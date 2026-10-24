# Tizen 5.0 / Chromium M63 compatibility record

## 1. Target engine (verified, not assumed)

Samsung publishes a per-model-year engine table
(<https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html>):

| TV model year | Platform | Web engine |
|---|---|---|
| 2021 | Tizen 6.0 | Chromium M76 |
| 2020 | Tizen 5.5 | Chromium M69 |
| **2019** | **Tizen 5.0** | **Chromium M63** ← QE65Q60RATXXH |
| 2018 | Tizen 4.0 | Chromium M56 |

Everything in this project is therefore validated against **M63 (Dec 2017)**,
not against the Chromium version of the developer machine.

## 2. Hard structural constraints

### 2.1 No native ES modules at runtime
Tizen serves packaged applications from a **`file://` origin**, where Chromium
blocks `<script type="module">` (CORS). Source code uses ESM for authoring
convenience, and `scripts/build.mjs` bundles it to a **single IIFE** with
`target: chrome63`. `npm run verify` fails the build if the bundle ever contains
`import`/`export` statements.

### 2.2 No syntax newer than M63
`target: chrome63` makes esbuild down-level newer syntax. The verifier greps the
bundle for `?.`, `??`, `&&=`/`||=`/`??=`, class private fields, static blocks and
optional `catch {}` bindings.

### 2.3 CSS must avoid post-M63 features
The verifier rejects: flex/grid `gap` shorthand, `inset`, `aspect-ratio`,
`backdrop-filter`, `:focus-visible`, `:is()/:where()/:has()`,
`clamp()/min()/max()`, `color-mix()`, `@container`, native nesting, individual
`translate/rotate/scale` properties, logical properties, `dvh/svh/lvh`,
`@supports selector()`.

Supported and used deliberately: flexbox, CSS custom properties, `calc()`,
`transform`, `translate3d`, `outline`/`outline-offset`, `-webkit-line-clamp`,
`radial-gradient`, `rgba()`, `transition`, `will-change`.

### 2.4 API availability on M63

| API | M63 | Consequence in this codebase |
|---|---|---|
| `fetch` | yes | available, but XHR-with-timeout is preferred for cancellation |
| `AbortController` | **no** (M66) | request cancellation will use `XMLHttpRequest.timeout` |
| `ResizeObserver` | no (M64) | layout re-measure on `window.resize` |
| `IntersectionObserver` | yes (M51) | usable later for poster lazy-loading |
| `localStorage` | yes | used only for the language preference today |
| `Element.closest` | yes (M41) | used by the focus manager and telemetry-free snapshot |
| Custom Elements / Shadow DOM v1 | yes | intentionally unused (memory) |

## 3. Measured results on this codebase

`npm run build` (unminified, most honest size):

| File | Size |
|---|---|
| `js/app.js` | 76.8 kB |
| `css/components.css` | 6.9 kB |
| `css/layout.css` | 3.0 kB |
| `css/tokens.css` | 1.7 kB |
| `css/reset.css` | 1.1 kB |
| `index.html` | 1.3 kB |
| `config.xml` | 1.8 kB |
| `assets/icon.png` | 4.7 kB |
| `assets/ph/*.png` (6 neutral placeholders) | 19.8 kB |
| **total** | **122.4 kB** |

`npm run verify` → 8/8 PASS (payload, IIFE, M63 syntax, M63 CSS, i18n parity,
`t()` key coverage, TV declarations, XML well-formedness).

`npm run smoke` (headless Chrome 149, 1920×1080 emulation) → 49/49 PASS:
placeholder catalogue and navigation as before, plus the add-on engine against a
hermetic mock add-on server: manifest accept/reject, catalog rows replacing
placeholders, lazy posters, full `meta` + `stream` sources in details, `skip`
pagination, add/remove round-trip, persistence across a page reload.

## 4. Performance plan for the Q60R

Rules already followed in Milestone 0:

1. **Animate transform/opacity only.** Row scrolling is a `translate3d` on the
   track; focus highlight scales the card with `transform`. No layout animation,
   no `scrollLeft`, no animated `box-shadow` on many elements.
2. **Fixed 1920×1080 stage, absolute layout.** No reflow chains; geometry read
   only on key press.
3. **Bounded DOM.** 18 cards today. Cards are plain `<div>`s, no per-card
   listeners (one delegated `keydown` handler at window level).
4. **No runtime dependencies.** Bundle is 34 kB, so parse/eval time at launch is
   negligible even on a 2019 SoC.

Deferred (with the milestone that needs it):

| Concern | Plan | Milestone |
|---|---|---|
| Poster images | bounded LRU decode cache, max ~30 live `<img>`, `src=''` on eviction, `IntersectionObserver` lazy load | M2 |
| Large catalogues | windowed list rendering (mount ~visible+4 cards per row), cached row geometry | M2 |
| Watch-history persistence | compact JSON in `localStorage`, capped at N entries | M3 |
| HLS/DASH playback | `webapis.avplay`, `$WEBAPIS/webapis/webapis.js`, direct AVPlay (no `<video>` fallback) | M4 |

## 5. Assumptions that need on-device confirmation (Milestone 1)

These cannot be proven in a desktop browser and must be verified on the TV:

1. **`required_version="5.0"` install acceptance.** The current Samsung TV SDK
   is 10.0; we deliberately declare 5.0. Verify install and launch on the Q60R.
2. **`tizen.tvinputdevice.registerKeyBatch()`** succeeds with the
   `tv.inputdevice` privilege (media keys then arrive).
3. **`webapis` / AVPlay presence** (needed only from M4, but check early).
4. **localStorage quota** and persistence across app restarts.
5. **Text rendering** — the placeholder font stack (`Segoe UI`/`SamsungOneUI`)
   will be replaced by a bundled OFL font once typography is measured from the
   screenshots.
6. **BACK/EXIT key codes** 10009 / 10182 as handled in `core/keys.js`.
