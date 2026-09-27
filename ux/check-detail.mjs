import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import * as THREE from 'three';
import {footprints,stateMesh} from './geometry.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const manifest=read('./boundaries/manifest.json'),us=read('../node_modules/us-atlas/counties-10m.json');
const states=topojson.feature(us,us.objects.states).features.filter(f=>+f.id<60);
const projection=d3.geoMercator().rotate([100,0]).fitExtent([[55,60],[1145,690]],{type:'FeatureCollection',features:states.filter(f=>!['02','15'].includes(f.id))});
const expected=topojson.feature(us,us.objects.counties).features.filter(f=>+f.id.slice(0,2)<60).map(f=>f.id).sort(),ids=[];
for(const record of manifest.states){
 const bytes=fs.readFileSync(new URL(`./boundaries/${record.id}.json`,import.meta.url));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256);
 const data=JSON.parse(bytes);assert.equal(data.features.length,record.counties);
 for(const f of data.features){ids.push(f.id);assert.ok(d3.geoArea(f)>0&&d3.geoArea(f)<2*Math.PI,f.id+' finite land area');}
}
assert.deepEqual(ids.sort(),expected);
// Representative coast, islands, lake holes, mainland and independent city boundaries.
for(const state of ['06','02','15','36','51']){
 const features=read(`./boundaries/${state}.json`).features;
 const geo={projection,counties:features.map(feature=>({id:feature.id,stateId:state,feature}))};
 const rows=footprints(geo,d3.geoStream),selected=state==='06'?'06075':rows[0].feature.id;
 const result=stateMesh(rows,()=>.5,{height:.14,color:()=> '#e55732',center:new THREE.Vector3(),selectedId:selected});
 assert.ok(result.mesh.geometry.attributes.position.array.every(Number.isFinite));
 const top=.0015+.5*.14+.00002;
 for(const line of [result.outline,result.selection]){
  assert.ok(line.material.depthTest,'Outlines are occluded by the actual model');
  for(const name of ['instanceStart','instanceEnd']){
   const a=line.geometry.attributes[name];for(let i=0;i<a.count;i++)assert.ok(Math.abs(a.getY(i)-top)<1e-7,'Outline lies on the cap, not above it');
  }
 }
 if(state==='06'){
  const sf=features.find(f=>f.id==='06075');const coordinates=sf.geometry.coordinates.flat(2);assert.ok(coordinates.length>100,'SF must retain detailed coastline');
  assert.ok(result.selection.geometry.attributes.instanceStart.count>100);
 }
 for(const object of Object.values(result)){object.geometry.dispose();object.material.dispose();}
 rows.forEach(r=>r.geometry.dispose());
}
console.log('PASS: 51 detail files / 3142 exact FIPS / hashes and winding; CA, AK, HI, NY, VA extrusions; surface-attached state and county outlines; detailed SF coastline.');
