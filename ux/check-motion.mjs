import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {ExplorerMap} from './map.js';
const settings=JSON.parse(fs.readFileSync(new URL('./view-settings.json',import.meta.url))).settings;
let sequence=0;const queue=new Map();
globalThis.requestAnimationFrame=callback=>{queue.set(++sequence,callback);return sequence;};
globalThis.cancelAnimationFrame=id=>queue.delete(id);
const tick=()=>{const callbacks=[...queue.values()];queue.clear();callbacks.forEach(fn=>fn(performance.now()+3000));};
const map=Object.create(ExplorerMap.prototype);
Object.assign(map,{camera:new THREE.PerspectiveCamera(40,1,.01,100),controls:{mouseButtons:{},target:new THREE.Vector3(),cursor:new THREE.Vector3(),minDistance:2,maxDistance:20,maxTargetRadius:0,update(){}},state:{mode:'3d',selectedId:null},stateGroups:new Map(),settings,dim:0,heightScale:1,fitDistance:10,render(){},reduced:()=>false,geo:{byId:new Map([['20159',{focusBounds:[[0,0],[10,10]]}]])}});
const overview={mode:'3d',position:[2,10,8],target:[1,0,-1],up:[0,1,0],zoom:1.2,minDistance:2,maxDistance:20,cursor:[1,0,-1],maxTargetRadius:3,fitDistance:12};
const detail={...overview,position:[2,3,2],target:[2,0,0],zoom:1,minDistance:1,maxDistance:8};
map.applyPose(overview);map.session={overview,parent:'20'};map.state.selectedId='20';map.animateTo(detail,1);
assert.equal(map.phase,'focusing');assert.equal(queue.size,1);
// Exit before the first focus frame: the old tween cannot run later and steal the camera.
map.state.selectedId=null;map.animateTo(overview,0,{restoring:true});assert.equal(queue.size,1);tick();
assert.deepEqual(map.snapshotPose(),overview);assert.equal(map.session,null);assert.equal(map.phase,'overview');assert.equal(queue.size,0);
// A comment started during motion settles to the semantic destination and cancels all frames.
map.state.selectedId='20159';map.animateTo(detail,1);map.settle();assert.deepEqual(map.snapshotPose(),detail);assert.equal(map.phase,'focused');assert.equal(queue.size,0);assert.ok(Math.abs(map.heightScale-.15)<1e-12);
map.state.selectedId=null;map.zoom(.00001);tick();assert.ok(Math.abs(map.camera.position.distanceTo(map.controls.target)-detail.minDistance)<1e-10);
map.zoom(100000);tick();assert.ok(Math.abs(map.camera.position.distanceTo(map.controls.target)-detail.maxDistance)<1e-10);
map.reduced=()=>true;map.state.selectedId='20';map.animateTo(detail,1);assert.equal(queue.size,0);assert.deepEqual(map.snapshotPose(),detail);assert.equal(queue.size,0);
// A dimmed neighbouring state's actual surface must be picked, never mistaken for background.
const picker=Object.create(ExplorerMap.prototype),scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-3,3,2,-2,.1,20);
camera.position.set(0,5,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const stateGroups=new Map();
for(const [stateId,countyId,x] of [['36',36001,-1],['42',42001,1]]){
  const geometry=new THREE.BoxGeometry(1,.2,1);
  geometry.setAttribute('county',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(countyId),1));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.position.x=x;
  const group=new THREE.Group();group.userData={id:stateId,mesh};group.add(mesh);scene.add(group);stateGroups.set(stateId,group);
}
Object.assign(picker,{camera,scene,stateGroups,state:{selectedId:'36'},renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:600,height:400})}}});
assert.equal(picker.hit({clientX:400,clientY:200}),'42','Neighbour is a state navigation target');
assert.equal(picker.hit({clientX:200,clientY:200}),'36001','Current-state county stays selectable');
assert.equal(picker.hit({clientX:300,clientY:20}),null,'Actual background remains empty');
picker.state.selectedId='36001';assert.equal(picker.hit({clientX:400,clientY:200}),'42','Switch also works from county detail');
for(const group of stateGroups.values()){group.userData.mesh.geometry.dispose();group.userData.mesh.material.dispose();}
console.log('PASS: neighbouring state/county/background picking, interrupted return, exact pose restoration, capture settle, county relief, zoom bounds and reduced motion.');
