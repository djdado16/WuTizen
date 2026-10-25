# WuTizen feature matrix

Target: reproduce WuPlay on a Samsung Q60R (Tizen 5.0 / Chromium M63).
Every "verified" line cites WuPlay's own public material (README / CHANGELOG / issue
tracker). Nothing is inferred from the Android binary.

Status legend: **done** (implemented + tested) · **partial** · **planned** ·
**blocked** (no authorized interface) · **verify** (exists, needs device check).

## 1. Add-ons (Stremio protocol) — Milestone 3 scope

| Feature | Evidence | Dependency | Status |
|---|---|---|---|
| Manifest fetch + validation | WuPlay README: "Stremio add-on compatible" | HTTP(S) + CORS | **done** |
| Catalog rows from add-ons | protocol `catalog` resource | manifest `catalogs` | **done** |
| Catalog pagination (`skip`) | protocol extra args | — | **done** |
| Full metadata in details (`meta`) | protocol `meta` resource | — | **done** |
| Stream list (`stream`) | protocol `stream` resource | — | **partial** (listed, not played) |
| Subtitles (`subtitles`) | protocol `subtitles` resource | OpenSubtitles-style add-on | **partial** (client ready, UI pending) |
| Add / remove add-ons UI | README "Full control over catalogs" | — | **done** |
| Local persistence | — | `localStorage` | **done** |
| Add-on auto-update | README "Add-ons auto update" | periodic manifest refetch | planned |
| Custom URL entry | — | TV IME / keyboard | **verify** (presets avoid typing) |
| Diagnostics screen (host-only request log, AVPlay probe) | — | — | **done** (temporary, for the TV investigation) |

Key-free presets shipped in the UI: **Cinemeta** (`v3-cinemeta.strem.io`) and
**OpenSubtitles v3** (`opensubtitles-v3.strem.io`). Add-ons that need credentials
carry them inside the user-entered URL — stored on the TV only, never logged,
never committed.

## 2. Hubs and streaming-network catalogs

| Feature | Evidence (CHANGELOG) | Status |
|---|---|---|
| Hubs / hub folders, custom hubs from a system hub | "Hub cards are now Hub folders", "Create a custom hub using a system hub as a starter" | planned |
| Community sharing of screens and hubs | "Community sharing: screens and hubs" | blocked (no public API) |
| TMDB catalog filters (e.g. Release Status) | "TMDB catalog filter: Release Status now available for shows" | planned |
| MDBList lists / recommendations | "MDBList recommendations" | planned (user-supplied MDBList key) |
| Netflix / HBO Max / Disney+ / Prime Video rows | **not documented as built-in catalogs** — WuPlay reaches such content through add-ons | not claimed |

## 3. Metadata sources

| Feature | Evidence | Status |
|---|---|---|
| IMDb ratings on details/episodes/seasons | "IMDb rating on each episode and season" | planned (add-on meta `imdbRating` is already rendered) |
| TMDB metadata + filters | "TMDB catalog filter …" | planned (user-supplied TMDB key) |
| Cast & crew, similar titles, person pages | "full-screen Episodes, Cast & Crew, Similar Titles and Streams views" | partial (cast from meta; screens planned) |
| Trailers | "Trailers now play through YouTube's embedded player" | planned (YouTube embed, no key) |

TMDB needs a user key; IMDb has no public client API — WuPlay uses its own backend.
WuTizen will only use locally-entered keys or add-on-provided metadata.

## 4. Profile, library and sync

| Feature | Evidence | Status |
|---|---|---|
| Multiple profiles with per-profile settings | README "Profiles — multiple profiles with per-profile settings" | planned |
| WuPlay JSON profile import | Configurator export (user-owned file) | planned (read-only, local, redacted) |
| Watchlists, history, continue watching, resume | README "Watchlists", "Watch history & progress tracking" | planned ("Continue watching" exists as placeholder row) |
| Multi-device sync | README "Multi-device sync … Android TV devices" | **blocked** — no public API (WUPLAY_API_RESEARCH.md) |
| Trakt / Simkl scrobbling | CHANGELOG "Episodes watched on Trakt or Simkl…", issue #104 | planned (public OAuth APIs, opt-in) |
| "Recommended by Wuplay" engine | CHANGELOG "personal recommendations … no third-party required" | planned (local engine) |

## 5. Playback, audio and subtitles

| Feature | Evidence | Status |
|---|---|---|
| Stream picker with add-on filters | CHANGELOG "Stream picker: pressing right on an addon filter…" | partial (sources listed) |
| Preferred audio/subtitle languages, Clean SDH | CHANGELOG "preferred languages, Clean SDH, subtitles only for foreign audio" | planned |
| Subtitle styling | CHANGELOG "Subtitle Style panes" | planned |
| Dolby Digital conversion / audio fallback | CHANGELOG "Dolby Digital Conversion", "falls back to standard audio" | planned (AVPlay only) |
| Player OSD (time, resolution, HDR, bitrate) | CHANGELOG "Player: optional current time, end time and status line" | planned |

### AVPlay inside TizenBrew — investigation result

- TizenBrew's docs and issue tracker contain **no mention** of `avplay`/`webapis`
  (GitHub issue search: 0 results) → there is **no documented support statement**.
- A TizenBrew module runs inside TizenBrew's own Tizen web app, so our
  `app/config.xml` privileges (`internet`, `tv.inputdevice`) do **not** apply; the
  host app's privileges do.
- WuTizen now probes at runtime: `platform.probeAvPlay()` → `{ webapis, avplay }`,
  exposed as `WuTizenDebug.snapshot().avplay`.
- **Status: verify on the TV.** If `avplay` is present, Milestone 4 can play
  HLS/DASH through it; if not, playback needs the standalone `.wgt` route (our own
  manifest declares the privileges). No workaround is implemented or claimed.

## 6. Appearance and UI

| Feature | Evidence | Status |
|---|---|---|
| Icon rail, hero, poster/landscape rows, details view | official screenshots | **done** |
| Pink focus accent + outline focus style | CHANGELOG "Frost UI: one focus style … (outline and glow)" | **done** |
| Customizable player control row / themes | CHANGELOG "control row … can now be customized" | planned |
| Croatian + English UI | project requirement | **done** |

## 7. Security constraints kept in Milestone 3

- No credentials, API keys or profile exports in the repository.
- Add-on URLs are user-entered, stored locally (`localStorage`), never logged.
- All requests are read-only GETs against user-configured add-ons.
- No traffic interception and no scraping of WuPlay services.

