#!/usr/bin/env node
// Compatibility entrypoint for the current production mobile checks.
// ATLAS_TEST_URL, WIDTH, THEME, and OUTPUT are consumed by the canonical suite.
// The former hidden-search and forced-snap expectations described old behavior;
// current free-drag positions, supported handle snaps, scrolling, and map/footer
// geometry are checked by check-release-regressions.mjs instead.
const browser=process.env.ATLAS_TEST_BROWSER||'chrome';
if(browser!=='chrome'){
  console.error(`Unsupported ATLAS_TEST_BROWSER=${browser}; the current release-regression suite runs Chrome only.`);
  process.exit(2);
}
await import('./check-release-regressions.mjs');
