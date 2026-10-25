# Versioning and release progress — 25 October 2026

This is a bounded before/after progress record for the documentation consolidation. It records available evidence and current limits; it is not a release receipt.

## Before

- The public manifest reported release `20261025-seo-routes-dd3d97`, raw build SHA-256 `337a3e0bbb9dd5e50f603e49c6c4f79cb5d1366d5a10d38af7f27f7256f1c512`, and `sourceBaseCommit` `dd3d97d829e85e341b051538707298bd943dea31`. These live bytes were built from reviewed source inputs; no exact Git source commit is established by that binding.
- The recovered stable app commit is `1c3881a`; clean SEO transfer `83d2bc0` is on the app integration branch. App final `main`, tag, and deployment are pending.
- Data reader PR #2 is merged at `b405bfdf473614beea49dd5126a843a916168f7d`, tagged `reader-contract-v1.0.0`; CI run `40188844214` passed. Local data `main` was clean and fast-forwarded to that commit at the dated check. This producer identity is separate from the production pipeline code audit.

## After this documentation pass

| Evaluation | Status | Evidence boundary |
| --- | --- | --- |
| E1 | NOT RUN | Required exact single app source commit and tag reproducing both frontend and backend are not established. |
| E2 | PASS | Preservation requirement and dated workspace/app bindings documented; no owner work was intentionally overwritten. |
| E3 | PASS | Both repository Git protections were reported verified in the dated release evidence; recheck live settings before a future release. |
| E4 | PENDING TESTS | Wrong-base valid SEO package rejection still requires required release-gate evidence. |
| E5 | PENDING TESTS | Dirty tree, stale base, and undeclared diff blocking still require required release-gate evidence. |
| E6 | PENDING TESTS | Positive and negative behavior checks remain required as bug detectors. |
| E7 | PENDING TESTS | Stage rollback plus revoked, stale, and concurrent activation blocks remain unverified. |
| E8 | PENDING TESTS | Independently pinned contract behavior and incompatible-contract blocking need required evidence. |
| E9 | PENDING TESTS | SEO route, metadata, redirect, noindex, 404, sitemap, and robots acceptance needs required evidence. |
| E10 | PENDING TESTS | Eight Chrome viewport/theme combinations, short-desktop API, read-only mounts, rollback, and public hashes need acceptance evidence. Physical iPhone owner checks are separate. |
| E11 | DOCUMENTED | Deferred React/TypeScript task, state owners, preserved map/controller boundaries, and component inventory are documented in the release/evaluation record. No React implementation is included. |

The live public build remains the manifest binding above. Do not claim the new release workflow, application final `main`/tag, or all E1–E11 PASS until actual evidence is recorded. Evaluation screenshots and test materials remain under `/tmp`; this document includes no row data, secrets, private feedback, camera state, or host paths. The sanitized production pipeline fingerprint is in [`../operations/pipeline-provenance-20261025.json`](../operations/pipeline-provenance-20261025.json).
