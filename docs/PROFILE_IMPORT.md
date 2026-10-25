# WuPlay profile import

Milestone 4 imports the configured **add-ons** from a WuPlay profile export so the
same stream providers used on the Chromecast become available on the TV.

## 1. What is parsed

The export format is not published, so `app/js/data/profileImport.js` does **not**
assume field names. It walks the JSON (max depth 6, max 5000 nodes) and recognises:

| Data | Rule | Result |
|---|---|---|
| Add-on URLs | any `http(s)` string under keys like `transportUrl`, `addonUrl`, `manifestUrl`, `url` — or any string ending in `/manifest.json` | normalised to the base URL, deduplicated, max 20 |
| Image URLs | keys containing `logo/poster/background/image/avatar/icon/banner` | ignored |
| Profiles | arrays under `profiles/users`, entries with `name`/`title` | names only (max 8) |
| Lists | arrays under `list/watchlist/watchLater/bookmarks/favorites/library/history/continueWatching` | counted |

Everything else is ignored. **The raw export is never stored, logged or displayed.**

## 2. How to get the file onto the TV (TizenBrew, Q60R)

| Method | Works on TizenBrew? | Notes |
|---|---|---|
| **LAN URL (recommended, implemented)** | ✅ | Run a **temporary** static server on the PC in a **dedicated folder containing only `profile-data.json`**: `python -m http.server 8000 --bind 0.0.0.0`. Then on the TV: **Settings → “profile-data.json address”** and enter `http://<PC-LAN-IP>:8000/profile-data.json`. Same Wi-Fi only; nothing leaves the local network. **Stop the server immediately after the import** (see hardening below). |
| File picker (implemented) | ❌ | A TizenBrew module runs in TizenBrew's webview, which exposes no file browser. The “Choose file” action therefore only works in the desktop preview. |
| USB drive | ❌ | Blocked: a module has no `tizen.filesystem` access, and TizenBrew does not expose one. |
| Bundling the JSON in the `.wgt` | ⚠️ | Technically possible for a private standalone build, but it copies a private export into a build artefact. **Not recommended, never done in this repository.** |
| Cloud paste / upload services | 🚫 | Forbidden: private data would leave the device. |

### Hardening the temporary LAN server

`python -m http.server` has **no authentication**: any device on the same network can
download anything it serves while it runs. Therefore:

- Serve a **dedicated scratch folder that contains only the export** — never the
  home directory, a project folder, `Documents`, or anything holding certificates,
  `.env` files, SSH keys or other private data.
- Copy the export into that folder, import on the TV, then **stop the server** and
  delete the served copy.
- Keep it short-lived and, if possible, bind it to the LAN interface only; avoid
  running it on public/shared Wi-Fi.
- The export contains add-on URLs with credentials: treat the scratch folder as
  secret while it exists, and never commit it (`.gitignore` blocks
  `profile-data.json`).

## 3. Security model

- Imported add-on URLs may contain API keys. They are stored **locally**
  (`localStorage`) and used only for GET requests to the add-on the user chose.
- The **profile summary** that is persisted contains only: import time, add-on
  **hosts** (`https://host`, no path/query), profile names, list count and
  statistics — see `state/profile.js`.
- Nothing is logged: the request log in `addonClient` records host + resource only.
- Imported add-ons can be removed at any time in **Add-ons → Remove**, which also
  deletes the stored URL.
- `profile-data.json` and any `.p12`/`.env` file are blocked by `.gitignore`; the
  automated tests use a synthetic fixture (`scripts/fixtures/wuplay-profile.sample.json`)
  containing a fake `SECRET-TOKEN-abc123` sentinel that must never be persisted.

## 4. Behaviour on unsupported / broken add-ons

Each URL is installed through the normal validated path (`addAddon` → manifest
fetch → manifest shape check). Failures are counted as *skipped* and never abort
the import; the Settings screen reports `imported / total` plus a pointer to
**Diagnostics**, where each failed request is listed **by host only** with the HTTP
status or network/TLS error — enough to identify the add-on without revealing its
configuration path or credentials.

## 5. What is persisted, and where

| Key | Contents | Contains configuration? |
|---|---|---|
| `wuplay.addons` | installed add-ons: **full base URL** (including the configuration path), name, version, resources, catalogs | **yes** — required to fetch manifest/catalog/meta/stream after a restart |
| `wuplay.profile` | import summary: add-on **hosts only**, profile names, list count, statistics | no |

The two are deliberately different: the add-on store must keep the configured URL
to work, while the profile summary and the Diagnostics screen are redacted.
Removing an add-on (Add-ons → Remove) deletes its stored URL.

## 5. Scope of this milestone

Implemented: add-ons, catalogs, metadata, stream listing (name, quality, language).
**Not** implemented: watchlist/history rendering, resume positions, profile
switching, playback (Milestone 5) and any WuPlay server sync (no public API).
