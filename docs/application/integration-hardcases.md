# Application integration hard cases

## Ownership and dependency scan

The application has no runtime reference to a sibling `usa-atlas-data-collection` checkout and no `.worktrees` lookup. The map and build tools use the app's pinned `us-atlas@3.0.1` package, checked-in `ux/boundaries/*.json`, `ux/county-boundary-repair.json`, and `ux/boundaries/manifest.json`. Those inputs are exported in `contracts/geography/boundaries.json` with hashes; `scripts/check_geography_contract.py` verifies them. The reader artifact is vendored under `contracts/reader/v1`; application runtime must never perform a sibling checkout lookup.

## Reader contract

Producer PR #2 merged as commit `b405bfdf473614beea49dd5126a843a916168f7d` and tag `reader-contract-v1.0.0`. The exact published producer artifacts are vendored under `contracts/reader/v1` and pinned in `contracts/reader-contract.lock.json`; `scripts/check_reader_contract.py` rejects any artifact hash change or candidate producer revision. The contract does not claim observation completeness and preserves the passed-ingest admission rule.

The producer bootstrap, corrected fixture, producer query, actual application adapter query, and schema-column/type inspection now run in an isolated disposable PostgreSQL database. The adapter path is tested for numeric zero, missing observations, county FIPS identity, native units, and admission filtering. The 45-test application Python suite and the 4 reader-contract tests passed against the separately provided disposable app PostgreSQL cluster on 25 October 2026. These checks establish source/fixture compatibility; they are not a claim that the candidate is the production pipeline main branch. The producer contract identity `b405bfdf473614beea49dd5126a843a916168f7d` is distinct from production pipeline code fingerprints recorded in [`../operations/pipeline-provenance-20261025.json`](../operations/pipeline-provenance-20261025.json).

## Release packaging

The production packager is owned by the release worker and remains unchanged. Its required SEO updates are specified in `/tmp/usa-xray-versioning-20261025/required-packager-changes.md` and its temporary build passed the raw 130-path manifest plus the prior three omitted inputs. Until those coordinated changes are applied to the owned packager, `scripts/check_seo.py` intentionally fails at its package-inclusion assertion.

## Browser acceptance

The browser worker owns `ux/check-release-regressions.mjs` and is running the positive and negative loopback-origin cases against the packaged runtime. The full Chrome viewport/theme and gesture matrix is not yet recorded PASS here. Keep browser artifacts under `/tmp`; the optional physical iPhone owner check is a separate follow-up record and is not a substitute for the mandatory Chrome matrix.


## Read-only production pipeline audit (25 October 2026)

A separate sanitized audit records the primary and auxiliary pipeline working-tree identities, relative code-file SHA-256 values, dirty code paths, and read-only service inventory in [`../operations/pipeline-provenance-20261025.json`](../operations/pipeline-provenance-20261025.json). The primary data collection checkout was observed at `84c73e3959b2631a70c65bf26c233e254188079a` on `main` with 74 code files fingerprinted, five dirty code files, and 172 tracked changes. The auxiliary wave-control checkout was observed at `778e5cbf4a927f94df7b27e7862a195b49ab2cb0` on `codex/parallel-luna-20261006` with 56 code files, three dirty code files, and eight tracked changes. These are working-tree fingerprints, not exact clean source commits; neither replaces the separate producer contract tag/commit. The audit observed failed monitor/research units; record these for a separate operational follow-up. No repair or restart was authorized or performed here.
