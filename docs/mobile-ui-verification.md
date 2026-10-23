# Mobile UI refactor verification — 23 October 2026

Implementation: `d990335` on `codex/mobile-ui-architecture-20261023`.
Baseline: `bf9dc8b`, preserving the reviewed source of `20261023-ui-overhaul`.
The source DOCX has 56 mapped requirements in `mobile-ui-evaluation.json`.
Review policy: DIRECT, by the implementing agent; no independent review agents.

## Result

The shared sheet controller fixes the inaccessible minimum handle, recreated
handle during data refreshes, competing transform owners and root-level scrolling.
All ordinary mobile drawers reuse it. The existing four navigation destinations
share one footer geometry, separate from sheet content. The map stays mounted at
a constant size during snap changes. Visual viewport, safe areas and browser
background/theme metadata have explicit owners. Existing JS/CSS patterns, colors,
data APIs and map renderers are preserved; no dependency was added.

The complete Chrome run passed **74 records** at 390×844, 360×640 and 1440×900,
in light and dark themes. It covers state/county selection, search, map/compare
2D/3D, Stats, Blog, Support, theme changes, minimum/half/expanded cycles, grip
behavior at all snaps, content scrolling at top/middle/bottom, cancellation,
reverse interruption, reduced motion, viewport height, orientation and simulated
safe-area insets. Assertions found no page/console errors, horizontal overflow,
visible loading overlays or covered primary controls. Ranking refreshes preserve
the handle; comparison preparation keeps navigation available. Every test browser
context was closed after verification.

## Commands and evidence

`node scripts/check.mjs`, `ux/check-motion.mjs`, `ux/check-runtime.mjs`,
`ux/check-support-data.mjs`, `ux/check-icons.mjs`, `ux/check-detail.mjs`,
`ux/check-flat-map.mjs` and `ux/check-source-metadata.mjs` all passed.
The superseded, unused `place-sheet.js` and its isolated test were removed;
`ux/check-mobile-ui.mjs` exercises the actual replacement in Chrome.

Run the browser check against an isolated server with feedback under `/tmp`:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node ux/check-mobile-ui.mjs
```

Optional environment variables are `ATLAS_TEST_URL` and `ATLAS_TEST_OUTPUT`.
Defaults use local port 4198 and the evidence folder below. The Chrome installation
is selected through Playwright's `channel: 'chrome'`; this is not a DOM mock.

Evidence folder: `/tmp/usa-xray-ui-architecture-20261023/`.

- `baseline-binding.json`: 13/13 published source hashes match the preserved source.
- `baseline-measurements.json`, `before-*.png`: original failure geometry and images.
- `browser-results.json`, `browser-check.log`, `after-*.png`: all final browser records.
- `package-check.json`, `verified-public-build/ux/build.json`: local public bundle,
  including all four new module/style files and their hashes; 17 hashed sources.
- `design-detector.json`, `detector-disposition.json`: one detector run and disposition.
- `apple-devices.txt`: unavailable native-device tooling.

The preview packager was updated and exercised locally. No production release was
performed. The owner's working tree, feedback, camera settings and running servers
were left intact. Agent screenshots and test feedback were isolated under `/tmp`.

## Platform limits

A real iPhone Safari run was unavailable: the installed command-line developer
tools do not provide `xctrace` and no configured physical-device browser harness
is available. Toolbar expansion/collapse and native status/bar blending are
therefore **not certified**. Chrome orientation/visual-height and simulated insets
verify document behavior only. The implementation respects native Safari chrome;
it cannot place geographic pixels into browser-controlled UI.

The design detector reports 14 existing-style warnings: 11 small functional text
occurrences, two ticker/marquee occurrences and the approved font choice. Their
visual changes are outside this controlled refactor and the owner required the
current composition and typography to be preserved. This result is not an
accessibility certification.
