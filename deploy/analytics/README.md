# Local Audience analytics

Before: the map had no Atlas event collector or verified Audience aggregates.
After: one optional browser integration sends stable map actions and active time to
an isolated Umami 3.4.0 service. A private CLI reads its API and produces aggregates.
The five Paper directions use demonstration data; public Audience integration is
still the next stage. The owner selected Pulse; its search/map design states are
recorded in the project design notes.

## Start

This workspace uses the dedicated `colima-usa-atlas-analytics` Docker context.
Other Colima profiles and owner servers are independent. On a machine using Docker
Desktop, omit `--context` and use the same separate Compose project.

```sh
# Run from usa-atlas-design-lab.
python3 scripts/setup_analytics.py --init-secrets
# On this Mac, if the dedicated profile is stopped:
colima start --profile usa-atlas-analytics --cpu 2 --memory 3 --disk 20 --runtime docker --network-address=false --activate=false

docker --context colima-usa-atlas-analytics compose \
  --env-file "$HOME/.config/usa-atlas/analytics.env" \
  -f deploy/analytics/compose.yaml up -d
# After /api/heartbeat returns {"ok": true}:
python3 scripts/setup_analytics.py
npm run start:analytics -- --port 4195 --feedback-dir /tmp/atlas-analytics-preview
```

Umami: <http://127.0.0.1:4300>. Atlas: <http://127.0.0.1:4195/ux/>.
The private file is `~/.config/usa-atlas/analytics.env`, mode 0600. Setup preserves
an existing file, initializes the new service's admin password and idempotently
creates `USA Atlas · Local` and `USA Atlas · Browser QA`. The username is `admin`;
read the generated password from that private file locally. Do not put it in Git,
URLs or browser screenshots. Website IDs are public tracker identifiers.

The launcher passes only `ATLAS_ANALYTICS_ENABLED`, `ATLAS_ANALYTICS_URL` and the
selected `ATLAS_ANALYTICS_WEBSITE_ID` to Atlas. Umami credentials stay in the setup
and report tools. Plain `npm start` remains opt-in: without those variables the
collector is disabled. `/api/analytics/config` returns only enabled, tracker URL
and Website ID; invalid enabled configuration returns 503 and the map continues.

The Compose project owns its database, network and `usa-atlas-analytics_analytics-db`
volume. PostgreSQL has no host port. Umami binds only `127.0.0.1:4300`.
`compose restart` and `compose down` preserve the volume. Removing the volume would
remove telemetry; it is not part of restart or rollback. To disable collection,
run Atlas without its analytics environment or set `ATLAS_ANALYTICS_ENABLED=0`.
No data-pipeline database, credential or migration is shared.

New runtime images: Umami **3.4.0**, MIT, for collection/API; PostgreSQL
**16.13-bookworm**, PostgreSQL License, for isolated persistence. Both exact tags
were pulled and run on ARM64; Umami heartbeat, API readback and PostgreSQL version
were checked. Atlas adds no npm or Python package dependency.
[Umami installation](https://docs.umami.is/docs/install),
[Umami 3.4.0 source](https://github.com/umami-software/umami/tree/v3.4.0),
[PostgreSQL license](https://www.postgresql.org/about/licence/).

## Events and definitions

`ux/app.js` remains the UI state owner. `ux/analytics.js` owns serialization,
comparison deduplication, the foreground clock and the external tracker boundary.
No search input or contact form field is serialized. URLs become `/ux/` for visits
or `/ux/<surface>` for events, with empty referrer and a fixed title; map query
parameters, hash fragments and arbitrary page text are excluded.

| Event | Meaning |
| --- | --- |
| `atlas_initial_view` | First ready map context, separate from chosen actions |
| `atlas_indicator_select` | A confirmed change of the selected indicator |
| `atlas_place_select` | A confirmed state/county selection after geography loads |
| `atlas_compare_view` | Opening or changing the participants/indicators of a comparison |
| `atlas_sources_open` | Opening the sources/statistics drawer, excluding closing it |
| `atlas_save_success` | Browser storage succeeded |
| `atlas_share_success` | Clipboard write succeeded |
| `atlas_active_time` | A foreground interval, in milliseconds |
| `atlas_view_select`, `atlas_view_restore`, `atlas_comparison_mode_select` | Explicit navigation, prepared exploration, saved view, or mode selection |

Events carry schema version 1, surface, stable indicator IDs, place type and FIPS,
parent state FIPS, and comparison participants/indicators when applicable. A
selected right-hand participant also has explicit `selected_place_*` and
`selected_state_id` properties. `US` is a separate national context. Cities are
not inferred from counties: San Francisco is county equivalent 06075; Austin
city is not Austin County. Initial contexts and repeated rendering do not inflate
indicator/place action rankings. A comparison emits once per confirmed context
change, regardless of subsequent data renders or source drawer opening.

- **Visitors and visits:** use Umami's `visitors` and `visits` from `/stats`, with
  its anonymous/session definitions. They are not account counts or a precise
  count of people. `pageviews` are separate.
- **Online now:** distinct Umami sessions with an event in the last **five
  minutes**, independent of the selected reporting period. This is activity, not
  an open socket or a guaranteed foreground count. See the pinned
  [active visitor query](https://github.com/umami-software/umami/blob/v3.4.0/src/queries/sql/getActiveVisitors.ts).
- **Indicator/place rankings:** confirmed actions, not unique visitors. Places
  describe what Atlas users explore, not where those users live.
- **Comparison pairs:** typed IDs sorted into one `pair_key`; reversing the two
  places combines their counts. Two-indicator comparisons stay separate from
  two-place interest. Each confirmed comparison opening/change contributes one
  count, so the sum of indicator counts within a pair equals its pair count.
- **Active time:** counts only when the document is visible and its window has
  focus and the selected data has finished loading. Pointer, keyboard, wheel,
  touch and scroll interaction reset a **60-second** inactivity cutoff. Flush
  every **15 seconds**, on context changes, focus/visibility changes and pagehide.
  The clock integrates only to the cutoff, so a delayed timer cannot overcount.
  A focused error/no-data context is still an exploration after loading finishes.
- **Average active exploration:** total active milliseconds divided by distinct
  ephemeral context IDs that have a positive interval. A context ID changes when
  the indicator/place/comparison changes. It is neither a visitor nor a visit.
  Two indicators share one time interval, stored under a sorted indicator pair;
  time is not duplicated. Place time is explicitly the primary-place attribution.
  Pair time and its indicator breakdown are also returned.

Collection is best effort. A bounded in-memory buffer holds at most 50 startup
events, then clears when configuration or script loading fails. There is no
persistent offline queue. A blocked tracker or unavailable service does not block
map interaction; reload after restoring it to initialize a failed collector.
The last interval may be lost if the browser closes before its request completes.
The default Umami visit duration is not Atlas active time.

## Report

```sh
python3 scripts/analytics_report.py --days 30 --output /tmp/atlas-audience.json
# Isolated QA: separate Website ID and temporary feedback records.
npm run start:analytics -- --test --port 4194 --feedback-dir /tmp/atlas-analytics-qa
python3 scripts/analytics_report.py --test --days 7 --output /tmp/atlas-audience-qa.json
```

Periods are 7/30/90 rolling days, default 30, UTC. The report returns traffic,
Online now, confirmed indicator/place counts, comparison pairs and their indicator
counts, active time by indicator/primary place/comparison and average exploration
time. Umami event properties are read through the paginated `event-data-pivot` API,
not a shared SQL connection. Raw session IDs and context IDs are not returned.
The CLI currently reads all selected events into counters; for a large public
service use a scheduled aggregate/cache instead of running this on page requests.

## Checks

```sh
node ux/check-analytics.mjs
python3 -m unittest discover -s scripts -p test_analytics.py
ATLAS_BASE_URL=http://127.0.0.1:4194 node ux/check.mjs
node ux/check-data.mjs
python3 -m unittest discover -s scripts -p test_feedback.py
npm run check
```

The real browser/API acceptance record — readback, persistence and the
internal-browser focus limitation — is kept outside this repository with the
rest of the project evidence.
