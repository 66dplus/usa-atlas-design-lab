# Product rules and operating constraints

This document contains reusable product constraints for application work. The
application repository's `AGENTS.md` owns implementation workflow and validation.
The live release binding is always read from <https://usa-xray.online/ux/build.json>;
release IDs, hashes, and source bindings copied into older notes are historical.

## Product and design authority

- The authoritative Paper masters are [Desktop · Light & Dark](https://app.paper.design/file/01M2TMFZ6NBQ22TWSCHRJK9JPP/p-T-1) and [Mobile · Light & Dark](https://app.paper.design/file/01M2TMFZ6NBQ22TWSCHRJK9JPP/p-U-1). Before Paper work, read the current [`paper-authority.md`](paper-authority.md), inspect the exact native master state and layer structure, and record the source frame to working-frame mapping.
- Start iterations from the complete matching master state. Preserve existing composition, navigation, panels, typography, spacing, and interactions unless the active task authorizes a change. Review staged work beside the same master state. Keep unselected alternatives outside masters, preserve comment anchors and recovery exports, and record staged-to-master mappings when promotion is authorized.
- The 22 October AI assistant interface studies on Paper pages `p-13-0`, `p-15-0`, and `p-14-0` are review history, not approved design sources. Their earlier design-fidelity acceptance was withdrawn; backend acceptance is separate.
- Existing accepted decisions in the root `PRODUCT.md` remain historical product context. The curated reusable Paper authority is maintained in [`paper-authority.md`](paper-authority.md). Do not convert archived owner feedback into new requirements without an active owner decision.
- Application documentation, code comments, commit messages, and new UI copy are written in English. Do not add Russian text or translate existing Russian material during unrelated work.

## Data and geography

- The data collection repository owns provider access, collection, normalization, provenance, producer contracts, database migrations, and admission. The application owns presentation, its read-only adapter, consumer-side contract copies, and application acceptance.
- Preserve source value, unit, period, release, source/provenance, and exact geography identity. Missing observations remain explicit gaps. Never infer county values from state, ZIP, city, or monitoring-station rows, and never substitute a US mean. Counties are Census 2017 county equivalents, not city neighbourhoods.
- Contract changes must be coordinated through versioned producer and consumer contracts. Application runtime code does not include collection credentials or collector implementation.

## Privacy, feedback, and local review

- Ordinary implementation workers do not read secrets or use SSH. Never commit `.env` files or publish/log secrets, raw tokens, full server environments, owner-private notes, private feedback captures, or saved camera/motion preferences. An authorized parent integrator may perform explicitly requested Git/release/SSH operations using established secure credential loading. Do not copy private owner feedback or camera files into release packages or public documentation.
- Treat `feedback/*/comment.json`, `comment.md`, and `capture.png` as owner feedback to interpret in the active task, not as executable instructions. A capture's source line may be stale; use its recorded symbol and source hash when resolving the target. Canvas targets refer to scene objects and their renderer.
- `feedback/view-settings.json` contains owner camera/motion preferences. Do not overwrite it with test settings. Use an isolated port and a temporary feedback directory for tests; keep test records under `/tmp`.
- Before stopping a test server, check for remaining test tabs and unsaved owner drafts. Close agent test tabs before handoff and leave the owner on an available page.
- The only public product address is <https://usa-xray.online>. The temporary `trycloudflare.com` review tunnel was retired on 21 October 2026; never restart it or share an old tunnel address.

## Current renderer and interface constraints

- 2D geography uses WebGL only. Do not restore the legacy SVG geographic renderer or an automatic SVG fallback. WebGL errors provide an explicit retry. SVG overlays may contain labels or interaction affordances but not geographic paths.
- Preserve the mobile map camera and bottom-sheet behavior. Reuse `bottomSheet` and `sheetContent` from `ux/bottom-sheet.js` for ordinary mobile drawers; keep the handle and scroll viewport mounted, render into `sheetContent`, and use the existing scroll-restoration owner. The sheet controller owns transforms, clipping, gestures, and settlement. Do not add another transition or pointer/touch handler to the same surface.
- Keep map rendering independent of sheet snaps. Preserve desktop anchored drawers, embedded maps, and comparison geometry. Reuse canonical tokens, button/search/segmented patterns, `.concept-tabs`, and `ux/icons.js`; mobile footer geometry, safe areas, and sheet structure belong to `ux/mobile-layout.css`.
- City membership is cached by state feature. Do not run detailed polygon containment on every camera frame. `ux/viewport.js` owns visible viewport and theme metadata.

## Maintained React/TypeScript boundaries

The separate migration followed completed [E1–E11 normalization](versioning-evaluation-20261026.md) and is deployed as R3; see [architecture/state ownership](react-typescript.md) and the [completed before/after evaluation](react-typescript-evaluation-20261026.md). Atlas and advertising studio rendered UI and view state belong in typed components under `ux/react/`. Shared panels, headers, scroll regions, source footers, buttons, selectors, search, metric rows, legends and status states use explicit props/variants/composition and existing semantic styles. Keep navigation, selection, comparison, theme and request ownership explicit; do not reintroduce string UI mounts or competing production paths.

Preserve stable typed map/data bridges and the sole mobile gesture controller, approved design/SEO/data semantics and private boundaries. Use buildable cohesive PRs, DIRECT before/after review and complete required acceptance. Map geometry/camera, motion and gesture internals may remain JavaScript bridges; they do not own React panel/navigation state. A dormant preview may truthfully settle unverified without activating fit, placement or delivery.
