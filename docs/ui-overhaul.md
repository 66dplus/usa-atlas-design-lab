# Full UI reconciliation, 22 October 2026

Base: live release `20261022-mobile-sheet-v8`, commit `96a2ae0`.
The implementation branch is isolated from the AI backend branch.

## Authorized scope

Audit all public desktop/mobile routes, overlays, controls and transitions. Keep
original observations, units, periods, releases, exact geography and explicit
gaps. Remove commercial advertising and the whole ticker. Do not restore old
Saved, Share, camera-toolbar, map-settings or standalone Trends surfaces.

Missing UI states include startup loading/error, indicator loading/error,
missing local/national observations, partial Compare loading/error, empty
comparison/search/ranking/journal, unavailable articles and renderer fallback.
An error is not zero, stale data is not a new observation, and funded is not
shipped. New visual states are implemented only from checked Paper iterations.

About/Support use three staged alternatives. About explains the project and
sources with a short sole-developer credit and a persistent compact Support
link. Support uses one manually maintained USD goal and inline roadmap. Unknown
author URLs, wallets, real totals and targets remain unconfigured. No new
payment APIs, feedback delivery or public audience service is included.

## Read-only runtime inventory

Run `scripts/serve.py` on an isolated port with a temporary feedback directory.
`scripts/audit-ui-browser.mjs` inspects 14 baseline scenes in desktop/mobile,
records actions, duplicate IDs, repeated action destinations, request outcomes,
geometry overflow and sampled WebGL colours. Optional screenshots preserve
before/after evidence. Repeated destinations are review candidates, not automatic
defects (global navigation and a contextual return can serve different roles).

Configuration: `ATLAS_BASE_URL`, `ATLAS_AUDIT_DIR`, optional
`ATLAS_PLAYWRIGHT_MODULE` and `ATLAS_CHROME_PATH`. Set
`ATLAS_AUDIT_SCREENSHOTS=1` to capture screens. Defaults use port 4196 and a
temporary output directory. The browser blocks non-GET/HEAD requests and closes
every created context/tab. This command does not write owner settings, feedback,
analytics, support or payment data. A baseline audit is not acceptance of new UI.

## External design constraint

The source Paper file reported that further edits could cause data loss because
the file is too large. All design streams stopped mutations in the source file.
Authoritative masters remain intact; copied, unedited frames are explicitly
unaccepted. The workspace implementation ledger records source mappings, counts,
the platform warning and owner-approved separate working files. Each native
clone is reduced to its assigned frames before editing resumes; original source
IDs and the destination file are recorded together.
