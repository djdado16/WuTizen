#!/usr/bin/env node
/** scripts/cloud-pair-e2e.mjs - TV-initiated pairing, end to end, against the real handler. */

import http from 'node:http';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { startMockCloud } from './mock-cloud.mjs';

let failures = 0;
let checks = 0;
function check(name, ok, extra) {
  checks += 1;
  if (!ok) {
    failures += 1;
    console.log('FAIL  ' + name + (extra ? ' -> ' + extra : ''));
  } else {
    console.log('ok    ' + name);
  }
}

const cloud = await startMockCloud(8791);
const base = cloud.url;

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (err) { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

class FakeXHR {
  open(method, url) { this.method = method; this.url = url; }
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
const unb64 = (s) => Buffer.from(s, 'base64');

async function shortAuth(shared, tvPub, pcPub) {
  const digest = await webcrypto.subtle.digest('SHA-256', Buffer.concat([Buffer.from(new Uint8Array(shared)), unb64(tvPub), unb64(pcPub)]));
  return String(100000 + (new DataView(digest).getUint32(0) % 900000));
}

async function browserJoin(seenTvPub) {
  const own = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
  const peer = await webcrypto.subtle.importKey('spki', unb64(seenTvPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await webcrypto.subtle.deriveBits({ name: 'ECDH', public: peer }, own.privateKey, 256);
  const myPub = b64(await webcrypto.subtle.exportKey('spki', own.publicKey));
  return { own, peer, myPub, sas: await shortAuth(bits, seenTvPub, myPub) };
}

async function encryptFor(own, peer, payload) {
  const key = await webcrypto.subtle.deriveKey({ name: 'ECDH', public: peer }, own.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return { iv: b64(iv), data: b64(data) };
}

function waitFor(predicate, ms = 15000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const value = predicate();
      if (value || Date.now() - started > ms) { clearInterval(timer); resolve(value); }
    }, 100);
  });
}

// ---- 1. TV creates, browser joins, SAS confirmed, Save, Apply --------------
let received = null;
tv.create({ onPayload: (payload) => (received = payload) }, { base });
await waitFor(() => tv.state().status === 'waiting');
const code = tv.state().code;
check('TV creates the session and shows a 6-digit code', /^\d{6}$/.test(String(code)), String(code));
check('TV publishes its key and waits', tv.state().status === 'waiting');

const device = await api('GET', '/api/session/' + code + '/device');
check('browser reads the TV public key', typeof device.json.tvPub === 'string' && device.json.tvPub.length > 40);

const browser = await browserJoin(device.json.tvPub);
const commit = await api('POST', '/api/session/' + code + '/commit', { pub: browser.myPub, sas: browser.sas });
check('browser joins the TV session', commit.status === 200 && commit.json.ok === true, JSON.stringify(commit.json));

await waitFor(() => tv.state().status === 'confirm');
check('TV shows the same SAS', tv.state().status === 'confirm' && tv.state().sas === browser.sas, String(tv.state().sas));

const payload = { emby: { url: 'https://emby.local:8920', user: 'ana', pass: 's3cret' }, addons: ['https://example.com/manifest.json'], prefs: { lang: 'hr', subSize: 'l' } };
const early = await api('POST', '/api/session/' + code + '/payload', { pub: browser.myPub, ...(await encryptFor(browser.own, browser.peer, payload)) });
check('Save before the TV confirms is refused', early.status === 409, JSON.stringify(early.json));

tv.confirmSas();
await waitFor(() => tv.state().status === 'confirmed');
check('OK on the TV confirms the SAS', tv.state().status === 'confirmed');

const saved = await api('POST', '/api/session/' + code + '/payload', { pub: browser.myPub, ...(await encryptFor(browser.own, browser.peer, payload)) });
check('browser saves the encrypted payload', saved.status === 200 && saved.json.approved === true, JSON.stringify(saved.json));

await waitFor(() => received !== null);
check('TV decrypts the saved settings', !!received && received.emby.pass === 's3cret');
check('TV accepts addons and prefs', !!received && received.addons.length === 1 && received.prefs.lang === 'hr');
check('TV status is ready', tv.state().status === 'ready' && tv.state().hasPayload === true);

// ---- 2. replay ------------------------------------------------------------
const replay = await api('POST', '/api/session/' + code + '/payload', { pub: browser.myPub, ...(await encryptFor(browser.own, browser.peer, payload)) });
check('replay of the delivered session is refused', replay.status === 404 || replay.status === 409, String(replay.status));
// ---- 3. unknown code ------------------------------------------------------
const unknown = await api('GET', '/api/session/000000/device');
check('unknown code has no TV session', unknown.status === 404, String(unknown.status));
const throwaway = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
const somePub = b64(await webcrypto.subtle.exportKey('spki', throwaway.publicKey));
const stranger = await browserJoin(somePub);
const strangerJoin = await api('POST', '/api/session/000000/commit', { pub: stranger.myPub, sas: '123456' });
check('browser cannot claim a non-existent session', strangerJoin.status === 404, JSON.stringify(strangerJoin.json));

// ---- 4. plaintext / owner secret -----------------------------------------
const fresh = (await api('POST', '/api/session', {})).json;
check('create returns code + owner secret', /^\d{6}$/.test(String(fresh.code)) && typeof fresh.sid === 'string' && fresh.sid.length > 10);
const plain = await api('POST', '/api/session/' + fresh.code + '/payload', { url: 'https://emby.local', pass: 'x' });
check('plaintext payload is rejected', plain.status === 400, JSON.stringify(plain.json));
const hijack = await api('POST', '/api/session/' + fresh.code + '/device', { pub: somePub });
check('device-put without the owner secret is refused', hijack.status === 403, JSON.stringify(hijack.json));

// ---- 5. mismatched SAS destroys the session -------------------------------
let wrongPayload = null;
tv.create({ onPayload: (p) => (wrongPayload = p) }, { base });
await waitFor(() => tv.state().status === 'waiting');
const c2 = tv.state().code;
const attacker = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
const attackerPub = b64(await webcrypto.subtle.exportKey('spki', attacker.publicKey));
const tricked = await browserJoin(attackerPub);
const trickedCommit = await api('POST', '/api/session/' + c2 + '/commit', { pub: tricked.myPub, sas: tricked.sas });
check('substituted key still commits', trickedCommit.status === 200, JSON.stringify(trickedCommit.json));
await waitFor(() => tv.state().status === 'sasMismatch');
check('TV rejects the mismatched SAS', tv.state().status === 'sasMismatch' && wrongPayload === null);
const destroyed = await api('GET', '/api/session/' + c2 + '/device');
check('mismatch destroys the session', destroyed.status === 404, String(destroyed.status));

// ---- 6. expiry -----------------------------------------------------------
const exp = (await api('POST', '/api/session', {})).json;
const meta = JSON.parse(cloud.store.get('m:' + exp.code));
meta.created = Date.now() - 11 * 60 * 1000;
cloud.store.set('m:' + exp.code, JSON.stringify(meta));
const expired = await api('GET', '/api/session/' + exp.code + '?sid=' + exp.sid);
check('stale session reports expired', expired.status === 404 && expired.json.state === 'expired', JSON.stringify(expired.json));

// ---- 7. rate limit -------------------------------------------------------
const rl = (await api('POST', '/api/session', {})).json;
let limited = false;
for (let i = 0; i < 22; i++) {
  const res = await api('GET', '/api/session/' + rl.code + '?sid=' + rl.sid);
  if (res.status === 429) { limited = true; break; }
}
check('too many attempts are rate limited', limited);
check('rate-limited session is destroyed', !cloud.store.has('m:' + rl.code));

tv.stop();
cloud.server.close();
console.log('\n[cloud-e2e] ' + (checks - failures) + '/' + checks + ' checks passed');
process.exit(failures ? 1 : 0);