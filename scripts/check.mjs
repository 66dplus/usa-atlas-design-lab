import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {field,metrics,palettes} from '../field.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJSON=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const required=[
 'index.html','app.js','scene.js','maps.js','field.js','assets/geography.json',
 'assets/earth-silver.jpg','assets/earth-normal.jpg','assets/map-blue.svg','assets/map-blue.png',
 'handoff/selected-studies.json'
];
for(const file of required)assert.ok(fs.existsSync(path.join(root,file)),`missing ${file}`);

const stats=readJSON('assets/geometry-stats.json');
assert.equal(stats.counties,3108,'county count changed');
assert.equal(stats.samples,32892,'registered sample count changed');
assert.equal(stats.synthetic,true,'demo data must stay explicitly synthetic');
assert.equal(metrics.length,10,'expected ten demo metrics');
for(const palette of ['orbital','ember','blue'])assert.equal(palettes[palette].length,7,`${palette} palette must have seven steps`);
for(const [lon,lat] of [[-74.006,40.713],[-118.244,34.052],[-87.63,41.878],[-95.37,29.76]]){
 for(let metric=0;metric<metrics.length;metric++){
  const value=field(lon,lat,metric);assert.ok(value>=0&&value<=1,`field outside 0..1 at ${lon},${lat}`);
 }
}

const handoff=readJSON('handoff/selected-studies.json');
assert.deepEqual(handoff.selected.map(s=>s.number),['01','02','06'],'handoff selection changed');
console.log('PASS: selected studies 01, 02 and 06 have valid local assets and bounded synthetic fields.');
