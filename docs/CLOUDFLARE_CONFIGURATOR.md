# Cloudflare configurator (foundation, iteration 1)

Status: **foundation only — nothing is deployed, and the TV does not talk to it yet.**
The existing LAN configurator (`tools/configurator/`) stays the working path.

## Why Cloudflare Pages

A TizenBrew module has no sockets, so the TV can only *poll* an HTTPS endpoint. A
permanent HTTPS URL is what removes the “run a server on the PC” step. Cloudflare
Pages is free for this use (static hosting + Functions) and keeps everything out
of third-party cloud storage of our own.

Free-tier figures to re-check in the dashboard before relying on them:

| Service | Free tier (verify in dashboard) | Our use |
|---|---|---|
| Pages (static) | unlimited requests/bandwidth | one HTML page |
| Pages Functions | ~100k invocations/day | a handful per pairing |
| KV | ~100k reads/day, ~1k writes/day | one key per session, 10 min TTL |

A session needs ~1 write to create, ~1 write on approval, ~1 read + 1 write per TV
poll (every 2–5 s for at most 10 minutes). That is far inside the free limits for
personal use.

## Pairing protocol (implemented in `cloudflare/functions/api/session/[[code]].js`)

```
POST /api/session              → { code: "123456", ttl: 600 }   browser creates the session
POST /api/session/:code        → { approved: true }             browser uploads { iv, salt, data }
GET  /api/session/:code        → { state: "waiting" }           TV polls
                               → { state: "ready", payload: { iv, salt, data } }  once
                               → { state: "delivered" } | 404 { state: "expired" }
```

- 6-digit code, 10-minute TTL (`expirationTtl` on the KV key), single delivery.
- Attempt counter per code (20) → `429`, guards brute force on the 6-digit space.
- The Function **rejects any payload that is not exactly `{iv, salt, data}`**, so
  plaintext can never be stored, even by mistake.

## Encryption (browser ↔ TV, no server secret)

**Iteration 2 replaces the code-derived key.** The 6-digit code is now only an
authorisation token for *joining* a session; it is never key material.

```
TV     ── POST /:code/device {pub}  →  publishes ephemeral ECDH P-256 public key
PC     ── GET  /:code/device        →  reads tvPub, generates its own P-256 pair
PC     ── POST /:code/payload {pub, iv, data}
          data = AES-GCM-256(ECDH(pcPriv, tvPub), iv, JSON payload)
TV     ── GET  /:code               →  {state:'ready', {pub, iv, data}} once
          derives ECDH(tvPriv, pcPub) and decrypts locally, then the user presses Apply
```

Why this is stronger than PBKDF2(code): an attacker who reads KV (or the pairing
traffic) holds public keys and one AES-GCM ciphertext. There is no 10^6 password
space to search — the key is 256-bit ECDH output — so credentials cannot be
recovered offline. PBKDF2 from a 6-digit code was brute-forceable in hours.

Security properties

| Property | How |
|---|---|
| No plaintext in the cloud | the Function rejects any body that is not exactly `{pub, iv, data}` |
| Server never sees the payload key | ECDH is done end-to-end; the Function only relays public keys |
| Explicit TV approval | the TV publishes its key only after the user enters the code and presses Connect; settings are applied only after a second, explicit Apply |
| Expiry | KV `expirationTtl` 600 s + a `created` timestamp check |
| Single use | first successful poll marks `delivered`; the next poll deletes the key and answers `409 delivered` |
| Replay | the delivered key is deleted; a replayed `GET` cannot fetch the ciphertext twice |
| Rate limiting | per-code attempt counter (20) → `429 too-many-attempts` and the session is destroyed |
| Secrets kept out of URLs/logs | the payload key never leaves the two devices; only public keys and ciphertext are transmitted; the code lives in the path but authorises a session, it is not a credential |

Verified compatible fallback: Chromium 63 (Tizen 5.5) has `crypto.subtle` ECDH
P-256 + AES-GCM, which `app/js/data/cloudPair.js` uses. If `crypto.subtle` is
missing (insecure context), the TV reports `noCrypto` and the LAN configurator
stays the only path — there is deliberately **no** weak fallback.

## Remaining limitations

- The short code is still guessable (10^6) within its 10-minute window; the attempt
  cap and TTL bound it to ~20 tries/session, but IP-based throttling (Cloudflare
  WAF / rate-limit rules) is not configured yet.
- Metadata leaks: session existence, sizes and timing are visible to the relay.
- No forward secrecy beyond the ephemeral keys: if a device's memory is
  compromised *during* pairing, the payload is exposed.
- The browser page cannot verify that the TV key belongs to the TV the user has in
  front of them (no attestation); a malicious relay could substitute its own key.
  Detecting that requires comparing a short authentication string on both screens —
  not implemented.
- Emby credentials are stored on the TV in localStorage as before; the pairing
  channel does not change at-rest storage.
- `www`/project domain is not deployed yet, and the TV cloud fields currently reuse
  the LAN configurator block (entries starting with `http(s)://` take the cloud path).


## Manual deployment steps (no API tokens)

1. Create a **KV namespace**: Cloudflare dashboard → *Storage & databases → KV* →
   *Create namespace* (name e.g. `wutizen-pairing`). Copy its **id**.
2. Put that id into `cloudflare/wrangler.toml` (`REPLACE_WITH_KV_NAMESPACE_ID`).
3. Dashboard → *Workers & Pages → Create → Pages → Connect to Git* and pick the
   WuTizen repository.
4. Build settings: **Framework preset = None**, **Root directory = `cloudflare`**,
   **Build command = (empty)**, **Build output directory = `public`**.
5. Deploy. Then *Settings → Functions → KV namespace bindings* → add
   **Variable name `PAIRING`** → the namespace from step 1 → redeploy.
6. Verify with `curl -X POST https://<project>.pages.dev/api/session` → `{"code":…}`.
7. The TV will be pointed at `https://<project>.pages.dev` in the next iteration
   (the LAN configurator keeps working meanwhile).

Do not commit a Cloudflare API token or account id: the dashboard flow above needs
neither.

## Not implemented yet (iteration 1 scope)

- TV-side client (`/api/session/:code` polling + WebCrypto decrypt + apply) and the
  “cloud” toggle in Settings.
- Rate limiting beyond the per-code attempt counter (Cloudflare WAF rules can add
  IP throttling later).
- Automatic cleanup beyond KV TTL.

## SAS confirmation (final protocol)

Pairing is mutually authenticated before any configuration is transferred:

```
TV  POST /:code/device {pub}                    TV publishes its ephemeral ECDH P-256 key
PC  GET  /:code/device                          reads tvPub
PC  POST /:code/commit {pub, sas}               publishes pcPub + its SAS
TV  GET  /:code  -> {state:"confirm", pub, sas}  recomputes the SAS and compares
      equal   -> shows the code, waits for the user to press Apply -> POST /:code/confirm {ok:true}
      differs -> POST /:code/confirm {ok:false} -> session destroyed on the relay
PC  GET  /:code/commit -> {confirmed:true}       only then encrypts and uploads
PC  POST /:code/payload {pub, iv, data}          requires confirmed + pub == committed pub
TV  GET  /:code -> payload once, decrypt locally, user presses Apply
```

SAS = 100000 + (SHA-256(ECDH shared secret || tvPub || pcPub)[0..4] mod 900000), computed
independently on both devices (app/js/data/cloudPair.js and the browser page). The SAS is
display-only: never key material, never a credential.

## Security properties

| Property | How |
|---|---|
| No plaintext in the cloud | the Function rejects any body that is not exactly {pub, iv, data} |
| Relay never sees the payload key | ECDH end-to-end; only public keys and ciphertext are relayed |
| Explicit TV approval | the TV shows the SAS; only the user''s Apply posts confirm {ok:true} |
| Mismatch cannot deliver | confirm {ok:false} deletes the session; payload needs confirmed === true and pub === session.pub |
| Expiry | KV expirationTtl 600 s plus a created timestamp check |
| Single use / replay | first poll marks delivered; the next poll deletes the key and answers 409 |
| Rate limiting | per-code attempt counter (20) -> 429, session destroyed |
| Secrets out of URLs/logs | only public keys and ciphertext are transmitted |

Chromium 63 (Tizen 5.5) provides crypto.subtle ECDH P-256, deriveBits and AES-GCM, which the
TV client uses. Without crypto.subtle the TV reports noCrypto and only the LAN configurator
remains - there is deliberately no weaker fallback.

## Remaining limitations

- The 6-digit code is guessable (10^6) within 10 minutes; the attempt cap bounds it to ~20
  tries per session, but IP-level throttling (Cloudflare WAF rate-limit rules) is not set up.
- Metadata (session existence, sizes, timing) is visible to the relay.
- No attestation: the SAS only helps if the user actually compares both screens.
- Nothing is deployed yet; Emby credentials at rest on the TV are unchanged by pairing.

## Deployment requirements (manual, no API tokens)

1. Create a KV namespace (wutizen-pairing) and put its id in cloudflare/wrangler.toml.
2. Pages -> Connect to Git -> repo WuTizen, root directory cloudflare, framework preset
   None, build command empty, build output directory public.
3. Bind the KV namespace to the Pages project as PAIRING, then redeploy.
4. Verify: curl -X POST https://<project>.pages.dev/api/session -> {"code":"...","ttl":600}.
5. Run the TV from https: (or file:) so crypto.subtle exists.
## Deployed architecture (v0.7.2)

Live: **https://wutizen-config.pages.dev** (project `wutizen-config`, KV `wutizen-pairing`,
binding `PAIRING`).

```
cloudflare/
  wrangler.toml          name = wutizen-config, pages_build_output_dir = public, [[kv_namespaces]] PAIRING
  public/
    index.html           phone/PC UI: ECDH + SAS + encrypted upload
    _worker.js           Pages Functions ADVANCED MODE entry point (all /api/session routes)
    _lib/session.js      session state machine (KV: m:, t:, p:, y:)
```

Why advanced mode: a `[[param]]` dynamic segment is only valid as a FILE name, so
`functions/api/session/[[code]]/device.js` never matched and every sub-route 404'd.
A `_worker.js` in `functions/` is ignored too - Pages only picks it up from the build
OUTPUT directory. The single worker now routes explicitly:

| Request | Action |
|---|---|
| `POST /api/session` | create `{code, ttl:600}` |
| `GET /api/session/:code` | poll: `waiting` / `confirm {pub,sas}` / `ready {payload}` / `409 delivered` |
| `POST|GET /api/session/:code/device` | TV publishes / browser reads the TV ECDH public key |
| `POST|GET /api/session/:code/commit` | browser publishes pcPub + SAS / waits for confirmation |
| `POST /api/session/:code/confirm` | TV decision; `ok:false` destroys the session |
| `POST /api/session/:code/payload` | encrypted payload, only after `confirmed === true` |
| `OPTIONS *` | 204 preflight (no body - a 204 with a body crashes workerd with error 1101) |

Static files are served through `env.ASSETS.fetch(request)`; unknown paths fall through
to the asset binding. KV keys are split per field so a read-modify-write in one isolate
cannot clobber another value (KV reads are eventually consistent).

## TV side (v0.7.2)

Settings ? *Configurator from PC/phone*: the address field is **pre-filled** with
`https://wutizen-config.pages.dev` (a saved LAN host still wins), so pairing needs only
the 6-digit code typed on the remote, then Connect. The TV publishes its ECDH key,
shows the SAS, waits for the user to press Apply (that press is the SAS confirmation),
polls for the encrypted payload, and only a second, explicit Apply writes settings.
Anything not starting with `http(s)://` is treated as a LAN host and uses the local
configurator (`tools/configurator/server.mjs`) as before.