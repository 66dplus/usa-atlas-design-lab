# USA Atlas — assembled UI

Updated 20 September 2026 from the owner's Paper comments on screens 83–106. Current live code: `index.html`, `app.js`, `style.css`, `map.js`. Reference captures and acceptance evidence are held in the wider workspace archive.

## Visual direction

The map is the workspace. Silver ground `#e7eaed`, white surfaces, graphite text `#25282c`, muted text `#737a83`, dividers `#e5e7eb`. Retain the existing statistical color ramp and county extrusion. Geist is served locally (400/500/600/700); SVG icons replace emoji. Primary actions are graphite; decoration is minimal.

Desktop: 20 px outside margin, header at 18 px, left profile 308 px, right quick stats 244 px. Both start at 82 px. Surface radius 12 px, compact control radius 5–7 px. Left content scrolls inside the frame. The profile becomes a lower sheet on mobile, with a separate map region and an explicit Hide panel / Explore control.

## Navigation and surfaces

- Header order: Trends / Explorer / Compare. Saved is on the left beside the brand. The old `concept=stories` route remains valid and now means Trends.
- Left profile: search icon + place dropdown, real geographic path, photo, indicator dropdown, raw value with source/period, Highest / Lowest, Compare / Explore more, next questions, source details.
- California's photo opens San Francisco; in San Francisco the photo expands in the same scrollable profile. The credit stays on the photo. Other places do not reuse an unrelated city photo.
- Metric chooser retains search, categories and coverage labels. Curated Popular indicators sit below the results; these do not claim measured search traffic.
- Saved, place search, metric search, rankings and Surprise use the left frame. Saved's Back restores the previous profile and scroll, without a modal on the map.
- Right side: quick statistics for the selected place, source details and a labelled advertisement placeholder. No live advertiser, ad network or outbound commercial integration.
- Compare: two full-height frameless map halves, place/metric selectors and small values near their lower edge, a source comparison table from below. No card surrounding either map. Mobile stacks the maps.
- Share writes the view URL and shows “Link copied” in the same button for 5 seconds. Clipboard failure is also inline.

## Data and interaction semantics

Preserve real period/unit/source/release/geography. No county value from a state observation, no US mean from states. A dash means absent data. SF is explicitly city & county; other city labels are not silently joined to county data.

Rankings use 50 states excluding DC from a state/US profile, or counties of the current state from a county profile. Missing values are omitted; coverage count, tied rank, tied cutoff and common numeric range are visible. A row opens its place, the separate plus adds a place to Compare. Real 3D labels follow projected coordinates and avoid overlap. The map fits ranking context including Hawaii where needed; saved camera preferences remain unchanged.

Saved is local browser storage, capped at 50 recent unique view URLs. It restores places, indicators, comparison and 2D/3D context. A saved period is retained as a label, but reopening loads the latest available source snapshot because the existing API supplies one snapshot per series. Invalid/unavailable storage gives feedback and is not silently overwritten.

Surprise uses prepared scenarios. The bottom ticker spans the viewport, loops continuously, pauses on hover/focus or its pause control, and becomes static horizontally scrollable content under reduced motion. “Try another” chooses a different prepared question. Trends also uses prepared examples, not verified live search demand.

## Implementation boundaries

`app.js`: UI state and actions. `model.js`: existing source loading/units/missingness, unchanged. `map.js`: geography, camera, 2D/3D and rank labels. `feedback.js` and the source whitelist map the new panels to their actual renderer symbols. No new packages, database changes, data-API changes or owner camera writes.

Existing pin/resolution/license information is in README and package-lock.json. Validate the real browser flows in the evidence report, plus `node ux/check-data.mjs`, `node ux/check-motion.mjs`, `node ux/check-geometry.mjs` and `ATLAS_BASE_URL=<local-server> node ux/check.mjs` when affected.
