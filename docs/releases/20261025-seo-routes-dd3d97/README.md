# Corrected SEO route release evidence

This application-side record preserves the exact clean SEO build manifest and safe provenance for release `20261025-seo-routes-dd3d97`. The release evidence was read from the workspace release record; source files were transferred from the read-only `seo-current-live` worktree after comparing each source or data-contract hash with the raw manifest.

The deployed allowlist is eight changed existing files (`ux/index.html`, `ux/app.js`, `ux/master.css`, `ux/mobile-layout.css`, `ux/motion.js`, `ux/pages.js`, `ux/journal-view.js`, `scripts/preview_server.py`) and five new SEO files (`robots.txt`, `sitemap.xml`, `ux/routes.js`, `ux/seo.js`, `scripts/seo_render.py`). Supporting source checks `scripts/check_seo.py` and `ux/check-routes.mjs`, plus local development routing in `scripts/serve.py`, were copied separately. No other changes from the SEO worktree were transferred.

The public check recorded clean route metadata for the California map, place comparison, About and Support; `noindex` Stats and Blog; legacy query redirects; unknown-route 404; 57 sitemap routes; a 39-field catalog; and Chrome map/navigation loading. The release README reports all 130 deployed file hashes matched. The raw manifest is retained in `public-build.json`; source-form changes are retained in `source-diff.patch`, and local routing/check support changes are in `supporting-diff.patch`.

`provenance.json` also carries the three build inputs omitted from the raw public manifest (`Dockerfile`, `ux/catalog.json`, `ux/catalog-proposals.json`) from the stable recovery record. Run `python3 scripts/verify_seo_build.py PACKAGE_DIR` to check the full corrected source/asset/data-contract set plus these inputs. `scripts/verify_recovered_runtime.py` remains the historical verifier for the pre-SEO 125+3 baseline.

The deployment record is not copied here. It includes operational host/container details that are not required for application reproducibility. No credentials or full server environment are stored in this evidence folder.

Known follow-up: Google Search Console submission, actual indexing and Core Web Vitals were not verified. About still needs an owner-approved biography, methodology and update policy; Blog drafts remain noindex; an approved Open Graph image is pending. Map body content is client-rendered.
