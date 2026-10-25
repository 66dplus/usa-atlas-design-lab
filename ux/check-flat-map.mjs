import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import * as THREE from 'three';
import {acquireFlatState,FlatMapRenderer} from './flat-map.js';
globalThis.d3=d3;
const us=JSON.parse(fs.readFileSync(new URL('../node_modules/us-atlas/counties-10m.json',import.meta.url)));
const states=topojson.feature(us,us.objects.states).features.filter(f=>+f.id<60);
const features=topojson.feature(us,us.objects.counties).features.filter(f=>+f.id.slice(0,2)<60);
for(const f of JSON.parse(fs.readFileSync(new URL('./county-boundary-repair.json',import.meta.url))).features)features[features.findIndex(old=>old.id===f.id)]=f;
const projection=d3.geoMercator().rotate([100,0]).fitExtent([[55,60],[1145,690]],{type:'FeatureCollection',features:states.filter(f=>!['02','15'].includes(f.id))});
const geo={projection,counties:features.map(feature=>({feature,id:feature.id,stateId:feature.id.slice(0,2)}))};
let counties=0,vertices=0,holes=0,islands=0;
for(const state of states){
  const entry=acquireFlatState(geo,state.id,d3.geoStream),p=entry.geometry.attributes.position,ids=entry.geometry.attributes.county;
  counties+=entry.ids.length;vertices+=p.count;assert.ok(p.array.every(Number.isFinite));
  assert.deepEqual([...new Set(ids.array)].map(id=>String(id).padStart(5,'0')).sort(),entry.ids.toSorted());
  for(const county of entry.picks){
    holes+=county.rings.reduce((n,shape)=>n+shape.length-1,0);if(county.rings.length>1)islands++;
    const expected=county.rings.reduce((sum,[outer,...holes])=>sum+Math.abs(d3.polygonArea(outer))-holes.reduce((n,h)=>n+Math.abs(d3.polygonArea(h)),0),0);
    let area=0;for(let i=0;i<p.count;i+=3)if(ids.getX(i)===+county.id)area+=Math.abs(THREE.ShapeUtils.area([0,1,2].map(k=>new THREE.Vector2(p.getX(i+k),p.getY(i+k)))));
    assert.ok(Math.abs(area-expected)<Math.max(1e-7,expected*.01),county.id+' flat triangles preserve holes and islands');
  }
  const second=acquireFlatState(geo,state.id,d3.geoStream);assert.equal(entry,second,'Compare shares immutable topology');
  let disposed=0;entry.geometry.addEventListener('dispose',()=>disposed++);entry.release();assert.equal(disposed,0,'one pane cannot dispose its neighbour');second.release();assert.equal(disposed,1,'final owner releases geometry');
}
assert.equal(counties,3142);assert.equal(holes,18);assert.equal(islands,86);
// An active old detail generation remains valid until its final owner releases it.
const old=acquireFlatState(geo,'06',d3.geoStream);geo.counties.find(f=>f.stateId==='06').feature=structuredClone(geo.counties.find(f=>f.stateId==='06').feature);
const detailed=acquireFlatState(geo,'06',d3.geoStream);assert.notEqual(old,detailed);assert.equal(old.owners,1);old.release();detailed.release();
const donutGeo={projection:d3.geoIdentity(),counties:[{id:'01001',stateId:'01',feature:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[3,7],[7,7],[7,3],[3,3]]]}}]};
const donut=acquireFlatState(donutGeo,'01',d3.geoStream);
const picker=Object.create(FlatMapRenderer.prototype);Object.assign(picker,{host:{getBoundingClientRect:()=>({left:0,top:0,width:1200,height:750})},size:[1200,750],transform:d3.zoomIdentity,groups:new Map([['01',{visible:true,userData:{cache:donut}}]])});
assert.equal(picker.hit({clientX:1,clientY:1}),'01001');assert.equal(picker.hit({clientX:5,clientY:5}),null,'lake hole remains unpickable');assert.equal(picker.hit({clientX:11,clientY:5}),null);
picker.groups.get('01').visible=false;assert.equal(picker.hit({clientX:1,clientY:1}),null);donut.release();
const map=Object.create(FlatMapRenderer.prototype);Object.assign(map,{camera:new THREE.OrthographicCamera(),size:[900,1000],requestRender(){}});
const t=d3.zoomIdentity.translate(-200,300).scale(4);map.setTransform(t);
assert.ok(Math.abs((map.camera.left+map.camera.right)/2-((600-t.x)/t.k/100-6))<1e-12);
assert.ok(Math.abs((map.camera.top+map.camera.bottom)/2-(3.75-(375-t.y)/t.k/100))<1e-12);
assert.ok(Math.abs((map.camera.right-map.camera.left)/(map.camera.top-map.camera.bottom)-.9)<1e-12,'orthographic frame preserves the geographic viewport');
console.log(JSON.stringify({result:'PASS',counties,vertices,holes,islands,checks:'full flat topology and FIPS, cap areas, independent Compare lifetimes, detail invalidation, hole/background picking and orthographic camera geometry'}));
// Demand rendering has one pending frame, no idle loop, and catches drawing failure.
let sequence=0;const queue=new Map();globalThis.requestAnimationFrame=callback=>{queue.set(++sequence,callback);return sequence;};globalThis.cancelAnimationFrame=id=>queue.delete(id);
const demand=Object.create(FlatMapRenderer.prototype);let draws=0;
Object.assign(demand,{visible:true,stats:{frames:0},renderer:{domElement:{},render(){draws++;}},scene:{},camera:{}});
demand.requestRender();demand.requestRender();assert.equal(queue.size,1);
const callback=[...queue.values()][0];queue.clear();callback();assert.equal(draws,1);assert.equal(queue.size,0);
demand.requestRender();demand.setVisible(false);assert.equal(queue.size,0);assert.equal(draws,1);
let failure;Object.assign(demand,{visible:true,disposed:false,renderer:{render(){throw new Error('GPU draw interruption');}},dispose(){this.disposed=true;},onFailure:message=>{failure=message;}});
demand.renderNow();await Promise.resolve();assert.ok(demand.disposed);assert.match(failure,/Try loading it again/);
console.log('PASS: demand frames coalesce, idle/hidden views stop, and drawing failures dispose and report an explicit retry.');
