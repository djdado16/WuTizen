# Changelog

## v0.5.1 — 2026-10-25 — Stream discovery across all add-ons

### Fixed
- **"No available sources" on movie/episode details, although Emby Bridge / TorBox were installed.** The details screen only asked the add-on that produced the catalog item (usually Cinemeta or another catalog provider) for `/stream/…`. Stream providers are separate, catalog-less add-ons, so they were never queried. New `data/streamResolver.js` asks **every installed add-on that advertises the `stream` resource**, filters by `manifest.types` and the resource's `idPrefixes`, and merges the answers.
- **Series episode ids were percent-encoded** (`tt0944947%3A1%3A2`). Colons in the id path segment now stay literal (`tt0944947:1:2`), which providers like Emby Bridge/TorBox expect.
- Configured add-on paths and authentication are used as stored (the resolver never rebuilds or strips the base URL).

### Added
- Merged, de-duplicated source list (by url / infoHash+fileIdx / externalUrl / ytId) — valid HTTP streams are never dropped; torrent entries are kept and refused with an explanation at play time.
- Details screen shows **loading**, then "*N* sources · *k*/*m* add-ons answered", plus one line per add-on that returned nothing or failed, as **name (host) · reason** — so "no streams" is distinguishable from `auth`, `notFound`, `server`, `timeout` and `unreachable`. No URL, path or token is displayed or logged.
- `WuTizenDebug.streams.resolve(id, type, videoId)` / `.providers()` for diagnostics.

### Tests
- 15 new browser checks (132 total): synthetic **Emby Bridge** (object-form resource with `idPrefixes`, path-level config), **TorBox** (string resources, duplicate URL, torrent entry), a **401** provider and an **empty** provider; provider fan-out, per-add-on status, dedupe, provider endpoints preserved, literal-colon episode ids, `types` filtering, no URLs/tokens in the report or the UI, and details rendering merged sources.

## v0.5.0 — 2026-10-25 — Video playback (Milestone 5)

### Added
- **Video player** (`app/js/playback/`): AVPlay first (DASH/HLS/HEVC on the TV), HTML5 `<video>` fallback (MP4 + HLS everywhere, including desktop Chrome). The active engine is shown in the HUD.
- Play/pause, ±10 s seeking (FF/REW ±30 s on media keys), progress bar with buffered range, buffering spinner, auto-hiding controls, ended state and a typed error overlay.
- **Stream selection**: stream rows are focusable — OK plays that source; the **Play** button plays the first playable one.
- **Episode playback**: real `videos[]` metadata from the add-on renders as episode cards; selecting one fetches that episode's sources (`tt…:S:E`) and plays them. Demo items keep placeholder episodes.
- **Torrent/infoHash/magnet streams are refused with a clear message** — no direct torrent playback is claimed or attempted. External-app (`externalUrl`, `ytId`) and `notWebReady` sources are refused too.
- Error mapping for network loss, unsupported codecs, expired/403 links (`MEDIA_ERR_SRC_NOT_SUPPORTED`), prepare/open timeouts and unknown containers.
- Cleanup on exit: engine stop/close, media `src` released, AVPlay transparent-stage mode removed, focus restored to the originating row.
- Docs: `docs/PLAYBACK.md` (engines, formats, keys, failure codes, device verification, limitations).

### Fixed / changed (add-on import)
- **Stream-only and subtitle-only add-ons are accepted** (`resources: ['stream']` with no catalogs, object-form `resources: [{ name }]`). The previous check required `manifest.resources` and rejected manifests that declare only catalogs.
- **Stremio-scheme add-on addresses are mapped to HTTPS** instead of being dropped — a cause of "detected N, imported fewer".
- The import no longer stops at 12 add-ons (the parser's cap is 20 and every detected URL is attempted).
- **Import diagnostics**: skipped add-ons are recorded and shown in Settings as **host · reason** (`auth`, `notFound`, `server`, `notAddon`, `invalidUrl`, `timeout`, `unreachable`). No URL, path, token or stream link is stored, logged or shown.

### Tests
- 38 new browser checks (117 total): real HTML5 playback of a served sample (play/pause/seek/progress/ended), BACK lifecycle + media release + focus restore, torrent/magnet/external refusals, broken-URL error state, AVPlay adapter against a stubbed Samsung API (open/rect/prepare/play/stop/close, `is-avplay` plane), episode metadata + per-episode stream fetch + episode playback, stream-only/subtitle-only installs, Stremio-scheme mapping, host+reason import diagnostics and their redaction.

## v0.4.1 — 2026-10-25 — Samsung IME / import hotfix

### Fixed
- **Import from URL re-opened the Samsung keyboard instead of importing.** The URL `<input>` kept DOM focus after the on-screen keyboard's *Done*, and Tizen re-attaches the IME to any focused editable element, so OK on **Uvoz** hit the field again. The field is now blurred as soon as the remote leaves it, *Done* commits the typed text (trimmed) and moves focus to the **Import** action, and OK then starts exactly one import.
- Done on the keyboard is committed exactly once: a repeat/echo keydown cannot import twice, and an import in flight ignores further OK presses.
- Import no longer moves focus back to the URL field when it finishes (success or error) — it stays on **Import**, so the keyboard stays closed.
- `BACKSPACE` while typing no longer closes the Settings screen (it was normalized to BACK). It now edits text; BACK while editing only closes the keyboard.
- The custom-URL field in **Add-ons** gets the same treatment (Done blurs and moves to its Add action).

### Tests
- 16 new checks (79 total): BACKSPACE keeps Settings open, *Done* commits the address, *Done* closes the keyboard and moves focus to Import, *Done* alone does not import, one OK (with a duplicated keydown) imports exactly once, keyboard stays closed after the import, focus remains on Import, plus the "IME closed itself" variant and Settings navigation.

## v0.4.0 — 2026-10-24 — WuPlay profile and add-on import (Milestone 4)

### Added
- **WuPlay profile import**: tolerant, redacting parser for `profile-data.json` (add-on URLs, profile names, list counts) with a Settings screen offering import-by-URL (LAN) and file picker.
- Imported add-ons are installed through the validated manifest path; unreachable/unsupported ones are skipped and counted.
- **Stream list** in details now shows name, quality (1080p/2160p/HDR…) and language when the add-on provides them.
- Docs: `docs/PROFILE_IMPORT.md` (transfer methods on TizenBrew, security model) and a synthetic fixture (`scripts/fixtures/wuplay-profile.sample.json`).

### Security
- Persisted profile summary holds add-on **hosts** only — never full URLs, tokens or the raw export; a sentinel token in the fixture is asserted absent from storage.

### Tests
- 6 new checks (60 total): import installs reachable add-ons, unsupported add-on skipped, storage contains no token, catalogs appear, stream quality label rendered, Settings screen open/close.

## v0.3.1 — 2026-10-24 — Diagnostic hotfix

### Added
- **Diagnostics screen** (Add-ons → Diagnostics): add-on host (scheme+host only), per-request HTTP status or network error, item counts, request duration, AVPlay/`webapis` availability, origin and user agent, plus Retry/Close.
- In-memory request log in the add-on client — records host, resource, type/id, status, item count; **never** the full add-on URL or query string.

### Changed
- When add-ons are installed but every catalog fails, the placeholder rows are now replaced by **explicit error rows** (catalog name, reason, hint) instead of staying silently on screen as if nothing was configured.

### Tests
- 5 new checks (54 total): failing add-on (valid manifest, HTTP 500 catalog), explicit error row with no mock fallback, diagnostics log entry, diagnostics screen open/close, placeholder restore after removing the failing add-on.

## v0.3.0 — 2026-10-24 — Add-on engine (Milestone 3)

### Added
- **Stremio add-on engine**: manifest validation, catalog rows with `skip` pagination, full `meta` in the details view and a `stream` source list. Subtitles resource client is in place.
- **Add-ons screen** (rail → Dodaci): installed list with remove, one-tap public presets (Cinemeta, OpenSubtitles v3) and a custom-URL field.
- Add-ons persist locally (`localStorage`); catalogs replace the placeholder rows when an add-on is installed and the placeholder catalogue returns when the last one is removed.
- Error handling for unreachable add-ons, invalid manifests and non-HTTP addresses.
- `platform.probeAvPlay()` — runtime AVPlay availability probe (exposed in the debug snapshot).
- Docs: `docs/WUTIZEN_FEATURES.md` (verified WuPlay feature matrix + AVPlay findings).

### Tests
- 12 new checks (49 total): manifest accept/reject, catalog rendering, lazy posters, meta + streams in details, pagination, persistence across reload, add/remove round-trip.

## v0.2.1 — 2026-10-24 — Q60R hotfix

### Fixed
- **BACK needed 5–6 presses** to close the details view: overlay layers could stack, and BACK popped only one layer per press. BACK now dismisses by state (pops the whole stack), and duplicate/held BACK key events are ignored, so one press always closes it.
- **Remote keys were occasionally ignored**: input is now bound once in the capture phase on `document`, so a host shell (TizenBrew) that stops event propagation can no longer hide keys.
- **Focus could be left unset** after closing details (OK appeared dead): restoration now falls back to the first focusable element.
- Guarded against a second boot of the bundle, which would have attached duplicate listeners.

### Changed
- NASA space imagery removed. Cards, hero and details now use **neutral dark procedural placeholders** (`app/assets/ph`, `npm run placeholders`); the WuPlay-inspired layout is unchanged.

### Tests
- 7 regression checks added (held BACK, duplicate BACK keydown, repeated OK, repeated navigation): `npm run smoke` now runs 37 checks.

## v0.2.0 — 2026-10-24 — WuPlay-style visual redesign (Milestone 2)

### Added
- **Icon-only left rail** that expands when it receives focus: a translucent panel slides in and the content layer is pushed aside (single `translate3d`, no width animation), with the pink `#ff3d7f` focus outline.
- **Cinematic hero**: full-bleed backdrop with left-to-right and bottom-up scrims, title, duration/year/rating-badge/genre metadata, synopsis and cast.
- **Content rows** with 16:9 landscape cards (progress bar + episode badge) and 2:3 poster cards, horizontally paged by focus.
- **Full-screen details view**: dimmed backdrop, metadata, description, Play / Trailer / In Watchlist / Mark Watched actions and a series episode section.
- **Lazy image loading** via `IntersectionObserver` with a bounded live-bitmap budget that never evicts on-screen images.
- **Windowed row rendering**: 8 cards initially, 8 more appended as focus approaches the end of a row.
- Public-domain NASA/JPL sample artwork with in-repo credits (`app/assets/sample/CREDITS.md`).

### Changed
- Focus/brand accent changed from violet to WuPlay pink; metrics and type scale measured from the official WuPlay screenshots (150 px rail, 238 px content edge, 430 px hero, 272×380 posters, 28 px gaps).
- Navigation restructured to match the reference (profile, search, home, discover, lists … language, settings).
- Croatian and English strings extended for the new navigation and details actions.

### Fixed (found by the milestone's visual + automated checks)
- Details view was translucent and let the home page bleed through.
- The lazy-loader eviction queue could unload images that were still on screen.
- The expanded rail covered content instead of pushing it.

### Tests
- `npm run smoke` grew from 21 to **30** headless-Chrome checks; `npm run verify` unchanged at 8.

### Notes
- No streaming, playback, profile import or network requests yet. All titles, synopses, ratings and episodes are invented placeholder data.

## v0.1.0 — initial TizenBrew-ready release
- TizenBrew application module (`packageType: "app"`, `appName: "WuTizen"`, `appPath: "dist/index.html"`) plus standalone Tizen `.wgt` manifest.
- 1920×1080 stage, spatial D-pad focus manager with region memory, Croatian/English localization, `verify` + `smoke` tooling.
