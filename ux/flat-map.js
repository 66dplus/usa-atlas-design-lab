import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {projectedShapes} from './geometry.js';

// Geometry is shared; color textures, materials, camera and selection belong to a pane.
// A detail replacement invalidates only its state. The final owner releases GPU buffers.
const caches=new WeakMap();
const key=p=>`${Math.round(p.x*1e7)},${Math.round(p.y*1e7)}`;
function segments(shapes,z=0){
  const positions=[];
  for(const shape of shapes){const p=shape.extractPoints(1);
    for(const ring of [p.shape,...p.holes])for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];positions.push(a.x,a.y,z,b.x,b.y,z);
    }
  }
  return positions;
}
export function acquireFlatState(geo,id,stream){
  let cache=caches.get(geo);if(!cache)caches.set(geo,cache=new Map());
  const features=geo.counties.filter(f=>f.stateId===id),old=cache.get(id);
  if(old&&old.features.every((f,i)=>f===features[i].feature)){old.owners++;return old;}
  const parts=[],edges=[],perimeter=new Map(),picks=[],selections=new Map();
  let geometry,countyLines,stateLines;
  try{features.forEach((feature,index)=>{
    const shapes=projectedShapes(feature.feature,geo.projection,stream);
    if(!shapes.length)throw new Error('Missing flat county boundary: '+feature.id);
    const cap=new THREE.ShapeGeometry(shapes,1),part=cap.index?cap.toNonIndexed():cap;if(part!==cap)cap.dispose();
    part.deleteAttribute('normal');part.deleteAttribute('uv');
    part.setAttribute('county',new THREE.Float32BufferAttribute(new Float32Array(part.attributes.position.count).fill(+feature.id),1));
    part.setAttribute('paletteIndex',new THREE.Float32BufferAttribute(new Float32Array(part.attributes.position.count).fill(index),1));parts.push(part);
    const lines=segments(shapes);for(const value of lines)edges.push(value);selections.set(feature.id,lines);
    const rings=shapes.map(shape=>{const p=shape.extractPoints(1);return [p.shape,...p.holes].map(r=>r.map(p=>[p.x,p.y]));});
    const bounds=new THREE.Box3().setFromBufferAttribute(part.attributes.position);
    picks.push({id:feature.id,bounds,rings});
    for(let i=0;i<lines.length;i+=6){const a={x:lines[i],y:lines[i+1]},b={x:lines[i+3],y:lines[i+4]},ka=key(a),kb=key(b);
      if(ka===kb)continue;const k=ka<kb?ka+'|'+kb:kb+'|'+ka,p=perimeter.get(k);
      if(p)p.count++;else perimeter.set(k,{count:1,line:lines.slice(i,i+6)});
    }
  });
  geometry=mergeGeometries(parts);geometry.computeBoundingBox();
  countyLines=new LineSegmentsGeometry().setPositions(edges);
  stateLines=new LineSegmentsGeometry().setPositions([...perimeter.values()].filter(p=>p.count===1).flatMap(p=>p.line));
  }catch(error){geometry?.dispose();countyLines?.dispose();stateLines?.dispose();throw error;}finally{parts.forEach(p=>p.dispose());}
  const entry={owners:1,features:features.map(f=>f.feature),geometry,countyLines,stateLines,picks,selections,ids:features.map(f=>f.id)};
  entry.release=()=>{if(--entry.owners!==0)return;geometry.dispose();countyLines.dispose();stateLines.dispose();if(cache.get(id)===entry)cache.delete(id);};
  cache.set(id,entry);return entry;
}

const vertexShader=`attribute float paletteIndex;
varying float vPaletteIndex;
void main(){vPaletteIndex=paletteIndex;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader=`uniform sampler2D palette;uniform float paletteWidth;uniform float opacity;
varying float vPaletteIndex;
void main(){gl_FragColor=vec4(texture2D(palette,vec2((vPaletteIndex+0.5)/paletteWidth,0.5)).rgb,opacity);
#include <colorspace_fragment>
}`;
function line(geometry,color,width){return new LineSegments2(geometry,new LineMaterial({color,linewidth:width,transparent:true,depthTest:false,depthWrite:false}));}

export class FlatMapRenderer {
  constructor(host,geo,{onFailure=()=>{},onRestore=()=>{}}={}){
    Object.assign(this,{host,geo,onFailure,onRestore});this.groups=new Map();this.stats={geometryBuilds:0,colorUpdates:0,frames:0};
    try{
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-6,6,3.75,-3.75,.01,100);this.camera.position.z=10;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    this.renderer.debug.onShaderError=()=>{this.suspended=true;this.renderer.domElement.hidden=true;queueMicrotask(()=>{this.dispose();this.onFailure('WebGL could not draw the map; using SVG.');});};
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    const canvas=this.renderer.domElement;canvas.className='geo-canvas geo-flat-canvas';canvas.setAttribute('aria-label','Interactive 2D WebGL map');
    canvas.style.pointerEvents='none';host.prepend(canvas);
    this.lost=event=>{event.preventDefault();this.suspended=true;cancelAnimationFrame(this.frame);this.frame=0;canvas.hidden=true;this.onFailure('WebGL interrupted; the SVG map is available.');};
    this.restored=()=>{this.suspended=false;this.onRestore();this.requestRender();};
    canvas.addEventListener('webglcontextlost',this.lost);canvas.addEventListener('webglcontextrestored',this.restored);
    this.worldGeometry=new THREE.ShapeGeometry(projectedShapes(geo.world,geo.projection,d3.geoStream),1);
    this.world=new THREE.Mesh(this.worldGeometry,new THREE.MeshBasicMaterial({color:'#EEF0F3',depthTest:false,depthWrite:false}));this.world.renderOrder=-2;this.scene.add(this.world);
    this.worldLines=line(new LineSegmentsGeometry().setPositions(segments(projectedShapes(geo.world,geo.projection,d3.geoStream))),'#3d454f',.5);this.worldLines.renderOrder=-1;this.scene.add(this.worldLines);
    this.resize(host.clientWidth,host.clientHeight);
    }catch(error){this.dispose();throw error;}
  }
  releaseGroup(id){
    const group=this.groups.get(id);if(!group)return;
    this.scene.remove(group);group.userData.mesh.material.dispose();group.userData.texture.dispose();
    group.userData.lines.material.dispose();group.userData.outline.material.dispose();group.userData.cache.release();this.groups.delete(id);
  }
  update(state,mappedValue,color,background){
    this.state=state;this.renderer.setClearColor(background,1);
    const parent=state.selectedId?.slice(0,2),isolated=state.cleanBackdrop;
    for(const id of this.geo.states.map(f=>f.id)){
      let group=this.groups.get(id);
      const rows=this.geo.counties.filter(f=>f.stateId===id);
      if(group&&!group.userData.cache.features.every((feature,i)=>feature===rows[i].feature)){this.releaseGroup(id);group=null;}
      if(!group){
        const cache=acquireFlatState(this.geo,id,d3.geoStream),texture=new THREE.DataTexture(new Float32Array(cache.ids.length*4),cache.ids.length,1,THREE.RGBAFormat,THREE.FloatType);
        const material=new THREE.ShaderMaterial({uniforms:{palette:{value:texture},paletteWidth:{value:cache.ids.length},opacity:{value:1}},vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:false});
        group=new THREE.Group();const mesh=new THREE.Mesh(cache.geometry,material),lines=line(cache.countyLines,'#382737',.35),outline=line(cache.stateLines,'#ddc8a7',1.1);
        mesh.renderOrder=0;lines.renderOrder=1;outline.renderOrder=2;group.add(mesh,lines,outline);group.userData={cache,texture,mesh,lines,outline};this.scene.add(group);this.groups.set(id,group);this.stats.geometryBuilds++;
      }
      const {cache,texture,mesh,lines,outline}=group.userData;
      if(group.userData.values!==state.values||group.userData.countySupported!==state.countySupported){
        const tint=new THREE.Color();cache.ids.forEach((id,i)=>{tint.set(color(mappedValue(this.geo.byId.get(id))));texture.image.data.set([tint.r,tint.g,tint.b,1],i*4);});texture.needsUpdate=true;
        group.userData.values=state.values;group.userData.countySupported=state.countySupported;this.stats.colorUpdates++;
      }
      group.visible=!isolated||(parent?id===parent:!['02','15'].includes(id));
      const opacity=parent&&id!==parent? .3:1;
      mesh.material.uniforms.opacity.value=opacity;lines.material.opacity=opacity;outline.material.opacity=1;
      outline.visible=!(state.selectedId?.length===5&&id===parent);
      outline.material.color.set(id===parent?'#fff7d2':'#ddc8a7');outline.material.linewidth=id===parent?2.5:1.1;
    }
    if(this.selectionId!==state.selectedId){
      if(this.selection){this.scene.remove(this.selection);this.selection.geometry.dispose();this.selection.material.dispose();this.selection=null;}
      this.selectionId=state.selectedId;
      if(state.selectedId?.length===5){const positions=this.groups.get(parent).userData.cache.selections.get(state.selectedId);this.selection=line(new LineSegmentsGeometry().setPositions(positions),'#ffffff',2.4);this.selection.renderOrder=3;this.scene.add(this.selection);}
    }
    // A replacement detail boundary also replaces the selection's coordinates.
    const selectionCache=this.groups.get(parent)?.userData.cache;
    if(this.selection&&this.selectionCache!==selectionCache){this.selection.geometry.dispose();this.selection.geometry=new LineSegmentsGeometry().setPositions(selectionCache.selections.get(state.selectedId));}
    this.selectionCache=selectionCache;
    if(this.hoverId&&this.hoverCache!==this.groups.get(this.hoverId.slice(0,2))?.userData.cache){const id=this.hoverId;this.hoverId=null;this.hover(id);}
    this.world.visible=this.worldLines.visible=!isolated;this.world.material.color.set(state.dark?'#25292D':state.cleanBackdrop?'#FFFFFF':'#EEF0F3');
    this.requestRender();
  }
  setTransform(t){
    this.transform=t;if(!this.size?.[0])return;
    const [w,h]=this.size,scale=Math.min(w/1200,h/750),x=(600-t.x)/t.k/100-6,y=3.75-(375-t.y)/t.k/100;
    const dx=w/scale/t.k/200,dy=h/scale/t.k/200;
    Object.assign(this.camera,{left:x-dx,right:x+dx,top:y+dy,bottom:y-dy});this.camera.updateProjectionMatrix();this.requestRender();
  }
  resize(w,h){
    if(!w||!h)return;this.size=[w,h];this.renderer.setSize(w,h);if(this.transform)this.setTransform(this.transform);
    // setSize empties the drawing buffer. Repaint it in the same tick, otherwise
    // the page shows an empty canvas between the resize and the next frame.
    this.renderNow();
  }
  hit(event){
    const r=this.host.getBoundingClientRect(),[w,h]=this.size||[r.width,r.height],scale=Math.min(w/1200,h/750),t=this.transform;
    if(!t)return null;
    const p=t.invert([(event.clientX-r.left-(w-1200*scale)/2)/scale,(event.clientY-r.top-(h-750*scale)/2)/scale]);
    const point=[p[0]/100-6,3.75-p[1]/100];
    for(const group of this.groups.values()){
      if(!group.visible)continue;
      const b=group.userData.cache.geometry.boundingBox;if(point[0]<b.min.x||point[0]>b.max.x||point[1]<b.min.y||point[1]>b.max.y)continue;
      for(const county of group.userData.cache.picks){const b=county.bounds;
        if(point[0]<b.min.x||point[0]>b.max.x||point[1]<b.min.y||point[1]>b.max.y)continue;
        if(county.rings.some(([outer,...holes])=>d3.polygonContains(outer,point)&&!holes.some(hole=>d3.polygonContains(hole,point))))return county.id;
      }
    }
    return null;
  }
  hover(id){
    if(this.hoverId===id)return;this.hoverId=id;
    if(this.hoverLine){this.scene.remove(this.hoverLine);this.hoverLine.geometry.dispose();this.hoverLine.material.dispose();this.hoverLine=null;}
    this.hoverCache=id?this.groups.get(id.slice(0,2))?.userData.cache:null;
    if(id){const positions=this.hoverCache.selections.get(id);this.hoverLine=line(new LineSegmentsGeometry().setPositions(positions),'#ffffff',id===this.selectionId?2.4:.35);this.hoverLine.renderOrder=4;this.scene.add(this.hoverLine);}
    this.requestRender();
  }
  setVisible(visible){this.visible=visible;this.renderer.domElement.hidden=!visible||this.suspended;if(!visible){cancelAnimationFrame(this.frame);this.frame=0;}else this.requestRender();}
  requestRender(){if(this.disposed||this.suspended||!this.visible||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.renderNow();});}
  renderNow(){
    if(this.disposed||this.suspended||!this.visible)return;
    try{this.renderer.render(this.scene,this.camera);this.stats.frames++;}
    catch(error){this.suspended=true;this.dispose();queueMicrotask(()=>this.onFailure('WebGL draw failed; using SVG. '+error.message));}
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;cancelAnimationFrame(this.frame);
    for(const id of [...this.groups.keys()])this.releaseGroup(id);
    for(const object of [this.selection,this.hoverLine,this.world,this.worldLines]){object?.geometry.dispose();object?.material.dispose();}
    const canvas=this.renderer?.domElement;canvas?.removeEventListener('webglcontextlost',this.lost);canvas?.removeEventListener('webglcontextrestored',this.restored);
    this.renderer?.dispose();canvas?.remove();
  }
}
