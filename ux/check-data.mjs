import assert from 'node:assert/strict';
import {prepareLayer,createDataStore,formatValue,comparable} from './model.js';

const geo={byId:new Map(['06','48','06037','09001'].map(id=>[id,{id}]))};
const metric={id:'rate',fieldId:'03.06:unemployment_rate'};
const sample=(fieldId=metric.fieldId)=>({fieldId,unit:'%',sourceRelease:'test-release',period:'2024-M12',excludedGeographies:['PR'],observations:[
  {id:'06',sourceGeoId:'06',value:0},{id:'48',sourceGeoId:'48',value:10},
  {id:'06037',sourceGeoId:'06037',value:5},{id:'09110',sourceGeoId:'09110',value:15},
]});
const data=prepareLayer(sample(),geo);
assert.equal(data.observations.get('06').value,0);
assert.equal(data.scale,'quantile7');assert.equal(data.bins,7);assert.equal(data.breaks.length,8);
assert.equal(data.values.get('06'),1/14,'the lowest observation sits in the first quantile bin');
assert.equal(data.values.get('06037'),3.5/7);
assert.equal(data.values.get('09001'),null);
assert.deepEqual(data.excludedGeographies,['PR','09110']);
assert.equal(data.observations.has('US'),false,'never synthesize a US average');
assert.equal(data.max,10,'unmapped source geographies do not change the map scale');
assert.equal(data.heightValues.get('06'),0,'relief keeps the original min-max range');
assert.equal(data.heightValues.get('48'),1);
assert.equal(formatValue(0,'%'),'0%');assert.equal(formatValue(null),'—');
const constant=sample();constant.observations.forEach(r=>r.value=7);
assert.equal(prepareLayer(constant,geo).values.get('06'),1/14,'one value stays in the first bin');
const signed=sample();signed.observations[0].value=-10;
assert.equal(prepareLayer(signed,geo).values.get('06037'),3.5/7,'a negative minimum moves to the first bin');
assert.equal(prepareLayer(signed,geo).values.get('06'),1/14);
const diverging=sample();diverging.scale='diverging';
const divergingLayer=prepareLayer(diverging,geo);
assert.equal(divergingLayer.scale,'diverging');
assert.equal(divergingLayer.values.get('06'),0,'the diverging scale spans 85 to 115');
assert.equal(divergingLayer.values.get('06037'),Math.min(1,Math.max(0,(5-85)/30)));
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
console.log('PASS: raw/normalized separation, zero/missing/signed/constant scales, exact geography, compatible comparison, deduplication, out-of-order completion, failure and retry.');
