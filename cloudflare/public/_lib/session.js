/**
 * Shared pairing-relay logic for Cloudflare Pages Functions.
 *
 * KV layout uses one key per field so a read-modify-write in one invocation can
 * never clobber a value written by another (KV reads are eventually consistent):
 *   m:<code>  { created, attempts, delivered }
 *   t:<code>  TV ECDH public key
 *   p:<code>  { pub, sas, confirmed }
 *   y:<code>  { pub, iv, data }   AES-GCM ciphertext only
 */

const TTL_SECONDS = 600;
const MAX_ATTEMPTS = 20;

export function json(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS, POST"
    }
  });
}

function newCode() {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  return String(100000 + (((buf[0] << 16) | (buf[1] << 8) | buf[2]) % 900000));
}

function isB64(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9+/=]+$/.test(value);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (err) {
    return null;
  }
}

async function readJsonKey(kv, key) {
  const raw = await kv.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export async function handle(context, action) {
  const { request, env, params } = context;
  const kv = env.PAIRING;
  if (!kv) {
    return json(500, { error: "PAIRING KV binding missing" });
  }

  if (action === "create") {
    const fresh = newCode();
    await kv.put("m:" + fresh, JSON.stringify({ created: Date.now(), attempts: 0, delivered: false }), {
      expirationTtl: TTL_SECONDS
    });
    return json(200, { code: fresh, ttl: TTL_SECONDS });
  }

  const code = params && params.code ? String(params.code) : "";
  if (!/^\d{6}$/.test(code)) {
    return json(400, { error: "invalid code" });
  }

  const mKey = "m:" + code;
  const meta = await readJsonKey(kv, mKey);
  if (!meta) {
    return json(404, { state: "expired" });
  }
  if (Date.now() - meta.created > TTL_SECONDS * 1000) {
    await kv.delete(mKey);
    return json(404, { state: "expired" });
  }
  const touched = { created: meta.created, attempts: (meta.attempts || 0) + 1, delivered: !!meta.delivered };
  if (touched.attempts > MAX_ATTEMPTS) {
    await kv.delete(mKey);
    return json(429, { state: "too-many-attempts" });
  }
  const saveMeta = (extra) =>
    kv.put(mKey, JSON.stringify(Object.assign({}, touched, extra || {})), { expirationTtl: TTL_SECONDS });

  if (action === "device-put") {
    const body = await readJson(request);
    if (!body || !isB64(body.pub, 200)) {
      await saveMeta();
      return json(400, { error: "public key required" });
    }
    await kv.put("t:" + code, body.pub, { expirationTtl: TTL_SECONDS });
    await saveMeta();
    return json(200, { ok: true });
  }

  if (action === "device-get") {
    await saveMeta();
    return json(200, { tvPub: await kv.get("t:" + code), hasPayload: !!(await kv.get("y:" + code)) });
  }

  if (action === "commit-put") {
    const body = await readJson(request);
    if (!body || !isB64(body.pub, 200) || !/^\d{6}$/.test(String(body.sas || ""))) {
      await saveMeta();
      return json(400, { error: "pub and 6-digit sas required" });
    }
    if (await kv.get("y:" + code)) {
      await saveMeta();
      return json(409, { error: "session already used" });
    }
    await kv.put("p:" + code, JSON.stringify({ pub: body.pub, sas: String(body.sas), confirmed: false }), {
      expirationTtl: TTL_SECONDS
    });
    await saveMeta();
    return json(200, { ok: true });
  }

  if (action === "commit-get") {
    const pc = (await readJsonKey(kv, "p:" + code)) || {};
    await saveMeta();
    return json(200, { confirmed: !!pc.confirmed, hasPub: !!pc.pub, hasPayload: !!(await kv.get("y:" + code)) });
  }

  if (action === "confirm-put") {
    const body = await readJson(request);
    const pc = await readJsonKey(kv, "p:" + code);
    if (!body || body.ok !== true) {
      await kv.delete(mKey);
      await kv.delete("p:" + code);
      await kv.delete("t:" + code);
      return json(200, { confirmed: false, state: "rejected" });
    }
    if (!pc || !pc.pub) {
      await saveMeta();
      return json(409, { error: "nothing to confirm" });
    }
    await kv.put("p:" + code, JSON.stringify({ pub: pc.pub, sas: pc.sas, confirmed: true }), {
      expirationTtl: TTL_SECONDS
    });
    await saveMeta();
    return json(200, { confirmed: true });
  }

  if (action === "payload-put") {
    const body = await readJson(request);
    const keys = Object.keys(body || {}).sort().join(",");
    if (keys !== "data,iv,pub" || !isB64(body.pub, 200) || !isB64(body.iv, 64) || !isB64(body.data, 200000)) {
      await saveMeta();
      return json(400, { error: "encrypted payload required (pub, iv, data)" });
    }
    if (!(await kv.get("t:" + code))) {
      await saveMeta();
      return json(409, { error: "device not paired yet" });
    }
    const pc = await readJsonKey(kv, "p:" + code);
    if (!pc || pc.confirmed !== true) {
      await saveMeta();
      return json(409, { error: "pairing not confirmed" });
    }
    if (body.pub !== pc.pub) {
      await saveMeta();
      return json(409, { error: "public key does not match the confirmed transcript" });
    }
    await kv.put("y:" + code, JSON.stringify({ pub: body.pub, iv: body.iv, data: body.data }), {
      expirationTtl: TTL_SECONDS
    });
    await saveMeta();
    return json(200, { approved: true });
  }

  // poll
  const payload = await kv.get("y:" + code);
  const pc = (await readJsonKey(kv, "p:" + code)) || {};
  if (!payload) {
    await saveMeta();
    return json(200, pc.pub ? { state: "confirm", pub: pc.pub, sas: pc.sas, confirmed: !!pc.confirmed } : { state: "waiting" });
  }
  if (meta.delivered) {
    await kv.delete(mKey);
    await kv.delete("y:" + code);
    return json(409, { state: "delivered" });
  }
  await kv.put(mKey, JSON.stringify(Object.assign({}, touched, { delivered: true })), { expirationTtl: 60 });
  return json(200, { state: "ready", payload: JSON.parse(payload) });
}