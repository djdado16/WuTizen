#!/usr/bin/env node
/** Production probe for TV-initiated pairing. Synthetic data only (test.invalid). */
const BASE = process.argv[2] || 'https://wutizen-config.pages.dev';
const C = globalThis.crypto;
const b64 = (b) => Buffer.from(new Uint8Array(b)).toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const api = async (method, path, body, tries = 0) => {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => null);
  if (res.status === 404 && tries > 0) {
    await sleep(2000);
    return api(method, path, body, tries - 1);
  }
  return { status: res.status, json, headers: res.headers };
};

const out = [];
const check = (name, ok, extra) => out.push((ok ? 'ok    ' : 'FAIL  ') + name + (ok || !extra ? '' : ' -> ' + extra));
const sas = async (bits, tvPub, pcPub) => {
  const d = await C.subtle.digest('SHA-256', Buffer.concat([Buffer.from(new Uint8Array(bits)), unb64(tvPub), unb64(pcPub)]));
  return String(100000 + (new DataView(d).getUint32(0) % 900000));
};

// TV side
const created = await api('POST', '/api/session', {}, 3);
const code = created.json && created.json.code;
const sid = created.json && created.json.sid;
check('TV creates the session', created.status === 200 && /^\d{6}$/.test(String(code)) && typeof sid === 'string' && sid.length > 10);
await sleep(2500);

const tvPair = await C.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
const tvPub = b64(await C.subtle.exportKey('spki', tvPair.publicKey));
const dev = await api('POST', '/api/session/' + code + '/device?sid=' + encodeURIComponent(sid), { pub: tvPub }, 5);
check('TV publishes its key', dev.status === 200 && dev.json.ok === true, JSON.stringify(dev.json));

try {
  const hijack = await api('POST', '/api/session/' + code + '/device', { pub: tvPub });
  check('device-put without sid is refused', hijack.status === 403, String(hijack.status));
} catch (e) { check('device-put without sid is refused', false, String(e)); }

// Browser side
const seen = await api('GET', '/api/session/' + code + '/device', null, 5);
check('browser reads the TV key', typeof (seen.json && seen.json.tvPub) === 'string');

const pcPair = await C.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
const tvKey = await C.subtle.importKey('spki', unb64(tvPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const pcPub = b64(await C.subtle.exportKey('spki', pcPair.publicKey));
const pcSas = await sas(await C.subtle.deriveBits({ name: 'ECDH', public: tvKey }, pcPair.privateKey, 256), tvPub, pcPub);
const commit = await api('POST', '/api/session/' + code + '/commit', { pub: pcPub, sas: pcSas }, 5);
check('browser joins the TV session', commit.status === 200 && commit.json.ok === true, JSON.stringify(commit.json));

const poll = await api('GET', '/api/session/' + code + '?sid=' + encodeURIComponent(sid), null, 5);
check('TV sees the browser SAS', poll.json && poll.json.state === 'confirm' && poll.json.sas === pcSas, JSON.stringify(poll.json));

const early = await api('POST', '/api/session/' + code + '/payload', { pub: pcPub, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' });
check('Save before confirmation is refused', early.status === 409, String(early.status));

const conf = await api('POST', '/api/session/' + code + '/confirm?sid=' + encodeURIComponent(sid), { ok: true }, 5);
check('TV confirms (OK, no typing)', conf.status === 200 && conf.json.confirmed === true, JSON.stringify(conf.json));

const fake = { emby: { url: 'https://test.invalid', user: 'synthetic', pass: 'not-a-real-secret' }, addons: [], prefs: { lang: 'en' } };
const aes = await C.subtle.deriveKey({ name: 'ECDH', public: tvKey }, pcPair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const iv = C.getRandomValues(new Uint8Array(12));
const cipher = await C.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(fake)));
const up = await api('POST', '/api/session/' + code + '/payload', { pub: pcPub, iv: b64(iv), data: b64(cipher) }, 5);
check('browser saves the encrypted payload', up.status === 200 && up.json.approved === true, JSON.stringify(up.json));

const ready = await api('GET', '/api/session/' + code + '?sid=' + encodeURIComponent(sid), null, 5);
check('delivery is ciphertext only', ready.json && ready.json.state === 'ready' && !JSON.stringify(ready.json).includes('not-a-real-secret'));

const pcKey = await C.subtle.importKey('spki', unb64(pcPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const tvAes = await C.subtle.deriveKey({ name: 'ECDH', public: pcKey }, tvPair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const plain = await C.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ready.json.payload.iv) }, tvAes, unb64(ready.json.payload.data));
const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(plain)));
check('TV decrypts the settings', decoded.emby.url === 'https://test.invalid' && decoded.prefs.lang === 'en');

const replay = await api('GET', '/api/session/' + code + '?sid=' + encodeURIComponent(sid));
check('replay is refused', replay.status === 404 || replay.status === 409, String(replay.status));

console.log(out.join('\n'));
console.log('\n' + out.filter((l) => l.startsWith('ok')).length + '/' + out.length + ' production checks passed');
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);