import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {reducedMotion} from './motion.js';
import {footprints,stateMesh,projectedShapes} from './geometry.js';
import {FlatMapRenderer} from './flat-map.js';

export const EMBER = ['#fff2b1','#f8c34a','#f4942c','#e55732','#af2345','#701e51','#281c43'];
export const DIVERGING = ['#2166ac','#67a9cf','#d1e5f0','#f7f7f7','#fddbc7','#ef8a62','#b2182b'];
const WIDTH = 1200, HEIGHT = 750;
export const rampColor = scale => d3.interpolateRgbBasis(Array.isArray(scale)?scale:(scale==='diverging'?DIVERGING:EMBER));
const color = (value,scale) => value == null ? '#aaa49e' : rampColor(scale)(value);
const RELIEF=.28;

export function geographyForSelection(sourceGeo, currentGeo, requested) {
  const type=requested==='congressional_district'?'congressional_district':'state';
  const refreshed=type==='congressional_district' &&
    (currentGeo.districts!==sourceGeo.districts || currentGeo.districtAreas!==sourceGeo.districtAreas);
  if(currentGeo.geographyType===type&&!refreshed)return currentGeo;
  return type==='congressional_district'
    ?{...sourceGeo,states:sourceGeo.districts||[],counties:sourceGeo.districtAreas||[],geographyType:type,detailStates:new Set()}
    :sourceGeo;
}

export async function loadGeography() {
  const responses=await Promise.all(['../node_modules/us-atlas/counties-10m.json','../node_modules/world-atlas/countries-110m.json','county-boundary-repair.json','cities.json'].map(url=>fetch(url)));
  if(responses.some(r=>!r.ok)) throw new Error('Geographic boundaries could not be loaded. Reload to retry.');
  const [us,world,repair,cities]=await Promise.all(responses.map(r=>r.json()));
  const states=topojson.feature(us,us.objects.states).features.filter(f=>Number(f.id)<60);
  const counties=topojson.feature(us,us.objects.counties).features.filter(f=>Number(f.id.slice(0,2))<60);
  // The simplified source collapses Falls Church to a line; use its verified 2017 polygon.
  for(const feature of repair.features){const index=counties.findIndex(f=>f.id===feature.id);if(index<0)throw new Error('Unknown county repair');counties[index]=feature;}
  const collection={type:'FeatureCollection',features:states};
  // A western central meridian keeps the Aleutians together across the date line.
  const projection=d3.geoMercator().rotate([100,0]).fitExtent([[55,60],[1145,690]],{type:'FeatureCollection',features:states.filter(f=>!['02','15'].includes(f.id))});
  const path=d3.geoPath(projection).digits(2);
  const decorate=f=>{
    const bounds=path.bounds(f);let focusBounds=bounds,point=path.centroid(f);
    // Remote tiny islands stay on the map; the main landmass determines the county close-up.
    if(f.id.length===5&&f.geometry.type==='MultiPolygon'){
      const parts=f.geometry.coordinates.map(coordinates=>({type:'Polygon',coordinates}));
      const areas=parts.map(d3.geoArea),largest=areas.indexOf(Math.max(...areas)),b=path.bounds(parts[largest]);
      if(areas[largest]/d3.sum(areas)>.65&&Math.max(bounds[1][0]-bounds[0][0],bounds[1][1]-bounds[0][1])>1.6*Math.max(b[1][0]-b[0][0],b[1][1]-b[0][1])){focusBounds=b;point=path.centroid(parts[largest]);}
    }
    return {id:f.id,name:f.properties.name,stateId:f.id.slice(0,2),feature:f,center:d3.geoCentroid(f),bounds,focusBounds,point};
  };
  const s=states.map(decorate);
  // National WebGL geometry uses source features directly; detailed bounds and
  // centroids are prepared only when a state is opened.
  const c=counties.map(f=>({id:f.id,name:f.properties.name,stateId:f.id.slice(0,2),feature:f}));
  let districts=[],districtAreas=[],districtLoad=null;
  const context=topojson.feature(world,world.objects.countries);
  // Only other countries form the backdrop; a coarse US coast would protrude into detailed bays.
  context.features=context.features.filter(f=>f.id!=='840');
  const geo={states:s,counties:c,districts,districtAreas,geographyType:'state',byId:new Map([...s,...c].map(f=>[f.id,f])),projection,path,cities:cities.map(c=>({...c,point:projection([c.lon,c.lat])})),world:context,collection,detailStates:new Set(),
    loadDistricts:async()=>{
      if(districts.length)return districts;
      if(districtLoad)return districtLoad;
      districtLoad=(async()=>{
        const response=await fetch('/api/atlas/reader/v2/cd119-boundary');
        if(!response.ok)throw new Error('The 2024 congressional district boundary is unavailable.');
        const payload=await response.json();
        if(!payload.available||payload.boundaryVintage!==2024||payload.congressSession!=='119'||!Array.isArray(payload.featureCollection?.features))throw new Error('The 2024 congressional district boundary is invalid.');
        const features=payload.featureCollection.features;
        if(features.length!==435)throw new Error('The 2024 congressional district boundary is incomplete.');
        districts=features.map(feature=>{feature.id=feature.properties.GEOID;const stateName=s.find(state=>state.id===feature.id.slice(0,2))?.name||feature.id.slice(0,2);const item=decorate(feature);item.name=`${stateName} · ${item.name}`;return {...item,stateId:feature.id.slice(0,2),districtCode:feature.properties.CD119FP,boundaryVintage:2024,congressSession:'119'};});
        districtAreas=districts.map(feature=>({...feature,stateId:feature.id}));
        geo.districts=districts;geo.districtAreas=districtAreas;
        for(const feature of districts)geo.byId.set(feature.id,feature);
        return districts;
      })().finally(()=>{districtLoad=null;});
      return districtLoad;
    }};
  geo.prepareFocus=id=>{
    const feature=geo.byId.get(id);
    if(feature&&feature.id.length===5&&!feature.focusBounds)Object.assign(feature,decorate(feature.feature));
  };
  const pending=new Map();
  geo.loadDetail=async id=>{
    if(geo.geographyType==='congressional_district'||geo.byId.get(id)?.districtCode)return;
    const parent=id?.slice(0,2);if(!parent||geo.detailStates.has(parent))return;
    if(pending.has(parent))return pending.get(parent);
    const request=(async()=>{
      const response=await fetch(`./boundaries/${parent}.json`);
      if(!response.ok)throw new Error('Detailed boundaries unavailable. Select the place again to retry.');
      const data=await response.json();
      const expected=c.filter(f=>f.stateId===parent);
      if(data.features.length!==expected.length||data.features.some(f=>!geo.byId.has(f.id)||f.id.slice(0,2)!==parent))throw new Error('Incomplete geographic detail');
      for(const f of data.features)Object.assign(geo.byId.get(f.id),decorate(f));
      const state=geo.byId.get(parent),feature={type:'FeatureCollection',features:data.features};
      state.feature=feature;state.bounds=path.bounds(feature);state.focusBounds=[[d3.min(expected,f=>f.focusBounds[0][0]),d3.min(expected,f=>f.focusBounds[0][1])],[d3.max(expected,f=>f.focusBounds[1][0]),d3.max(expected,f=>f.focusBounds[1][1])]];state.point=path.centroid(feature);
      geo.detailStates.add(parent);
    })().finally(()=>pending.delete(parent));
    pending.set(parent,request);return request;
  };
  return geo;
}

export class ExplorerMap {
  constructor(host,geo,{onSelect=()=>{},onRankSelect=()=>{},onError=()=>{},onHover=()=>{},onRenderError=()=>{}}={}) {
    Object.assign(this,{host,geo,sourceGeo:geo,onSelect,onRankSelect,onError,onHover,onRenderError});
    this.state={mode:'2d',selectedId:null,values:new Map(),dark:false};
    this.svg=d3.select(host).append('svg').attr('viewBox',`0 0 ${WIDTH} ${HEIGHT}`).attr('class','geo-svg').attr('aria-label','United States interactive map');
    this.labelLayer=this.svg.append('g').attr('pointer-events','none');
    this.zoomBehavior=d3.zoom().scaleExtent([.15,80]).translateExtent(geo.path.bounds({type:'Sphere'})).clickDistance(6).on('zoom',event=>{if(this.flatActive)this.flat.setTransform(event.transform);this.renderLabels();this.renderRankMarkers();});
    this.svg.call(this.zoomBehavior).on('dblclick.zoom',null);
    this.svg.on('click.flat',event=>{if(!this.flatActive)return;const id=this.flat.hit(event);if(id)this.pick(id);else this.exitFocus();});
    this.svg.on('pointermove.flat',event=>{
      if(!this.flatActive||event.buttons)return;
      this.hoverEvent={clientX:event.clientX,clientY:event.clientY};if(this.hoverFrame)return;
      this.hoverFrame=requestAnimationFrame(()=>{this.hoverFrame=0;if(!this.flatActive)return;const id=this.flat.hit(this.hoverEvent);this.svg.style('cursor',id?'pointer':'grab');this.flat.hover(id);if(id!==this.flatHovered){this.flatHovered=id;if(id)this.hover(id);else this.onHover(null);}});
    }).on('pointerleave.flat',()=>{if(this.flatActive){this.flatHovered=null;this.flat.hover(null);this.onHover(null);}});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    this.frame=0;this.isDisposed=false;this.dim=0;this.phase='overview';
    this.onEscape=event=>{if(event.key==='Escape'&&this.state.selectedId&&!this.host.closest('[inert]')&&!document.querySelector('.drawer:not([hidden]):not([inert]),#view-settings-panel:not([hidden]):not([inert])')&&!/INPUT|TEXTAREA/.test(event.target.tagName))this.exitFocus();};
    document.addEventListener('keydown',this.onEscape);
  }
  pick(id) {
    if(this.geo.geographyType==='congressional_district'){if(id)this.onSelect(id);return;}
    const selected=this.state.selectedId;
    const next=selected && selected.slice(0,2)===id.slice(0,2)?id:id.slice(0,2);
    this.onSelect(next);
  }
  hover(id) {
    if(this.geo.geographyType==='congressional_district'){
      const f=this.geo.byId.get(id);if(f)this.onHover({id:f.id,name:f.name,value:this.state.values.get(f.id)??null});return;
    }
    const f=this.geo.byId.get(this.state.selectedId?.slice(0,2)===id.slice(0,2)?id:id.slice(0,2));
    if(f) this.onHover({id:f.id,name:f.name,value:this.state.values.get(f.id)??null});
  }
  captureView(){return {mode:this.state.mode,renderer:this.host.dataset.renderer,transform:d3.zoomTransform(this.svg.node()),pose:this.renderer?this.snapshotPose():null,session:this.session,dim:this.dim,size:[this.host.clientWidth,this.host.clientHeight]};}
  restoreView(view){
    if(!view||view.mode!==this.state.mode)return;
    this.cancelMotion();this.session=view.session;this.dim=view.dim;
    if(view.mode==='2d')this.svg.call(this.zoomBehavior.transform,view.transform);
    else if(view.pose){const changedSize=view.size&&(view.size[0]!==this.host.clientWidth||view.size[1]!==this.host.clientHeight);this.applyPose(changedSize?this.resizedPose(view.pose):view.pose);if(changedSize&&this.session)this.session={...this.session,overview:this.resizedPose(this.session.overview,null)};this.configureControls();this.render();}
  }
  coverTransition(){
    if(reducedMotion())return null;
    const old=this.host.querySelector('.map-transition-cover');
    if(old){old.getAnimations().forEach(a=>a.cancel());return old;}
    let cover;
    if((this.state.mode==='3d'&&this.renderer)||this.flatActive){
      const canvas=document.createElement('canvas');canvas.width=this.host.clientWidth;canvas.height=this.host.clientHeight;
      this.flat?.renderNow();canvas.getContext('2d').drawImage(this.flatActive?this.flat.renderer.domElement:this.renderer.domElement,0,0,canvas.width,canvas.height);
      if(this.flatActive){cover=document.createElement('div');canvas.className='geo-canvas';cover.append(canvas);const labels=this.svg.node().cloneNode(true);labels.style.display='block';labels.style.background='transparent';cover.append(labels);}else cover=canvas;
    }
    else return null;
    cover.classList.add('map-transition-cover');cover.setAttribute('aria-hidden','true');this.host.append(cover);return cover;
  }
  mapBackdrop(){
    // The map keeps the same geographic backdrop on every screen size. Only the
    // embedded journal map asks for a clean, themed canvas.
    if(!this.state.cleanBackdrop)return this.state.mode==='2d'?'#242B34':'#171A1D';
    return this.state.background||'#EEF0F3';
  }
  update(next) {
    const previous=this.state,oldSettings=this.settings;
    const requestedGeography=next.geographyType==='congressional_district'?'congressional_district':'state';
    // A delayed boundary load replaces sourceGeo arrays after each map may have
    // copied the empty arrays. Rebind when readiness changes, for both panes.
    const nextGeo=geographyForSelection(this.sourceGeo,this.geo,requestedGeography);
    const changedGeography=nextGeo!==this.geo;
    const oldTransform=changedGeography?d3.zoomTransform(this.svg.node()):null;
    if(changedGeography){
      this.flat?.dispose();this.flat=null;this.flatFailed=false;
      this.geo=nextGeo;
    }
    const changedLayout=previous.layoutKey!==next.layoutKey,changedMode=previous.mode!==next.mode;
    let cover=changedMode&&this.initialized?this.coverTransition():null;
    const changedPlace=previous.selectedId!==next.selectedId,changedRanks=JSON.stringify(previous.ranks||[])!==JSON.stringify(next.ranks||[]);
    const detailChanges=[...this.geo.detailStates].filter(id=>!this.terrainDetailStates?.has(id));
    const cameraChanged=['tilt','cameraSide','minZoom','maxZoom'].some(key=>oldSettings?.[key]!==next.settings[key]);
    this.settings=next.settings;
    if(changedMode||changedLayout){this.cancelMotion();this.session=null;this.dim=0;}
    const before=this.renderer&&!changedMode?this.snapshotPose():null;
    this.state={...previous,...next};
    this.tint=value=>color(value,this.state.palette||this.state.scale);
    const {mode,dark,selectedId}=this.state,parent=this.geo.geographyType==='congressional_district'?selectedId:selectedId?.slice(0,2);
    this.setFlatMode(mode==='2d');
    this.host.dataset.mode=mode;this.host.dataset.selected=selectedId||'US';this.host.dataset.metric=this.state.metricKey||'';
    this.host.dataset.renderMode=mode;
    this.host.classList.toggle('map-dark',dark);this.svg.style('display',mode==='2d'?null:'none').style('background',this.flatActive?'transparent':this.mapBackdrop());
    if(this.renderer)this.renderer.domElement.hidden=mode==='2d';
    if(this.flatActive)try{this.flat.update(this.state,f=>this.mappedValue(f),this.tint,this.mapBackdrop());this.flat.setTransform(oldTransform||d3.zoomTransform(this.svg.node()));}catch(error){this.failFlat(error);}
    this.renderLabels();
    if(mode==='2d'){
      if(this.terrainBuilding){this.terrainBuildVersion++;this.terrainInterrupted=true;}
      this.terrainBuilding=false;this.setTerrainStatus('inactive');
      if(changedPlace||changedMode||changedLayout||changedRanks||!this.initialized)this.fit2D();
    }else try{
      this.ensureWebGL();this.renderer.domElement.hidden=false;
      const rebuild=this.terrainInterrupted||!this.stateGroups||previous.values!==this.state.values||previous.countySupported!==this.state.countySupported||oldSettings?.relief!==this.settings.relief;
      if(rebuild){if(this.initialized&&this.stateGroups?.size)cover ||= this.coverTransition();this.buildTerrain();}
      else {
        const refresh=new Set(detailChanges);
        if(changedPlace&&(previous.selectedId?.length===5||selectedId?.length===5)){if(previous.selectedId)refresh.add(previous.selectedId.slice(0,2));if(parent)refresh.add(parent);}
        if(refresh.size){if(this.initialized&&this.stateGroups?.size)cover ||= this.coverTransition();this.buildTerrain(refresh);}
      }
      if(selectedId&&!this.session){
        const overview=before&&!previous.selectedId?before:this.pose(null,mode);
        this.session={overview,parent};
      }
      if(this.session&&selectedId)this.session.parent=parent;
      const first=!this.initialized||changedMode||changedLayout;
      this.layoutEntry=Boolean(next.animateEntry);
      if(changedPlace||first||cameraChanged||changedRanks){
        if(next.ranks?.length)this.animateTo(this.pose(),0,{immediate:first});
        else if(!selectedId&&this.session){this.animateTo(this.session.overview,0,{restoring:true});}
        else{
          if(first){this.applyPose(next.animateEntry&&before?this.resizedPose(before,previous.selectedId):this.pose(null,mode));}
          this.animateTo(this.pose(),selectedId?1:0,{immediate:first&&!next.animateEntry});
        }
      }else{this.configureControls();this.render();}
      this.resize();this.layoutEntry=false;
    }catch(error){this.onError(error.message);}
    this.renderRankMarkers();
    this.initialized=true;
    if(cover)this.revealTerrain(cover);
  }
  whenReady(){
    if(this.state.mode!=='3d'||!this.terrainBuilding)return Promise.resolve();
    return new Promise(resolve=>(this.terrainWaiters ||= []).push(resolve));
  }
  setTerrainStatus(status){
    this.host.dataset.terrainStatus=status;this.host.setAttribute('aria-busy',String(status==='building'));
    this.host.dataset.terrainStateCount=String(this.stateGroups?.size||0);
    if(status!=='building'){for(const resolve of this.terrainWaiters||[])resolve();this.terrainWaiters=[];}
  }
  revealTerrain(cover=this.host.querySelector('.map-transition-cover')){
    if(!cover||this.state.mode==='3d'&&this.terrainBuilding)return;
    const version=cover.motionVersion=(cover.motionVersion||0)+1;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(cover.motionVersion!==version||this.state.mode==='3d'&&this.terrainBuilding)return;
      if(this.reduced()){cover.remove();return;}
      const animation=cover.animate([{opacity:1},{opacity:0}],{duration:320,easing:'ease-out'});
      animation.finished.then(()=>{if(cover.motionVersion===version)cover.remove();}).catch(()=>{});
    }));
  }
  mappedValue(feature) {
    const id=this.geo.geographyType==='congressional_district'?feature.id:this.state.countySupported===false ? feature.stateId : feature.id;
    return this.state.values.get(id)??null;
  }
  mappedHeight(feature) {
    const id=this.geo.geographyType==='congressional_district'?feature.id:this.state.countySupported===false ? feature.stateId : feature.id;
    return this.state.heightValues?.get(id)??null;
  }
  setFlatMode(requested){
    if(requested&&!this.flat&&!this.flatFailed)try{
      this.flat=new FlatMapRenderer(this.host,this.geo,{
        onFailure:message=>{this.flatActive=false;this.syncFlatLayers();this.showFlatError(message);},
        onRestore:()=>{try{this.flat.update(this.state,f=>this.mappedValue(f),this.tint,this.mapBackdrop());this.flat.setTransform(d3.zoomTransform(this.svg.node()));this.flatActive=this.state.mode==='2d';this.syncFlatLayers();this.flat.setVisible(this.flatActive);this.clearFlatError();}catch(error){this.failFlat(error);}}
      });
    }catch(error){this.flatFailed=true;queueMicrotask(()=>this.showFlatError('WebGL is unavailable. Try loading the map again.'));}
    this.flatActive=Boolean(requested&&this.flat&&!this.flat.suspended&&!this.flat.disposed);
    this.flat?.setVisible(this.flatActive);this.syncFlatLayers();
    if(!requested||this.flatActive)this.clearFlatError();
    else this.showFlatError(this.flatErrorMessage||'WebGL is unavailable. Try loading the map again.');
  }
  failFlat(error){
    this.flat?.dispose();this.flat=null;this.flatFailed=true;this.flatActive=false;this.syncFlatLayers();
    queueMicrotask(()=>this.showFlatError('WebGL could not draw the map. Try loading it again.'));
  }
  showFlatError(message){
    this.flatErrorMessage=message;
    if(this.state.mode!=='2d'||this.isDisposed||this.flatRenderError===message)return;
    this.flatRenderError=message;this.onRenderError(message);
  }
  clearFlatError(){if(this.flatRenderError){this.flatRenderError=null;this.onRenderError(null);}}
  retryFlat(){this.flat?.dispose();this.flat=null;this.flatFailed=false;this.update(this.state);}
  syncFlatLayers(){
    this.svg.style('background','transparent');
    this.host.dataset.renderer=this.state.mode==='3d'?'webgl3d':this.flatActive?'webgl':'unavailable';
  }
  fitScale(){const b=this.bounds();return Math.max(.8,Math.min(400,.82/Math.max((b[1][0]-b[0][0])/WIDTH,(b[1][1]-b[0][1])/HEIGHT)));}
  focusFeature(id=this.state.selectedId){return id?this.geo.byId.get(id)||null:null;}
  bounds() {if(this.state.ranks?.length){const bounds=[[[45,20],[1155,720]],...this.state.ranks.map(row=>this.geo.byId.get(row.id).focusBounds)];return [[Math.min(...bounds.map(b=>b[0][0])),Math.min(...bounds.map(b=>b[0][1]))],[Math.max(...bounds.map(b=>b[1][0])),Math.max(...bounds.map(b=>b[1][1]))]];}const focus=this.focusFeature();return focus?focus.focusBounds:[[45,20],[1155,720]];}
  renderLabels() {
    if(this.state.mode!=='2d'||!this.viewportSize?.[0])return;
    // Read the cached viewport so camera gestures do not trigger synchronous layout.
    const transform=d3.zoomTransform(this.svg.node()),scale=Math.min(this.viewportSize[0]/WIDTH,this.viewportSize[1]/HEIGHT);
    const fontSize=12/scale,occupied=[],labels=[];
    const selected=this.geo.byId.get(this.state.selectedId);
    const focusedState=selected?(selected.id.length===5?this.geo.byId.get(selected.stateId):selected.id.length===2?selected:null):null;
    let members;
    if(focusedState){
      this.cityMembership ||= new WeakMap();members=this.cityMembership.get(focusedState.feature);
      if(!members){members=new Set(this.geo.cities.filter(city=>d3.geoContains(focusedState.feature,[city.lon,city.lat])));this.cityMembership.set(focusedState.feature,members);}
    }
    const rows=this.geo.geographyType==='congressional_district'?(selected?[{name:selected.name,point:selected.point}]:[]):this.geo.cities.filter((city,index)=>(transform.k>2||index<12)&&(selected?.id.length!==5||city.name!==selected.name)&&(!focusedState||members.has(city)));
    if(selected?.id.length===5)rows.unshift({name:selected.name+' · county',point:selected.point});
    // Screen-space collision estimates avoid layout reads and hundreds of county labels per zoom tick.
    for(const row of rows){
      const [x,y]=transform.apply(row.point),width=(row.name.length*6.5+12)/scale,height=22/scale;
      const rect={left:x-width/2,right:x+width/2,top:y-height,bottom:y+4/scale};
      if(rect.left<0||rect.right>WIDTH||rect.top<0||rect.bottom>HEIGHT)continue;
      if(occupied.some(b=>rect.left<b.right&&rect.right>b.left&&rect.top<b.bottom&&rect.bottom>b.top))continue;
      occupied.push(rect);labels.push({...row,x,y});
    }
    this.labelLayer.selectAll('text').data(labels,d=>d.name).join('text').attr('x',d=>d.x).attr('y',d=>d.y-6/scale)
      .attr('text-anchor','middle').attr('font-size',fontSize).attr('fill','#fff4dc').attr('paint-order','stroke').attr('stroke','#20242c').attr('stroke-width',3/scale).text(d=>d.name);
  }
  fit2D() {
    const b=this.bounds();
    const k=this.fitScale();
    this.zoomBehavior.scaleExtent([.15,Math.max(80,k*2)]);
    const t=d3.zoomIdentity.translate(WIDTH/2,HEIGHT/2).scale(k).translate(-(b[0][0]+b[1][0])/2,-(b[0][1]+b[1][1])/2);
    const target=this.reduced()?this.svg:this.svg.transition().duration(650).ease(d3.easeCubicOut);
    target.call(this.zoomBehavior.transform,t);
  }
  reduced(){return matchMedia('(prefers-reduced-motion: reduce)').matches;}
  ensureWebGL() {
    if(this.renderer)return;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(40,1,.0001,150);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    const canvas=this.renderer.domElement;canvas.className='geo-canvas';
    canvas.setAttribute('aria-label','Interactive 3D map. Click a state to focus; scroll to zoom.');this.host.append(canvas);
    this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=false;this.controls.enablePan=true;this.controls.enableZoom=true;
    this.controls.screenSpacePanning=true;this.controls.zoomToCursor=true;
    this.controls.touches.ONE=THREE.TOUCH.PAN;
    this.controls.addEventListener('start',()=>{cancelAnimationFrame(this.zoomFrame);this.zoomDestination=null;});
    this.controls.rotateSpeed=.35;this.controls.addEventListener('change',()=>this.render());
    this.scene.add(new THREE.AmbientLight(0xffffff,2));
    const light=new THREE.DirectionalLight(0xfff1de,2.2);light.position.set(-4,12,5);this.scene.add(light);
    this.group=new THREE.Group();this.scene.add(this.group);
    this.terrain=new THREE.Group();this.group.add(this.terrain);
    const worldGeometry=new THREE.ShapeGeometry(projectedShapes(this.geo.world,this.geo.projection,d3.geoStream));worldGeometry.rotateX(-Math.PI/2);
    this.worldMesh=new THREE.Mesh(worldGeometry,new THREE.MeshBasicMaterial({color:'#d3d7dc'}));this.worldMesh.position.y=-.005;this.group.add(this.worldMesh);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onError('3D was interrupted. Switch to 2D to continue.');});
    canvas.addEventListener('pointerdown',e=>{this.pointerStart=e.button===0?[e.clientX,e.clientY]:null;this.dragging=true;});
    canvas.addEventListener('pointerup',e=>{
      const start=this.pointerStart;this.pointerStart=null;this.dragging=false;
      if(!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>6)return;
      const id=this.hit(e);
      if(!id&&this.session){this.exitFocus();return;}
      if(id&&!this.transition)this.pick(id);
    });
    canvas.addEventListener('pointercancel',()=>{this.pointerStart=null;this.dragging=false;});
    canvas.addEventListener('pointermove',e=>{
      if(this.dragging||this.transition){canvas.style.cursor='grabbing';return;}
      const id=this.hit(e);
      canvas.style.cursor=id?'pointer':'grab';
      if(id!==this.hoveredPlace){this.hoveredPlace=id;if(id)this.hover(id);else this.onHover(null);this.highlight(this.geo.geographyType==='congressional_district'?id:id?.slice(0,2));}

    });
    canvas.addEventListener('pointerleave',()=>{this.hoveredPlace=null;this.onHover(null);this.highlight(null);});
  }
  clearGroup(group) {
    group?.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}});
    group?.clear();
  }
  clear(){this.clearGroup(this.group);}
  buildTerrain(only=null) {
    if(!this.renderer||this.state.mode!=='3d')return;
    const rebuildAll=!only||this.terrainBuilding;
    this.terrainBuildVersion=(this.terrainBuildVersion||0)+1;
    if(rebuildAll){this.clearGroup(this.terrain);this.stateGroups=new Map();}
    this.terrainInterrupted=false;this.terrainBuilding=true;this.setTerrainStatus('building');
    const version=this.terrainBuildVersion;
    const queue=[...(rebuildAll?new Set(this.geo.states.map(state=>state.id)):only)];
    queue.forEach(id=>{const old=this.stateGroups.get(id);if(old){this.terrain.remove(old);this.clearGroup(old);this.stateGroups.delete(id);}});
    let cursor=0;
    const step=deadline=>{
      if(version!==this.terrainBuildVersion||this.state.mode!=='3d')return;
      const start=performance.now();
      try {
        while(cursor<queue.length&&(cursor===0||deadline.timeRemaining?.()>4||performance.now()-start<5))this.buildStateTerrain(queue[cursor++]);
      } catch(error) {
        this.terrainBuilding=false;this.setTerrainStatus('error');
        this.onError(error.message||'The 3D map could not be built. Switch to 2D to continue.');
        return;
      }
      if(cursor<queue.length){this.scheduleTerrainStep(step);return;}
      this.terrainBuilding=false;this.terrainDetailStates=new Set(this.geo.detailStates);this.render();this.setTerrainStatus('ready');this.revealTerrain();
    };
    this.scheduleTerrainStep(step);
  }
  scheduleTerrainStep(step){
    if('requestIdleCallback'in window)requestIdleCallback(step,{timeout:80});
    else setTimeout(()=>step({timeRemaining:()=>0}),0);
  }
  buildStateTerrain(id){
    const rows=footprints(this.geo,d3.geoStream,new Set([id]));
    const state=this.geo.byId.get(id),b=this.state.selectedId?.startsWith(id)?this.geo.byId.get(this.state.selectedId).focusBounds:state.focusBounds;
    const center=new THREE.Vector3((b[0][0]+b[1][0])/200-6,0,(b[0][1]+b[1][1])/200-3.75);
    // One national height scale also keeps both comparison panes comparable.
    const height=RELIEF*this.settings.relief;
    const {mesh,lines,outline,selection}=stateMesh(rows,f=>this.mappedValue(f),{height,color:this.tint,heightValue:f=>this.mappedHeight(f),center,selectedId:this.state.selectedId});
    const group=new THREE.Group();group.position.copy(center);group.userData={id,mesh,lines,outline,height};group.add(mesh,lines,outline);if(selection)group.add(selection);
    this.stateGroups.set(id,group);this.terrain.add(group);
  }
  renderRankMarkers(){
    if(!this.rankMarkers){this.rankMarkers=document.createElement('div');this.rankMarkers.className='rank-markers';this.host.append(this.rankMarkers);}
    const rows=this.state.rankMarkers||this.state.ranks||[],key=JSON.stringify(rows);
    if(this.rankKey!==key){this.rankKey=key;this.rankMarkers.replaceChildren(...rows.map(row=>{const button=document.createElement('button');button.className='rank-marker';button.dataset.rankMarkerPlace=row.id;button.textContent=row.rank+' · '+(row.label||this.geo.byId.get(row.id).name);button.setAttribute('aria-label','Zoom to '+(row.label||this.geo.byId.get(row.id).name));button.onclick=()=>this.onRankSelect(row.id);return button;}));}
    const rankingPanel=this.host.ownerDocument.querySelector('#ranking-panel'),mobile=this.host.ownerDocument.defaultView.innerWidth<=760;
    const panelVisible=rankingPanel&&!rankingPanel.hidden&&!rankingPanel.inert&&rankingPanel.getClientRects().length;
    const sheetTop=mobile&&panelVisible?rankingPanel.getBoundingClientRect().top:Infinity,panelRect=!mobile&&panelVisible?rankingPanel.getBoundingClientRect():null;
    const occupied=[];
    rows.forEach((row,i)=>{
      const f=this.geo.byId.get(row.id),el=this.rankMarkers.children[i],w=this.viewportSize?.[0]||0,h=this.viewportSize?.[1]||0;let x,y,visible=true;
      if(this.state.mode==='3d'&&this.camera){const parent=this.stateGroups?.get(f.stateId);const altitude=(.0015+(this.state.heightValues?.get(row.id)??0)*(parent?.userData.height??RELIEF))*(this.heightScale??1);const p=new THREE.Vector3(f.point[0]/100-6,altitude+.002,f.point[1]/100-3.75).project(this.camera);x=(p.x+1)*w/2;y=(1-p.y)*h/2;visible=p.z>=-1&&p.z<=1;}
      else {const scale=Math.min(w/WIDTH,h/HEIGHT),p=d3.zoomTransform(this.svg.node()).apply(f.point);x=p[0]*scale+(w-WIDTH*scale)/2;y=p[1]*scale+(h-HEIGHT*scale)/2;}
      el.hidden=!visible||x<0||x>w||y<0||y>h;let offset=0;const width=Math.min(w,el.textContent.length*5.8+20),anchorX=x,anchorY=y;
      if(!el.hidden){
        if(Number.isFinite(sheetTop))offset=Math.max(offset,y-sheetTop+8);
        const markerWidth=el.offsetWidth||width,markerHeight=el.offsetHeight||27;let horizontalLeader=false;
        if(panelRect&&x+markerWidth/2>panelRect.left&&x-markerWidth/2<panelRect.right&&y-offset>panelRect.top&&y-offset-markerHeight<panelRect.bottom){
          const right=panelRect.right+markerWidth/2+8,left=panelRect.left-markerWidth/2-8;
          x=right+markerWidth/2<=w-4?right:left;
          horizontalLeader=true;
        }
        while(occupied.some(b=>x-markerWidth/2<b.right&&x+markerWidth/2>b.left&&y-offset-markerHeight<b.bottom&&y-offset>b.top))offset+=30;
        occupied.push({left:x-markerWidth/2,right:x+markerWidth/2,top:y-offset-markerHeight,bottom:y-offset});
        if(horizontalLeader){const dx=anchorX-x,dy=anchorY-(y-offset),length=Math.hypot(dx,dy);el.dataset.leader='horizontal';el.style.setProperty('--leader-length',length+'px');el.style.setProperty('--leader-angle',Math.atan2(dy,dx)+'rad');}
        else delete el.dataset.leader;
      }
      el.style.left=x+'px';el.style.top=(y-offset)+'px';el.style.setProperty('--leader',offset+'px');
    });
  }
  pose(selectedId=this.state.selectedId,mode=this.state.mode) {
    let target,position,distance,extent;
    {
      const focus=this.focusFeature(selectedId),b=this.state.ranks?.length?this.bounds():focus?focus.focusBounds:[[45,20],[1155,720]];
      const dx=(b[1][0]-b[0][0])/100,dz=(b[1][1]-b[0][1])/100;
      const aspect=this.host.clientWidth/Math.max(1,this.host.clientHeight),tilt=this.settings.tilt*Math.PI/180;
      const height=(this.stateGroups?.get(selectedId?.slice(0,2))?.userData.height??RELIEF)*this.reliefScale(selectedId);
      // Paper's Mobile canvas gives the landmass more of the available width.
      // Desktop keeps its established fit; resize still preserves relative zoom.
      const mobile=this.host.ownerDocument?.defaultView.innerWidth<=760&&!this.state.cleanBackdrop;
      distance=Math.max(.035,Math.max(dx/Math.max(.25,aspect),dz)*(mobile?(selectedId?(this.state.layoutKey==='compare'?1.16:this.host.clientHeight>400?1.1:1.2):1.2):1.65)+height*2.5);
      target=new THREE.Vector3((b[0][0]+b[1][0])/200-6,height*.3,(b[0][1]+b[1][1])/200-3.75);
      position=target.clone().add(new THREE.Vector3(0,distance*Math.cos(tilt),distance*Math.sin(tilt)*(this.settings.cameraSide==='north'?-1:1)));extent=Math.max(dx,dz);
    }
    const min=distance/this.settings.maxZoom;
    return {mode,position:position.toArray(),target:target.toArray(),up:[0,1,0],zoom:1,minDistance:min,maxDistance:distance/this.settings.minZoom,cursor:target.toArray(),maxTargetRadius:Math.max(30,extent*5),fitDistance:distance};
  }
  snapshotPose(){return {mode:this.state.mode,position:this.camera.position.toArray(),target:this.controls.target.toArray(),up:this.camera.up.toArray(),zoom:this.camera.zoom,minDistance:this.controls.minDistance,maxDistance:this.controls.maxDistance,cursor:this.controls.cursor.toArray(),maxTargetRadius:this.controls.maxTargetRadius,fitDistance:this.fitDistance};}
  reliefScale(id=this.state.selectedId){
    if(id?.length!==5)return 1;
    const b=this.geo.byId.get(id).focusBounds;
    // At street-sized county equivalents, national relief would hide the footprint.
    // Scale every county equally for this view; colour retains the fixed national index.
    return Math.min(1,Math.max(b[1][0]-b[0][0],b[1][1]-b[0][1])/100*1.5);
  }
  applyPose(pose){
    this.camera.position.fromArray(pose.position);this.camera.up.fromArray(pose.up);this.camera.zoom=pose.zoom;this.camera.updateProjectionMatrix();
    this.controls.target.fromArray(pose.target);this.controls.cursor.fromArray(pose.cursor);
    this.controls.minDistance=pose.minDistance;this.controls.maxDistance=pose.maxDistance;this.controls.maxTargetRadius=pose.maxTargetRadius;
    this.fitDistance=pose.fitDistance;this.camera.lookAt(this.controls.target);this.controls.update();
  }
  configureControls(){
    this.controls.enableRotate=this.settings.rotation&&!this.transition;
    this.controls.enableZoom=!this.transition;this.controls.enablePan=!this.transition;
    this.controls.zoomSpeed=.5+this.settings.sensitivity*3;
    this.controls.mouseButtons.LEFT=this.settings.rotation?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;
    this.controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;
    this.controls.minPolarAngle=.02;this.controls.maxPolarAngle=Math.PI*.48;

  }
  animateTo(pose,dim,{restoring=false,immediate=false}={}) {
    this.cancelMotion();for(const group of this.stateGroups.values())group.rotation.set(0,0,0);
    const from=this.snapshotPose(),fromDim=this.dim,fromHeight=this.heightScale??1,toHeight=this.reliefScale();
    this.transition={pose,dim,restoring};this.phase=restoring?'restoring':this.state.selectedId?'focusing':'overview';this.configureControls();
    const duration=immediate||this.reduced()?0:this.settings.duration,start=performance.now();
    const finish=()=>{
      this.applyPose(pose);this.dim=dim;this.heightScale=toHeight;this.transition=null;
      if(restoring)this.session=null;
      this.phase=this.state.selectedId?'focused':'overview';this.configureControls();this.render();
    };
    this.transition.finish=finish;
    if(!duration){finish();return;}
    const a=new THREE.Vector3().fromArray(from.position),b=new THREE.Vector3().fromArray(pose.position),ta=new THREE.Vector3().fromArray(from.target),tb=new THREE.Vector3().fromArray(pose.target);
    const step=now=>{
      if(this.isDisposed)return;const t=Math.max(0,Math.min(1,(now-start)/duration)),e=t*t*(3-2*t);
      this.camera.position.lerpVectors(a,b,e);this.controls.target.lerpVectors(ta,tb,e);this.camera.lookAt(this.controls.target);
      this.dim=fromDim+(dim-fromDim)*e;this.heightScale=fromHeight+(toHeight-fromHeight)*e;this.render();
      if(t<1)this.frame=requestAnimationFrame(step);else finish();
    };
    this.frame=requestAnimationFrame(step);
  }
  cancelMotion(){cancelAnimationFrame(this.frame);cancelAnimationFrame(this.zoomFrame);this.transition=null;this.zoomDestination=null;}
  settle(){if(this.transition){const finish=this.transition.finish;this.cancelMotion();finish();}else this.cancelMotion();for(const group of this.stateGroups?.values()||[])group.rotation.set(0,0,0);this.svg?.interrupt();this.flat?.renderNow();this.render();}
  exitFocus(){const id=this.state.selectedId;if(id)this.onSelect(this.geo.geographyType==='congressional_district'?null:id.length===5?id.slice(0,2):null);}
  highlight(id){
    if(this.hoveredState===id)return;this.hoveredState=id;
    for(const [key,group] of this.stateGroups||[]){group.userData.outline.material.color.set(key===id?'#ffffff':'#ffe9bc');}
    this.render();
  }
  fit3D(){this.animateTo(this.pose(),this.state.selectedId?1:0);}
  hit(event) {
    if(!this.renderer)return null;
    const r=this.renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.camera);this.scene.updateMatrixWorld(true);
    // Dimmed states remain navigation targets; only a miss on every state means background.
    const parent=this.state.selectedId?.slice(0,2),meshes=[...this.stateGroups.values()].filter(g=>g.visible).map(g=>g.userData.mesh);
    const result=ray.intersectObjects(meshes)[0];
    if(!result)return null;
    const id=String(result.object.geometry.attributes.county.getX(result.face.a)).padStart(5,'0');
    return parent===id.slice(0,2)?id:id.slice(0,2);
  }
  zoom(factor) {
    if(this.state.mode==='2d'){this.svg.transition().duration(this.reduced()?0:200).call(this.zoomBehavior.scaleBy,1/factor);return;}
    if(this.transition)return;
    cancelAnimationFrame(this.zoomFrame);
    const delta=this.camera.position.clone().sub(this.controls.target),start=delta.length();
    const length=THREE.MathUtils.clamp((this.zoomDestination||start)*factor,this.controls.minDistance,this.controls.maxDistance);
    this.zoomDestination=length;const direction=delta.normalize(),begin=performance.now();
    const step=now=>{const t=this.reduced()?1:Math.max(0,Math.min(1,(now-begin)/240)),ease=1-Math.pow(1-t,3);this.camera.position.copy(this.controls.target).addScaledVector(direction,start+(length-start)*ease);this.controls.update();this.render();if(t<1)this.zoomFrame=requestAnimationFrame(step);else this.zoomDestination=null;};
    this.zoomFrame=requestAnimationFrame(step);
  }
  rotate(direction=1){
    if(this.state.mode==='2d'||!this.settings.rotation||this.transition)return;
    const delta=this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),.15*direction);
    this.camera.position.copy(this.controls.target).add(delta);this.controls.update();this.render();
  }
  reset(){if(this.state.mode==='2d')this.fit2D();else this.fit3D();}
  feedbackSnapshot(point){
    this.settle();this.svg.interrupt();
    const r=this.host.getBoundingClientRect(),inside=point.x>=r.left&&point.x<=r.right&&point.y>=r.top&&point.y<=r.bottom;
    let picked=null;
    if(inside&&this.state.mode!=='2d')picked=this.hit({clientX:point.x,clientY:point.y});
    if(inside&&this.state.mode==='2d'&&this.flatActive)picked=this.flat.hit({clientX:point.x,clientY:point.y});
    const transform=d3.zoomTransform(this.svg.node());
    return {side:this.host.id,mode:this.state.mode,renderer:this.host.dataset.renderer,phase:this.phase,selected:this.state.selectedId,metric:this.state.metricKey,picked:picked?{id:picked,name:this.geo.byId.get(picked)?.name}:null,
      bounds:{x:r.x,y:r.y,width:r.width,height:r.height},transform2d:{x:transform.x,y:transform.y,k:transform.k},settings:{...this.settings},reliefScale:this.heightScale??1,camera:this.state.mode==='2d'?null:this.snapshotPose()};
  }
  resizedPose(pose,selectedId=this.state.selectedId){
    const fitDistance=this.pose(selectedId,'3d').fitDistance,ratio=fitDistance/pose.fitDistance;
    const target=new THREE.Vector3().fromArray(pose.target),offset=new THREE.Vector3().fromArray(pose.position).sub(target).multiplyScalar(ratio);
    // Resize changes the fitted distance, preserving the user's relative zoom,
    // pan target and viewing direction instead of resetting their exploration.
    return {...pose,position:target.clone().add(offset).toArray(),fitDistance,minDistance:pose.minDistance*ratio,maxDistance:pose.maxDistance*ratio};
  }
  resize(){
    if(this.isDisposed)return;
    const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h){this.flat?.setVisible(false);return;}
    const changed=this.viewportSize&&(this.viewportSize[0]!==w||this.viewportSize[1]!==h);
    this.viewportSize=[w,h];this.renderLabels();
    if(this.flat){this.flat.setVisible(this.flatActive);this.flat.resize(w,h);this.flat.setTransform(d3.zoomTransform(this.svg.node()));}
    if(this.state.mode==='2d')this.renderRankMarkers();
    if(!this.renderer)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    if(changed&&this.initialized&&this.state.mode==='3d'){
      if(this.layoutEntry){this.layoutEntry=false;this.configureControls();this.render();return;}
      this.settle();this.applyPose(this.resizedPose(this.snapshotPose()));
      if(this.session)this.session={...this.session,overview:this.resizedPose(this.session.overview,null)};
      this.configureControls();
    }
    this.render();
  }
  render(){
    if(!this.renderer||this.isDisposed||this.state.mode==='2d')return;
    const parent=this.state.selectedId?.slice(0,2)||this.session?.parent;
    const isolated=this.state.cleanBackdrop;
    for(const [id,group] of this.stateGroups||[]){
      group.scale.y=this.heightScale??1;
      const shade=parent&&id!==parent?1-this.dim*.88:1;
      group.visible=isolated?(parent?id===parent:!['02','15'].includes(id)):true;
      group.userData.mesh.material.color.setRGB(shade,shade,shade);
      group.userData.lines.material.opacity=.38*shade;
      group.userData.outline.visible=!(id===parent&&this.state.selectedId?.length===5);
      group.userData.outline.material.opacity=(id===parent?1:.8)*shade;
    }
    this.renderer.setClearColor(this.mapBackdrop(),1);
    // Paper uses the same geographic backdrop across Desktop themes.
    // The Mobile overview and embedded journal maps use a clean themed canvas.
    this.worldMesh.visible=!isolated;
    this.worldMesh.material.color.set('#D3D7DC');
    const distance=this.camera.position.distanceTo(this.controls.target);
    this.camera.near=Math.max(.00001,distance*.01);this.camera.far=Math.max(40,distance*8);this.camera.updateProjectionMatrix();
    this.host.dataset.phase=this.phase||'overview';
    this.renderer.render(this.scene,this.camera);this.renderRankMarkers();
  }
  dispose(){this.isDisposed=true;this.cancelMotion();cancelAnimationFrame(this.hoverFrame);this.flat?.dispose();this.clearFlatError();this.svg.interrupt().remove();this.rankMarkers?.remove();this.observer.disconnect();document.removeEventListener('keydown',this.onEscape);this.controls?.dispose();this.clear();this.renderer?.dispose();this.renderer?.domElement.remove();}
}
