# WuPlay API research

**Question:** does WuPlay offer an official, public, documented or otherwise
authorized API for reading/updating profiles, add-ons, catalogs, watchlists,
history and resume positions — so this Tizen client could synchronise with the
user's existing Android TV / Chromecast profile?

**Answer: no.** No public API is documented or discoverable. This document records
what was checked, what exists, and what that means for the project.

Research method: public web/GitHub only. No reverse engineering, no traffic
interception, no token extraction from the Android app, no requests to any WuPlay
service, no writes to the user's account.

---

## 1. What WuPlay actually is

| Fact | Evidence |
|---|---|
| Closed-source Android TV app, distributed as APK + issue tracker | repository `wuplayapp/wuplay-releases`, description *"WuPlay for Android TV — releases and issue tracker"*, **no `LICENSE`**, no source directories (only `.github`, `CHANGELOG.md`, `README.md`, `screenshots/`) |
| The GitHub organisation publishes **exactly one** public repository | `GET /users/wuplayapp/repos` → `wuplay-releases` only |
| Stremio add-on compatible, no account registration | README: *"privacy-focused streaming app with multi-device sync that works with Stremio add-ons. No account registration required"* |
| Sync exists, but between WuPlay devices only | README: *"Multi-device sync — keep your library, watchlists, watch history, and progress in sync across Android TV devices"* |
| There is a **web configurator** | README: *"Web configurator — manage add-ons, catalogs, and data from any browser"*; CHANGELOG references configurator tabs (Layout, Profile Manager, Age Restrictions, Privacy & Data) |
| Configurator was hardened with a PIN | issue **#16 "Secure Wuplay Configurator!"** (closed); issue #26 notes *"the PIN if set is now used to protect the public web-page"* |
| Profile export/import is an **in-app / configurator UI feature** | issue #26 (closed) requests export/import between devices; CHANGELOG: *"Removed Import Data option in web config privacy & data tab (may return in future)"* |
| An API is a **wish, not a product** | issue **#82 "Expose an API for deep links"** — **open**. Body: *"it never had an API to do this"* … *"I'm not sure if Wuplay has deep links support but that may need to be implemented first."* |
| The add-on SDK link in the README is **dead** | README links `https://github.com/wuplayapp/wuplay-addon-sdk` → **HTTP 404** |

Source links:

1. <https://github.com/wuplayapp/wuplay-releases>
2. <https://github.com/wuplayapp/wuplay-releases/blob/main/README.md>
3. <https://github.com/wuplayapp/wuplay-releases/blob/main/CHANGELOG.md>
4. <https://github.com/wuplayapp/wuplay-releases/issues/82> (open — API does not exist)
5. <https://github.com/wuplayapp/wuplay-releases/issues/26> (closed — local profile / configurator)
6. <https://github.com/wuplayapp/wuplay-releases/issues/16> (closed — configurator PIN)
7. <https://api.github.com/users/wuplayapp/repos> (org publishes only the releases repo)

Because items 1–7 are the complete public surface, the following fields are
**intentionally empty — not omitted by error**:

| Requested field | Result |
|---|---|
| Base URL | **none published** |
| Authentication method | **none published** (no OAuth, no API keys, no tokens documented) |
| Supported endpoints | **none published** |
| Request/response formats | **none published** except the user-visible JSON profile export |
| Rate limits | **none published** |
| Read/write capabilities | **none published** |
| Usage restrictions | not stated; no developer terms for third-party clients exist |

> Deliberate decision: no endpoint is invented, guessed or inferred from the app.
> Doing so would violate the project rules and would break the moment WuPlay
> changes anything.

## 2. What the profile export is (and is not)

The export produced by the official WuPlay Configurator is a **user-controlled
data interchange file** (`profile-data.json`). It contains profile configuration,
add-ons (with private URLs / embedded API keys), catalog settings, watchlists,
watch history, resume positions, metadata and playback preferences.

- It is **not** an API: no schema guarantee, no version negotiation, no auth.
- Treating it as the sync format is legitimate because **the user owns it and
  hands it over voluntarily**; talking to WuPlay's backend is not, because no
  authorized interface is published.
- Practical consequence: sync is **manual and one-directional** (WuPlay → this
  app). A read-only import preserves the user's data; nothing is written back.

---

## 3. The one integration surface that *is* public: Stremio add-ons

WuPlay's own interoperability story is "Stremio add-ons", and that protocol **is**
publicly documented and open source, so it is the correct thing to implement:

| Fact | Source |
|---|---|
| An add-on serves `/manifest.json` and resources at `/{resource}/{type}/{id}.json` | Stremio Add-on SDK `docs/protocol.md` |
| Resources: `catalog`, `meta`, `stream`, `subtitles` | same |
| Extra args as a path segment: `/{resource}/{type}/{id}/{extraArgs}.json`, e.g. `search=…&skip=100` | same |
| HTTP transport must serve CORS headers allowing all origins | same |
| Transports: `https://…/manifest.json`, `ipfs://…`, legacy v1/v2 mapping | same |
| SDK repository (open source, documents request/response shapes) | <https://github.com/Stremio/stremio-addon-sdk> |

Source: <https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md>

This is what Milestone 2 will implement: the user enters add-on manifest URLs at
runtime, we fetch manifests, merge catalogs, then perform `catalog`/`meta` reads.
Add-on URLs are stored locally only and never in git. No auth mechanism is
invented — if an add-on requires credentials, they live inside the user-supplied
URL exactly as WuPlay does it.

---

## 4. Recommended synchronisation strategy

| Stage | Mechanism | Status |
|---|---|---|
| **A. Import once** (M3) | User selects the export file locally; parse in the page; validate structure; **redact secrets before any log or UI echo**; store in `localStorage` (capped) | recommended |
| **B. Local profile management** (M3) | Profiles, watchlist, history, resume positions kept locally; app works fully offline | recommended |
| **C. User-controlled export** (M3) | Produce a **redacted** JSON backup the user can save themselves | recommended |
| **D. Read-only add-on sync** (M2) | Stremio protocol reads (catalog/meta) — the same data WuPlay shows | recommended |
| **E. True two-way sync** | Only if WuPlay publishes an authorized API or grants written permission | **blocked — do not build** |

Explicitly **not** proposed: scraping the configurator web UI, reusing session
cookies, MITM of app traffic, decompiling the APK, or "guessing" an endpoint.

If real cross-device sync matters sooner, the only legitimate route with public
documentation is an external watch-state service — note that WuPlay itself has
requests for Trakt (#61, #58), SIMKL (#104) and Scrob (#122) integration, i.e.
even WuPlay relies on third-party public APIs for this. That would be an
opt-in, user-visible integration with its own consent flow, decided in a later
milestone — never wired in silently.

---

## 5. Impact on the Tizen client (Tizen 5.0 / M63)

- `XMLHttpRequest`/`fetch` to add-on hosts works with the `internet` privilege
  (already declared in `app/config.xml`).
- Add-on servers must send CORS headers (a protocol requirement) — no proxy needed.
- Tizen 5.0 permits plain HTTP but HTTPS is required for anything sensitive.
- No WuPlay credentials are stored by this app; imports stay on the device.

## 6. Open questions for the project owner

1. Is the Configurator URL personalised/private per profile (i.e. a secret)?
   → assumed **yes**, never committed.
2. May the import run **read-only** and never write back to WuPlay? (planned: yes)
3. Do you consent to storing imported add-on URLs locally on the TV (they contain
   API keys)? → required before M3.
4. Is a redacted export acceptable as the backup format?

