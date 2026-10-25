# Versioning implementation handoff — owner-requested pause, 25 October 2026

Status: **INCOMPLETE, PAUSED AT OWNER REQUEST**. Resume only when the owner asks. The owner plans to select Luna for continuation. This is the latest checkpoint; earlier progress notes are historical. No versioning production deployment or application-main merge has occurred.

## Open this worktree

- Workspace: `/Users/dmitrijrybkin/Documents/USA-MAPS`.
- Application integration: `.worktrees/versioning-baseline-20261025`, branch `codex/versioning-baseline-20261025`.
- Head before the pause checkpoint: `580a8cd74f3a4eab04f85cf9f610a6e07760027f`.
- Do not resume implementation inside the owner's `usa-atlas-design-lab` checkout. It still contains unrelated AI analyst work at `878fb956a4b3831e53cb693651f9b1b8a2fa5b72`.
- App PR: https://github.com/66dplus/usa-atlas-design-lab/pull/2 (draft, attached to the chat). Last pushed head was `580a8cd`; local pause fixes still need push after review and checks.
- Read `AGENTS.md`, `docs/unified-release.md`, and `docs/application/release-and-evaluation.md` here. The approved full plan remains in the conversation. All mandatory E1–E11 must PASS; FAIL or NOT RUN means incomplete. React + TypeScript implementation is deferred to a separate session.

## Verified current production binding

Most recently checked after the internet outage:

- Release `20261025-seo-routes-dd3d97`.
- Raw public `/ux/build.json` SHA-256: `337a3e0bbb9dd5e50f603e49c6c4f79cb5d1366d5a10d38af7f27f7256f1c512`.
- Legacy `sourceBaseCommit`: `dd3d97d829e85e341b051538707298bd943dea31`; exact `sourceCommit` is still absent.
- Primary container `usa-atlas-paper-runtime-20261009`, ID `bffbf17933c0ca379c0483dd50d8d30db1aedd419832d8ba32e4d3f518c8908d`.
- Immutable image `sha256:2a8c285d271c8e3d1e86333079f2583cdea2903997ba5c5e7672dc93ed2b1c79`.
- Private network `usa-atlas-private`, primary `172.19.0.4:4429`; planned stage address `172.19.0.231:4429` (SEO uses .230).
- UID/GID 10001:10001; root and required secret/database mounts are read-only.
- Existing previous rollback container `usa-atlas-paper-runtime-before-seo-routes-dd3d97` is retained.
- Bad historical SEO image `sha256:f6ede23c5fed55dcf9bda27d7796b4d19571d9affba098eb50e45889362116ea` is revoked by digest, not by reused historical labels.

Recheck live identity before continuing. The clean SEO release changed exactly 13 approved SEO inputs relative to the recovered stable runtime; all 133 required runtime inputs were independently hashed. The new candidate preserves all 124 existing public UI assets byte-for-byte. Evidence is under `/tmp/usa-xray-versioning-20261025/eval` and immutable baseline docs under `docs/releases/`.

## Completed work

1. Owner work saved separately: original status/patches, verified full app/data Git bundles, DOCX, worktree/branch inventory under local ignored `archive/versioning-20261025/`. Root workspace dirty work was preserved. Owner app tracked patch SHA was `1ca42f0cdeeaaab7176a96a873f7c8eefeeea6b991a8c4cf3cb236a25e5a2fd9`; verify it remains unchanged.
2. App commits: `1c3881a` exact stable runtime recovery; `83d2bc2` clean SEO transfer; `37f59f5` release guards; `580a8cd` pinned contracts, CI, complete acceptance, docs. The separate release-guards worktree is already integrated: do not cherry-pick it again.
3. Data PR https://github.com/66dplus/usa-atlas-data-collection/pull/2 merged at `b405bfdf473614beea49dd5126a843a916168f7d`, tag `reader-contract-v1.0.0`, CI `40188844214` green. Local data/main fast-forwarded cleanly. Producer reader tests, DB fixture tests, collector/server/housing and pilot tests passed without skips.
4. Both GitHub main branches protected: strict required `checks`, PR, enforced admins, no force-push/delete, conversation resolution. Evidence files `eval/usa-atlas-*-main-protection.json`.
5. Reader bundle vendored independently into app. Lock `contracts/reader-contract.lock.json`; contract hash `7b9910816ac5608cbb8c1c90d2bbef45cc464e80d3c13aed92b7a2d62dd7600b`; schema fingerprint `91c807fa18d4ee39f4b89526bf7566cb1e47de31908521d887b68f8c48f4b811`.
6. Deployed data pipeline audited separately. It is not declared equal to data/main: primary pipeline HEAD `84c73e3959b2631a70c65bf26c233e254188079a` plus dirty deployed code; auxiliary control HEAD `778e5cbf4a927f94df7b27e7862a195b49ab2cb0` plus dirty code. Sanitized record `docs/operations/pipeline-provenance-20261025.json`; existing failed units were not changed.
7. Unified release CLI implemented: clean current-main source, full shipped-content/text plan, raw-manifest baseline, immutable same image staging/promotion, global lock, archives, current external approval registry and immutable revocations, real read-only schema proof, fresh mandatory receipts, staged rollback and current-baseline checks. No actual rollout yet.
8. Local consolidated app tests passed: 74 Python tests plus reader/geography/SEO/source checks (prior to last pause fixes). `eval/app-consolidated-tests.log`. Real WebGL interaction/startup/context loss/retry suite passed against live baseline; evidence `webgl-before/`.
9. Dirty package guard really rejected before creating output. Clean candidate at `/tmp/usa-xray-versioning-20261025/candidate-ci-package`, source `580a8cd`, 138 shipped inputs. Its metadata is CI-only, not a production release. Public-asset preservation proof `eval/candidate-public-asset-preservation.json`.
10. English standalone app/data instructions, root pointer docs, product rules, exact user E1–E11 mapping and deferred component/state-owner refactor task recorded.

## Last local fixes saved at pause

These changes were made by Luna Standard and reviewed as small scoped fixes. They are checkpointed for continuation, **not declared accepted release output**:

- `.github/workflows/ci.yml`: direct pinned `node node_modules/playwright/cli.js install --with-deps chrome`. Last GitHub run `40197515930` failed because `npx playwright` could not resolve an executable after successful npm ci. New invocation is not yet verified in GitHub CI.
- `AGENTS.md` and two application docs: explicit per-invocation `service_tier="default"`, Fast/Ultrafast off; correct E1-before wording and SEO commit typo.
- `scripts/check_release_acceptance.py`: force policy subprocess `ATLAS_TEST_URL` to the actually observed stage/package URL. Previously it could be absent or point at a different ambient target. Focused protocol tests (3) passed. The focused test currently checks the binding helper; consider exercising the main-to-subprocess handoff before accepting the fix.
- `ux/check-release-regressions.mjs`: accept either of the two legitimate unemployment explanatory formulations returned by the current DB. Source tooltips vary between the original brief method and full denominator wording; actual public UI bytes were not changed.
- Full browser suite is **NOT PASS**. Several prior runs completed the eight viewport/theme cases but failed later injected-error handling. Latest live run `browser-resume-positive-final8` was interrupted on owner request; inspect its outputs rather than claiming completion. Browser worker had fixed reload timing and exact expected injected 503 console messages in earlier committed work; retry needs final confirmation. Negative legacy-footer mutation also remains to complete.
- Latest packaged run `eval/local-packaged-browser-r2.log` was interrupted. Earlier `eval/local-packaged-browser.log` failed on the old too-specific desktop unemployment method assertion; that assertion has since been corrected.
- Final independent release audit was interrupted. Partial findings in `agents/integration-audit.jsonl`, no final approval. Prior primary review findings were addressed; all remaining code still needs final primary review.

## Resources and cleanup

All owned CLI workers, their Chrome processes, isolated package server, and read-only SSH forward were stopped for the owner pause. The owned disposable PostgreSQL cluster was stopped cleanly. Owner ports 4180/4181, feedback, camera preferences and production services were not stopped.

- All raw logs/screenshots/receipts: `/tmp/usa-xray-versioning-20261025/`. Inspect this before rerunning tests.
- Disposable PG configuration `/tmp/usa-xray-versioning-20261025/app-postgres.json` gives its `data` directory and temporary environment. Restart only that owned cluster with PG16 `pg_ctl`; never bootstrap/seed the owner's DB or production. Binaries `/opt/homebrew/opt/postgresql@16/bin`.
- Playwright 1.62.1 installed in app node_modules; Chrome 155.0.8059.85. Pinned package CLI can be invoked directly.
- Real stage browser access requires recreating an owned local forward to stage .231; use loopback port4429 because the runtime Host validation expects it. No retired public review tunnel.
- Secure SSH loader uses workspace `.env` SSH_HOST/SSH_PASSWORD in memory with sshpass -e; never print values or full environments. Production operations only by the authorized integrator.
- Server has Python/git/Docker, about 10GB free at last check. `/opt/usa-atlas-releases` had not been created; no final main source clone or registry exists yet.
- Pause patch backup: `archive/versioning-20261025/owner-pause-uncommitted-fixes.patch`; metadata `eval/owner-pause.json`.

## Resume sequence

1. Verify worktree/HEAD/status, owner preservation, live raw manifest and GitHub protections. Review checkpoint changes. Read latest log failures. Do not restart from the old AI analyst checkout or copy an old release over SEO.
2. Finish required Chrome suite against the **packaged candidate**, including all 8 viewport/theme cases, retry/loading/errors, WebGL, pages and negative footer mutation. Fix test defects through Luna without changing live UI to fit stale expectations. No silent skips or fabricated PASS.
3. Complete final release-code audit and protocol/source/SEO/reader/unit checks. Push app PR, obtain green current merge-result CI, mark ready and merge normally with exact head. Do not bypass branch protection.
4. Fetch accepted main into a dedicated clean worktree/clone; keep owner WIP intact. Production source must equal current remote main for stage and activation. Pin a production tag. Do not advance main with final report-only commits until control rollout/rollback is finished.
5. Through the new CLI, capture old live snapshot; prepare unique production A with explicit previous release/raw hash. Review full content diff (existing 124 frontend files must be preserved; intentional backend/reader/metadata changes only). Prove undeclared/wrong-base/stale source rejections in isolation.
6. Clean server main checkout; transfer candidate outside it; stage A on .231; archive exact package/image; run full acceptance against that image and real read-only DB schema; approve exact build/image pair in external registry; activate A. Recheck public hashes/API/read-only mounts.
7. Prove allowed rollback without targeting an incompatible legacy image: create B from the same accepted Git commit with unique release identity and prior A binding; stage/check/approve/activate B; rollback-stage B creates an isolated clone of archived A; fresh full current-suite rollback receipt bound to live B; rollback B restores A. Final public runtime A must equal production tag/source. Also prove revoked image, changed baseline and parallel activation rejected before mutation. Do not edit receipts or live records to force PASS.
8. Reproduce final package from a clean checkout with the exact same args, compare all shipped bytes/metadata, save image/archive checksums. Complete English E1–E11 before→after report with evidence. Add final docs through a separate PR if main must advance after rollout; distinguish production source tag from later documentation-only commits.
9. Recheck owner patch/feedback preservation and clean up owned tests. Final user report must say incomplete if any mandatory gate is FAIL or NOT RUN. Physical iPhone Safari remains a separate owner observation. React + TypeScript remains planned, not implemented.

## Execution policy

The user authorized implementation by Luna (`gpt-6-luna`), ordinary/default service tier, Fast and Ultrafast disabled. Preserve global config; apply explicit process flags. The primary orchestrates, reviews, tests and integrates rather than writing implementation code. Up to three independent implementation workers with explicit file ownership. If the owner switches the primary to Luna, keep the documented review requirement explicit and use an appropriate independent review before integration. No speculative new feature work. No implementation resumes merely because this checkpoint exists.
