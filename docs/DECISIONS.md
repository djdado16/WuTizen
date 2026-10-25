# Architecture decisions (ADR log)

Short records of *why* the codebase looks like it does. New decisions are appended.

---

## D1 — No UI framework (vanilla JS + CSS)
**Context:** Tizen 5.0 / Chromium M63, 2019 SoC, must feel native and stay smooth.
**Decision:** no React/Vue/Preact, no virtual DOM.
**Consequences:** 34 kB bundle, no framework runtime cost, full control over DOM
lifecycle; we own the focus manager and view rendering (≈400 lines total).

## D2 — Bundle to a single IIFE
**Context:** Tizen serves apps from `file://`, where `<script type="module">` is
blocked by CORS.
**Decision:** author ESM, ship one IIFE via esbuild (`format: 'iife'`).
**Consequences:** no dynamic imports, no code splitting — acceptable at this size.

## D3 — esbuild as the only build dependency
**Context:** need fast builds, ES2017 down-levelling, tiny footprint.
**Decision:** `esbuild` as the single devDependency; `target: ['chrome63']`.
**Consequences:** npm install is ~2 s; offline builds once installed.

## D4 — Fixed 1920×1080 stage with absolute layout
**Context:** TV CSS viewport is 1920×1080 regardless of the 4K panel.
**Decision:** `.stage` is exactly 1920×1080, regions positioned absolutely; the
browser preview scales the stage, the TV never does.
**Consequences:** deterministic geometry for focus maths; no responsive breakpoints.
Rejected: grid/flex rows (reflow cost, harder geometry), `vw/vh` (rounding issues).

## D5 — Custom spatial focus manager with region memory
**Context:** TV remotes are the only input; Android TV apps have trustworthy focus
semantics we must emulate.
**Decision:** geometric nearest-candidate scoring (`primary + 2.5 × secondary`) over
live `getBoundingClientRect()` values, plus **region memory**: crossing sideways
into another region restores the last element used there; vertical movement stays
geometric to preserve columns.
**Consequences:** predictable D-pad behaviour with no per-screen wiring; costs one
layout read per key press (~30 elements) — fine now, revisit with virtualization.
Alternative rejected: `tabindex` + browser focus (unreliable on TV engines and
impossible to scope inside overlays).

## D6 — Focus state is a class, not `:focus`
**Decision:** `.is-focused` on the focused element; `outline` + `transform: scale`.
**Consequences:** works with the spatial manager, no dependence on `:focus-visible`
(unsupported), animations stay composited.

## D7 — No runtime dependencies; `localStorage` only
**Decision:** persistence through a namespaced, try/catch-wrapped `localStorage`.
**Consequences:** 5 MB cap; IndexedDB deferred because its TV implementations are
inconsistent. Profile import (M3) must be size-capped and pruned.

## D8 — Platform access only through `platform/tizen.js`
**Decision:** every `tizen`/`webapis` call is capability-guarded in one module.
**Consequences:** identical bundle runs in Chrome and on the TV; no `if (tizen)`
scattered through UI code. `registerKeys`/`exitApp` are the seams for M1+.

## D9 — Placeholder, self-authored assets only
**Decision:** gradient posters, procedural icon, no WuPlay artwork or trademarks.
**Consequences:** zero licensing risk in M0; the fidelity pass will add assets only
where the owner has rights (own artwork, OFL fonts, add-on-provided posters).

## D10 — Localization from day one, Croatian default
**Decision:** every user-visible string goes through `t()`, dictionaries must have
identical key sets (enforced by `npm run verify`); language persisted locally and
switchable from the rail with the remote only.
**Consequences:** no hardcoded Croatian strings in components; adding a third
language is one dictionary file.

## D11 — Verification gates before any device claim
**Decision:** `npm run verify` (static, M63 syntax/CSS/i18n/manifest) and
`npm run smoke` (headless Chrome, real key events over CDP) must pass before code
is considered done; on-device behaviour is only claimed after testing on the Q60R.
**Consequences:** two real bugs were already caught this way (region-memory
hijacking vertical movement; focus ring clipped by the shelf viewport).

## D12 — No WuPlay API integration
**Decision:** see `WUPLAY_API_RESEARCH.md`: no authorized API exists, so no client
is written. Profile data enters only through a user-initiated, read-only local
import; Stremio add-on protocol (public) is the interoperability layer.
**Consequences:** no sync code, no invented endpoints, no credential handling yet.

## D13 — Distribute as a TizenBrew module *and* a standalone .wgt
**Context:** TizenBrew (reisxd/TizenBrew) runs web apps on Samsung TVs without
Tizen Studio: it fetches `<type>/<name>/package.json` from jsDelivr and serves an
`app`-type module's `appPath` locally.
**Decision:** add the TizenBrew manifest fields to the existing `package.json`
(`packageType: "app"`, `appName`, `appPath: "dist/index.html"`, `keys`) instead of
creating a second project, and stop gitignoring `dist/` because the module payload
must be in the repository. The standalone `.wgt` path is untouched.
**Consequences:** one build output serves both distribution routes; `dist/` is now
versioned (≈55 kB); publishing = push to GitHub; `npm run module` validates the
contract and prints the exact install string.

## D14 — WuPlay visual redesign (Milestone 2)
**Context:** the official WuPlay screenshots define the target look: icon-only
rail, cinematic hero, poster rows, full-bleed details view, pink focus accent.
**Decision:** rebuild the shell around those measurements (see DESIGN_TARGETS.md).
The rail expands by sliding a translucent panel and pushing the content layer with
a single `translate3d` (no width animation, nothing gets covered). Rows render in
windows of 8 cards. Images load through `IntersectionObserver` with a bounded
live-bitmap budget that never evicts an on-screen image.
**Superseded:** the NASA imagery shipped in v0.2.0 was removed after on-TV review
(it looked nothing like WuPlay); artwork is now neutral procedural placeholders.
**Consequences:** 22 of 24 cards in the DOM at boot, ~13-18 live bitmaps, all
motion is transform/opacity only; artwork and metadata are clearly marked
placeholders and are replaced by add-on data in Milestone 3.

## D15 — Remote input reliability + neutral placeholders (Q60R bugfix)
**Context:** on the Q60R, BACK needed five or six presses to leave the details
view, and remote keys were occasionally ignored altogether.
**Decision:**
- input is bound exactly once, in the **capture phase on `document`** — a host
  shell that calls `stopPropagation()` in the bubble phase (TizenBrew) can no
  longer hide keys from the app;
- **transitions (BACK / OK / EXIT) fire once per physical press**: `event.repeat`
  and a duplicate keydown without the matching keyup are ignored, and the guard is
  cleared on keyup, `blur` and `visibilitychange` so it can never stick;
- **BACK dismisses by state** — `closeDetails()` pops the whole stack, so one
  press is always enough regardless of how the stack grew;
- `openDetails()` refuses to stack a second layer, and focus restoration falls
  back to `focusFirst()` so the cursor is never left unset (an unset cursor made
  OK look dead);
- `start()` guards against a second boot of the same bundle (duplicate listeners).
- placeholder artwork is now neutral and procedural (`app/assets/ph`, six 640×360
  gradients, ~20 kB); the NASA imagery was removed because it made the UI read
  nothing like WuPlay.
**Consequences:** seven regression checks were added to `npm run smoke` (held
BACK, duplicate BACK keydown, repeated OK, repeated navigation); total 37.

## D16 — TV on-screen keyboard (IME) vs. the remote (v0.4.1)
**Context:** on the TV, typing the LAN address in **Settings → Import from URL**
and then pressing OK on **Uvoz** re-opened the Samsung keyboard instead of
importing. Root cause: the URL `<input>` kept **DOM** focus after the IME's
*Done* (the logical focus ring had moved on, the real one had not). Tizen keeps
the keyboard attached to whatever editable element has DOM focus, so the next OK
went back into the field; a failed import also left focus on the field. A second
bug on the same path: Backspace is normalized to BACK (keyCode 8), so deleting a
character closed the whole Settings screen.
**Decision:**
- the app tracks the field that owns DOM focus (`imeField`) and **blurs it as
  soon as the remote leaves it** — that is what closes the IME;
- while a field is focused the key router is in **editing mode**: Backspace and
  LEFT/RIGHT/UP are left to the field/IME, *Done* (OK) and DOWN commit the value
  (trimmed), blur the field and move focus to the field's action (Settings →
  **Import**); BACK closes only the keyboard;
- **Done never imports.** Importing needs its own OK press on **Import**, so one
  press can never both commit text and fire a request;
- an import in flight is **single-flight** (further OK presses are ignored) and
  focus returns to **Import**, never to the field, on success *and* on error;
- when the IME closed itself before the page saw the key, OK on the still-focused
  field commits and moves to **Import** instead of being a dead key that re-opens
  the keyboard.
**Consequences:** the remote never gets "stuck" on a text field; 16 new smoke
checks pin the chain (total 79). The same handling applies to the custom-URL
field in Add-ons, where *Done* moves to that row's Add action.

## D17 — Playback engines: AVPlay first, HTML5 always (Milestone 5)
**Context:** Milestone 5 must play what Stremio add-ons return, on a Q60R
(Tizen 5.0, Chromium M63) inside TizenBrew, without pretending to support
torrents.
**Decision:**
- **Two engines, one player API.** `platform.canUseAvPlay()` requires
  `webapis.avplay` *and* a top-level document, because the AVPlay video plane is
  composited *below* the page and cannot be shown from inside a host iframe. When
  it is available the page switches to a transparent stage (`html.is-avplay`) and
  hides the app UI; otherwise the player runs `<video>`.
- **Order is AVPlay → HTML5**, and a failed AVPlay open/prepare falls through to
  HTML5 automatically. The active engine is printed in the HUD so a device report
  never has to guess which pipeline ran.
- **DASH is AVPlay-only.** M63 `<video>` has no DASH support and shipping dash.js
  would cost more than the feature is worth right now; documented instead.
- **Streams are classified before anything is fetched** (`playback/sources.js`):
  HTTP URLs by extension/hint (m3u8/mpd/progressive/auto), torrent metadata and
  magnets as `torrent`, `externalUrl`/`ytId` as `external`. Refusals still open
  the player — with the reason on screen — because a silent no-op looks like a
  bug on the TV.
- **Errors are typed, not raw.** Media errors map to `network` / `codec` /
  `expired` / `unsupported`, plus `timeout` for a stalled open; `expired`
  deliberately covers 403/404 signed links, since that is what they look like.
- **Nothing is logged that identifies a stream**: only the classified type or the
  refusal reason is logged.
**Consequences:** 38 new smoke checks (117 total) drive the real HTML5 engine with
a served 20 s WAV sample (play/pause/seek/progress/ended), exercise the AVPlay
adapter against a stub of Samsung's API, and cover episode selection, torrent
refusal and cleanup. Remaining device limits (subtitles, resume, DASH without
AVPlay) are listed in `docs/PLAYBACK.md` rather than implied to work.

## D18 — Stream discovery across add-ons (v0.5.1)
**Context:** on the TV, movie/episode details said "no sources" while Emby Bridge
and TorBox were visibly installed. Verified in code: `openDetails()` called
`addonClient.streams(item.addonUrl, …)`, i.e. it asked **the catalog add-on only**
(Cinemeta-style, no `stream` resource). Stream providers are separate,
catalog-less add-ons, so they were never queried. Second, smaller defect found on
the same path: the id path segment was `encodeURIComponent`-ed, producing
`tt0944947%3A1%3A2` for episodes.
**Decision:**
- `data/streamResolver.js` fans out to **all installed add-ons advertising the
  `stream` resource**, filtered by `manifest.types` and the resource's
  `idPrefixes` (stored per add-on by the Milestone 5 `summarize` change);
- ids keep literal colons; `:` is the only character un-escaped;
- results are merged and de-duplicated by url / infoHash+fileIdx / externalUrl /
  ytId — duplicates are dropped, valid HTTP streams and torrent entries are kept;
- every request is reported as `ok | empty | error(reason)` and the details screen
  prints counts plus `name (host) · reason`, so "no streams returned" is
  distinguishable from `auth`/network failures;
- only host-level data leaves the resolver: no URL, path, query or token is
  rendered or logged.
**Consequences:** 15 new smoke checks (132 total) with synthetic Emby-Bridge- and
TorBox-shaped providers (object/string resources, `idPrefixes`, path config), a
401 provider and an empty provider; they verify fan-out, dedupe, id form, type
filtering and redaction. Existing add-on storage and profiles are untouched.

## D19 — Measured rail offset, metadata migration, redacted source diagnostics
**Context:** on the Q60R, BACK out of Settings left the left half of Home covered,
and imported Emby Bridge/TorBox still produced "no sources" after v0.5.1.
**Findings (code + tests, not guesses):**
- `RAIL_PUSH` was hardcoded to `150` while the rail panel is
  `--rail-panel-width: 300px`; BACK from Settings restores focus to the rail, so
  the panel was expanded while the content was only shifted 150 px — the panel
  painted over 150 px of the page. The existing smoke check had frozen the wrong
  number (`translate3d(150px…`), which is why it never caught it.
- Entries stored by v0.4.x have `resources: []` and no `idPrefixes` field
  (v0.4's `summarize` kept string resources only), so `advertises(entry,'stream')`
  was false for Emby Bridge/TorBox and v0.5.1's fan-out found **no candidates** —
  the resolver was right, the stored metadata was stale.
**Decision:**
- the rail offset is **measured from the panel** and re-measured on resize; a
  test asserts offset == panel width and that 4× Settings→BACK leaves Home
  unchanged (rows, titles, stage transform, document scroll);
- `refreshAddonMetadata()` runs once at boot: it re-fetches the manifest for
  entries missing `idPrefixes`/`resources` and merges the metadata into the
  existing entry. URLs (and therefore configuration/authentication) are never
  rewritten and no entry is ever removed; a failed refresh changes nothing;
- the resolver treats *unknown* metadata as a candidate (unverified) so an entry
  can still produce streams if the refresh could not run;
- Diagnostics shows the last stream resolution: type/id, candidate count,
  per-add-on status + HTTP status + returned count, and skip reasons. The stored
  snapshot is counts/hosts only — stream objects (which carry signed URLs) are
  returned to the caller but never kept for diagnostics.
**Consequences:** 15 new smoke checks (147 total), including a deliberately
v0.4.x-shaped stored entry that is still queried, then migrated in place.
