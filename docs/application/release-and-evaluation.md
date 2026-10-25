# Application release and evaluation plan

## Ownership and release authority

The application repository owns the UI, its read-only PostgreSQL adapter, app-side consumer contracts, and acceptance evidence. The data collection repository owns provider access, collection, schema migrations, admission and producer contract definitions. Production packaging and deployment are controlled by the unified release workflow. Ordinary implementation workers do not push, deploy, SSH, or handle secrets. The authorized parent integrator may perform explicitly requested Git, release, or SSH operations using established secure credential loading.

Each release binds a source commit, a reader lock, a geography contract, and an immutable public-build manifest. Packaging transformations must be explicit and verifiable. Do not treat an uncommitted checkout as a release source. Keep all test feedback and screenshots under `/tmp`; do not publish owner notes, feedback, camera state, or full server environment.

## Session preflight

At the start of every implementation session:

1. Record branch, HEAD, dirty paths, and worktree identity.
2. Confirm the task worktree is the application worktree and that its parent release evidence is available.
3. Check whether mainline advanced and whether any shared-index or unrelated dirty change exists. Stop integration on conflicts and report exact paths to the parent integrator.
4. Confirm the requested release scope and read its manifests; compare exact hashes before copying any source.
5. Inspect live state only through approved release evidence. Do not query server environments or secrets.
6. Record dependency availability. Required browser/database checks may not silently skip.

## Luna Standard review route

Implementation workers use Luna Standard (`gpt-6-luna`), default service tier, with Fast and Ultrafast off. Use the bundled CLI at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` (version `0.163.0-alpha.11.2`); do not use the older `codex` from `PATH`. Example: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec -m gpt-6-luna -c service_tier='"default"' --disable fast_mode --disable ultrafast_mode --cd /path/to/usa-atlas-design-lab "Implement the assigned task; preserve existing global configuration."` These per-invocation options select the required model and service tier and disable Fast and Ultrafast without changing the global configuration. The user primary does not author application implementation code; required code corrections are returned to Luna. The parent performs primary review, required tests, and integration. The parent may dispatch up to three independent workers in separate worktrees with explicit file ownership; workers do not recursively delegate. Sol verification uses `gpt-6-sol`, default service tier, with Fast and Ultrafast off. An authorized parent integrator may perform requested Git/release/SSH operations through established secure credential loading. Production release remains controlled by the unified workflow.

## E1–E11 evaluation plan

For each item, preserve a before/after result, exact source/build binding, commands, exit status, browser or database versions, observed behavior, screenshots under `/tmp`, and reviewer disposition. Physical iPhone owner checks are separate and do not complete E10. Record `PASS`, `FAIL`, or `NOT RUN`; missing evidence is never a pass.

| ID | Evaluation | Before evidence | Required after evidence |
| --- | --- | --- | --- |
| E1 | Single source commit and tag | The deployed build is bound to mixed-worktree source inputs and a `sourceBaseCommit`; no exact deployed `sourceCommit` was established | Reproduce the published frontend and backend from one exact application commit and tag; do not require separate frontend/backend commits or user identities |
| E2 | Preserve owner work | Owner-owned application, workspace, feedback, and camera state before integration | Exact before/after preservation evidence; no owner state overwritten or packaged |
| E3 | Git protections | Current branch rules and repository protections | Required review, checks, no force-push, and no deletion protections verified |
| E4 | Reject wrong-base SEO package | Historical SEO incident and baseline evidence | A valid SEO package based on the wrong source base is blocked by the release gate |
| E5 | Dirty, stale, or undeclared source | Clean/dirty state, branch base, and declared release scope | Dirty source, stale base, and undeclared differences are each blocked; authorized diff is reviewed and bound |
| E6 | Behavior regressions as bug detector | Existing behavior and specific known regressions | Positive and negative behavior checks detect known regressions and show the fixed cases remain fixed |
| E7 | Rollback and activation races | Current/live identity, failure boundaries, and concurrent operation behavior | Rollback succeeds on stage; revoked, stale, and concurrent activations are blocked |
| E8 | Independent data contract | Current producer/consumer contracts and admitted data behavior | Independently pinned versioned producer contract and fixture semantics pass; incompatible contract is blocked |
| E9 | SEO | Current public routes, metadata, redirects, and indexing policy | Canonical route, metadata, redirect, noindex, 404, sitemap, and robots checks pass |
| E10 | Full Chrome/runtime | Current shipped application across supported viewports and themes | Packaged runtime passes all eight Chrome viewport/theme combinations and the script's short-desktop coverage (four viewports across two themes), API and read-only mount checks, rollback, and public-hash checks |
| E11 | Deferred React/TypeScript task | Current UI and state ownership | A separate task is documented with explicit state owners and component inventory; migration starts only after all E1–E11 are PASS |

### Evaluation receipt template

```json
{
  "format": "usa_atlas_release_acceptance",
  "releaseId": "",
  "operation": "activate",
  "status": "fail",
  "testedAt": "",
  "suiteIdentity": "usa-atlas-application-acceptance-v1",
  "mandatorySuccessfulCheckIDs": [],
  "testedImageDigest": "sha256:...",
  "sourceCommit": "",
  "backendCommit": "",
  "producerTag": "",
  "buildSha256": "",
  "readerLockSha256": "",
  "readerSchemaFingerprint": "",
  "checks": {}
}
```

Only the acceptance runner may produce a receipt. It must return nonzero if a mandatory gate did not run or failed. An operator may not edit a receipt to turn a result into PASS.

The `--stage-evidence` input is the immutable JSON record returned by the release coordinator after staging. The runner consumes its `stageVerifiedIdentity` object and checks the verified container and image IDs, running state, build hash, source commit, and release ID against the actual staged runtime. It also requires `readerSchemaProof` with `status: "pass"`, `queryReadOnly: true`, `source: "stage.database-schema-readonly"`, the pinned `schemaFingerprint`, and a timezone-aware `checkedAt` within 15 minutes of the acceptance run. The release backend must produce this proof by querying only `information_schema.columns` on the configured database with a read-only connection; export the normalized reader schema fingerprint and check timestamp, never query results, credentials, or environment values.

## Current evaluation pointer

The current release/evaluation status is maintained in [versioning-evaluation-20261026.md](versioning-evaluation-20261026.md). Runtime evaluation E1–E11 is **PASS**. This approved file remains the plan and acceptance policy; its historic `NOT RUN` statement below is superseded by the canonical evaluation evidence. Documentation/test-only integration follows the protected PR process and is verifiable in GitHub history.

## Known limitations and pending work

- The application reader bundle is copied byte-for-byte from producer tag `reader-contract-v1.0.0`, commit `b405bfdf473614beea49dd5126a843a916168f7d`. Its hashes and schema fingerprint are recorded in `contracts/reader-contract.lock.json`.
- Do not infer overall E1–E11 PASS from individual receipts. The canonical evaluation records completed checks, rollback and final public closeout.
- Public SEO follow-up includes search-console submission/indexing, Core Web Vitals, owner-approved About methodology/biography, approved Blog content, and an Open Graph image.
- React/TypeScript remains a separate future task after all mandatory evaluations PASS.

## UI refactoring: React + TypeScript

Do not migrate during versioning or release integration. After all mandatory evaluations pass, create a separate task with short, reviewable PRs. Inventory these surfaces before proposing component boundaries: panels, headers, scroll regions, footers, buttons, selectors, search, metric rows, legends, loading/error states, and remaining valid native-input, scroll/drawer, and resize coverage. Assign ownership of navigation and selected-data state explicitly. Keep the map adapter and mobile gesture controller intact. Preserve design, application functions, SEO routes/metadata, and release manifests in each PR. Require a working before/after comparison and the full acceptance suite before integration.

### Current state ownership for that future task

| State or component | Current owner to preserve | React migration boundary |
| --- | --- | --- |
| Canonical route, query parsing, and browser history | `ux/routes.js`; route rendering in `scripts/seo_render.py` | Route adapter and navigation shell |
| Selected place, metric, comparison draft, and page mode | `ux/app.js` and normalized state helpers in `ux/model.js` | Shared selection store with explicit navigation actions |
| Catalog and observations | `scripts/atlas_data.py` and `/api/atlas/*` read-only endpoints | Typed read-only data client; producer contract remains separately versioned |
| Theme and visible viewport metadata | `ux/viewport.js` | Theme/viewport context that does not own map rendering |
| Map surfaces, camera, and feature picking | `ux/map.js` and `ux/flat-map.js` | Map adapter remains mounted independently of panels and drawers |
| Mobile drawer snaps, drag, and scroll restoration | `ux/bottom-sheet.js` and `ux/viewport.js` | Controller remains the only gesture and transform owner |
| Panels, search, selectors, metric rows, legends, and status surfaces | `ux/app.js`, `ux/pages.js`, `ux/journal-view.js`, `ux/index.html` | Reusable components retain existing semantic patterns and DOM behavior |
| Loading, error, retry, and empty states | `ux/startup-guard.js`, `ux/app.js`, and the route/data boundary | Explicit state mapping; failed data remains visible and retryable |

## Separately authorized React candidate

The E1–E11 normalization above is historical acceptance and is not rerun by the migration. The owner explicitly assigns a single Sol 6.1 (`gpt-6.1-sol`, `xhigh`, configured default tier, Fast/Ultrafast off) implementation and verification worker for this task, superseding the older Luna preference. No independent agent review is used. [React architecture](react-typescript.md) and [before/after candidate evaluation](react-typescript-evaluation-20261026.md) distinguish local proof from coordinator-only protected merge, current-main image/stage receipts and production activation.
