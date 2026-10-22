import assert from 'node:assert/strict';
import {prepareLayer,createDataStore,formatValue,comparable} from './model.js';

const geo={byId:new Map(['06','48','06037','06075','06085','09001'].map(id=>[id,{id}]))};
const metric={id:'rate',fieldId:'03.06:unemployment_rate'};
const sample=(fieldId=metric.fieldId)=>({fieldId,unit:'%',sourceRelease:'test-release',period:'2024-M12',excludedGeographies:['PR'],observations:[
  {id:'06',sourceGeoId:'06',value:0},{id:'48',sourceGeoId:'48',value:10},
  {id:'06037',sourceGeoId:'06037',value:5},{id:'06075',sourceGeoId:'06075',value:7},{id:'06085',sourceGeoId:'06085',value:9},
  {id:'09110',sourceGeoId:'09110',value:15},
]});
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-12,message);
const data=prepareLayer(sample(),geo);
assert.equal(data.observations.get('06').value,0);
assert.equal(data.scale,'linear');assert.equal('bins' in data,false);assert.equal('breaks' in data,false,'continuous colour has no quantile bins');
assert.equal(data.values.get('06037'),0);
assert.equal(data.values.get('06075'),.5,'the middle county sits halfway on the linear ramp');
assert.equal(data.values.get('06085'),1);
assert.equal(data.values.get('06'),0,'state values are clamped, not used to compress the county domain');
assert.equal(data.values.get('48'),1);
assert.equal(data.values.get('09001'),null);
assert.deepEqual(data.excludedGeographies,['PR','09110']);
assert.equal(data.observations.has('US'),false,'never synthesize a US average');
assert.equal(data.min,5);assert.equal(data.max,9,'county values define the colour domain; state totals and unmapped geographies do not');
assert.equal(data.heightValues.get('06037'),0,'relief keeps the original min-max range');
assert.equal(data.heightValues.get('06075'),.5);
assert.equal(data.heightValues.get('06085'),1);
assert.equal(formatValue(0,'%'),'0%');assert.equal(formatValue(null),'—');
const legacy=sample();legacy.scale='quantile7';
assert.equal(prepareLayer(legacy,geo).scale,'linear','a stored quantile label no longer bins the map');
const logarithmic=sample();logarithmic.scale='log';
const logLayer=prepareLayer(logarithmic,geo);
assert.equal(logLayer.scale,'log');
close(logLayer.values.get('06075'),Math.log(7/5)/Math.log(9/5),'log colour spacing follows value ratios');
assert.equal(logLayer.heightValues.get('06075'),.5,'relief stays linear on a log colour scale');
const nonPositive=sample();nonPositive.scale='log';nonPositive.observations.find(row=>row.id==='06037').value=0;
assert.equal(prepareLayer(nonPositive,geo).scale,'linear','a non-positive minimum falls back to a linear colour scale');
const constant=sample();constant.observations.forEach(r=>r.value=7);
assert.equal(prepareLayer(constant,geo).values.get('06'),.5,'one value paints the middle of the ramp');
const signed=sample();signed.observations.find(row=>row.id==='06037').value=-10;signed.observations.find(row=>row.id==='06075').value=-2;signed.observations.find(row=>row.id==='06085').value=2;
close(prepareLayer(signed,geo).values.get('06075'),2/3,'a negative minimum stays on the linear ramp');
const diverging=sample();diverging.scale='diverging';
diverging.observations.find(row=>row.id==='06037').value=85;diverging.observations.find(row=>row.id==='06075').value=100;diverging.observations.find(row=>row.id==='06085').value=115;
const divergingLayer=prepareLayer(diverging,geo);
assert.equal(divergingLayer.scale,'diverging');
assert.equal(divergingLayer.values.get('06037'),0,'the diverging scale spans 85 to 115');
assert.equal(divergingLayer.values.get('06075'),.5);
assert.equal(divergingLayer.values.get('06085'),1);
const suppressed=sample();suppressed.suppressedGeographies=['06037'];
assert.ok(prepareLayer(suppressed,geo).suppressed.has('06037'));
assert.ok(comparable(data,data,{id:'06'},{id:'48'}));
assert.ok(!comparable(data,data,{id:'06'},{id:'06037'}));
for(const changed of [{unit:'people'},{period:'2023'},{fieldId:'04.01'},{sourceRelease:'other'}])assert.ok(!comparable(data,{...data,...changed},{id:'06'},{id:'48'}));

let resolves=new Map(),calls=0,changed=[];
const store=createDataStore(geo,id=>changed.push(id),url=>{
  calls++;return new Promise(resolve=>resolves.set(new URL(url,'http://local').searchParams.get('field'),resolve));
});
const pendingA=store.load(metric),duplicate=store.load(metric),other={id:'other',fieldId:'05.14'};
assert.equal(pendingA,duplicate,'parallel consumers share one request');
const pendingB=store.load(other);await Promise.resolve();
assert.equal(calls,2);assert.equal(store.get(metric).status,'loading');
resolves.get(other.fieldId)({ok:true,json:async()=>sample(other.fieldId)});await pendingB;
assert.equal(store.get(other).status,'ready');assert.equal(store.get(metric).status,'loading');
resolves.get(metric.fieldId)({ok:true,json:async()=>sample()});await pendingA;
assert.equal(store.get(other).fieldId,other.fieldId,'late result never overwrites another active series');
assert.deepEqual(changed,['other','rate']);

let attempts=0;
const recovering=createDataStore(geo,()=>{},()=>{
  if(++attempts<=2)throw new Error('connection lost');
  return Promise.resolve({ok:true,json:async()=>sample()});
});
await recovering.load(metric);assert.equal(recovering.get(metric).status,'error');
assert.equal(attempts,2,'One automatic retry is exhausted before an explicit unavailable state');
assert.equal(recovering.get(metric).values.size,0,'errors never retain old painted values');
await recovering.retry(metric);assert.equal(recovering.get(metric).status,'ready');
assert.equal(attempts,3,'The user can restart a failed read without retaining stale painted values');
console.log('PASS: raw/normalized separation, continuous linear/log/diverging scales, county-only colour domain, zero/missing/signed/constant values, exact geography, compatible comparison, deduplication, out-of-order completion, failure and retry.');
