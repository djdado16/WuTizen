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
