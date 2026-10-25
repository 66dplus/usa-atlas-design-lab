# Mobile UI verification and release — 24 October 2026

Release `20261024-mobile-ui`, public address **https://usa-xray.online/ux/**.
Runtime source commit `ecfb461ea93867c35c96c8f5bbcb8683991dd9c8`;
final browser harness commit `8ae20ac`. The exact shipped commit and hashes are in `/ux/build.json` and the deployment
record. Baseline `bf9dc8b` preserves all 13 reviewed public source hashes from
`20261023-ui-overhaul`. The release changes no data API, geography joins, periods,
source values or collector credentials.

## Acceptance scope

The DOCX SHA-256 is
`3409a30dd8ab91de4947850fd61a44272d7dd121d93d49200b01d9bfb531354e`.
`mobile-ui-evaluation.json` now maps 56 behavioral requirements **and all seven
section-8 implementation steps**, with an explicit result for each of the 11 sections.
Earlier blanket pass records were too broad; native Safari items are marked as
owner device checks. The owner explicitly requested deployment and will check an
iPhone. No new macOS permission was requested or enabled.

| Section | Evidence and result |
| --- | --- |
| 1 — Scope | Preserved approved composition; plain JavaScript and existing styling. |
| 2 — Observed problems | Shared geometry, stable grip, mounted content and explicit scroll ownership. Native Safari gap verification remains with owner. |
| 3 — Audit | Baseline screenshots/measurements, exact source binding and root causes in architecture report. |
| 4 — Reuse | One sheet controller and structural stylesheet; semantic tokens and documented intentional variants. |
| 5 — Viewport/Safari | Constant map viewport, browser zoom, safe-area/height simulations and theme metadata pass. Actual Safari toolbar behavior is not certified. |
| 6 — Gestures | Pointer snap cycles, native Chrome touch/pinch, nested scroll, cancellation, interruption, focus exclusion and reduced motion. |
| 7 — Ownership | Persistent maps, independent content viewport, non-scrolling shared navigation. |
| 8 — Sequence | All seven audit/migrate/remove/document/verify steps are separately mapped. |
| 9 — Acceptance | All available browser gates pass; physical-device limitation remains explicit. |
| 10 — Matrix | 74 Chrome and 74 WebKit records; six startup captures per engine. |
| 11 — Deliverables | Audit, inventory, implementation, AGENTS rules, screenshots, critique, limitations and reversible release. |

## Browser evidence

All screenshots and raw results are under
`/tmp/usa-xray-mobile-release-20261024/`, outside owner feedback.

- `chrome-accepted/`, `webkit-ship/`: 390×844, 360×640, 1440×900, both themes;
  state/county, search, ranking, compare 2D/3D, Stats, Blog, Support and return.
  Each suite has 74 records with no page/console errors, loading overlay,
  horizontal overflow or covered tested navigation/header controls.
- `startup-chrome/`, `startup-webkit/`: twelve centered loading screenshots,
  rotating English geography phrases, reduced motion, retry and ready dismissal.
- `webgl-chrome/`, `webgl-webkit/`: WebGL-only old-link handling, real pan,
  supported wheel zoom, context loss, 3D/2D reentry, retry, startup failure/retry,
  and reachable recovery in both comparison panes at 360×640.
- `required-checks-final.log`: gallery preservation, motion/runtime, city-cache,
  Support, icons, detailed geometry, flat geometry/render lifetime and metadata checks.
- `public/`: 36 Chrome captures on the actual HTTPS site after cutover;
  `public-health.json` verifies all 120 public asset hashes, 39 fields and published
  unemployment observations, HTTPS redirect and www.

A CDP pinch initially overlapped later synthetic single-finger input; the harness
now runs the native pinch last in each context. This was traced to an extra
compositor contact, not accepted as a product gesture failure.

The tests wait for the terrain, D3 camera and finite layout animations to settle.
They also assert no overflow during comparison entry. Screenshots were opened and
visually inspected, including both themes, 2D/3D, county, compare, reading pages,
minimum/expanded sheets, loading and explicit GPU errors. Geometry checks cover
actual root width/padding/grip offset; 3D readiness requires all 51 state meshes and
visible geographic pixels, including interrupted mode changes.

Chrome uses the installed real browser through Playwright. Its touch/pinch events
are native browser input in an emulated mobile viewport, not a physical phone.
Desktop WebKit covers page/pointer flows; its mobile harness lacks native wheel
and CDP touch-drag APIs. Simulated viewport changes/insets do not certify Safari
browser chrome, iPhone status areas or physical gestures. This is not a complete
accessibility certification; hit tests cover named controls and targeted recovery.

## Independent critique and additional owner changes

OpenCode GLM 5.3 did not complete a review: the free and Go providers returned
quota errors. The owner explicitly authorized a separate Codex reviewer instead.
That reviewer reproduced and rechecked these resolved defects:

1. Nested comparison scroll was stolen by the outer sheet.
2. The invisible minimum summary remained keyboard accessible.
3. Sheet touch-action prevented browser pinch zoom.
4. Legacy important rules overrode canonical sheet geometry.
5. Interrupted 3D construction left only part of the map built.
6. 2D label updates repeated detailed polygon containment on every camera frame.
7. WebGL failure recovery disappeared after visiting 3D, or was clipped in Compare.

The 2D hotspot measured 158.9 ms median before caching; repeated label updates fell
to under 0.1 ms with zero repeated containment calls. This is a measurement of the
label update function, not an end-to-end frame-rate claim. The owner also removed
legacy SVG map mode/fallback; transparent text/gesture overlays contain no geographic
paths. WebGL failure has an explicit retry. Old `renderer=svg` links use WebGL.

The owner requested top controls at the available screen edge: all four outer
controls measure 8 px with no safe-area inset and move only as required by a real
safe area. Bottom navigation ends at the available viewport edge, including its
safe-area padding; no site-owned geographic strip is intended below it. Physical
Safari confirmation remains with the owner.

## Release and recovery

The deployment builds a separate read-only staging container and validates exact
source/asset/data-contract hashes before cutover. The previous live container is
retained, stopped, as `usa-atlas-paper-runtime-before-mobile-ui-20261024`.
The new runtime uses a read-only root, UID 10001:10001 and read-only secret/data
mounts. PostgreSQL remains read-only. No public Docker port or review tunnel is
introduced. After cutover, the public manifest/catalog/browser flow, asset hashes,
mounts and rollback container identity are checked again.

The owner working tree, feedback, camera preferences and existing servers are
preserved. All automated browser contexts are closed. Release metadata and the
credential-free deployment procedure are retained with the workspace release record.
