# Design targets — what is placeholder and what the screenshots must define

Milestone 0 intentionally ships a **wireframe**, not a WuPlay replica: the layout
structure, focus behaviour and localization are real; the visual identity is not.

## 1. Placeholder values that MUST be replaced from screenshots

| Area | File | Current placeholder |
|---|---|---|
| Palette (bg, surfaces, accent) | `app/css/tokens.css` | neutral dark + `#7c5cff` accent |
| Typography (family, sizes, weights, line heights) | `tokens.css` `--fs-*`, `reset.css` font stack | `Segoe UI`/`SamsungOneUI` stack, sizes guessed |
| Radii, spacing, gutters | `tokens.css`, `layout.css` | 8/12/20 px radii, 60 px gutter, 300 px rail |
| Card size and aspect ratio | `components.css` `.card` | 228 × 320 (portrait 0.71), 26 px gap |
| Focus treatment | `components.css` `.is-focused` | `scale(1.05)` + 4 px inset white ring + lift shadow |
| Motion timings | `tokens.css` `--t-fast/--t-mid` | 120 ms / 200 ms |
| Navigation pattern | `layout.css` `.rail` | left rail (top-nav is a real possibility) |
| Detail overlay | `components.css` `.detail` | centred card overlay |
| App icon / logo | `app/assets/icon.png` | procedural "W" disc |

Typography note: a bundled **SIL OFL** font (e.g. Inter) or the TV's built-in
family will be used — WuPlay's exact typeface must not be copied without a licence.

## 2. Screenshot → implementation mapping

| WuPlay screen (reference to be supplied) | Our screen | File(s) | Milestone |
|---|---|---|---|
| Profile selection ("Who's watching") | `profiles` | `ui/views/profiles.js` | M3 |
| Home | `home` | `ui/views/home.js` | M0 (structure) / M1 (fidelity) |
| Catalog / Discover | `catalog` | `ui/views/catalog.js` | M1–M2 |
| Details | `detail` | `ui/views/detail.js` | M1 |
| Search | `search` | `ui/views/search.js` | M2 |
| Settings | `settings` | `ui/views/settings.js` | M3 |
| Player / OSD | `player` | `ui/views/player.js` + AVPlay | M4 |

## 3. Checklist for the visual fidelity pass (Milestone 1)

For each supplied screenshot, measure and record before coding:

- [ ] Stage composition: is navigation a left rail, top bar, or floating sidebar?
      Rail width, top bar height, content gutters, safe area.
- [ ] Row anatomy: number of cards visible at 1920 px, card width/height,
      horizontal gap, row title size/position, spacing between rows.
- [ ] Card anatomy: corner radius, image aspect, text block (title only? year?
      rating? badges?), subtitle style, hover/focus scale factor and ring style.
- [ ] Colour values: sample exact hex for background, surface, accent, text,
      dim text, focus ring, progress bar.
- [ ] Focus behaviour: does the focused card scale, lift, darken siblings,
      brighten, or move a highlight strip? Any transition duration/easing.
- [ ] Header content: greeting text, avatar, clock, profile chip.
- [ ] Profile screen: avatar shape/size, name placement, PIN affordance.
- [ ] Detail screen: backdrop vs poster, action buttons, metadata ordering,
      episode list layout.
- [ ] Player OSD: seek bar style, button row, subtitle style/size, auto-hide delay.
- [ ] Empty/loading/error states (catalogs, search with no results).
- [ ] Localization: does Croatian layout break any label (length/truncation)?

Store the reference images in `docs/reference/` (gitignored) or outside the repo;
they are third-party material and must not be published.

## 4. Non-negotiable visual-performance rules

1. Animate only `transform` / `opacity`; never animate layout or `box-shadow`
   across many cards.
2. One focus ring implementation, reused everywhere, driven by `.is-focused`.
3. Text is HTML text, not baked into images (required for localization).
4. No blurred/`backdrop-filter` surfaces (unsupported on M63 and expensive).
5. Poster artwork is fetched later, capped in memory, and never bundled in the
   `.wgt`.
