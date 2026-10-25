# Changelog

## v0.7.1 — 2026-10-25 — PC/Mobile configurator

### Added
- **Local-network configurator** (`tools/configurator/`): a dependency-free Node server + browser page to configure WuTizen from a PC or phone — Emby server, Stremio add-on URLs, a WuPlay profile export and preferences (language, subtitle size). The TV only makes **outbound** requests (a TizenBrew webview cannot host a server).
- **Pairing**: the PC issues a 6-digit code (8 min TTL, single use); the user types it on the TV (Settings → “Konfigurator s računala”). The payload is handed over only after **“Approve & send”** on the PC, delivered **once**, and only then applied on the TV (Add-ons are added, never replaced; lists/profiles untouched).
- Preferences are stored under `wuplay.prefs`; the PC address is remembered (`wuplay.configurator`) while the pairing code is never persisted.

### Security
- Pairing code: 6 digits, in-memory only, expires after 8 minutes, single use; an unapproved session never returns a payload and a delivered one cannot be replayed.
- No cloud storage, no relays, LAN only; the server logs session events but never payloads, credentials or URLs.
- `https` TV + `http` configurator is refused as mixed content. Limitation: transfer is plain HTTP on the LAN, and credentials are stored in `localStorage` (not encrypted) — documented in `docs/CONFIGURATOR.md`.

### Tests
- 10 new browser checks (231 total): malformed code rejected, 6-digit code issued, TV waits without payload, approved payload arrives, apply adds new add-ons and reports the rejected one, preferences stored, Emby credentials validated, replay blocked, unapproved session yields nothing, existing add-ons survive.

## v0.7.0 — 2026-10-25 — Provider-first picker, capabilities, My Stuff, native Emby client

### Fixed
- **StreamBridge was missing from source selection** because the picker listed *streams*, not *providers*: an add-on that returned no streams (error, empty, or all sources de-duplicated/filtered) left no trace. Play now opens a **provider list first**, so every compatible stream add-on appears with its own state (`ready` / `no sources` / `error · reason`).
- **`idPrefixes`/`types` were read from one merged field**; they are now taken per declared resource (`resourceDetails`), so a multi-role add-on is filtered by the rules it declared for `stream` specifically.
- Subtitles over AVPlay: the opaque `.app` background covered the native video plane (and the subtitle overlay area); it is now transparent in `is-avplay` mode.

### Added
- **Two-stage source picker (WuPlay behaviour)**: providers → that provider's streams, each row independently selectable, quality/codec/HDR/size/language shown, per-provider status. BACK walks the chain **streams → providers → details/player**. **Never auto-plays** when more than one provider can serve the item; a single provider with a single source still plays directly.
- **Automatic capability classification**: `catalog` / `meta` / `stream` / `subtitles` derived from manifest resources (string *and* object form), with resource-level `types`/`idPrefixes`; shown as localised labels in **Add-ons**.
- **My Stuff** (`state/lists.js`): locally persisted *Moje liste* / *Gledano* lists — add from details (Watchlist / Mark-watched), list screen on the rail entry, remove with the remote. Only id/kind/title/year/poster are stored — never add-on URLs, tokens or stream links.
- Redacted diagnostics: **Subtitles** line (candidate count, languages, per-add-on status, loaded track + cue count, load error) next to the existing sources/playback lines.
- Docs: `docs/MDBLIST.md` (integration requirements, not implemented).

### Tests
- 11 new browser checks (198 total): provider stage first, provider rows/state/redaction, provider → streams, BACK from streams to providers, blocked source selected inside its provider, per-resource prefix filtering, My Stuff add/list/remove/persist, BACK closing My Stuff, subtitle diagnostics.

### Not in this iteration
- Native Emby server (connection, library browsing, Emby as a provider) — documented plan only.
- Hub system (streaming services / genres / studios / decades / collections) and custom screens.
- MDBList API, Trakt/Simkl, importer extensions for list items and hub configs.

## v0.6.0 — 2026-10-25 — Player UX, StreamBridge and subtitles

### Fixed
- **StreamBridge (Emby → Stremio) streams were refused.** `behaviorHints.notWebReady` was treated as "cannot play"; it only means "not guaranteed web-playable" (StreamBridge marks its direct-play links with it). Such URLs are now attempted. The one honest refusal left is `behaviorHints.proxyHeaders.request`: no HTTP headers can be sent by `<video>` or AVPlay, so the player says exactly that instead of failing generically.
- **Mixed content was reported as a generic network error.** An `http://` Emby URL inside an `https://` page is blocked by Chromium (StreamBridge's own README documents this); it is now detected before playback and explained.
- **The sidebar stayed visible during playback.** The player sat at `z-index: 40` while `.rail` is 50 and `.details` 60. The player is now `200`, and playback adds `html.is-player`, which hides the whole shell (rail, hero, rows, details).
- **Subtitles were missing.** Streams can carry their own `subtitles[]` (StreamBridge does) and that list was ignored; subtitle add-ons were never queried.

### Added
- **Source picker**: every stream from every compatible add-on, grouped by add-on, showing resolution / HDR / codec / size / language; each row is remote-selectable; **Play opens the picker when more than one source exists**; **UP during playback re-opens it to switch source** without losing the subtitle selection.
- **True fullscreen playback**: shell hidden, player fills the stage, only the player takes remote keys; BACK restores the details screen and focus.
- **Subtitles**: candidates from the chosen stream plus all installed `subtitles` add-ons; SRT and WebVTT parsing (SRT→VTT conversion available), rendered in a DOM overlay so **AVPlay and HTML5 behave the same**; picker with Off / languages / size (M·L·XL) / position (bottom·middle·top) / timing offset (±0.5 s); **DOWN during playback** opens it.
- **Playback diagnostics**: Diagnostics now shows the last playback as add-on · stream type · engine (AVPlay/HTML5) · error — host/type only, never a URL or key.
- Docs: picker/fullscreen/subtitle sections in `docs/PLAYBACK.md`.

### Tests
- 37 new browser checks (184 total): StreamBridge-shaped provider (path config, direct-play URL with key in the query, `notWebReady`, per-stream subtitles), header-requiring stream listed but refused with `requiresHeaders`, mixed-content detection, metadata parsing, picker grouping/selection/no-URL redaction, fullscreen geometry + shell visibility, mid-playback source switching, subtitle discovery from both sources, SRT rendering, size/position/offset, BACK layering, cleanup and the redacted playback diagnostics line.

## v0.5.2 — 2026-10-25 — Q60R layout and stream metadata fixes

### Fixed
- **Half the Home screen covered after BACK from Settings.** The content offset for the expanded rail was a code constant (`RAIL_PUSH = 150`) while the panel is `--rail-panel-width: 300px`, so whenever focus landed on the rail (exactly what BACK from Settings does) the panel painted over the left half of the page. The offset is now measured from the rail panel and re-measured on resize; content is either fully beside the panel or fully back (verified over repeated Settings→BACK cycles).
- **No streams from add-ons imported by v0.4.x.** Those versions stored only string-form `resources` and no `idPrefixes`, so an Emby Bridge/TorBox manifest with `resources: [{ name: 'stream', … }]` was persisted as `resources: []` and could never be recognised as a stream provider. Added:
  - a **one-time metadata refresh** at boot that re-reads the manifest and merges `resources`/`types`/`idPrefixes` into existing entries — the stored URL (configuration path, authentication) is never changed and nothing is removed;
  - a resolver fallback that **still asks add-ons with unknown metadata** (they may well be providers), instead of silently skipping them.

### Added
- **Diagnostics → “Sources (last request)”** (TV-visible): the requested `type/id`, candidate count, per add-on name (host) · ok/empty/error · reason · HTTP status · streams returned, and a “skipped: …” line per add-on that was filtered out (`noStreamResource`, `typeMismatch`, `idPrefixes`, `limit`). Distinguishes *no candidates*, *no results* and *request failures*.
- Redaction: the diagnostics snapshot holds counts and hosts only — no stream objects, URLs, paths, queries or tokens (asserted in tests).

### Tests
- 15 new browser checks (147 total): 4× Settings→BACK leaves Home byte-identical (rows, row titles, stage transform, document scroll, rail offset), RIGHT returns the unshifted layout, rail offset equals the measured panel width; stale (v0.4.x-shaped) add-on is still queried, metadata refresh restores `resources`/`idPrefixes` and keeps the URL, nothing is removed; diagnostics expose candidates, HTTP 200/401, skip reasons and stay redacted on screen.

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
