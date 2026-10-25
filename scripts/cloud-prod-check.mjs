#!/usr/bin/env node
/** Temporary production smoke test: full pairing flow with FAKE data only. */
const BASE = process.argv[2] || 'https://wutizen-config.pages.dev';
const C = globalThis.crypto;
const b64 = (b) => Buffer.from(new Uint8Array(b)).toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64');

const api = async (method, path, body, tries) => {
  const left = typeof tries === 'number' ? tries : 0;
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => null);
  if (res.status === 404 && left > 0) {
    await new Promise((r) => setTimeout(r, 1500));
    return api(method, path, body, left - 1);
  }
  return { status: res.status, json, headers: res.headers };
};

const sas = async (bits, tvPub, pcPub) => {
  const digest = await C.subtle.digest('SHA-256', Buffer.concat([Buffer.from(new Uint8Array(bits)), unb64(tvPub), unb64(pcPub)]));
  return String(100000 + (new DataView(digest).getUint32(0) % 900000));
};

const out = [];
const check = (name, ok, extra) => out.push((ok ? 'ok    ' : 'FAIL  ') + name + (ok || !extra ? '' : ' -> ' + extra));

// TV side
const tvPair = await C.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
const tvPub = b64(await C.subtle.exportKey('spki', tvPair.publicKey));

const created = await api('POST', '/api/session');
const code = created.json.code;
check('create session', created.status === 200 && /^\d{6}$/.test(code), JSON.stringify(created.json));
// Give KV a moment to propagate to other isolates, as the TV client does.
await new Promise((r) => setTimeout(r, 2500));

const dev = await api('POST', '/api/session/' + code + '/device', { pub: tvPub }, 25);
check('TV key accepted (KV write via PAIRING)', dev.status === 200 && dev.json.ok === true, JSON.stringify(dev.json));

// Browser side
const pcPair = await C.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
const tvKey = await C.subtle.importKey('spki', unb64(tvPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const pcPub = b64(await C.subtle.exportKey('spki', pcPair.publicKey));
const pcBits = await C.subtle.deriveBits({ name: 'ECDH', public: tvKey }, pcPair.privateKey, 256);
const pcSas = await sas(pcBits, tvPub, pcPub);
const commit = await api('POST', '/api/session/' + code + '/commit', { pub: pcPub, sas: pcSas }, 25);
check('browser commit accepted', commit.status === 200 && commit.json.ok === true, JSON.stringify(commit.json));

const bare = await api('POST', '/api/session/' + code + '/payload', { url: 'https://test.invalid' });
check('plaintext payload rejected', bare.status === 400, JSON.stringify(bare.json));

// TV computes the SAS independently
const pcKey = await C.subtle.importKey('spki', unb64(pcPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const tvBits = await C.subtle.deriveBits({ name: 'ECDH', public: pcKey }, tvPair.privateKey, 256);
const tvSas = await sas(tvBits, tvPub, pcPub);
check('SAS matches on both sides', tvSas === pcSas, tvSas + ' vs ' + pcSas);

const pending = await api('GET', '/api/session/' + code);
check('poll exposes confirm state', pending.json.state === 'confirm' && pending.json.sas === pcSas, JSON.stringify(pending.json));

const beforeConfirm = await api('POST', '/api/session/' + code + '/payload', { pub: pcPub, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' });
check('payload blocked before confirmation', beforeConfirm.status === 409, JSON.stringify(beforeConfirm.json));

const conf = await api('POST', '/api/session/' + code + '/confirm', { ok: true });
check('TV confirmation accepted', conf.status === 200 && conf.json.confirmed === true, JSON.stringify(conf.json));

const fake = { emby: { url: 'https://test.invalid', user: 'synthetic', pass: 'not-a-real-secret' }, addons: [], prefs: { lang: 'en' } };
const aes = await C.subtle.deriveKey({ name: 'ECDH', public: tvKey }, pcPair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const iv = C.getRandomValues(new Uint8Array(12));
const cipher = await C.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(fake)));
const up = await api('POST', '/api/session/' + code + '/payload', { pub: pcPub, iv: b64(iv), data: b64(cipher) }, 25);
check('encrypted payload stored', up.status === 200 && up.json.approved === true, JSON.stringify(up.json));

const ready = await api('GET', '/api/session/' + code);
if (!ready.json || !ready.json.payload) {
  console.log('DEBUG upload=' + JSON.stringify(up) + ' ready=' + JSON.stringify(ready));
}
check('delivery returns ciphertext only', ready.json.state === 'ready' && typeof ready.json.payload.data === 'string' && !JSON.stringify(ready.json).includes('not-a-real-secret'));

const tvAes = await C.subtle.deriveKey({ name: 'ECDH', public: pcKey }, tvPair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const plain = await C.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ready.json.payload.iv) }, tvAes, unb64(ready.json.payload.data));
const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(plain)));
check('TV decrypts correctly', decoded.emby.url === 'https://test.invalid' && decoded.prefs.lang === 'en');

const replay = await api('GET', '/api/session/' + code);
check('replay refused', replay.status === 409 && replay.json.state === 'delivered', JSON.stringify(replay.json));

console.log(out.join('\n'));
console.log('\n' + out.filter((l) => l.startsWith('ok')).length + '/' + out.length + ' production checks passed');
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);

