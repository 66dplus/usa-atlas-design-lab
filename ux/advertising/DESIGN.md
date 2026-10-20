# Advertiser studio — selected side inspector

Authoritative owner source: USA Maps chat, 2026-10-08, “Мне нравится 1 вариант / А может собрать лайв прототип”. Selected reference: [Paper Advertising · map-first · 5 variants, artboard 18CD-0](https://app.paper.design/file/01M2TMFZ6NBQ22TWSCHRJK9JPP/p-M-0/18CD-0). The full native Paper reference is retained outside this repository with the design captures. This supersedes the rejected long form. Mode: Operate. Route: DIRECT; primary-agent review and in-app browser verification, no delegation or Chrome.

## Composition and interaction

A fixed viewport contains an 80px header, a 312px inspector and a continuous map workspace. Graphite #171A1D / #25292D, text #F4F1E8, muted #B6BBB8, border #3B4145, orange #FF7A32, Geist and the existing Brand 02 Thin paths. The header provides Save draft (JSON download) and Review request. Creative / Placement / Request replace only the inspector content. Scrolling stays inside that inspector. Tab keys and arrow/Home/End tab navigation retain values and map context.

Creative edits the banner/ticker, JPG/PNG/WebP image up to 5 MB, area, zoom, horizontal crop, headline, supporting copy, CTA, URL, appearance and ticker speed. Invalid image selection retains the previous image. Image bytes stay local until an explicit request submission. Copy is rendered as plain text. Desktop places the banner inside Quick stats; mobile places an inline photo-left creative inside statistics. The ticker supports Pause/Resume and reduced motion. The preview can switch device, indicator, place and real 2D/3D geography without losing the creative. US overview returns the camera while retaining the selected statistics context.

Placement selects exact catalog IDs and devices, with search, removable selections and visible counts. An excluded indicator or device hides the ad and explains why. Request shows a summary and contact fields. Refresh discards the draft; Save draft includes contact fields, image and exact targeting. The API contract and idempotency behavior remain unchanged. Review request itself performs no external transmission.

Below 640px, a compact preview stays above an independently scrolling inspector. This responsive authoring layout is distinct from the visitor's mobile preview. The native Paper composition remains the desktop authority.

## State and integration owners

- `editor.js` owns the creative, targets, inspector tab, contact fields, request ID and preview controls; same-origin messages deliver that state to the iframe.
- `creative.js` retains the single targeting predicate and both creative renderers.
- `preview.js` owns geographic selection, camera context and data display. It reuses `ExplorerMap`, `createDataStore`, raw-value formatting and explicit missingness.
- `map.js` adds only an optional `background` field for the prototype's WebGL surface. Existing consumers omit it and retain #E7EAED. Geometry, camera and statistical colors are otherwise unchanged.
- `scripts/advertising.py` still owns provider validation and delivery. No recipient, key, backend or public ad activation is introduced by this iteration.

## Verified snapshot boundary

The Codex in-app browser blocks direct `/api/atlas/catalog` access (`ERR_BLOCKED_BY_CLIENT`); the original prototype could not load its real map there. For this local interactive prototype, `scripts/build_ad_preview.py` captures the admitted **read-only** catalog/series and existing geography/settings defaults, then bundles the existing renderer. `snapshot-loader.js` is injected only into `preview.bundle.js`; other atlas consumers continue live reads. The main editor uses the same generated catalog. This is an explicit prototype data mode, not a change to the server's data or security boundary.

The 8 October 2026 capture contains 98 catalog metric entries (including variants), 32 admitted observation series and 56 existing geography/default files. Original FIPS, values, units, period, release and source are retained. California's December 2024 BLS LAUS unemployment rate is 5.4%, employment 18,701,026 people. County observations remain county observations; no state row or US mean is synthesized. Planned/unloaded indicators retain their explicit missingness. The map displays source periods, units, range, missing-data context and the generated capture date. Default camera settings are used; owner saved preferences are never written.

Shortcut: the self-contained local bundle is approximately 36.5 MiB. Runtime integration should replace the injected snapshot with the existing live read adapter and lazy geography assets. Its generated JSON and bundle are deliberately retained for reproducibility. Start the normal prototype server to open the shipped files; no build tool installation is needed for viewing. Regeneration requires a running local read API and an installed esbuild CLI:

```bash
python3 scripts/build_ad_preview.py --base-url http://127.0.0.1:4180 --esbuild /absolute/path/to/esbuild
```

Build tool verified here: esbuild 0.25.12, MIT, reused from an existing local installation. No new npm/runtime package is installed. Bundle metadata records reused Three 0.186.0 (MIT), D3 7.9.0 (ISC), TopoJSON client 3.1.0 (ISC) and their existing dependencies; `THIRD_PARTY_LICENSES.txt` retains all 36 bundled package license texts. Existing geometry/font/photo attribution remains in `../assets/SOURCES.md`. The example photograph is Daniel L. Lu / King of Hearts, CC BY-SA 4.0; the sample destination/creative are placeholders.

Email is disabled without the existing Resend environment configuration. Actual configured delivery remains NOT RUN; the prototype never automatically publishes an ad. Real-browser verification records are kept outside this repository with the rest of the project evidence.
