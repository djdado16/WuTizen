# Design targets — what is placeholder and what the screenshots must define

Milestone 0 intentionally ships a **wireframe**, not a WuPlay replica: the layout
structure, focus behaviour and localization are real; the visual identity is not.

## 1. Measured from the reference (now implemented)

Values taken from `home.png` and `details.png` in
<https://github.com/wuplayapp/wuplay-releases/tree/main/screenshots>
(1920x1080 CSS pixels), applied in `app/css/tokens.css` / `layout.css`:

| Area | Reference value | Token |
|---|---|---|
| Left navigation | icon-only column, ~150 px, no solid background; icons ~34 px | `--rail-width` |
| Expanded rail | translucent dark panel, labels appear, pink focus outline | `--rail-panel-width`, `--accent` |
| Focus / brand colour | pink `#ff3d7f` | `--accent` |
| Content left edge | 238 px | `--content-left` |
| Hero | full-bleed backdrop, left-to-right + bottom-up scrim, ~430 px tall | `--hero-height` |
| Hero title | ~62 px extra-bold, white | `--fs-hero` |
| Hero metadata | duration · year · yellow rating badge · genres, ~24 px | `--fs-hero-meta`, `--rating-bg` |
| Poster cards | 272 x 380, 12 px radius, 28 px gaps, no caption | `--poster-w/-h`, `--card-gap` |
| Rows | title ~28 px bold, 46 px between rows | `--fs-row-title`, `--row-gap` |
| Details | full-screen dimmed backdrop, 56 px title, white Play button, secondary actions | `.details` |

Still to be measured / implemented (later milestones): player OSD, profile
picker, search screen, catalogs screen, settings screen, loading/empty states.

## 2. Placeholder values that remain

| Area | File | Current placeholder |
|---|---|---|
| Typeface | `reset.css` font stack | `Segoe UI`/`SamsungOneUI` stack (reference uses a Roboto-like face) |
| Artwork | `app/assets/ph/` | procedural neutral dark placeholders (self-authored, no third-party licence) |
| Titles, synopses, ratings, episodes | `app/js/data/mock.js` | invented, Croatian + English |


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
