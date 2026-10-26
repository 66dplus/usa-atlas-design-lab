# Journal editorial batch — 26 October 2026

This source candidate contains 13 English articles, static cover images for the Journal listing, and native interactive map components within the articles. Activation is separate from source preparation.

## Provenance and content

- Source package: `USA_Maps_Editorial_2026-10-26.zip`.
- Source archive SHA-256: `39bbb5a113eef1eb42af9c24801110079b4794ba7e19ccbe8bdd1074580ae61d`.
- The three previously accepted reader texts (Pitkin, Los Alamos, Nassau/Bronx) are preserved. The other ten reader bodies come from the completed editorial packet. Editor memos and internal research notes are excluded.
- The state poverty CSV is included as a small public download. No research database or raw evidence package is shipped.
- The only reader copy edit is “2010 s” → “2010s” in the state-population story. Source periods remain explicit; no author or publication date is fabricated.

## Maps and covers

- Article maps reuse the existing `ExplorerMap`; fixed selections ignore selection changes while retaining native pan/zoom. The compact legend shows indicator/value, native ramp, and nationwide minimum/maximum.
- Two-digit selections use admitted state observations and a matching state scale. Five-digit selections retain the county scale. No state totals are inferred from county values by the component.
- The card images are screenshots of those native map views, fitted without distortion to 1200×600 and 640×320 WebP. A card mounts no map. Lower cards use native lazy loading and asynchronous decoding.
- Full-size covers: 9276–30550 bytes each; all below the 200,000-byte target. The official packager explicitly inventories both cover sizes and the CSV.
- Reading routes can become ready after the read-only resources load; a hidden background map does not determine reading-page readiness. Visible Map/Compare keep their renderer readiness path. Article maps retain independent loading/error handling.

## Source review and build

Independent editorial review found no material content blocker. Independent source review identified outdated unpublished-Journal SEO expectations; those existing expectations were updated to the approved published Journal and exact published route set. SPA links retain real hrefs and use the existing navigation handler. Source review and successful frontend compilation do not constitute release acceptance. No automated tests were run or added in this task.

Production integration and activation must follow [the unified release workflow](unified-release.md), with its required acceptance and public verification. This document does not claim that a release was activated.

## Articles

- `/blog/imperial-county-unemployment`
- `/blog/pitkin-income-comparison`
- `/blog/los-alamos-doctorates-and-income`
- `/blog/nassau-bronx-household-income`
- `/blog/california-tax-return-income`
- `/blog/garfield-work-from-home`
- `/blog/oglala-lakota-international-income`
- `/blog/child-mortality-mississippi`
- `/blog/rent-price-vs-burden`
- `/blog/state-poverty-high-income`
- `/blog/population-largest-counties`
- `/blog/youngest-oldest-counties`
- `/blog/most-least-populous-states`
