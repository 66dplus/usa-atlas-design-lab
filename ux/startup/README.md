# Versioned startup observation

`unemployment-BLS-LAUS-2024-2024-M12.json` is a compact UI startup snapshot for
the default Unemployment rate map. It preserves the read-only atlas response,
including original observations, units, period, source, release and selection
method. The snapshot contains 3,272 state and county observations and no `US`
row; the interface does not infer a national value.

The file is served under an immutable, release-specific name. The browser seeds
only the matching indicator, period and BLS-LAUS-2024 release, displays its
source metadata, then refreshes it from `/api/atlas/observations`. If the live
request fails, the labelled snapshot remains available. Other indicators and
the three Quick stats series are loaded only when a place is selected.

When the default indicator's published period or release changes, export the
current public observation response to a new filename, update the version check
in `ux/app.js`, retain the prior snapshot for existing cached clients, and
verify the new source period and release against the catalog and API response.
This file is not a new collection pipeline; the read-only database remains the
source of record.

## Why the snapshot has no national row

The current UI field `03.06:unemployment_rate` is the `BLS-LAUS-2024` regional
series. Its collector contract requests `LASST` state series and `LAUCN` county
series; the admitted response has 3,272 rows and no `US` geography. The official
December 2024 national rate of 4.1% is reported in BLS's Employment Situation
household-survey release, a separate CPS series. It is not a missing aggregate
for this LAUS field and should not be inserted into that release as though it
were one comparable observation.

If the product wants a U.S. headline, the collector follow-up is to admit a
separately identified CPS national unemployment series, with its own source,
seasonal-adjustment status, period and release, then label that distinct
reference explicitly in the UI. Do not average the map geographies or mix the
CPS headline into the LAUS color scale. Until that series is admitted, the
national screen shows the state/county map and explains the missing U.S. value.

Sources: [BLS Employment Situation, December 2024](https://www.bls.gov/news.release/archives/empsit_01102025.htm)
and [BLS LAUS data](https://www.bls.gov/lau/data.htm).
