# UI implementation rules

The parent workspace AGENTS.md is authoritative. Repository language is English.
Preserve the current Paper masters and the published UI baseline; do not use an
older study as the design source. UI changes follow DIRECT self-review.

Read `docs/mobile-ui-architecture.md` before changing mobile layout or gestures.

- Reuse `bottomSheet` and `sheetContent` from `ux/bottom-sheet.js` for ordinary
  mobile drawers. `min`, `half` and `expanded` are the supported snap variants.
  Minimum is visible and reachable; never make the entire collapsed panel inert.
- Keep the handle and scroll viewport mounted. Render data into `sheetContent`,
  never replace a sheet root's innerHTML. Use `sheetScroll` for scroll restoration.
- The controller owns sheet transforms, clipping, gestures and settlement. Do not
  add CSS transitions or another pointer/touch handler to the same surface.
- Reuse the existing `.concept-tabs` navigation DOM. Mobile footer geometry,
  safe-area insets and sheet structure belong to `ux/mobile-layout.css`.
- Reuse theme variables and semantic aliases in `ux/ui-tokens.css`, the existing
  button/search/segmented variants and `ux/icons.js`. Extend a canonical pattern
  before introducing another local version. Do not create components for trivial
  one-use markup or add a framework for this refactor.
- Map hosts persist independently of the sheet. Do not resize/remount maps on
  snap changes. `ux/viewport.js` owns the visible viewport and theme metadata.
- 2D geography uses WebGL only. Do not restore the removed SVG renderer or
  fallback. Keep geographic paths out of the SVG gesture/text overlay. Report
  WebGL failure explicitly with retry, including after a mode change. Cache city
  membership by state feature; do not run detailed polygon tests on camera frames.
- Desktop anchored drawers, embedded maps and comparison pane geometry are
  intentional variants. Changes must preserve their behavior.
- Run `node scripts/check.mjs`, relevant `ux/check-*.mjs`, and the browser flow in
  `ux/check-mobile-ui.mjs`. Follow the parent viewport/theme gates and save all
  screenshots/test feedback under `/tmp`, never the owner's feedback directory.
