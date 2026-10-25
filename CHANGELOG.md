# Changelog

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
