# Changelog

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
