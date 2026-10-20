# USA Atlas

[![CI](https://github.com/66dplus/usa-atlas-design-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/66dplus/usa-atlas-design-lab/actions/workflows/ci.yml)

USA Atlas is an interactive atlas of US statistics. It links indicators to state and county geography, shows data sources and periods, and lets you explore the map in 2D and 3D.

> This is a prototype for local runs. The live atlas reads data from a separate PostgreSQL database; the database and its credentials are not part of the repository. Project source code and documentation are available under the MIT license.

## 2D renderer: owner decision, 14 October 2026

Standard 2D maps render in WebGL; links without a `renderer` parameter serve WebGL. Saved views and links with an explicit `renderer=svg` keep using SVG, and newly saved or shared links always record the selected renderer in the URL. SVG remains the automatic fallback when WebGL is unavailable, a draw fails, or the context is lost. The 3D renderer is unchanged. The local SVG-vs-WebGL comparison over a frozen set of observations is described in [docs/webgl-comparison-2026-10-11.md](docs/webgl-comparison-2026-10-11.md); the preference for WebGL came from the owner after a local comparison and is not a performance claim.

## Current interface — 20 September, feedback synthesis

The standard overview uses a white-and-graphite palette, Geist, the **Trends / Explorer / Compare** rows, a photo-lead scroll in the left panel of the place profile, quick statistics for the selected place, and a labelled advertising slot on the right. Search and categories are preserved; popular indicators sit under the selector. Highest / Lowest shows five raw values with coverage and matches, aligned with the 3D labels. Saved replaces the left frame with Back and keeps up to 50 views locally. The period of saved views is labelled, but reopening reads the latest available source snapshot. Share confirms in its own button for five seconds. Surprise opens prepared scenarios; the full-width ticker stops on hover/focus and supports reduced motion.

## What to open

After starting the server:

- **Interactive atlas:** [http://127.0.0.1:4180/ux/](http://127.0.0.1:4180/ux/) — place search, indicators, state and county comparison, the 2D map and the 3D relief.
- **Concept gallery:** [http://127.0.0.1:4180/](http://127.0.0.1:4180/) — an early design study with synthetic demo values. These values are not statistics.
- **Advertising studio:** [http://127.0.0.1:4180/ux/advertise.html](http://127.0.0.1:4180/ux/advertise.html) — an experimental editor. Its local preview is built separately from the connected database's data; the generated snapshot and bundle are intentionally not stored in Git. Instructions live in [ux/advertising/DESIGN.md](ux/advertising/DESIGN.md).

In the atlas, a missing observation remains an explicit gap. A state value is not distributed over counties, ZIP-code or monitoring-station values are not converted to counties, and a US average is not computed from states.

## Quick start

You need Node.js with npm and Python 3. For real data you also need <code>psql</code> and access to the <code>usa_atlas</code> PostgreSQL database.

~~~sh
git clone https://github.com/66dplus/usa-atlas-design-lab.git
cd usa-atlas-design-lab
npm ci
npm start
~~~

The server prints its address and keeps running in the terminal. Open <code>/ux/</code> for the atlas or <code>/</code> for the gallery. The local server binds to <code>127.0.0.1</code>; it is a development server, not a ready public-hosting configuration.

The gallery at <code>/</code> runs without a database connection. <code>/ux/</code> also loads, but real values stay unavailable until the PostgreSQL connection is configured.

## Connecting data

Collection and loading belong to a separate repository, [usa-atlas-data-collection](https://github.com/66dplus/usa-atlas-data-collection). This interface does not run the collector and receives no data-provider keys. It reads published observations through a compatible PostgreSQL contract in the <code>usa_atlas</code> schema.

To get data for the map, run collection, validation, admission and loading per [the database instructions in the collector repository](https://github.com/66dplus/usa-atlas-data-collection/blob/main/database/README.md). The UI and the collector must point at the same <code>usa_atlas</code> database; there is no need to pass CSV, JSON or collector code into the UI repository. After a successful loading check, reopen the atlas page — the catalog and series load from the database on request.

The working atlas needs an available <code>usa_atlas</code> database, contract tables (<code>catalog_field</code>, <code>observation</code>, <code>ingest_run</code>), completed loads with status <code>pass</code>, and the <code>psql</code> client installed. Set the libpq variables in the environment before starting the application; keep secrets outside the repository, for example in a PostgreSQL password file with restricted permissions:

~~~sh
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=usa_atlas_reader
export PGPASSFILE=/path/outside/the/repository/pgpass
psql -X -d usa_atlas -c 'SELECT source, row_count, status FROM usa_atlas.ingest_run'
npm start
~~~

Point <code>PGHOST</code> and <code>PGPORT</code> at the same database the collector loads into. Do not expose PostgreSQL to the internet for a local UI. The server touches the database only in read transactions. The database name is fixed as <code>usa_atlas</code>; <code>PGDATABASE</code> does not override it. The password never reaches the browser. If the connection is not configured, the atlas API reports data unavailability; the concept gallery keeps working.

The integration goes through <code>GET /api/atlas/catalog</code> and <code>GET /api/atlas/observations?field=...</code>. The UI admits only successfully loaded catalog records, displays state and county observations, and matches counties to Census 2017 geometry by exact FIPS. Other geography levels and collector records without a UI adapter stay in the database and do not turn into estimates for the map. The adapter accepts only two known catalog versions — the original with 81 indicators and the versioned one with 87; an unknown or partial format is rejected. Any change to the catalog format, indicator ID, value type or geography ID must come with a compatible UI change and checks on both sides.

## Repository layout

- <code>ux/</code> — the current atlas interface: map, catalogs and geographic assets.
- <code>scripts/serve.py</code> — the local web server and API; <code>scripts/atlas_data.py</code> — the read-only PostgreSQL adapter.
- <code>assets/</code>, <code>app.js</code>, <code>maps.js</code>, <code>scene.js</code> and <code>field.js</code> — the separate concept gallery.
- <code>deploy/</code> — examples of local analytics and mobile environments. They are not needed for a basic run.
- <code>ux/assets/SOURCES.md</code> — provenance and attribution for major interface assets.
- <code>package-lock.json</code> — pinned versions of npm dependencies.

Data, saved feedback and settings must not end up in the public repository. The server stores local reviews in a sibling <code>feedback/</code> folder; the path can be overridden with <code>--feedback-dir</code>.

## Development

For a quick integrity check of the gallery run:

~~~sh
npm run check
~~~

The command checks files, geographic assets and synthetic fields. It does not require PostgreSQL. Changes to the atlas or the server API call for additional checks of the relevant code in <code>ux/</code> and <code>scripts/</code>; verify them before sending changes.

When changing data, keep the original values, units, period, source release and exact geography matching. Do not fill gaps with computations and do not change the geography level without changing the contract and the documentation.

## Privacy and external services

- Analytics are off by default. Local setup and reporting are described in [deploy/analytics/README.md](deploy/analytics/README.md).
- Sending requests from the advertising studio is unavailable without the server variables <code>RESEND_API_KEY</code>, <code>ATLAS_AD_FROM</code> and <code>ATLAS_AD_TO</code>. Do not put them into client code or Git.
- Advertising preview data snapshots and collected bundles are generated locally. They may contain records from your database and file paths on your machine, so they are excluded from Git.
- The comment form stores a snapshot and description on the local server. Before publishing or sending a review, check that the image contains no personal data.

## License

Project source code and documentation are available under the [MIT license](LICENSE). Copyright © 2026 Dmitrii Rybkin. Third-party fonts, photographs, cartographic assets and libraries keep their own terms of use; their provenance is listed in [ux/assets/SOURCES.md](ux/assets/SOURCES.md) and in the licenses of npm dependencies.
