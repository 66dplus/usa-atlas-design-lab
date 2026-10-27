# Verification efficiency

Use these rules to reduce duplicate work while preserving the current release bar. The pinned
Python acceptance policy, protected CI, current-main/source and reader bindings, artifact
identity, and [unified release workflow](../unified-release.md) remain authoritative. This
guide coordinates evidence; it cannot waive any mandatory check or authorize activation or
rollback.

## Reuse evidence by exact identity

- Reuse protected CI and source-review results only for the exact unchanged source tree and
  inputs they cover. Confirm commit/tree and relevant input hashes before reuse; any changed
  input needs evidence for that delta.
- Once all required protected CI checks pass for those exact inputs, do not voluntarily rerun
  the entire CI suite locally. Run only local checks needed to diagnose an identified failure
  or verify a changed delta.
- A source, CI, stage, or public PASS is evidence for its bound identity and purpose. It never
  authorizes deployment or rollback. Every new operation needs its own fresh mandatory receipt
  bound to that operation's live baseline and target.
- Ordinary work already authorized in the task does not need an extra permission loop just
  because it uses these efficiency rules. Follow the existing owner and release boundaries.

## Cover each boundary once

For each new image/CID, run one complete mandatory stage acceptance close to promotion and
promote that same staged artifact. Then run one required public suite unfiltered. Add scoped
changed-feature or transport checks where the change creates coverage not provided by those
suites. Never skip or filter a currently mandatory public suite.

| Boundary | Required coverage | Reuse rule |
| --- | --- | --- |
| Source / CI | Protected checks and review for exact source and input hashes | Reuse while identity and inputs remain unchanged; retest changed delta |
| Stage | Complete pinned acceptance for each new image/CID, near promotion | Do not rebuild between accepted stage and promotion |
| Public | One mandatory unfiltered run after promotion | When artifact, source, and contract identity match, avoid repeating unchanged UI/data matrices if public boundary smoke covers transport |
| Changed feature / transport | Scoped checks for uncovered behavior or boundary | State the gap each added check covers; retain the same artifact and acceptance criteria |

Before adding a check, state the risk or behavior it covers that existing evidence does not.
Extra checks and reviews target a new delta, a specific failure, or an unresolved concern.
After PASS, do not repeat whole-source reviews, screenshot suites, or metric audits without
one of those reasons.

## Diagnose failures without erasing them

- Treat bad bytes/HTTP, OOM, and reproducible functional failures as product failures. A timeout
  or test-harness error without attribution is unclassified; do not call it a product defect or
  infrastructure defect without evidence.
- Preserve every failure and its original receipt/report. Where policy permits, use bounded
  diagnosis and rerun only the affected check with the same artifact, criteria, and timeouts.
  An unavailable service or browser is not PASS.
- Do not silently clear a failure or trigger automatic whole-release loops from an unclassified
  harness error. Classify the cause, record the disposition, and continue under the pinned policy.
- Explicit user rollback requirements and current operator policy take precedence over these
  coordination rules. Any actual rollback still requires a new complete mandatory receipt
  bound to the fresh live baseline; historical eligibility or prior receipts cannot substitute.

## Sequence QA and preserve receipts

- Complete long-running scoped QA before generating the fresh canonical seven-check stage
  receipt; then proceed promptly to required approval and promotion. The canonical runner and
  current policy determine the mandatory IDs and acceptance criteria.
- A genuine locked, read-only schema reinspection may refresh schema proof. Preserve the
  original record and timestamp; do not edit or backdate receipts.
- If a parent wrapper has a metadata error after canonical acceptance passes, validate the
  authoritative receipt, artifact/source bindings, and freshness. Correct wrapper metadata
  from that evidence instead of rerunning every check unnecessarily.
- Fix any stale or mismatched binding before relying on reused evidence. No convenience rule
  changes policy pins, contracts, manifests, or historical ledgers.

## Documentation-only changes

For documentation-only commits with shipped inputs unchanged, review the diff and local
Markdown targets and run the existing required protected CI once. Do not run local runtime
builds or browser suites, and do not deploy. A documentation-only mainline advance does not
require retagging or rebuilding an already verified production runtime; preserve its exact
bindings.
