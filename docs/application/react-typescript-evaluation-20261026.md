# React/TypeScript candidate evaluation — 26 October 2026

The maintained UI and interaction/state ownership are migrated to native React + TypeScript. Local implementation and regression evidence is complete; release readiness remains blocked by the unavailable Docker stage and the preserved advertiser preview limitation below. This record is separate from historical E1–E11 normalization and does not authorize activation or rollback.

## Exact source and artifact binding

Accepted main at dispatch: `0e9706022a2108be2804d37fb0d1390ce7db17b9`. Production was rechecked as release `20261025-versioning-ed8eefb-A`, source `ed8eefbe22c3befcf2b40d5e16fde0948e696772`, raw build SHA256 `213f3c50fdd595420f19b917bb13c0b47c6463049695de0ae08ed9197a252859`. No release manifest, Paper master, owner checkout, feedback preference or production service was changed. The coordinator must re-fetch the authoritative public manifest immediately before activation.

Only exact owner commit `f00c82af1ec9a158d28c45a24c90f724fc8edc34` supplied product changes, cherry-picked as `b768275` without ancestors or conflicts. Rendering/state migration is `c484c9b`; package/private storage adaptation is `11be0e5`; preservation fixes are `ab3e75d`; package asset closure correction is `ae6233a4b07a847682554d9054ce7db398afa772`. That last full SHA is the clean committed implementation used for the final built-runtime tests. The subsequent evaluation commit changes documentation only; it is not substituted for the tested package's source identity.

The local artifact label is `local-react-ts-20261026-r3`, not a production release. Evidence root: `/tmp/usa-xray-react-ts-20261026`.

| Binding | Exact value |
| --- | --- |
| Raw candidate `ux/build.json` SHA256 | `b17919d9000236f5aa37a1298d091e39571957f5603651d68e14aa259e2243a6` |
| Full package fingerprint | `9c3197a04ea59ccfd0a1225d5dfe74404dd3c3c8e9f6a92c249689d7ccb56d93` |
| Raw route manifest SHA256 | `db3fedeef65b3c47e30b403dc89f94da00082f48b3eaf71c622d2717510bc2e0` |
| Inventory | 117 files, 101 public mappings, 41 compiled frontend inputs; 39 admitted fields and all three medical fields retained |
| Installed tools | Node 24.14.1, npm 11.11.0, Python 3.9.6, PostgreSQL client 16.13, Chrome 155.0.8059.85 |

`final-package-proof.json` verifies all file bytes and both raw manifests reproduced after a fresh `npm ci --ignore-scripts`. `local-package-content-diff.json` lists all 35 changed package paths against the local accepted-main before snapshot. It is review evidence; the production plan must be derived from the actual fresh immutable runtime snapshot. Release/acceptance policy files and archived manifests are unchanged.

## Before → after evaluation

All commands use the isolated fixture configuration through `run-local.py`; screenshots and reports stay under `/tmp`. Required services were real local PostgreSQL and installed Chrome, not mocks. Mocked Docker tests are labeled separately.

| Evaluation | Before | After | Command and evidence |
| --- | --- | --- | --- |
| Canonical eight viewport/theme cases plus startup/failure cases | PASS 10/10 | PASS 10/10 | `node ux/check-mobile-ui.mjs`; `before-chrome/results.json`, `final-mobile-compat/results.json`, `final-mobile-compat.json` |
| Complete local Chrome regression runner | Existing accepted behavior | PASS: canonical 10/10, WebGL recovery, native UI 8/8 + embed case, editor 8/8, HTTP 23 cases, expected negative footer rejection | `python3 scripts/run_release_regressions.py`; `final-built-canonical.json` exit 0, `built-evidence/usa-atlas-release-regression-evidence-kvt9z4mq/` |
| Native React state and persistent lifecycle | Legacy mutable templates | PASS all eight cases: map/canvas/grip/scroll/credit identity, theme, modal focus/inert/history, native grip Home/Escape, summary drag suppression | `node ux/check-react-ui.mjs`; final runner `react-ui/results.json`, `visual-final/results.json` |
| Private bug-report success/failure/retry | PASS 13 owner backend tests | PASS real durable private saves; simulated 503/429/network/invalid acknowledgement and pending-close-reopen; actual backend privacy/rate/storage cases | Final runner `react-ui/results.json`; `backend-r7.json` |
| Editor form/drafts/downloads | Before screenshots saved | PASS 8/8: controlled fields/contact/duration/targeting, reload persistence, invalid URL, Desktop-only ticker, no POST/delivery/publication | `node ux/check-studio-react.mjs`; final runner `studio/results.json` |
| Full Python source/backend/release/reader unit suites | Owner report subset PASS | PASS 127 tests, including ten mount tests and four entry asset-closure tests | `python3 -m unittest discover -s scripts -p 'test_*.py'`; `backend-r7.json` |
| Strict TypeScript/build/source behavior | No TS build | PASS typecheck, build and 12 Node source check scripts | `npm run check:source`; `final-source.json` |
| Reader and geography | Coordinator normalization PASS | PASS real isolated PostgreSQL reader, source/geography/boundary checks | `python3 scripts/check_reader_contract.py --require-postgres`, `python3 scripts/check_geography_contract.py`; `reader-final.json`, `geography-final.json` |
| Static/server SEO | Accepted production | PASS 57 sitemap routes; route and metadata assertions | `python3 scripts/check_seo.py`, `node ux/check-routes.mjs`; `seo-final.json` |
| Actual built HTTP SEO/private boundary | Existing server contract | PASS 23 cases: clean/legacy/case/slash/query, 404, SSR canonical/metadata/structured data, robots/sitemap, Stats/unpublished noindex, no private fixture/report/feedback reads | `node ux/check-http-seo.mjs`; final runner `http-seo/results.json` |
| Visual preservation | Accepted main + exact owner Support/About | PASS DIRECT comparison of 80 pairs across all eight cases; 54 pixel-exact; largest thresholded difference 0.293%, from local report origin text; no layout difference found after fixes | `visual-final/`, `visual-review-final/pixel-differences.json`, inspected contact sheets and final package screenshots |
| Clean install/build/package | Pinned lockfile | PASS exact byte reproduction and strict inventory | `clean-final-install.json`, `package-r3.json`, `package-r3-reproduced.json`, `final-package-proof.json` |
| Production dependencies | Existing dev-tool advisory | PASS `npm audit --omit=dev`: zero findings; full install still reports the pre-existing dev-only sharp advisory | `production-dependency-audit.json` and log; no forced unrelated upgrade |
| Report mount guards | Root + two RO mounts, reports unavailable | PASS mocked positive/negative and repeated-stage/rollback guards; root and required RO mounts retained | Included in 127 Python tests; `reports-release-final.json` (64 focused tests), `entry-asset-tests.json` |
| Universal no-stuck-loading / end-to-end advertising fit | FAIL baseline: no placement handshake receiver/ready sender; preview status remains “Loading live source observations…” | FAIL preserved baseline limitation; editor and actual map/draft tests pass, placement/fit is not certified | `advertiser-preview-baseline-limit.json`; exact original and migrated screenshots |
| Real Docker image, UID/mount permissions/durability, reconstruction stage proof, complete canonical stage acceptance receipt | Historical production proof only | NOT RUN: local Docker daemon unavailable | `docker-availability.log`; no fabricated digest, stage evidence or receipt |
| Physical iPhone/native pinch; retired optional WebKit | Not certified | NOT RUN | No device/browser claim |

The historical optional `ux/check-compare-layout.mjs` was also attempted. It FAILS its obsolete immediate-parent source lookup on both the accepted baseline and this candidate (`legacy-compare-baseline.log`, `compare-layout-final.log`). It is not a passing gate. Current canonical regressions and their negative footer detector exercise the accepted comparison geometry; those assertions were not weakened.

## Corrections and review disposition

Development failures remain in evidence. Modal keyboard/focus ownership was corrected; cached reading wrappers now receive the original four direct-child CSS rules with exact values; Escape is captured before the map while dialog ownership is respected; summary drags suppress their resulting chooser click. Repeated stage inspection now retains expected mount identities for activation. The SSR test harness shares the installed React instance. A full packaged editor run caught missing `studio.css`; it was restored and packaging now validates HTML script/stylesheet and CSS font dependencies. The complete local runner was then rerun successfully against a new clean package. No earlier failure was relabeled as a pass.

DIRECT self-review covered the entire changed-file inventory, source diff, privacy, obsolete UI paths, state/adapter lifetimes, source/data/SEO preservation and complexity. See `direct-self-review.json` and `final-review.diff`. No independent agent, other Codex process, SSH or secret-reading operation was used. The settings attestation distinguishes configured default tier from an absent observed server tier. Global configuration is unchanged.

The dormant advertising fit integration is preserved because only the exact owner product changes were authorized. A decision to activate that integration or change its approved status text is still required; the broad no-stuck-loading requirement cannot be claimed for that flow. This does not represent a new migration regression, and it remains an explicit readiness blocker.

## Coordinator integration and release gates

Review the owner import, native rendering/state change, then packaging/private storage and preservation corrections as dependent PR boundaries. Do not push or activate this branch as an ad hoc release. After protected integration, use clean current accepted main and a unique immutable release ID. Rebuild with the exact lockfile, capture the actual baseline, and review the complete declared content diff through `scripts/release_workflow.py`.

Securely provision approved private report storage writable by UID/GID 10001 at the fixed private destination, with both existing mounts and root read-only. Configure only real trusted proxy peers/chains. Verify permissions, durable storage, static denial, origin/rate behavior and backup/retention on the real stage. Use that same image/container for staging and production. Obtain fresh complete acceptance receipts bound to current main, image/build/source/reader identities; obtain fresh current-reader regressions for any eligible rollback target. Recheck public baseline, current registry approval, reader contract and deployment lock immediately before activation. See [unified release](../unified-release.md); local proof is not deployment authorization.
