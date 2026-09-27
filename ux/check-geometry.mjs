import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import * as THREE from 'three';
import {footprints,projectedShapes,stateMesh} from './geometry.js';

const us=JSON.parse(fs.readFileSync(new URL('../node_modules/us-atlas/counties-10m.json',import.meta.url)));
const states=topojson.feature(us,us.objects.states).features.filter(f=>+f.id<60);
const counties=topojson.feature(us,us.objects.counties).features.filter(f=>+f.id.slice(0,2)<60);
for(const repair of JSON.parse(fs.readFileSync(new URL('./county-boundary-repair.json',import.meta.url))).features)counties[counties.findIndex(f=>f.id===repair.id)]=repair;
const projection=d3.geoMercator().rotate([100,0]).fitExtent([[55,60],[1145,690]],{type:'FeatureCollection',features:states.filter(f=>!['02','15'].includes(f.id))});
const geo={projection,counties:counties.map(feature=>({feature,id:feature.id,stateId:feature.id.slice(0,2)}))};
const start=performance.now(),rows=footprints(geo,d3.geoStream);
assert.equal(rows.length,3142);assert.equal(rows.filter(r=>r.feature.stateId==='02').length,29);assert.equal(rows.filter(r=>r.feature.stateId==='15').length,5);
for(const row of rows){
  const p=row.geometry.attributes.position,n=row.geometry.attributes.normal;
  assert.ok(p.count>0,row.feature.id);assert.ok(p.array.every(Number.isFinite),row.feature.id);
  let topArea=0;
  for(let i=0;i<p.count;i+=3){
    for(let k=0;k<3;k++)assert.ok(p.getY(i+k)>=-1e-6&&p.getY(i+k)<=1.000001,row.feature.id+' bounded vertical extrusion');
    if(n.getY(i)>.99)topArea+=Math.abs(THREE.ShapeUtils.area([0,1,2].map(k=>new THREE.Vector2(p.getX(i+k),p.getZ(i+k)))));
  }
  const footprintArea=row.shapes.reduce((sum,shape)=>{const q=shape.extractPoints(1);return sum+Math.abs(THREE.ShapeUtils.area(q.shape))-q.holes.reduce((s,h)=>s+Math.abs(THREE.ShapeUtils.area(h)),0);},0);
  // Simplified source rings can self-touch; tolerate <1% area error, never missing/oversized caps.
  assert.ok(Math.abs(topArea-footprintArea)<Math.max(1e-7,footprintArea*.01),row.feature.id+' cap follows its full footprint');
}
// A synthetic donut tests actual triangulation: top triangle area excludes its hole.
const donut={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[3,7],[7,7],[7,3],[3,3]]]};
const shapes=projectedShapes(donut,d3.geoIdentity(),d3.geoStream);
assert.equal(shapes.length,1);assert.equal(shapes[0].holes.length,1);
const cap=new THREE.ShapeGeometry(shapes);let area=0;
for(let i=0;i<cap.index.count;i+=3){const points=[0,1,2].map(offset=>new THREE.Vector2().fromBufferAttribute(cap.attributes.position,cap.index.getX(i+offset)));area+=Math.abs(THREE.ShapeUtils.area(points));}
assert.ok(Math.abs(area-.0084)<1e-7,'Hole must not be filled');cap.dispose();
// Test merged raised surfaces and FIPS identity on real county top triangles.
for(const id of ['06037','15001','02013','51610','51510','51683','51685','11001']){
  const row=rows.find(r=>r.feature.id===id),{mesh,lines}=stateMesh([row],()=>.75,{height:.12,color:()=> '#e55732',center:new THREE.Vector3(),selectedId:null});
  const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
  let index=-1,largest=0;
  for(let i=0;i<p.count;i+=3){
    if(n.getY(i)<.99||p.getY(i)<.09)continue;
    const triangle=[0,1,2].map(k=>new THREE.Vector2(p.getX(i+k),p.getZ(i+k))),area=Math.abs(THREE.ShapeUtils.area(triangle));
    if(area>largest){largest=area;index=i;}
  }
  assert.ok(index>=0,id+' has a raised polygon cap');
  const center=new THREE.Vector3();for(let k=0;k<3;k++)center.add(new THREE.Vector3().fromBufferAttribute(p,index+k));center.divideScalar(3);
  assert.ok(Math.abs(center.y-.0915)<1e-6, id+' top height '+center.y);
  const ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0));
  mesh.updateMatrixWorld();const hit=ray.intersectObject(mesh)[0];assert.ok(hit,id+' is clickable on its raised surface');assert.equal(mesh.geometry.attributes.county.getX(hit.face.a),+id);
  if(id.startsWith('51')){
    const neighbours=stateMesh(rows.filter(r=>r.feature.stateId==='51'),()=>.75,{height:.12,color:()=> '#e55732',center:new THREE.Vector3(),selectedId:null});
    neighbours.mesh.updateMatrixWorld();
    const hits=ray.intersectObject(neighbours.mesh).filter(hit=>hit.face.normal.y>.99);
    assert.deepEqual([...new Set(hits.map(hit=>neighbours.mesh.geometry.attributes.county.getX(hit.face.a)))],[+id],id+' enclave must not be covered by a neighbour');
    for(const object of [neighbours.mesh,neighbours.lines]){object.geometry.dispose();object.material.dispose();}
  }
  mesh.geometry.dispose();mesh.material.dispose();lines.geometry.dispose();lines.material.dispose();
}
console.log(JSON.stringify({result:'PASS',counties:rows.length,islandCounties:rows.filter(r=>r.shapes.length>1).length,holes:rows.reduce((s,r)=>s+r.shapes.reduce((n,p)=>n+p.holes.length,0),0),vertices:rows.reduce((s,r)=>s+r.geometry.attributes.position.count,0),milliseconds:Math.round(performance.now()-start),checks:'finite geometry, complete coverage, holes, islands, raised-surface raycast and county ownership'}));
