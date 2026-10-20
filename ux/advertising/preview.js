import {ExplorerMap,loadGeography} from '../map.js';
import {createDataStore,formatValue,formatPeriod,missingReason} from '../model.js';
import {loadViewSettings} from '../settings.js';
import {isTargeted,renderCreative} from './creative.js';
import {snapshotCapturedAt} from './snapshot-loader.js';
const $=selector=>document.querySelector(selector);
let geo,catalog,store,map,settings,selection=0,focusPlace=false;
let state={device:'desktop',mode:'2d',place:'06',metric:'unemployment',ad:null};
function report(type,payload={}){parent.postMessage({type,...payload},location.origin);}
function renderAd(){
  if(!state.ad)return;
  const show=isTargeted(state.ad,state.device,state.metric);
  $('#desktop-ad-slot').replaceChildren();$('#mobile-ad-slot').replaceChildren();$('#ticker-slot').replaceChildren();
  document.body.classList.toggle('ticker-active',show&&state.ad.format==='ticker');
  const slot=$(state.ad.format==='ticker'?'#ticker-slot':state.device==='mobile'?'#mobile-ad-slot':'#desktop-ad-slot');
  if(show){const host=document.createElement('div');renderCreative(host,state.ad,state.device);slot.append(host);}
  else{const note=document.createElement('p');note.className='slot-empty '+state.device;note.textContent='No ad here. This '+(!state.ad.devices.includes(state.device)?'device':'indicator')+' is outside your selection.';$(state.device==='mobile'?'#mobile-ad-slot':'#desktop-ad-slot').append(note);}
  report('atlas-ad-placement',{show,metric:state.metric,device:state.device});
}
function render(){
  if(!map)return;
  const metric=catalog.find(item=>item.id===state.metric);if(!metric)return;
  const data=store.get(metric),place=geo.byId.get(state.place),row=data.observations.get(state.place||'US');
  $('#metric-name').textContent=metric.name;
  $('#metric-value').textContent=['idle','loading'].includes(data.status)?'Loading…':formatValue(row?.value,data.unit);
  $('#metric-source').textContent=[data.unit,formatPeriod(data.period),data.source].filter(Boolean).join(' · ');
  $('#data-note').textContent=row?'':missingReason(metric,place,data);
  $('#map-place').value=['06','48','36',null].includes(state.place)?state.place||'US':'custom';
  let custom=$('#map-place option[value=custom]');
  if(place&&!['06','48','36'].includes(state.place)){if(!custom){custom=document.createElement('option');custom.value='custom';$('#map-place').append(custom);}custom.textContent=place.name;$('#map-place').value='custom';}
  $('#stats-place').textContent=place?.name||'United States';
  $('#quick-metric-name').textContent=metric.name;
  $('#quick-metric-value').textContent=$('#metric-value').textContent;
  $('#quick-metric-source').textContent=$('#metric-source').textContent;
  $('#legend-title').textContent=[metric.name,data.source,formatPeriod(data.period)].filter(Boolean).join(' · ');
  $('#legend-range').textContent=data.status==='ready'?`${formatValue(data.min,data.unit)} – ${formatValue(data.max,data.unit)} · No data in grey`:'No loaded observations';
  $('#retry-data').hidden=data.status!=='error';
  const employment=catalog.find(item=>item.id==='unemployment--03-06-employment');
  if(employment){
    const jobs=store.get(employment),job=jobs.observations.get(state.place||'US');
    $('#employment-value').textContent=['idle','loading'].includes(jobs.status)?'Loading…':formatValue(job?.value,jobs.unit);
    $('#employment-source').textContent=[jobs.source,formatPeriod(jobs.period),jobs.unit].filter(Boolean).join(' · ');
    store.load(employment);
  }
  map.update({layoutKey:state.device,mode:state.mode,selectedId:focusPlace?state.place:null,metricKey:state.metric,values:data.values,countySupported:metric.countySupported,dark:true,background:'#171a1d',settings,ranks:[]});
  store.load(metric);renderAd();
}
async function choosePlace(id){
  const request=++selection;
  try{await geo.loadDetail(id);}catch(error){$('#data-note').textContent=error.message;return;}
  if(request!==selection)return;focusPlace=Boolean(id);state.place=id;render();report('atlas-ad-place',{place:id||'US',name:geo.byId.get(id)?.name||'United States'});
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='atlas-ad-state')return;
  const next=event.data.state;if(!next||!['desktop','mobile'].includes(next.device)||!['2d','3d'].includes(next.mode))return;
  state={...state,device:next.device,mode:next.mode,metric:next.metric,ad:next.ad};
  document.body.dataset.device=state.device;
  const place=next.place==='US'?null:next.place;
  if(geo&&place!==state.place)choosePlace(place);else {render();renderAd();}
});
$('#map-place').onchange=event=>{if(event.target.value!=='custom')choosePlace(event.target.value==='US'?null:event.target.value);};
$('#map-overview').onclick=()=>{focusPlace=false;render();};
$('#retry-data').onclick=()=>{const metric=catalog.find(m=>m.id===state.metric);if(metric)store.retry(metric);};$('#map-reset').onclick=()=>map?.reset();
try{
  const [geography,response,saved]=await Promise.all([loadGeography(),fetch('/api/atlas/catalog'),loadViewSettings()]);
  const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Map data is unavailable.');
  geo=geography;catalog=payload.metrics;settings={...saved.record.settings};
  await geo.loadDetail(state.place);
  store=createDataStore(geo,id=>{if(id===state.metric||id==='unemployment--03-06-employment')render();});
  map=new ExplorerMap($('#map-host'),geo,{onSelect:choosePlace,onError:message=>{state.mode='2d';report('atlas-ad-mode',{mode:'2d'});report('atlas-ad-map-error',{message});render();}});
  map.svg.attr('aria-hidden','true');map.host.setAttribute('role','img');map.host.setAttribute('aria-label','Interactive geographic map; use Map location to choose a place.');
  $('#snapshot-note').textContent='Census 2017 · Snapshot captured '+new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(snapshotCapturedAt));
  render();$('#map-loading').hidden=true;report('atlas-ad-ready');
}catch(error){$('#map-loading').textContent=error.message+' Reload the page to retry.';report('atlas-ad-map-error',{message:error.message});}
window.addEventListener('pagehide',()=>map?.dispose());
