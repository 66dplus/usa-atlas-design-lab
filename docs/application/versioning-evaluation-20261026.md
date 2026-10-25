# Application versioning and release evaluation — 26 October 2026

**Runtime evaluation: PASS (E1–E11).** All runtime evidence and required evaluation conditions are complete. This report records the completed runtime evaluation; documentation/test-only integration follows the protected PR process and is verifiable in GitHub history. This is the canonical application evaluation and release pointer. The immutable completed evidence index is `/tmp/usa-xray-versioning-20261025/final-evidence-index-completed.json` (SHA-256 `b6a3df493be36fe5e094bbf326483ad43558c1a20f904c1fbed78095e308a08a`). The earlier `final-evidence-index-current.json` was mutable coordination state and is stale; it is not the authority for this closeout.

## Release identity and final runtime

| Binding | Verified value |
| --- | --- |
| Prior public baseline | `20261025-seo-routes-dd3d97`; raw build SHA-256 `337a3e0bbb9dd5e50f603e49c6c4f79cb5d1366d5a10d38af7f27f7256f1c512`; exact Git source commit was not established |
| Production release after rollback | `20261025-versioning-ed8eefb-A`; source commit `ed8eefbe22c3befcf2b40d5e16fde0948e696772`; tag `20261025-versioning-ed8eefb-A`; raw build SHA-256 `213f3c50fdd595420f19b917bb13c0b47c6463049695de0ae08ed9197a252859`; image `sha256:a19e40876e8cdc70ad94caad5ba25ca582a56da5388203fc3d0d12259d576df9`; restored original container `89c59884b2f3b184282be7dc84fe6b2bb2bb32849f2be573a8de276786225b3d` |
| Candidate B control | `20261025-versioning-ed8eefb-B`; same source commit; raw build SHA-256 `a20af1d59ecffd004ed167321f44aed3035e121517cddef050f63971c8a7bd00`; image `sha256:0c532db12c48e858c6d7891709f57797636203620104066453bf30a928580298`; container `774f7622be18dcc5d2f672cf86ee52795a2bb546b30bd1f0a7f1d3ae2cd355c2`; status `rolled-back` |
| Actual rollback | Completed `2026-10-25T17:56:45.536535+00:00`; restored the original A container and image, removed rollback clone `1877fdb88662ad7033c8468e77f2e9623fa3b0c6e75cc5a98c077408920f6887`; runtime UID:GID `10001:10001`, read-only root and both required mounts, network address `172.19.0.4` |
| Producer reader contract | Commit `b405bfdf473614beea49dd5126a843a916168f7d`, tag `reader-contract-v1.0.0`, contract SHA-256 `7b9910816ac5608cbb8c1c90d2bbef45cc464e80d3c13aed92b7a2d62dd7600b`, schema fingerprint `91c807fa18d4ee39f4b89526bf7566cb1e47de31908521d887b68f8c48f4b811` |

The final restored production source and tag remain bound to `ed8eefbe22c3befcf2b40d5e16fde0948e696772`. This documentation/test-only mainline advance does not change or retag the deployed source and does not request a deployment. The exact source is not the later documentation commit. The producer contract identifies the reader boundary; deployed collector provenance is separately recorded, and is not claimed equal to producer main.

## E1–E11 results

| ID | Before | After/result/evidence |
| --- | --- | --- |
| **E1 — source and tag** | The deployed build's exact source commit was absent; its manifest named only a source base. | **PASS.** A and B bind exact application source `ed8eefbe22c3befcf2b40d5e16fde0948e696772`; A's immutable production tag peels to that source. Clean-install reconstruction matched all 140 package files. The final public runtime remained bound to A after rollback. |
| **E2 — owner work preservation** | Owner checkout was reported as AI878 WIP diff against production. | **PASS, qualified.** The closeout matched recorded working-file hashes, application history archive, and recovered seven root preimages; three root policy documents were intentionally consolidated while retaining owner content through the decision record and canonical pointers. The initial feedback aggregate hash was not captured, so exact initial feedback comparison is unavailable and is not claimed. |
| **E3 — Git protections** | Protection was reported as absent/unprotected before this task; no initial capture establishes a measured baseline. | **PASS, qualified.** Both repositories require PRs and strict checks, with force-push and deletion disabled. Configured approving-review count is zero; primary and Sol reviews are separately evidenced. No nonzero GitHub approval-count rule or enforced human approval requirement is claimed. |
| **E4 — wrong-base SEO package** | SEO replaced the intended UI from the wrong base; releases were made by manual overlay. | **PASS for tested pattern replays.** Fresh source proof rejected stale and false-current source claims before backend staging; exact committed-source reconstruction rejected altered package bytes. The historical bad raw build `b870c0d5889f8f01716f42514f0c6714ae261a208d8bf63b7488caa6919b1fd1` and image `sha256:f6ede23c5fed55dcf9bda27d7796b4d19571d9affba098eb50e45889362116ea` were revoked. This was pattern replay, not exact replay of the historical full package. |
| **E5 — dirty, stale and undeclared source** | Releases were packaged by manual overlay, without a consistent check that source was clean and matched the declared scope. | **PASS.** Recorded gates rejected dirty checkout packaging without creating a package, undeclared changes, stale baseline and old source before staging, and altered package bytes falsely claiming current source. |
| **E6 — regression detection** | Regressions were distributed across changes while an older green result was treated as current; no single regression-detection gate covered the known runtime failures. | **PASS.** Candidate acceptance passed all seven required checks, including Chrome 10/10, WebGL-only 2D pan/zoom, retry behavior and the expected legacy-footer mutation failure. Actual Sol reviews accepted the compatibility gate and closed medium finding #4 for the direct wrapper. |
| **E7 — rollback and activation races** | Only the previous container was available; a verified safe rollback path had not been established. | **PASS.** Real B→A rollback completed at the timestamp above. Seven fresh rollback acceptance IDs passed; source and runner were `ed8eefbe22c3befcf2b40d5e16fde0948e696772`, with operation baseline B raw build `a20af1d59ecffd004ed167321f44aed3035e121517cddef050f63971c8a7bd00` and rollback target A raw build `213f3c50fdd595420f19b917bb13c0b47c6463049695de0ae08ed9197a252859`. Revoked-target and global-lock negative replays also passed. The restore receipt proves the original A identity and read-only runtime configuration. |
| **E8 — independent data contract** | Application build depended on sibling catalog and geography-manifest inputs. | **PASS.** The reader lock pins producer commit/tag, contract hash and schema fingerprint. Positive PostgreSQL fixtures passed; a coherently altered incompatible contract was rejected before backend stage/activate/restore. Collector provenance remains separate and is not equated with producer main. |
| **E9 — SEO and public compatibility** | New SEO slugs needed preservation alongside the existing application routes. | **PASS.** Final restored public A had 124/124 static asset checks, 17/17 HTTPS SEO checks, and the API passed. Two dynamic SSR indexes are covered by route checks rather than static-byte hashes. Stats remains noindex; unpublished Blog content is not indexed. |
| **E10 — full Chrome/runtime** | Integration gates were incomplete and skippable, including required browser/database service checks. | **PASS.** A activation, B activation and rollback each had a fresh acceptance receipt with seven unique IDs, including Chrome 10/10, separate WebGL checks and the expected negative-footer result. The staged runtime API passed catalog and requested-observations checks; final public API identity remained stable. Real rollback completed and final public A passed 124/124 static assets and 17/17 HTTPS SEO. Root and both mounts were read-only. The canonical mobile entrypoint was hardened and independently reviewed. Only test-wrapper hardening used a focused 3/3 smoke because runtime and canonical code were unchanged and the three full receipts already existed. |
| **E11 — deferred React/TypeScript task** | React/TypeScript was discussed verbally without a recorded component or state ownership plan. | **PASS as documentation only.** The separate React/TypeScript task, state-owner map and component inventory are documented. No migration is implemented by this evaluation. Implementation remains a separate task after all mandatory evaluations, with small PRs and full acceptance. |

E2/E3 qualifications are part of the result and do not change the PASS dispositions. No initial feedback hash comparison, nonzero required approval count, or collector-equals-producer-main claim is made.

## Mobile test scope and review

The test-only branch consolidated and hardened the compatibility entrypoint; runtime bytes are unchanged. The old suite's hidden-search geometry was observed identical on the public baseline and A stage. Its forced-snap expectation failed on stage and conflicts with preserved free-drag behavior. There was no direct replay of that old forced-snap failure on public. The canonical free-drag behavior remains in force.

Actual Sol reports accept the consolidation and close medium finding #4 without new material blockers. An earlier unverified Luna review statement is not treated as proof. Optional native pinch/touch, WebKit, resize/orientation, interruption and related legacy coverage is retired and not certified; physical iPhone Safari remains a separate owner observation. Future UI work should restore only valid, maintained coverage as an explicit task.

## Immutable evidence references

The completed index above lists report hashes. Critical reports include:

- Rollback result: `eval/ed8eefb-B-real-rollback-result.json`, SHA-256 `fa0ffc5e4b4ec478ddbc68bf45da7d4f3723b34f98a59c9ea62c9a2297620054`.
- Seven-check rollback acceptance: `release-ed8eefb-B-rollback-acceptance.json`, SHA-256 `6b97b981bb9786e6b12cf75f4c82264eed8c290304beda24a1ee8f2466247910`.
- Final public assets: `eval/public-ed8eefb-final-assets.json`, SHA-256 `57310313e0b01705c9ad643a6939e366f29ab4df0089158cf625f4d650a874d5`.
- Final public SEO: `eval/seo-http-ed8eefb-final-public.json`, SHA-256 `d613b0dbbe965f04e97c0423cfd99ce357fc9d2d369e978c4be8fcf0f141ca03`.
- Final public API: `eval/ed8eefb-final-public-api.json`, SHA-256 `eabbd8d493130681d2755669eaada6f665dedebcb36cf26c94f736b2702c3019`.
- Owner preservation closeout: `eval/owner-preservation-closeout.json`, SHA-256 `01ac0c0cc35b553176fb3d7f5b85b768e03116c5bb6f82e2b7ed4867ef9d346b`.
- Git protection closeout: `eval/git-protection-closeout.json`, SHA-256 `41f856596678c72b6880713a4878938f87674e1e9c78e0c3a018bb294d7dcdf5`.
- Actual Sol mobile hardening review: `sol-mobile-hardening-review.md`, SHA-256 `73b3ae0c10a7675300d93d3fbdade70e24bce553d79ae20b6dd0fa6818228471`.

Private owner camera preferences are excluded; curated committed runtime defaults remain versioned. The evidence packet contains no secrets, full server environment, private feedback, mount sources or owner-private notes. This report records completed runtime evaluation; documentation/test-only integration follows the protected PR process and is verifiable in GitHub history.

## Separate React task

The completed E1–E11 record above remains unchanged. The separately owner-authorized React/TypeScript candidate is tracked in [its own before/after evaluation](react-typescript-evaluation-20261026.md); its local checks do not change the current production release or authorize activation.
