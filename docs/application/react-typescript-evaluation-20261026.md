# React/TypeScript candidate evaluation — 26 October 2026

This is local candidate evidence, separate from completed versioning E1–E11 and from deployment authorization. The accepted main at dispatch was `0e9706022a2108be2804d37fb0d1390ce7db17b9`. Production was rechecked as release `20261025-versioning-ed8eefb-A`, source `ed8eefbe22c3befcf2b40d5e16fde0948e696772`, raw build SHA256 `213f3c50fdd595420f19b917bb13c0b47c6463049695de0ae08ed9197a252859`. No release manifest, Paper master, owner checkout, feedback preference or production service was changed.

Only exact owner commit `f00c82af1ec9a158d28c45a24c90f724fc8edc34` supplied product changes, imported as `b768275` without ancestors or conflicts. Native rendering/state implementation is `c484c9b`. Architecture and component responsibility are documented in [react-typescript.md](react-typescript.md). All test data and evidence are under `/tmp/usa-xray-react-ts-20261026`. The private fixture uses its own PostgreSQL socket/port; owner services are untouched.

| Evaluation | Before | After at implementation checkpoint | Evidence / command |
| --- | --- | --- | --- |
| Canonical Chrome baseline | PASS 10/10 | PASS 10/10 plus WebGL and expected negative footer failure | `before-chrome/results.json`, `canonical-dev-r2.log`; `python3 scripts/run_release_regressions.py` |
| Native UI and persistent lifecycle | Legacy templates | PASS 8/8 plus embedded theme isolation; latest native grip/summary test rerun pending | `react-ui-r3/results.json`; `node ux/check-react-ui.mjs` |
| Advertising editor | Before screenshots saved | PASS 8/8 | `studio-r3/results.json`; `node ux/check-studio-react.mjs` |
| Backend/privacy | PASS 13 owner report tests | PASS 122 full backend tests | `backend-r5.json`; `python3 -m unittest discover -s scripts -p 'test_*.py'` |
| Strict TS/build/source behavior | No TS build | PASS | `source-final.json`; `npm run check:source` |
| Reader and geography | Coordinator normalization PASS | PASS real isolated PostgreSQL reader + boundary hashes | `reader-final.json`, `geography-final.json` |
| Static/server SEO | Accepted production | PASS 57 sitemap routes and route assertions | `seo-final.json`; `python3 scripts/check_seo.py`, `node ux/check-routes.mjs` |
| Private reports release guards | Root + two RO mounts, reports unavailable | PASS 64 focused release/acceptance tests, including 10 new mount tests | `reports-release-final.json` |
| Clean dependency install | Pinned lockfile | PASS; compiled package reproducibility pending | `clean-install.json`; `npm ci --ignore-scripts` |
| Clean package and complete local built-runtime suite | Baseline packages saved | NOT RUN at this checkpoint | Must use clean committed source; no substitute partial receipt |
| Real Docker image, read-only UID/mount/durability, stage source proof, complete canonical stage receipt | Prior production binding only | NOT RUN: local Docker daemon absent | `docker-availability.log`; coordinator real stage required |
| Physical iPhone/native pinch; retired optional WebKit | Not certified | NOT RUN | No device/browser claim |

Failures found during development remain in evidence: the first modal keyboard check exposed lost focus, corrected and rerun; the initial editor run used an old owned Python server process and failed to load the new bundle, corrected by restarting that process; a later SSR test harness bundled a second React instance, corrected to share the installed package. No failed or unavailable check was reported as passing.

DIRECT self-review follows the explicit single-worker owner instruction; no other agent, Codex process, SSH or secret-reading operation was used. The settings attestation records configured default tier and an absent observed server tier separately. Global configuration is unchanged.

The coordinator must review cohesive commits, perform protected integration, then build/stage from clean current accepted main through the unified workflow. It must provision approved private report storage, configure actual trusted proxy networks, review the full declared content diff, approve the exact image/build pair, and obtain fresh complete activation and eligible rollback receipts against the current reader contract. Current baseline/registry/lock rechecks remain mandatory; local proof cannot authorize activation or rollback.
