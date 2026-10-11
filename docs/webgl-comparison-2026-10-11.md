# SVG and WebGL comparison — 11 October 2026

This branch adds an optional flat WebGL renderer to the exact October collected35
application. The source baseline is `f5cd8bf`; its imported asset hashes and original
Git base are recorded in [october-svg-baseline.json](october-svg-baseline.json).
SVG remains the default. No metric definitions, adapters, panels or deployment
configuration are changed.

Open the same exploration with `view=2d&renderer=svg` or
`view=2d&renderer=webgl`. For example:

- `/ux/?view=2d&place=06041&metric=unemployment&renderer=svg`
- `/ux/?view=2d&place=06041&metric=unemployment&renderer=webgl`
- `/ux/?concept=compare&view=2d&place=06041&other=06075&metric=unemployment&renderer=webgl`

The renderer choice survives URL updates, Share, saved explorations and 2D/3D
switches. Old URLs without a renderer parameter continue to use SVG for 2D.
Three.js retains the existing 3D path.

The new renderer triangulates the same projected county polygons with their holes
and islands. It shares immutable flat caps, county edges and state perimeters
between Compare panes; reference counts release the final owner's buffers.
A detail replacement invalidates its state's geometry. Each pane owns its color
texture, materials, camera and selection. Indicators update colors without
triangulation. Camera movement uses the existing D3 transform and cursor zoom
contract, updates an orthographic camera, and schedules a single demand frame.
The existing SVG overlays retain city labels, ranks and gestures; their geographic
layer is hidden and never transformed during WebGL pan/zoom.

Picking tests the cached projected polygon rings, including holes, behind the
SVG gesture surface. It returns the existing county FIPS and uses the same
state-then-county selection and data callbacks. It does not fetch observations
or boundaries while moving the camera. Initialization and drawing failures use
SVG; context loss preserves the D3 transform and restores WebGL after the browser
restores its context. Captures render the latest GPU frame and bind the new
feedback component to `ux/flat-map.js`.

## Verification

Run the flat topology test with `node ux/check-flat-map.mjs`. It checks all 3,142
county identities, 18 holes and 86 counties with multiple polygons, cap areas,
Compare resource lifetimes, detail invalidation, hole/background picking and SVG
camera framing. Existing `ux/check-geometry.mjs`, `ux/check-detail.mjs` and
`ux/check-motion.mjs` are also applicable.

Run the browser harness against a loopback server that supplies an unchanged
observation snapshot. `scripts/serve-renderer-review.py --root . --data /path/to/snapshots --port 4438` serves a directory containing `catalog.json`,
`snapshot-manifest.json` and its listed observation files. The review used an isolated server with 38 captured
observation series, GET-only APIs and default settings. It rejects all writes and
never loads owner camera preferences. Playwright and Chromium are external test
tools, not new application dependencies:

```sh
ATLAS_PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
ATLAS_CHROMIUM_PATH=/path/to/chromium \
ATLAS_REVIEW_URL=http://127.0.0.1:4438 \
node scripts/check-renderer-browser.mjs
```

The browser evidence in `docs/evidence/renderer-comparison.json` records its exact
viewport, browser, pixel ratio, frozen source values, checks and active-input frame
intervals. Screenshots permit a direct same-view SVG/WebGL comparison.

The geometry, detail, motion and new flat-renderer suites pass. The read-only
browser flow passes for US overview, California, Marin, San Francisco, Alaska,
Hawaii, independent Compare cameras, resize, 2D/3D return, desktop and mobile
initialization, trusted hover/drag/county click, cursor zoom, fit, saved renderer
restoration and both initialization/context-loss fallback. No page or shader
errors were observed. The WebGL demand-frame test also checks coalescing, hidden
views and drawing-failure disposal.

Matched active input used 47 frame intervals per interaction, after initial load,
at 1440 × 900 and pixel ratio 1:

| Interaction | Renderer | Median interval | 95th percentile | Intervals > 50 ms |
| --- | --- | ---: | ---: | ---: |
| Pan | SVG | 2,150 ms | 3,683 ms | 46 / 47 |
| Pan | WebGL | 1,917 ms | 4,350 ms | 43 / 47 |
| Zoom | SVG | 2,467 ms | 5,467 ms | 46 / 47 |
| Zoom | WebGL | 1,483 ms | 3,033 ms | 44 / 47 |

WebGL's median intervals were lower, but its pan tail was worse. Both renderers
were slow in this software environment. This does not meet a hardware interaction
acceptance target and does not establish an overall FPS improvement. WebGL motion
kept its 51 geometry builds and 102 initial color updates unchanged; neither
renderer fetched source values or boundaries during camera movement.

Both Marin screenshots succeeded. An optional whole-US screenshot exceeded its
30-second software-GPU capture timeout; that visual tier is **NOT RUN**. The
remaining functional checks were rerun without optional full-country captures.
Compare/mobile screenshots and hardware visual acceptance are also **NOT RUN**.
Run `scripts/check-renderer-interactions.mjs` after the main browser harness to
repeat the trusted-pointer and saved/fallback flow. Use
`ATLAS_SKIP_MEASUREMENTS=1` for a functional rerun that preserves timing evidence;
`ATLAS_ALL_SCREENSHOTS=1` enables optional region/Compare/mobile captures.

The available browser uses ANGLE SwiftShader, a software GPU. These measurements
cannot establish performance on the owner's hardware. Hardware desktop/mobile,
Safari and Firefox verification are **NOT RUN**. The exact requested
`metric=obesity-rate` Marin scenario is **NOT RUN**: this collected35 runtime does
not expose that indicator. The matched interaction uses unemployment instead.

`ux/check-data.mjs` fails at its existing retry assertion (`ready` versus `error`,
line 46); the same failure reproduces against the unmodified pinned baseline
model. `npm run check` fails on an existing external handoff asset
(`01 primaryReference`). Neither failure comes from this renderer. The old
`ux/check.mjs` API sweep assumes an older catalog and is **NOT RUN** against the
frozen review server. No unavailable tier is counted as a pass.

This is a comparison branch, not a default migration or a production deployment.
