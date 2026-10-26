# Application release and evaluation

The completed production React release is **`20261026-react-ts-6f24b2b-r3`**, runtime source `6f24b2ba7faa3b14f48be81771983838a5417f35`. Its [completed before/after evaluation](react-typescript-evaluation-20261026.md) is the current result; [architecture](react-typescript.md) defines maintained UI/state boundaries. The historical E1–E11 normalization plan below and [completed evidence](versioning-evaluation-20261026.md) remain preserved. The live manifest is authoritative for subsequent releases.

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

For the separately owner-authorized 26 October React/TypeScript migration, a single `gpt-6.1-sol` worker at `xhigh`, configured default service tier and Fast/Ultrafast off supersedes the older Luna preference for this task only. No nested workers, Codex processes, SSH, secrets or global configuration changes are authorized. DIRECT self-review and coordinator-controlled protected integration/release remain required.

## Historical E1–E11 normalization plan

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

[React/TypeScript evaluation](react-typescript-evaluation-20261026.md) records successful R3 protected integration, exact source reconstruction, actual stage 7/7, same-image/container activation, complete public conformance and immutable tag. It also preserves R1/R2 public failures and both fresh receipt-bound real rollbacks, plus R3’s first failed stage attempt and full successful retry. [Versioning evaluation](versioning-evaluation-20261026.md) remains the completed historical E1–E11 normalization record; its A release is now a retained prior rollback target, not current primary.

Documentation-only commits after runtime 6f24 do not retag or redeploy it. Final documentation protected CI/merge and operator-source fast-forward are not predeclared PASS. The parent controls protected integration and unified production operations.

## Maintained UI and contract boundaries

The separate migration began after completed E1–E11 and is now implemented. Native atlas and studio JSX/state live in `ux/react/`; obsolete string-rendered production entries are removed. Shared components and semantic styles, navigation/selection/request owners, typed map/data bridges and the sole mobile gesture controller are inventoried in [React architecture](react-typescript.md). Preserve approved Paper design, data/SEO semantics, accessibility, map lifetime and free drag in future changes. Reuse existing components before adding variants. Cohesive cutovers must remain buildable at each protected merge; no duplicate production path or migration framework is required.

The application reader bundle remains copied byte-for-byte from producer tag `reader-contract-v1.0.0`, commit `b405bfdf473614beea49dd5126a843a916168f7d`. Its hashes/schema fingerprint are in `contracts/reader-contract.lock.json`. Collector provenance is separate. Current source/native/core/reader/geography/SEO and private storage gates remain mandatory; a focused local pass never authorizes activation or rollback. See [unified release](../unified-release.md) for exact source/receipt/freshness and current-live-baseline requirements.

Public SEO follow-up (search-console submission/indexing, Core Web Vitals, further owner-approved methodology/biography, approved Blog content and Open Graph art) is separate work, not a missing React release gate. Physical iPhone/native pinch and retired optional WebKit are not certified. Dormant advertising activation remains outside scope; truthful bounded loading behavior is verified separately.
