#!/usr/bin/env node
// Compatibility entrypoint for the current production mobile checks.
// ATLAS_TEST_URL, WIDTH, THEME, and OUTPUT are consumed by the canonical suite.
// The former hidden-search and forced-snap expectations described old behavior;
// current free-drag positions, supported handle snaps, scrolling, and map/footer
// geometry are checked by check-release-regressions.mjs instead.
import {readFile,writeFile} from 'node:fs/promises';
const browser=process.env.ATLAS_TEST_BROWSER||'chrome';
if(browser!=='chrome'){
  console.error(`Unsupported ATLAS_TEST_BROWSER=${browser}; the current release-regression suite runs Chrome only.`);
  process.exit(2);
}
const width=process.env.ATLAS_TEST_WIDTH;
const theme=process.env.ATLAS_TEST_THEME;
if(width&&!['390','360','1440'].includes(width)){
  console.error(`Unsupported ATLAS_TEST_WIDTH=${width}; supported widths are 390, 360, and 1440.`);
  process.exit(2);
}
if(theme&&!['light','dark'].includes(theme)){
  console.error(`Unsupported ATLAS_TEST_THEME=${theme}; supported themes are light and dark.`);
  process.exit(2);
}
const focused=Boolean(width||theme);
if(focused)console.log('Focused release regression run; this result is not the full E10 matrix.');
const output=process.env.ATLAS_TEST_OUTPUT||`/tmp/usa-xray-mobile-compat-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`;
process.env.ATLAS_TEST_OUTPUT=output;
await import('./check-release-regressions.mjs');
if(!focused){
  const path=`${output}/results.json`;
  const results=JSON.parse(await readFile(path,'utf8'));
  const expected=['chrome-390x844-light','chrome-390x844-dark','chrome-360x640-light','chrome-360x640-dark','chrome-1440x900-light','chrome-1440x900-dark','chrome-1440x640-light','chrome-1440x640-dark'];
  const actual=results.checks.filter(check=>check.name.startsWith('chrome-')).map(check=>check.name);
  if(actual.length!==expected.length||expected.some(name=>!actual.includes(name))){
    const message=`Full E10 matrix incomplete: expected exactly ${expected.length} viewport/theme cases, got ${actual.length}.`;
    results.failures.push({name:'full-e10-matrix',message});
    results.pass=false;
    await writeFile(path,JSON.stringify(results,null,2)+'\n');
    console.error(`FAIL: ${message}`);
    process.exitCode=1;
  }
}
