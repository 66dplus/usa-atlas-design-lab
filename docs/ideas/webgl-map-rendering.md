# Idea: WebGL rendering for the 2D atlas

Date: 11 October 2026.

Status: implementation proposal for a later cloud task. This document records the
owner's discussion and preferred direction; it does not implement a renderer change
or establish a measured performance improvement.

## Problem and intended result

The owner reports severe lag while panning the 2D map, including the Marin County
view (`place=06041`, `metric=obesity-rate`). The statistics are source snapshots;
moving the camera does not require refreshing their values.

Before: `/ux/` uses D3/SVG for 2D and Three.js/WebGL for 3D. The inspected live
2D view contained 3,194 SVG paths: 3,142 county equivalents, 51 state/DC outlines,
and a world-context path. Detailed boundaries increase geometric complexity.

After, if the prototype succeeds: 2D uses prepared GPU geometry and a flat camera.
Panning changes the camera rather than updating a large SVG geography tree.
Geography, source values, colors, selection, hover details and the approved interface
remain available. HTML continues to own panels, buttons and text.

Static data does not mean static screen pixels. Every camera movement still needs
new frames. The proposal is to cache geometry and values and render those frames
efficiently, rather than repeatedly rebuilding the map or freezing it as one image.

## Baseline and cloud handoff

At publication, GitHub `main` is commit
`2e9280db8e9b3898121027981f254bd854e40a3c`. The current October live prototype
contains additional uncommitted/untracked work in the owner's local worktree
`.worktrees/live-fields-2d-20261010`. This documentation branch contains only this
proposal and its README link; it does not publish that application work.

**Before implementation, identify the intended application revision.** Reconcile
any subsequently published runtime branch with `main`. Do not assume this document's
base commit reproduces the October live interface. If the necessary runtime is
still unavailable in GitHub, state that limitation and resolve the source decision
with the owner before changing behavior that depends on it.

The October renderer already caches viewport dimensions for city/rank labels.
Earlier local California reverse-zoom measurements reduced total label work from
116.3 ms to 2.7 ms across one button animation. Those figures are historical label
measurements, not whole-map FPS. The inspected live zoom/pan callback performs no
data fetch. Detailed boundary requests occur on place selection and are cached.
Remaining SVG paint/compositing cost is a hypothesis to measure: a fresh Performance
recording of the reported drag was unavailable during this discussion.

## What WikiBarrio does

Reference: [the owner's WikiBarrio view](https://www.wikibarrio.es/#v=total_pop&z=7.01&c=28.6117%2C-16.5208&lang=en).

Page and public-code inspection on 11 October found:

- MapLibre GL JS 3.6.2, PMTiles 2.11.0 and deck.gl 8.9.36 are loaded.
- Both inspected 2D and 3D modes use a `maplibregl-canvas`; the map region has no
  SVG paths. Vector geography is not the same thing as SVG DOM elements.
- A vector source reads `barrioatlas_tracts.pmtiles?v=2026-10-rent`.
- Municipality and census-tract layers switch around zoom 10. The map configures
  a tile cache and caps its pixel ratio at 2. Its 3D code also uses deck.gl layers.

Sources: [public application code](https://www.wikibarrio.es/main.obf.js),
[MapLibre's WebGL/vector-tile documentation](https://maplibre.org/maplibre-gl-js/docs/),
[PMTiles archive and partial-request documentation](https://docs.protomaps.com/pmtiles/),
[deck.gl documentation](https://deck.gl/docs).

These observations establish an architectural difference. No matched FPS benchmark
between WikiBarrio and USA Atlas was performed. WikiBarrio is a technical reference,
not approval to copy its UI or substitute its geographic/data semantics.

## Proposed first implementation

Start with a separate, bounded Three.js 2D prototype using our real county geometry.
The existing Three.js dependency and geographic pipeline make this a useful first
comparison before introducing another mapping engine.

- Reuse projected footprints, FIPS identifiers, source values and normalization.
  Cache triangulated flat surfaces; preserve holes, islands and shared edges.
- Use a top-down orthographic camera for flat 2D. Map the existing fit, pan and
  cursor-centered zoom behavior explicitly rather than relying on 3D defaults.
- Reuse or extend the existing state batching and county identity attributes.
  Keep camera movement independent of triangulation, mesh construction, data
  requests and whole-interface rendering. Coalesce rendering to animation frames.
- Update colors when the indicator/data snapshot changes. Update geometry when
  boundary detail changes. Make these invalidation owners explicit.
- Preserve county/state picking, hover details, selection outlines, city/rank
  labels, Compare panes and camera restoration. Review raycasting and label costs
  as part of the prototype rather than assuming WebGL removes every bottleneck.
- Render on demand and handle disposal, resizing and WebGL failure explicitly.
  Retain the existing renderer as a recovery/comparison path until acceptance.

Keep all geographies reachable. Off-screen rendering/caching choices must not
remove county records or silently omit islands. Do not copy WikiBarrio's
municipality-to-tract switch into our data model: our geography remains Census
2017 counties and county equivalents.

If this prototype cannot meet the measured interaction requirement, evaluate
MapLibre with static vector tiles/PMTiles as the next option. That is a separate
renderer and asset-pipeline decision, with its own dependency/license verification.
A full-country raster image is not the preferred final design because deep zoom
needs sharp boundaries and interactive feature identification.

## Boundaries to inspect

| Owner | Existing files / symbols | Expected responsibility |
| --- | --- | --- |
| Geography and rendering | `ux/map.js`: `loadGeography`, `ExplorerMap`, `buildTerrain`, `hit`, `fit2D`, `renderLabels`, `renderRankMarkers` | Camera, geometry cache, drawing, picking and labels |
| Polygon construction | `ux/geometry.js`: `footprints`, `stateMesh`, `projectedShapes` | Shared polygon topology, batching and county identity |
| Data | `ux/model.js` | Snapshot loading, units, missingness and normalization |
| Interface state | `ux/app.js` | Selected place/indicator, Compare and map callbacks |
| Camera and capture consumers | `ux/settings.js`, `ux/feedback.js`, `scripts/feedback_sources.py` | Settings compatibility, captures and source bindings |

Read the target revision's actual symbols and consumers before reusing them.
Sharing a geometry cache must not let one Compare pane overwrite the other's
camera, colors or selection. Dispose shared resources only when no consumer owns
them. Preserve existing saved-view URLs and camera/settings contracts.

## Acceptance for the later task

1. Record the exact application revision and baseline. Measure active drag and
   zoom separately from initial load; use the same device, viewport, pixel ratio,
   geography and indicator for before/after. Report frame timings and long frames
   during the interaction, excluding idle time. Demonstrate improved responsiveness;
   do not infer success from selecting WebGL alone.
2. Exercise US overview, California, Marin (`06041`), San Francisco (`06075`),
   Alaska/Hawaii and two-pane Compare. Check dragging, cursor-centered zoom, fit,
   county/state/background selection, hover, labels and switching 2D/3D.
3. Preserve approved layout/themes, source values, periods, units, releases,
   missing-data display and exact geography joins. Do not infer county values from
   state data or introduce a new statistical scale.
4. Verify resizing, repeated mode switches, camera restoration and reduced motion.
   Check that repeated interactions do not rebuild geometry or leak GPU resources.
5. Run the applicable existing geometry, motion, data and runtime checks, then use
   the real browser flow on available desktop/mobile environments. Mark unavailable
   DB, device or browser checks NOT RUN; keep earlier available tiers visible.

Measure the first prototype before choosing a full migration. Publishing this
idea does not authorize a production deployment, data migration or credential
change. Tests must use an isolated feedback directory and must preserve the
owner's saved camera preferences.

## Suggested cloud-task prompt

> Use `docs/ideas/webgl-map-rendering.md` to prototype WebGL rendering for the 2D
> atlas. First establish the correct application revision and measure the existing
> pan/zoom flow. Try reusing Three.js with cached flat county geometry and a
> top-down camera. Preserve the approved UI, geography, source fidelity, picking,
> labels, Compare and camera restoration. Verify a real before/after browser flow
> and the applicable existing checks. If the October runtime is missing from the
> repository, resolve that source decision before implementing dependent behavior.
> Deliver a reviewable branch/PR with measurements and explicit verification limits;
> keep production deployment separate.
