#!/usr/bin/env node
/**
 * scripts/cloud-pair-e2e.mjs — synthetic end-to-end test of the cloud pairing.
 *
 * Runs the REAL Pages Function (with an in-memory KV) and the REAL TV module
 * (`app/js/data/cloudPair.js`) against a minimal `window`/XHR shim, so pairing,
 * ECDH encryption, delivery, replay, expiry and invalid codes are exercised for
 * real. Run: node scripts/cloud-pair-e2e.mjs
 */

import http from 'node:http';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { startMockCloud } from './mock-cloud.mjs';

let failures = 0;
let checks = 0;
function check(name, ok) {
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log('FAIL  ' + name);
  } else {
    console.log('ok    ' + name);
  }
}

const cloud = await startMockCloud(8791);
const base = cloud.url;

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      base + path,
      { method, headers: body ? { 'Content-Type': 'application/json' } : {} },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (err) {
            json = null;
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

// window / XHR shim so the browser module runs under Node.
class FakeXHR {
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader() {}
  send(body) {
    api(this.method, this.url.replace(base, ''), body ? JSON.parse(body) : null).then((res) => {
      this.status = res.status;
      this.responseText = JSON.stringify(res.json);
      this.readyState = 4;
      if (this.onreadystatechange) this.onreadystatechange();
    });
  }
}
globalThis.window = { crypto: webcrypto, location: { protocol: 'http:' } };
globalThis.XMLHttpRequest = FakeXHR;

const tv = await import(pathToFileURL('app/js/data/cloudPair.js').href);

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
const unb64 = (text) => Buffer.from(text, 'base64');

// Browser half of the pairing (mirrors cloudflare/public/index.html).
async function shortAuth(shared, tvPub, pcPub) {
  const concat = Buffer.concat([Buffer.from(new Uint8Array(shared)), unb64(tvPub), unb64(pcPub)]);
  const digest = await webcrypto.subtle.digest('SHA-256', concat);
  return String(100000 + (new DataView(digest).getUint32(0) % 900000));
}

async function browserJoin(seenTvPub) {
  const own = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
  const peer = await webcrypto.subtle.importKey('spki', unb64(seenTvPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await webcrypto.subtle.deriveBits({ name: 'ECDH', public: peer }, own.privateKey, 256);
  const myPub = b64(await webcrypto.subtle.exportKey('spki', own.publicKey));
  return { own, peer, myPub, seenTvPub, sas: await shortAuth(bits, seenTvPub, myPub) };
}

async function encryptFor(own, peer, payload) {
  const key = await webcrypto.subtle.deriveKey(
    { name: 'ECDH', public: peer },
    own.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return { iv: b64(iv), data: b64(data) };
}

// ---- 1. happy path with SAS confirmation ----------------------------------
const created = await api('POST', '/api/session');
check('POST /api/session returns a 6-digit code', /^\d{6}$/.test(String(created.json.code)));
const code = created.json.code;

let received = null;
tv.start({ base, code }, { onPayload: (payload) => (received = payload) });
await waitFor(() => tv.state().status === 'waiting');
check('TV publishes its key and waits', tv.state().status === 'waiting');

const device = await api('GET', '/api/session/' + code + '/device');
check('relay returns the TV public key', typeof device.json.tvPub === 'string' && device.json.tvPub.length > 40);

const browser = await browserJoin(device.json.tvPub);
const commit = await api('POST', '/api/session/' + code + '/commit', { pub: browser.myPub, sas: browser.sas });
check('browser publishes its key and SAS', commit.status === 200 && commit.json.ok === true);

await waitFor(() => tv.state().status === 'confirm');
check('TV derives the same SAS', tv.state().status === 'confirm' && tv.state().sas === browser.sas);

const payload = {
  emby: { url: 'https://emby.local:8920', user: 'ana', pass: 's3cret' },
  addons: ['https://example.com/manifest.json'],
  prefs: { lang: 'hr', subSize: 'l' }
};
const preConfirm = await api('POST', '/api/session/' + code + '/payload', {
  pub: browser.myPub,
  ...(await encryptFor(browser.own, browser.peer, payload))
});
check('payload before confirmation is refused', preConfirm.status === 409);

tv.confirmSas();
await waitFor(() => tv.state().status === 'confirmed');
check('TV confirms the matching SAS', tv.state().status === 'confirmed');

const uploaded = await api('POST', '/api/session/' + code + '/payload', {
  pub: browser.myPub,
  ...(await encryptFor(browser.own, browser.peer, payload))
});
check('browser uploads the encrypted payload', uploaded.status === 200 && uploaded.json.approved === true);

await waitFor(() => received !== null);
check('TV decrypts the payload', !!received && received.emby.pass === 's3cret');
check('TV accepts addons and prefs', !!received && received.addons.length === 1 && received.prefs.lang === 'hr');
check('TV status is ready', tv.state().status === 'ready' && tv.state().hasPayload === true);

// ---- 2. replay ------------------------------------------------------------
const replay = await api('GET', '/api/session/' + code);
check('replay of the delivery is refused', replay.status === 409 && replay.json.state === 'delivered');

function waitFor(predicate, ms = 12000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const value = predicate();
      if (value || Date.now() - started > ms) {
        clearInterval(timer);
        resolve(value);
      }
    }, 100);
  });
}

// ---- 3. invalid code ------------------------------------------------------
tv.start({ base, code: '000000' }, { onPayload: () => {} });
await waitFor(() => tv.state().status !== 'pairing' && tv.state().status !== 'waiting');
check('unknown code is rejected', tv.state().status === 'rejected');

// ---- 4. plaintext / missing device ---------------------------------------
const fresh = (await api('POST', '/api/session')).json.code;
const plain = await api('POST', '/api/session/' + fresh + '/payload', { url: 'https://emby.local', pass: 'x' });
check('plaintext payload is rejected', plain.status === 400);
const early = await api('POST', '/api/session/' + fresh + '/payload', { pub: 'AAAA', iv: 'AAAA', data: 'AAAA' });
check('payload before the TV joins is refused', early.status === 409);

// ---- 5. key substitution is caught by the SAS -----------------------------
const c2 = (await api('POST', '/api/session')).json.code;
let wrongPayload = null;
tv.start({ base, code: c2 }, { onPayload: (p) => (wrongPayload = p) });
await waitFor(() => tv.state().status === 'waiting');
const d2 = await api('GET', '/api/session/' + c2 + '/device');

// A malicious relay hands the browser its own key instead of the TV's.
const attacker = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
const attackerPub = b64(await webcrypto.subtle.exportKey('spki', attacker.publicKey));
const tricked = await browserJoin(attackerPub);
const trickedCommit = await api('POST', '/api/session/' + c2 + '/commit', { pub: tricked.myPub, sas: tricked.sas });
check('substituted key still commits', trickedCommit.status === 200);
check('SAS differs when the key is substituted', tricked.sas !== (await shortAuth(
  await webcrypto.subtle.deriveBits(
    { name: 'ECDH', public: await webcrypto.subtle.importKey('spki', unb64(d2.json.tvPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []) },
    attacker.privateKey,
    256
  ),
  d2.json.tvPub,
  tricked.myPub
)));

await waitFor(() => tv.state().status === 'sasMismatch');
check('TV rejects the mismatched SAS', tv.state().status === 'sasMismatch' && wrongPayload === null);
const destroyed = await api('GET', '/api/session/' + c2);
check('mismatched confirmation destroys the session', destroyed.status === 404);
const blocked = await api('POST', '/api/session/' + c2 + '/payload', {
  pub: tricked.myPub,
  ...(await encryptFor(tricked.own, tricked.peer, { emby: { pass: 'x' } }))
});
check('no payload can be delivered after a mismatch', blocked.status === 404 && wrongPayload === null);

// ---- 6. expiry -----------------------------------------------------------
const c3 = (await api('POST', '/api/session')).json.code;
const stored = JSON.parse(cloud.store.get('m:' + c3));
stored.created = Date.now() - 11 * 60 * 1000;
cloud.store.set('m:' + c3, JSON.stringify(stored));
const expired = await api('GET', '/api/session/' + c3);
check('stale session reports expired', expired.status === 404 && expired.json.state === 'expired');

// ---- 7. rate limit -------------------------------------------------------
const c4 = (await api('POST', '/api/session')).json.code;
let limited = false;
let last = null;
for (let i = 0; i < 22; i++) {
  last = await api('GET', '/api/session/' + c4);
  if (last.status === 429) {
    limited = true;
    break;
  }
}
check('too many attempts are rate limited', limited);
check('rate-limited session is destroyed', !cloud.store.has('m:' + c4));

tv.stop();
cloud.server.close();
console.log('\n[cloud-e2e] ' + (checks - failures) + '/' + checks + ' checks passed');
process.exit(failures ? 1 : 0);

