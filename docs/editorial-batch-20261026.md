# Journal editorial batch — 26 October 2026

This source candidate contains 13 English articles, static cover images for the Journal listing, and native interactive map components within the articles. Activation is separate from source preparation.

## Provenance and content

- Source package: `USA_Maps_Editorial_2026-10-26.zip`.
- Source archive SHA-256: `39bbb5a113eef1eb42af9c24801110079b4794ba7e19ccbe8bdd1074580ae61d`.
- The three previously accepted reader texts (Pitkin, Los Alamos, Nassau/Bronx) are preserved. The other ten reader bodies come from the completed editorial packet. Editor memos and internal research notes are excluded.
- The state poverty CSV is included as a small public download. No research database or raw evidence package is shipped.
- In the submitted source archive, the only copy edit was “2010 s” → “2010s” in the state-population story. Later application integration updated selected factual copy where the admitted reader periods changed the displayed values, including the Mississippi mortality and unemployment stories. Historical analysis remains labeled with its original year; final displayed values follow the admitted period. No author or publication date is fabricated.

## Maps and covers

- Article maps reuse the existing `ExplorerMap`; fixed selections ignore selection changes while retaining native pan/zoom. The compact legend shows indicator/value and the native ramp. Fixed selections label fixed domain endpoints as a scale; observed minimum and maximum labels are reserved for actual observed extrema.
- Two-digit selections use admitted state observations and a matching state scale. Five-digit selections retain the county scale. No state totals are inferred from county values by the component.
- The card images are screenshots of those native map views, fitted without distortion to 1200×600 and 640×320 WebP. A card mounts no map. Lower cards use native lazy loading and asynchronous decoding.
- Full-size covers: 9276–30550 bytes each; all below the 200,000-byte target. The official packager explicitly inventories both cover sizes and the CSV.
- Reading routes can become ready after the read-only resources load; a hidden background map does not determine reading-page readiness. Visible Map/Compare keep their renderer readiness path. Article maps retain independent loading/error handling.

## Source review and build

Independent editorial review found no material content blocker. Independent source review identified outdated unpublished-Journal SEO expectations; the HTTP suite now checks all 13 published article routes, Article JSON-LD, canonical and cover responses, the indexable Journal route, and the exact 71-route sitemap. The existing Mississippi draft remains served with `noindex,follow` and is excluded from the sitemap. SPA links retain real hrefs and use the existing navigation handler. Test-only HTTP expectations preserve the 57-route, noindex-Blog behavior only for either exact pinned legacy identity (the accepted rollback runtime or archived versioning A); all other runtimes require the published Journal. The separate UI compatibility branch applies only to the exact accepted rollback identity and keeps all eight native UI cases and core checks running while asserting its legacy Support/About behavior. Source review and successful frontend compilation do not constitute release acceptance.

## Application integration updates — 27 October 2026

The article-map uses the current catalog-selected data store, preserving exact periods and source releases. Public API checks confirmed the article map values and labels for the current ACS maps, 2023 IRS California total, 2024 Mississippi under-18 mortality rate, 2025 unemployment, and the admitted 2025 FBI rate. The public API returned 503 for unemployment December 2024; no older value is substituted into the live map. Its live map caption now separates the selected admitted period from the story's historical December 2024 analysis. The Mississippi story, ranking table and native-map covers now use the current 2024 PEP under-18 denominator and matching map rates.

Integration checks cover both compiled React entries, SSR/SEO routes and the 13 published article route, cover and map bindings. A headless Chrome review of the local build used read-only GETs to the current public API, blocked all browser POSTs and saved desktop/mobile screenshots under `/tmp/usa-maps-release-20261027/journal-evidence/`. This source review and its focused checks do not constitute release acceptance.

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
