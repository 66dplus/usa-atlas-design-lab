# Data research handoff — 2026-09-28

Data-repository work: `research/2026-09-28/README.md` in
[`66dplus/usa-atlas-data-collection`](https://github.com/66dplus/usa-atlas-data-collection).
The current working copies contain this research locally; the repository URL
identifies the owning project and does not imply that this change was pushed.

## Current integration status

**Update, 1 October 2026:** the v3 extension and automatic admission timer are
deployed. At 08:55 UTC two real batches had committed: 494,986 numeric rows and
5,014 quality records, including 72,560 inserted facts and 422,426 updates.
The admitted B01002 portion contains 36,182 distinct block groups. This is
partial coverage of one table; the 43-dataset backlog continues automatically.
Current evidence: `research/2026-10-01/pipeline-live.json` and `PROGRESS.md`
in the data repository. UI integration and geometry handling remain separate.

An automatic admission pipeline is now installed in the data repository
(`ops/AUTO-PIPELINE.md`): a 15-minute systemd timer, bounded import batches,
transactional checkpoints and retries. Its two registered adapters cover
22 national and 21 regional/federal/research snapshots. The new timer and v3
namespace were installed at 08:50 UTC on 1 October, with watchdog monitoring.
Only committed batches may be treated as production data by the UI.

The additive `usa_atlas_pipeline` namespace stores source records,
quality flags and snapshot completion separately from canonical observations.
Consumers of `kind='source_record'` must select `dataset.latest_snapshot_id`,
which refers to a complete snapshot. Current `observation_quality` flags are
published with canonical observations per chunk and must not be hidden by that
complete-snapshot filter during an update. Building records and research transcriptions do not become
catalog metrics merely by being stored. Existing observation readers retain
their 13-column compatibility interface after the coordinated migration.

After network/server access was enabled, the real `usa_atlas` database was found
in the `usa-atlas-postgres` Docker container. **Compaction completed on
2026-09-29 at 15:17 UTC:** all 49,206,438 observations and 13 original columns
were preserved, with zero mismatches over 101 exact ranges. Facts, indexes and
provenance dictionaries now occupy 17.79 GB instead of 63.94 GB. The `observation`
compatibility view and matched production loader are deployed; both backups are
retained. Current evidence is in `research/2026-09-29/PROGRESS.md` and
`research/2026-09-28/storage/postgres-cleanup-result.json` in the data repository.

A complete production inventory on 29 September at 15:23 UTC confirmed 31 populated catalog
fields out of 81 (28 of 74 non-food fields), with no admitted block-group
observations at that time. The existing ACS portion contained eight fields at
state/county/place/tract levels. Its source-variable and MOE rows are not a count
of distinct product metrics. The inventory is
`research/2026-09-29/production-coverage.json` in the data repository.

The new national collection finished 19 primary ACS tables, two extensions and
CDC tract data: 72,599,760 source-variable records, including overlapping
alternative inputs and up to 242,297 block groups per eligible ACS table.
B17021 poverty data covers block groups; B05012 remains tract-level. These new
artifacts are now being admitted incrementally; they are not all loaded.
The existing catalog and UI runtime remain as before.

As of 2026-09-29, the collection also contains 10 regional datasets with 75,580
source rows across parts of CA, DC, VA, NY, TX, CO and WA. Their units differ:
buildings, permit/status aggregates, registrations, gauges and other records
cannot be added as one population or facility count. The new Prince William
County dataset contains 248 building records, including 57 Completed; that
status does not establish 57 operating data centers. WA EV records cover 1,770
tracts and do not measure electricity demand.

Portal discovery reached all 50 states, DC and Puerto Rico and produced 931
distinct catalog candidates. These are metadata awaiting publisher, geography
and measurement review. Persistent schedules refresh regional sources daily,
PWC weekly and rotate nationwide search topics every six hours; a watchdog
checks the jobs every two minutes. Current evidence is in
`research/2026-09-29/PROGRESS.md` in the data repository.

## Requirements for subsequent UI/data work

- Preserve public field and series IDs and provenance. The storage proposal moves
  repeated source/method text into dictionaries and restores the existing read
  shape through a compatibility view. The loader needs a matching migration.
- Current `scripts/atlas_data.py` admits state/county data and assumes an 81-field
  catalog. New topics and tract/block-group geometry require an explicit versioned
  integration change. Research CSVs should not be attached directly to the map.
- The initial offline Census recovery is superseded for coverage by the new live
  collection report and field matrix. Coverage varies per table. Source-variable
  pairs still need contract formulas and uncertainty handling before becoming UI
  metrics. Missing MOE remains missing; controlled-estimate sentinels are flags.
- Food prices, restaurants, grocery access and farmers' markets are outside this
  expansion. This instruction does not delete previously admitted records.
- Display wealth thresholds and dates explicitly. Income-tax returns are not
  people with a given net worth. Firm receipts and valuation are separate metrics.
- Data-center buildings, campuses, operating capacity and proposed development
  need separate definitions. Local registry coverage is not national completeness.
- An energy price at state/utility level is not an observed tract price. Water
  withdrawals, consumption, drought and available supply are separate quantities.
- The search-demand pack contains research candidates and published signals;
  it provides no measured national popularity ranking. Correlation pairs are
  hypotheses, not established effects.

## Product candidates

The data team has prepared 20 demand topics and 15 comparison hypotheses.
The initial editorial order is data centers/energy/water, housing/income,
overdose/treatment, water/climate, then wealth/companies. This order is a research
choice. It should be revisited after actual US keyword exports and source coverage
are available. Keep unavailable layers distinguishable from measured zero values.
