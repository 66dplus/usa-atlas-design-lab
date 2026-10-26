import assert from 'node:assert/strict';
import { geographyForSelection } from './map.js';

const source={states:[],counties:[],districts:[],districtAreas:[],geographyType:'state',byId:new Map()};
const paneA=geographyForSelection(source,source,'congressional_district');
const paneB=geographyForSelection(source,source,'congressional_district');
assert.equal(paneA.states.length,0,'initial House switch may precede the async boundary');

let finishFetch;
const pending=new Promise(resolve=>{finishFetch=resolve;});
const delayed=async()=>{
  await pending;
  const district={id:'0606',districtCode:'06'};
  source.districts=[district];
  source.districtAreas=[{...district,stateId:'0606'}];
  source.byId.set(district.id,district);
};
const loading=delayed();
finishFetch();
await loading;

const refreshedA=geographyForSelection(source,paneA,'congressional_district');
const refreshedB=geographyForSelection(source,paneB,'congressional_district');
assert.equal(refreshedA.states.length,1,'ordinary metric switch rebinds after delayed CD119 load');
assert.equal(refreshedB.states.length,1,'both compare panes rebind after delayed CD119 load');
assert.equal(refreshedA.states[0].id,'0606');
assert.equal(refreshedB.states[0].id,'0606');
assert.notEqual(refreshedA,paneA,'the map update rebuilds the geographic binding');
const returnedToState=geographyForSelection(source,refreshedA,'state');
const switchedBack=geographyForSelection(source,returnedToState,'congressional_district');
assert.equal(switchedBack.states[0].id,'0606','a later House activation uses loaded geometry too');
console.log('PASS: delayed House boundaries rebind after ordinary metric switches and in both compare panes');
