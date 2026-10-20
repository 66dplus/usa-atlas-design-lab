import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import {prepareLayer,missingReason} from './model.js';
const root=path.dirname(fileURLToPath(import.meta.url));
globalThis.d3=d3;globalThis.topojson=topojson;
const nativeFetch=globalThis.fetch;
globalThis.fetch=url=>nativeFetch(new URL(url,(process.env.ATLAS_BASE_URL||'http://127.0.0.1:4180')+'/ux/'));
const {loadGeography}=await import('./map.js');
const geo=await loadGeography();
assert.equal(geo.states.length,51);assert.equal(geo.counties.length,3142);
assert.equal(geo.counties.filter(f=>f.stateId==='02').length,29);
assert.equal(geo.counties.filter(f=>f.stateId==='15').length,5);
assert.equal(new Set(geo.counties.map(f=>f.id)).size,3142);
for(const f of [...geo.states,...geo.counties]){assert.ok(f.path&&!/NaN/.test(f.path),f.id+' has invalid path');assert.ok(f.bounds.flat().every(Number.isFinite),f.id+' has invalid bounds');}
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))).metrics;
const proposals=JSON.parse(fs.readFileSync(path.join(root,'catalog-proposals.json')));
assert.equal(catalog.length,81);assert.equal(new Set(catalog.map(m=>m.id)).size,81);assert.equal(new Set(catalog.map(m=>m.category)).size,9);
assert.equal(proposals.baseCatalogCount,catalog.length);
assert.equal(proposals.metrics.length,3);
assert.equal(new Set([...catalog,...proposals.metrics].map(m=>m.id)).size,84);
const api=await (await fetch('/api/atlas/catalog')).json();
assert.equal(api.catalogCount,84);assert.equal(api.publishedCatalogCount,81);
assert.equal(new Set(api.metrics.map(m=>m.catalogId)).size,84);
for(const item of proposals.metrics){
  const metric=api.metrics.find(m=>m.id===item.id);
  assert.equal(metric?.plannedState,'proposed');assert.equal(metric.fieldId,null);
  assert.match(metric.coverageNote,/No observations have been loaded/);
}
const loaded=api.metrics.filter(m=>m.fieldId),reports=[];
for(const m of loaded){
  const response=await fetch('/api/atlas/observations?field='+encodeURIComponent(m.fieldId));
  assert.equal(response.status,200,m.fieldId);
  const data=prepareLayer(await response.json(),geo);
  for(const v of data.values.values())assert.ok(v===null||(v>=0&&v<=1));
  assert.ok(data.observations.size,m.fieldId);
  assert.ok(data.period&&data.sourceRelease&&data.unit,m.fieldId);
  reports.push({id:m.fieldId,period:data.period,mapped:data.observations.size,excluded:data.excludedGeographies.length});
}
const missing=api.metrics.find(m=>m.id==='total-homeless');
assert.equal(missing.fieldId,null);
assert.match(missingReason(missing,geo.byId.get('06037'),{status:'unavailable'}),/No observations/);
console.log(JSON.stringify({series:reports}));
const repoRoot=path.resolve(root,'..'),baseline=JSON.parse(fs.readFileSync(path.join(root,'fixtures/ui-preservation-baseline.json')));
// Setup/data documentation and the existing package changes are intentional; gallery assets stay immutable.
const packageChanges=new Set(['package.json','package-lock.json','README.md']);
for(const f of baseline){if(packageChanges.has(f.path))continue;let bytes=fs.readFileSync(path.join(repoRoot,f.path));if(f.path==='README.md')bytes=bytes.subarray(0,f.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256,'Preservation failure '+f.path);}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'../package.json'))),lock=JSON.parse(fs.readFileSync(path.join(root,'../package-lock.json')));
for(const [name,version] of Object.entries({three:'0.186.0',d3:'7.9.0','topojson-client':'3.1.0','us-atlas':'3.0.1','world-atlas':'2.0.2',html2canvas:'1.4.1'})){assert.equal(pkg.dependencies[name],version);assert.equal(lock.packages['node_modules/'+name].version,version);}
assert.equal(pkg.scripts.start,'python3 scripts/serve.py');
console.log(`PASS: live geography, 81 published and 3 proposed indicators, ${loaded.length} PostgreSQL map series, explicit gaps and preserved gallery assets/dependency pins.`);
