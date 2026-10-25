# Application repository rules

This is the English-language application repository. The deployed Paper runtime and current public baseline are binding. Treat release artifacts and manifests as immutable evidence; do not recreate a release from an older study or a sibling checkout.

## Ownership and release boundaries

- Work only in this application worktree. Do not edit owner checkouts, SEO worktrees, root workspace documentation, or feedback/camera data.
- The application owns browser presentation, its read-only data adapter, app-side contract copies, and release acceptance. The data collection repository owns collection, credentials, admission, migrations, and producer contract definitions.
- No collection credentials or private database settings belong in the application repository. No secret, full server environment, owner-private note, camera file, or feedback capture is release evidence.
- Only the unified release workflow may produce a production release. Ordinary implementation workers do not push, deploy, SSH, or operate production. An authorized parent integrator may perform explicitly requested Git, release, or SSH operations using established secure credential loading; worker restrictions do not block an approved parent plan.
- Keep immutable release and source bindings. Packaging transformations must be explicit, reviewed, reproducible, and checked against exact manifests.

## Development workflow

- Before work, check `git status`, current branch and HEAD; read the applicable release record and tests. Do not overwrite unrelated dirty changes. Ask the parent integrator to resolve mainline or dirty-tree conflicts before integration.
- Follow the English repository conventions and keep changes scoped to application behavior, checks, and documentation.
- The implementation worker uses Luna Standard (`gpt-6-luna`), default service tier, with Fast and Ultrafast off. The user primary does not implement application changes; the parent performs primary review, required tests, and integration. Example invocation with the bundled app checkout: `codex exec --model gpt-6-luna --cd /path/to/usa-atlas-design-lab "Implement the assigned task; preserve existing global configuration."` Do not pass a profile or config override; this keeps the established global configuration and default service tier. Production release remains controlled by the unified workflow and an explicitly authorized parent integrator.
- UI changes follow DIRECT self-review. Preserve current Paper masters and the published UI baseline. Before changing mobile layout or gestures, read `docs/mobile-ui-architecture.md`.
- Reuse `bottomSheet` and `sheetContent` from `ux/bottom-sheet.js` for ordinary mobile drawers. `min`, `half`, and `expanded` are the supported snaps; the visible minimum remains reachable. Keep the handle and scroll viewport mounted; render data into `sheetContent`, never replace the sheet root's `innerHTML`, and use `sheetScroll` for restoration.
- The controller owns sheet transforms, clipping, gestures, and settlement. Do not add another CSS transition or pointer/touch handler to the same surface. Reuse `.concept-tabs`; mobile footer geometry, safe areas, and sheet structure belong in `ux/mobile-layout.css`.
- Reuse semantic tokens, button/search/segmented patterns, and `ux/icons.js`. Extend canonical patterns before adding local variants. Keep maps mounted independently of sheet snaps; `ux/viewport.js` owns visible viewport and theme metadata.
- 2D geography uses WebGL only. Do not restore the SVG geographic renderer or fallback. Keep geographic paths out of SVG gesture/text overlays. Report WebGL failures with retry, including after mode changes. Cache city membership by state feature; do not test detailed polygons on camera frames.
- Preserve desktop anchored drawers, embedded maps, and comparison geometry.
- Do not begin the separate React/TypeScript migration until every mandatory evaluation is recorded PASS. It requires a separate task and small PRs.
- Save screenshots, browser output, and test feedback under `/tmp`; never overwrite the owner's feedback directory.

## Validation

The parent runs `node scripts/check.mjs`, relevant `ux/check-*.mjs` checks, and `ux/check-mobile-ui.mjs` for UI changes during required validation. Keep global configuration untouched. Follow viewport/theme gates and required PostgreSQL and Chrome CI gates. A required check must fail clearly when its service or browser is unavailable; do not turn an unavailable gate into a pass.
