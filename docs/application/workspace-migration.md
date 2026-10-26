# Workspace ownership and migration record

Historical ownership/migration record dated 25 October 2026.

**26 October closeout:** E1–E11 normalization and the separate React migration are complete. Current recorded production release/tag is `20261026-react-ts-6f24b2b-r3`, exact source `6f24b2ba7faa3b14f48be81771983838a5417f35`. See the [completed React evaluation](react-typescript-evaluation-20261026.md), [historical E1–E11 results](versioning-evaluation-20261026.md) and [release authority](release-and-evaluation.md). The dated pending statements below preserve the earlier state; they are not current blockers or release instructions.

At that checkpoint the root workspace was a local Git repository with no
remote. It held workspace documentation, planning, iteration worktrees, and
legacy evidence. The application and data collection repositories have
independent Git histories and remotes; they integrate through versioned contracts
and the read-only PostgreSQL boundary, not shared Git history or collector
credentials.

## Repository ownership

| Repository | Workspace path | Owns |
| --- | --- | --- |
| Application | `usa-atlas-design-lab/` | Browser UI, read-only data adapter, app-side contract copies, product behavior, app checks, release acceptance, and production release workflow |
| Data collection | `research/data-collection/` | Provider access, collection, normalization, provenance, producer contracts, database schema/migrations, loading, and admission |
| Workspace | repository root | Local plans, historical decision ledger, iteration worktrees, and legacy incident/evidence records |

The canonical operating instructions are `usa-atlas-design-lab/AGENTS.md` and
`research/data-collection/AGENTS.md`. In a temporary worktree, consult its local
`AGENTS.md`, but use repository-relative or canonical GitHub links rather than temporary checkout paths. Application
product constraints are in `docs/application/product-rules.md`; release and
acceptance are defined by the application repository's release workflow and
`docs/application/release-and-evaluation.md`.

## Historical 25 October release facts and incomplete work

The public manifest at <https://usa-xray.online/ux/build.json> is the live source
of truth. Verified 25 October 2026: release `20261025-seo-routes-dd3d97`, raw
build SHA-256 `337a3e0bbb9dd5e50f603e49c6c4f79cb5d1366d5a10d38af7f27f7256f1c512`,
and `sourceBaseCommit` `dd3d97d829e85e341b051538707298bd943dea31`. The live build
was produced from reviewed source inputs; this does not prove an exact Git source
commit. Exact source-commit introduction by the new pipeline remains pending.
Dated 25 October 2026, the recovered prior stable application commit is `1c3881a`; the clean SEO transfer `83d2bc0` is on the application integration branch. Final application `main`, tag, and deployment remain pending.

Data PR #2 merged as `b405bfdf473614beea49dd5126a843a916168f7d` and tag `reader-contract-v1.0.0`; CI run `40188844214` passed. The real 8-reader, 9-database, and 41-collector/server checks and the housing 9 pilot passed. Local data `main` was fast-forwarded to `b405bfdf473614beea49dd5126a843a916168f7d` and was clean at that check. These are dated facts; recheck live state before relying on them. The data producer contract commit is distinct from application source identity.

The application `main` and data `main` protection evidence is dated and must be rechecked before release. Do not describe the versioning pipeline as complete or mark any E1–E11 evaluation PASS without its required evidence. Record `NOT RUN` when evidence is missing. Existing root `ops/releases/` directories are legacy incident/evidence records; new application production releases belong to the application's unified release workflow.

## Root archive and preservation

Root release folders, deployment notes, screenshots, and incident records are
historical evidence only. Do not copy complete release packages, bulk images,
private feedback, camera preferences, secrets, or raw tokens into the application
repository. Do not rewrite or delete root history as part of this migration.
Keep accepted decisions in root `PRODUCT.md` as dated history and link to the
canonical product rules and maintained UI architecture in the application repository.

The root's local plan location remains a pointer for workspace planning. Root
`AGENTS.md` is only a workspace pointer: it directs application work to the
application repository instructions and data work to the data repository
instructions. Its current deployment binding must be a fresh lookup of the public
manifest, not an old release paragraph.

## Historical remaining normalization work — superseded by completed evaluations

The new versioning/release pipeline must establish the exact single application source commit that introduced each published build, preserve all 133 verified inputs, and produce immutable release evidence. Final application `main`/tag creation and deployment remain pending. E1–E11 must be completed and reported with actual evidence. No status in this record implies those steps have passed.

The pending normalization requirements in this dated section were subsequently completed; their exact results remain in the linked E1–E11 record. The successful R3 source/tag is distinct from any later documentation-only mainline commit, which does not request rebuilding or redeployment. Final documentation integration is parent-controlled and is not claimed complete by this record.
