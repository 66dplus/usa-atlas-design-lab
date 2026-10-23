import {bottomSheet,sheetContent,sheetScroll} from './bottom-sheet.js';
import {initViewport} from './viewport.js';
import {initPages} from './pages.js';
import {showSurface,slidePill,isSurfaceOpen,captureMapLayout,animateMapLayout} from './motion.js';
import {ExplorerMap,loadGeography,rampColor,EMBER,DIVERGING} from './map.js';
import {createDataStore,readAtlasJSON,loadedMapMetrics,collectedMapIndicators,displayLayer,formatValue,formatPeriod,missingReason,comparable} from './model.js?v=postgres-1';

// The legend and the map read the same palette array, so they can never disagree.
const paletteFor=layer=>layer.scale==='diverging'?DIVERGING:EMBER;
import {loadViewSettings,initViewSettings} from './settings.js';
import {brandIcon,indicatorIcon} from './icons.js';
import {createAtlasAnalytics,atlasContext,placeContext} from './analytics.js';
const analytics=createAtlasAnalytics();
const $=s=>document.querySelector(s);
initViewport();
let placeSheet;
const drawerSheets=new WeakMap();
const mobileLayout=()=>matchMedia('(max-width:760px)').matches;
function showOverlay(node,open){
  if(mobileLayout()&&node.classList.contains('mobile-sheet')){node.hidden=!open;node.inert=!open;return Promise.resolve(true);}
  return showSurface(node,open,{axis:'y'});
}
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brandNames={search:'search',back:'back',bookmark:'saved',check:'check',compare:'compare',home:'house',shuffle:'shuffle',close:'close',plus:'plus',minus:'minus',down:'chevron-down',pin:'location',arrow:'forward'};
// shortcut: keep directional camera/rank glyphs until the approved library has exact equivalents.
const directionalPaths={map:'<path d="m2.5 5 5-2.5 5 2.5 5-2.5V15l-5 2.5-5-2.5-5 2.5Z"/><path d="M7.5 2.5V15m5-10v12.5"/>',info:'<circle cx="10" cy="10" r="7.5"/><path d="M10 8.7v5.4"/><circle cx="10" cy="5.9" r=".7"/>',expand:'<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>',uptrend:'<path d="m3 15 5-5 4 2 5-8M12 4h5v5"/>',downtrend:'<path d="m3 5 5 5 4-2 5 8M12 16h5v-5"/>',rotate:'<path d="M4 8a6 6 0 1 1 0 5M4 3v5h5"/>',left:'<path d="M16 8a6 6 0 1 0 0 5M16 3v5h-5"/>',reset:'<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>'};
const utilityNames={map:'map',info:'sources',expand:'fit',reset:'fit',uptrend:'uptrend',downtrend:'downtrend',cube:'cube'};
const icon=name=>brandNames[name]?brandIcon(brandNames[name]):utilityNames[name]?brandIcon(utilityNames[name]):`<svg viewBox="0 0 20 20" aria-hidden="true">${directionalPaths[name]}</svg>`;
document.querySelectorAll('[data-brand-icon]').forEach(node=>{node.outerHTML=brandIcon(node.dataset.brandIcon);});
document.querySelectorAll('[data-ui-icon]').forEach(node=>{node.outerHTML=icon(node.dataset.uiIcon);});
const params=new URLSearchParams(location.search);
const renderer2dFrom=query=>query.get('renderer')==='svg'?'svg':'webgl';
const embedded=params.get('embed')==='1';
document.body.classList.toggle('embedded-map',embedded);
window.addEventListener('message',event=>{if(embedded&&event.origin===location.origin&&event.source===parent&&event.data?.type==='atlas-embed-theme'&&['light','dark'].includes(event.data.theme)){document.body.dataset.theme=event.data.theme;if(dataStore)updateMaps();}});
const concepts=['explorer','stories','compare'];
const initialConcept=params.get('page')==='map'?'explorer':params.get('page')==='compare'?'compare':concepts.includes(params.get('concept'))?params.get('concept'):'explorer';
const state={renderer2d:renderer2dFrom(params),concept:initialConcept,mode:params.get('view')||'2d',selected:params.get('place')||null,second:params.get('other')==='US'?null:params.get('other')||'48',metric:params.get('metric')||'unemployment',secondMetric:params.get('metric2')||'population',comparison:params.get('comparison')==='metrics'?'metrics':'places',category:'All',metricTarget:'a',placeTarget:'a',cardMode:false,rank:['highest','lowest'].includes(params.get('rank'))?params.get('rank'):null};
if(!['2d','3d'].includes(state.mode))state.mode='2d';
document.body.dataset.view=state.mode;
document.querySelectorAll('.dimension-control>[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode)));
slidePill($('.dimension-control'),$(`.dimension-control [data-mode="${state.mode}"]`));
let comparisonDefaultFor=null,secondExplicit=params.has('other'),comparisonPrepared=params.has('other'),mapSplitEntry=false,overlayRequest=0,activeSourceSide=null,conceptLoading=0;
const stories=[
 {title:'The cost of calling it home',description:'Where does your dollar go further?',metric:'cost-of-living-regional-price-parities',place:'06',action:'Compare the cost of living'},
 {title:'Where work is changing',description:'Explore employment, place by place.',metric:'unemployment',place:'48',action:'Explore Texas'},
 {title:'A closer look at city life',description:'San Francisco, from state to city & county.',metric:'unemployment',place:'06075',action:'Explore San Francisco'}
];
let pages,explorationPose,geo,catalog,metricById,library,mapA,mapB,viewSettings,dataStore,toastTimer,returnFocus,returnFocusSelector;
let pinned=['unemployment--03-06-employment','unemployment--03-06-labor-force','unemployment--03-06-unemployment'];
const availableIndicatorId=(id,fallback)=>catalog.find(m=>m.id===id)?.id||metricById?.get(id)?.id||catalog.find(m=>m.id===fallback)?.id||catalog[0].id;
const metric=()=>metricById.get(state.metric);
const metricB=()=>metricById.get(state.comparison==='metrics'?state.secondMetric:state.metric);
const layer=m=>displayLayer(dataStore.get(m));
const heights=m=>layer(m).heightValues||new Map();
function metricSwitchMarkup(m){
  if(!m?.switchOptions)return '';
  return `<div class="metric-switch" role="group" aria-label="${escapeHTML(m.switchLabel||'Measure')}">${m.switchOptions.map(option=>`<button type="button" data-switch-metric="${option.id}" aria-pressed="${option.id===m.id}">${escapeHTML(option.label)}</button>`).join('')}</div>`;
}
const values=m=>layer(m).values;
const needed=()=>[...new Set([state.metric,...(state.concept==='compare'?[metricB()?.id]:[]),...(state.selected?pinned:[])])].map(id=>metricById.get(id)).filter(Boolean);
const place=id=>geo?.byId.get(id);
const selected=()=>place(state.selected);
const selectedB=()=>place(state.comparison==='metrics'?state.selected:state.second);
const observation=(m,id)=>layer(m).observations.get(id||'US');
const value=(m,id)=>observation(m,id)?.value??null;
const number=(m,id)=>formatValue(value(m,id),layer(m).unit);
const compactNumber=(m,id)=>{const v=value(m,id),unit=layer(m).unit;return v!=null&&unit==='people'&&Math.abs(v)>=1000?new Intl.NumberFormat('en-US',{notation:'compact',minimumFractionDigits:Math.abs(v)>=1e6?2:1,maximumFractionDigits:Math.abs(v)>=1e6?2:1}).format(v):number(m,id);};
function persist() {
  const q=new URLSearchParams({concept:state.concept,view:state.mode,metric:state.metric,metric2:state.secondMetric,comparison:state.comparison});
  if(secondExplicit||comparisonPrepared||state.concept==='compare')q.set('other',state.second||'US');
  for(const key of ['page','preview','expanded','embed','theme','article']){const v=new URLSearchParams(location.search).get(key);if(v)q.set(key,v);}
  q.set('renderer',state.renderer2d);
  q.set('page',document.body.dataset.page);
  if(state.selected)q.set('place',state.selected);if(state.rank)q.set('rank',state.rank);
  history.replaceState(null,'',`${location.pathname}?${q}`);
}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;showSurface($('#toast'),true,{distance:8,duration:180});toastTimer=setTimeout(()=>showSurface($('#toast'),false,{distance:8,duration:180}),3500);}
function setPlaceSheet(mode){
  const snap=mode==='dismissed'?'min':mode;
  if(placeSheet){placeSheet.setSnap(snap);return;}
  document.body.classList.toggle('place-expanded',snap==='expanded');
  document.body.classList.toggle('panel-collapsed',snap==='min'&&mobileLayout());
  syncPlaceChrome();
}
function syncPlaceChrome(){
  const reading=document.body.classList.contains('reading'),mobile=matchMedia('(max-width:760px)').matches;
  $('#mobile-panel').setAttribute('aria-expanded',String(document.body.classList.contains('place-expanded')));
  $('#explore-panel .sheet-handle')?.setAttribute('aria-label',document.body.classList.contains('place-expanded')?'Return to compact place sheet':'Expand place sheet');
  $('#sheet-back').hidden=reading||!document.body.classList.contains('place-expanded')||!mobile;
  $('#context-compare').hidden=mobile||document.body.classList.contains('panel-collapsed')||document.body.classList.contains('left-replaced')||state.concept==='compare'||!state.selected||reading||Boolean(comparisonDraft);
  $('#context-compare').innerHTML='Compare '+escapeHTML(selected()?.name||'this place')+' '+icon('map');
  $('.concept-tabs').inert=false;
  syncOverlayOwners();
}
function syncOverlayOwners(){
  const replacing=[...document.querySelectorAll('.drawer:not([hidden])')].some(panel=>!['inspector','compare-results'].includes(panel.id));
  $('#explore-panel').inert=Boolean(conceptLoading)||document.body.classList.contains('left-replaced')||replacing;
  $('#quick-stats').inert=Boolean(conceptLoading)||!$('#inspector').hidden&&$('#inspector').classList.contains('compact-data-card');
  $('#maps').inert=Boolean(conceptLoading);$('#maps').setAttribute('aria-busy',String(Boolean(conceptLoading)));
}
function prepareComparison(first=state.selected){
  const left=place(first)||place('06'),valid=state.second===null||Boolean(place(state.second)&&state.second!==left.id);
  if(secondExplicit&&valid){comparisonPrepared=true;return state.second;}
  if(comparisonDefaultFor===left.id&&valid)return state.second;
  const options=(left.id.length===5?geo.counties.filter(row=>row.stateId===left.stateId):geo.states).filter(row=>row.id!==left.id);
  state.second=!first?'48':left.id.length===5?options.sort((a,b)=>a.name.localeCompare(b.name))[0].id:options[Math.floor(Math.random()*options.length)].id;
  comparisonDefaultFor=left.id;comparisonPrepared=true;secondExplicit=false;return state.second;
}
function rememberExploration(){
  if(explorationPose||state.concept!=='explorer'||!mapA)return;
  explorationPose={selected:state.selected,metric:state.metric,mode:state.mode,rank:state.rank,rankOpen:isSurfaceOpen($('#ranking-panel')),rankScroll:sheetScroll($('#ranking-panel')).scrollTop,profileScroll:sheetScroll($('#explore-panel')).scrollTop,camera:mapA.captureView(),sheet:document.body.classList.contains('place-expanded')?'expanded':document.body.classList.contains('panel-collapsed')?'dismissed':'half'};
}
function closeDrawers(restore=true){
  const request=++overlayRequest;
  if(comparisonDraft){comparisonDraft=null;document.body.classList.remove('comparison-setup');if(explorationPose){setPlaceSheet(explorationPose.sheet);explorationPose=null;}}
  const hadRanks=isSurfaceOpen($('#ranking-panel'));document.body.classList.remove('sheet-expanded');
  const replaced=document.body.classList.contains('left-replaced');document.body.classList.remove('left-replaced');$('#explore-panel').inert=false;if(replaced)sheetScroll($('#explore-panel')).scrollTop=leftScroll;leftScroll=0;
  const closing=[...document.querySelectorAll('.drawer:not([hidden]):not([inert]),#view-settings-panel:not([hidden])')].map(el=>showOverlay(el,false).then(()=>syncOverlayOwners()));
  if(hadRanks&&geo&&dataStore){state.rank=null;persist();updateMaps();}
  document.querySelectorAll('[aria-expanded=true]').forEach(el=>el.setAttribute('aria-expanded','false'));
  syncPlaceChrome();
  if(restore){
    Promise.all(closing).then(()=>{
      if(request!==overlayRequest||document.querySelector('.drawer:not([hidden]):not([inert]),#source-popup:not([hidden]):not([inert])'))return;
      const target=returnFocus?.isConnected?returnFocus:returnFocusSelector?$(returnFocusSelector):null;
      const fallback=state.concept==='compare'?$('#summary-'+(state.inspectorSide==='b'?'b':'a')):$('#explore-panel .place-chooser');
      const chosen=target?.getClientRects().length?target:fallback;
      if(chosen?.getClientRects().length&&!chosen.closest('[inert]'))chosen.focus({preventScroll:true});
    });
  }
}
function openDrawer(id,trigger=document.activeElement,side='a',edge=side==='b'?'right':'left'){
  const panel=$('#'+id),wasOpen=isSurfaceOpen(panel)&&returnFocus===trigger;
  closeDrawers(false);if(wasOpen){trigger?.focus();return;}
  returnFocus=trigger;returnFocusSelector=trigger?.id?'#'+trigger.id:trigger?.dataset.paneMetric?`[data-pane-metric="${side}"]`:trigger?.dataset.panePlace?`[data-pane-place="${side}"]`:null;panel.dataset.edge=edge;setPlaceSheet(document.body.classList.contains('panel-collapsed')?'dismissed':'half');panel.classList.remove('expanded');drawerSheets.get(panel)?.setSnap('half',false);if(!mobileLayout()&&!panel.querySelector('[data-expand-sheet]')){const expand=document.createElement('button');expand.dataset.expandSheet=id;expand.className='expand-sheet';expand.setAttribute('aria-label','Expand '+panel.getAttribute('aria-label'));expand.innerHTML=icon('expand');panel.prepend(expand);}
  if(trigger?.matches('#quick-stats .source-button'))returnFocusSelector='#quick-stats .source-button';
  // The visual side belongs to the clicked pane, even when both panes share a metric/place.
  (id==='compare-results'?$('.map-workspace'):$('#pane-'+side)).append(panel);
  if(id!=='inspector'&&id!=='compare-results'){leftScroll=sheetScroll($('#explore-panel')).scrollTop;document.body.classList.add('left-replaced');$('#explore-panel').inert=true;}
  syncPlaceChrome();
  showOverlay(panel,true);trigger?.setAttribute('aria-expanded','true');
  syncOverlayOwners();
  if(id==='inspector'||id==='compare-results')analytics.action('sources_open',{side});
  [...panel.querySelectorAll('input,button')].find(control=>control.getClientRects().length&&!control.disabled)?.focus();
}
let selectionRequest={a:0,b:0},conceptRequest=0,comparisonDraft=null;
// shortcut: Paper's two recent rows use this tab's selections; persisted history needs an approved retention rule.
let recentStates=[];
function rememberState(id){
  const stateId=place(id)?.id.slice(0,2);
  if(stateId)recentStates=[stateId,...recentStates.filter(previous=>previous!==stateId)].slice(0,2);
}
async function choosePlace(id,side='a') {
  const target=side==='b'&&state.concept==='compare'&&state.comparison==='places'?'b':'a';
  const request=++selectionRequest[target];closeDrawers();
  try{await geo.loadDetail(id);}catch(error){toast(error.message);return;}
  if(request!==selectionRequest[target])return false;
  const previous=side==='b'&&state.concept==='compare'&&state.comparison==='places'?state.second:state.selected;
  if(side==='b'&&state.concept==='compare'&&state.comparison==='places'){state.second=id;secondExplicit=true;comparisonPrepared=true;}
  else state.selected=id;
  rememberState(id);
  setPlaceSheet(id?'half':'dismissed');closeDrawers();render();if(previous!==id){if(id&&matchMedia('(max-width:760px)').matches)animateSelectedMetric();const place=placeContext(id);analytics.action('place_select',{selected_place_id:place.place_id,selected_place_type:place.place_type,selected_state_id:place.state_id});}return true;
}
function animateSelectedMetric(){
  const value=$('#explore-panel .profile-value strong');
  if(!value||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  value.animate([{opacity:0,transform:'translateY(-14px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:320,easing:'cubic-bezier(.16,1,.3,1)'});
}
function showMetricLibrary(side='a',cardMode=false){
  state.metricTarget=state.concept==='compare'&&state.comparison==='metrics'?side:'a';state.cardMode=cardMode;state.category='All';
  $('#metric-search').value='';$('#metric-library-context').textContent=cardMode?'Fields in your data card':state.concept==='compare'?`${side==='a'?'Primary':'Comparison'} map · ${state.comparison==='places'?'Applies to both maps':'Changes this map only'}`:'Colour and height on the map';
  renderCategories();renderMetrics();openDrawer('metric-library',document.activeElement,side);
}
function showPlaceLibrary(side='a',countiesOnly=false){
  state.placeTarget=side;state.countiesOnly=countiesOnly;$('#place-search').value='';
  $('#place-library').classList.remove('expanded');
  $('#place-library-context').textContent=state.concept==='compare'?`${side==='a'?'Primary':'Comparison'} map · ${state.comparison==='metrics'?'Applies to both maps':'Changes this map only'}`:'Search states and counties';
  renderPlaces();openDrawer('place-library',document.activeElement,side);
}
function openComparisonDraft(){
  rememberExploration();
  const first=state.selected||'06';
  const second=prepareComparison(state.selected);
  openDrawer('comparison-setup-panel',document.activeElement);
  comparisonDraft={first,second,choosing:false};renderComparisonDraft();if(mobileLayout())drawerSheets.get($('#comparison-setup-panel'))?.setSnap('expanded');
}
function renderComparisonDraft(){
  if(!comparisonDraft)return;
  const {first,second,choosing}=comparisonDraft,a=place(first),b=place(second),m=metric(),data=layer(m);
  const panel=$('#comparison-setup-panel');if(!mobileLayout())panel.classList.add('expanded');document.body.classList.add('comparison-setup');
  $('#context-compare').hidden=true;
  const query=comparisonDraft.query||'',county=first.length===5;
  const options=(county?geo.counties:geo.states).filter(f=>f.id!==first&&`${f.name} ${f.id} ${place(f.stateId)?.name||''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
  sheetContent(panel).innerHTML=`<button class="comparison-back" data-comparison-cancel> ${icon('back')} Compare</button><h2>Compare ${county?'places':'states'}</h2><p class="comparison-caption">${escapeHTML(m.name)} · ${escapeHTML(formatPeriod(data.period)||'No observation')}</p><div class="comparison-first">${escapeHTML(a.name)} · ${number(m,first)} ${icon('check')}</div>${choosing?`<label class="search-field">${icon('search')}<input id="comparison-place-search" type="search" aria-label="Search second place" placeholder="Search ${county?'counties':'states'}" value="${escapeHTML(query)}"></label><div class="comparison-place-list">${options.slice(0,100).map(f=>`<button data-comparison-place="${f.id}"><span>${escapeHTML(f.name)}<small>${county?escapeHTML(place(f.stateId).name)+' · County':'State · United States'}</small></span><b>${number(m,f.id)}</b></button>`).join('')}</div>`:`<p class="comparison-label">SECOND ${county?'PLACE':'STATE'} · SELECTED</p><div class="comparison-selected">${icon('map')}<span>${escapeHTML(b.name)}<small>${b.id.length===5?'County':'State'} · United States</small></span><b>${number(m,second)}</b></div><button class="comparison-change" data-comparison-change>Choose a different ${county?'place':'state'} ${icon('arrow')}</button><p class="comparison-description">Compare ${escapeHTML(a.name)} at ${number(m,first)} with ${escapeHTML(b.name)} at ${number(m,second)}.</p>`}<p class="comparison-source">${sourceLink(m,a)} · ${escapeHTML(formatPeriod(data.period)||'No observation')} <button data-source="a"> · Source ${icon('info')}</button></p><button class="comparison-confirm" data-comparison-confirm>Compare ${escapeHTML(a.name)} + ${escapeHTML(b.name)} ${icon('arrow')}</button>`;
}
function renderCategories(){
  const categories=['All',...new Set(catalog.map(m=>m.shortCategory))];
  const list=$('#category-list');
  list.innerHTML=categories.map(c=>`<button data-category="${escapeHTML(c)}" aria-pressed="${state.category===c}">${escapeHTML(c)}</button>`).join('');
  list.onfocusin=event=>event.target.closest('[data-category]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  list.querySelector(`[data-category="${CSS.escape(state.category)}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function renderMetrics(){
  const query=$('#metric-search').value.trim().toLowerCase();
  const preferred=[state.cardMode?'':state.metric,...pinned];
  const priority=id=>{const index=preferred.indexOf(id);return index<0?preferred.length:index;};
  const list=catalog.filter(m=>(state.category==='All'||m.shortCategory===state.category)&&`${m.name} ${m.shortCategory} ${m.source}`.toLowerCase().includes(query)).sort((a,b)=>priority(a.id)-priority(b.id)||Number(Boolean(b.fieldId))-Number(Boolean(a.fieldId))||a.name.localeCompare(b.name));
  $('#metric-list').innerHTML=list.length?list.map(m=>`<button class="metric-item" data-metric="${m.id}" aria-pressed="${state.cardMode?pinned.includes(m.id):m.id===(state.metricTarget==='b'?state.secondMetric:state.metric)}">${indicatorIcon(m)}<span class="metric-copy"><strong>${escapeHTML(m.name.replace(' · people',''))}</strong><small>${escapeHTML(layer(m).unit==='%'?'Percent':layer(m).unit||m.shortCategory)} · ${escapeHTML(layer(m).source||m.source)}</small></span><span class="metric-availability">${m.plannedState==='proposed'?'Planned':state.cardMode?'Add to card':!m.fieldId?(m.hasObservations?'Other geography':'Not loaded'):m.countySupported?(m.stateSupported?'State / county data':'County data'):'State data'}</span>${!state.cardMode&&m.id===(state.metricTarget==='b'?state.secondMetric:state.metric)?'<i class="selected-check" aria-hidden="true">✓</i>':''}</button>`).join(''):'<p class="library-note">No indicators match. Try a shorter word or choose another category.</p>';
}
function renderPlaces(){
  const panel=$('#place-library'),mobile=matchMedia('(max-width:760px)').matches;
  const query=$('#place-search').value.trim().toLowerCase(),parent=(state.placeTarget==='b'?selectedB()?.id:state.selected)?.slice(0,2);
  const recent=mobile&&!state.countiesOnly&&!query&&!panel.classList.contains('expanded');
  panel.classList.toggle('recent-states',recent);
  $('#place-library-title').textContent=state.countiesOnly?'Explore the counties':mobile?'Find a state':'Choose a place';
  $('#place-search').placeholder=mobile&&!state.countiesOnly?'Search states':'State or county name…';
  if(recent){
    const arrow='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14m-5-5 5 5-5 5"/></svg>';
    $('#place-list-caption').textContent='Recent states';
    $('#place-list').innerHTML=recentStates.map(id=>place(id)).filter(Boolean).map(f=>`<button class="place-item" data-place="${f.id}">${icon('map')}<span><strong>${escapeHTML(f.name)}</strong><small>${f.id==='11'?'Federal district':'State'} · United States</small></span>${arrow}</button>`).join('')+(recentStates.length?'':'<p class="library-note">No recent states yet.</p>')+`<button class="place-item" data-browse-states>${icon('map')}<span><strong>Browse all states</strong><small>United States · 50 states + DC</small></span>${arrow}</button>`;
    return;
  }
  let list;
  if(state.countiesOnly&&parent)list=geo.counties.filter(f=>f.stateId===parent);
  else list=query?[...geo.states,...geo.counties]:geo.states;
  list=list.filter(f=>`${f.name} ${geo.byId.get(f.stateId)?.name||''} ${f.id}`.toLowerCase().includes(query)).sort((a,b)=>a.id.length-b.id.length||a.name.localeCompare(b.name));
  $('#place-list-caption').textContent=`${list.length.toLocaleString()} matches${!query&&!state.countiesOnly?' · Type a county name to search all counties':''}${list.length>100?' · First 100 shown':''}`;
  $('#place-list').innerHTML=list.slice(0,100).map(f=>`<button class="place-item" data-place="${f.id}"><span><strong>${escapeHTML(f.name)}</strong><small>${f.id.length===2?(f.id==='11'?'Federal district':'State'):escapeHTML(place(f.stateId).name)+' · County equivalent'} · FIPS ${f.id}</small></span><span aria-hidden="true">→</span></button>`).join('')||'<p class="library-note">No places found. Try a state name or county FIPS code.</p>';
}
function renderBreadcrumbs(){
  let content='<button data-breadcrumb="US">United States</button>';
  const f=selected();
  if(f){const parent=place(f.stateId);content+=`<span class="breadcrumb-divider" aria-hidden="true">/</span><button data-breadcrumb="${parent.id}">${escapeHTML(parent.name)}</button>`;if(f.id.length===5)content+=`<span class="breadcrumb-divider" aria-hidden="true">/</span><button data-breadcrumb="${f.id}">${escapeHTML(f.name)}</button>`;}
  $('#breadcrumbs').innerHTML=content;
}
function renderInspector(){
  const right=state.inspectorSide==='b'&&state.concept==='compare',f=right?selectedB():selected(),m=right?metricB():metric(),data=layer(m),row=observation(m,f?.id),v=row?.value,isCounty=f?.id.length===5;
  const loading=['idle','loading'].includes(data.status),rows=pinned.map(id=>metricById.get(id));
  const compact=state.concept==='explorer'&&!matchMedia('(max-width:760px)').matches;
  $('#inspector').classList.toggle('compact-data-card',compact);
  if(compact){
    // The final Desktop Sources master keeps the selected observation in the left panel.
    sheetContent($('#inspector')).innerHTML=`<section class="data-card"><button data-close="inspector" aria-label="Close statistics" class="data-card-close icon-button">${icon('close')}</button><div class="stats-title"><h3>Your data card</h3><button id="edit-card">Choose fields</button></div>${metricSwitchMarkup(m)}${rows.map(item=>`<div class="stat-row"><button data-inspect-metric="${item.id}"><span class="stat-label">${indicatorIcon(item)}<span class="stat-name" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</span></span><small class="data-period">${escapeHTML(formatPeriod(layer(item).period)||(layer(item).status==='error'?'Connection error · select to retry':!item.fieldId?(item.hasObservations?'Other geography':'Not loaded'):'Loading…'))}${layer(item).unit?' · '+escapeHTML(layer(item).unit):''}</small></button><strong>${number(item,f?.id)}</strong></div>`).join('')}<p class="explanation">Each field keeps its own unit and period. A dash means no observation.</p><button class="source-button" data-source="a">Source, coverage & method <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 5 5 5-5 5"/></svg></button></section>`;
    return;
  }
  const stat=v==null?`<h3 class="empty-stat">${loading?'Loading data…':data.status==='error'?'Data unavailable':m.plannedState==='proposed'?'Planned indicator':'No data here'}</h3><p class="no-data-detail">${escapeHTML(missingReason(m,f,data))}</p>${data.status==='error'?`<button class="outline-button" data-retry="${m.id}">Retry data</button>`:''}`:`<div class="value-line"><strong title="${v}">${formatValue(v,data.unit)}</strong><span>${escapeHTML(data.unit==='%'?'':data.unit)}</span></div><span class="demo-tag">${escapeHTML(formatPeriod(data.period))} · ${escapeHTML(data.source)}</span><p class="explanation">Published observation from the loaded source snapshot.</p>`;
  sheetContent($('#inspector')).innerHTML=`<div class="drawer-top"><div><p class="panel-context">${state.concept==='compare'?(right?'Comparison map':'Primary map')+' · ':''}Place statistics</p><h2>${escapeHTML(f?.name||'United States')}</h2></div><button data-close="inspector" aria-label="Close statistics" class="icon-button">×</button></div><p class="place-type">${f?(isCounty?escapeHTML(place(f.stateId).name)+' · County equivalent':'State profile'):'50 states + Washington, DC'}${f?' · '+f.id:''}</p>
    <p class="metric-caption">${escapeHTML(m.name)}</p>${metricSwitchMarkup(m)}${stat}
    <div class="local-position"><span>Observation period</span><strong>${escapeHTML(formatPeriod(data.period)||'—')}</strong></div>
    <div class="inspector-actions"><button class="primary-button" id="inspect-next">${!f?'Choose a state':isCounty?'Browse nearby counties':'Explore counties'} ${icon('arrow')}</button>${state.concept!=='compare'?`<button class="outline-button" id="inspector-compare-place">Compare ${f?'this place':'two places'} ${icon('arrow')}</button>`:''}</div>
    <div class="stats-title"><h3>Your data card</h3><button id="edit-card">Choose fields</button></div>
    ${rows.map(item=>`<div class="stat-row"><button data-inspect-metric="${item.id}">${escapeHTML(item.name)}<small class="data-period">${escapeHTML(formatPeriod(layer(item).period)||(layer(item).status==='error'?'Connection error · select to retry':!item.fieldId?(item.hasObservations?'Other geography':'Not loaded'):'Loading…'))}${layer(item).unit?' · '+escapeHTML(layer(item).unit):''}</small></button><strong>${number(item,f?.id)}</strong></div>`).join('')}
    <p class="explanation">Each field keeps its own unit and period. A dash means no observation.</p>
    <button class="source-button" data-source="${right?'b':'a'}">Source, coverage & method ${icon('info')}</button>
    ${!f?'<div class="note-box"><b>Start with a place.</b><p>Click a state on the map, or use search. Your selection stays with you in 2D and 3D.</p></div>':''}`;
}
function renderMapHeads(){
  const compare=state.concept==='compare';
  for(const side of ['a','b']){
    const f=side==='b'?selectedB():selected(),m=side==='b'?metricB():metric(),name=f?.name||'United States';
    $('#heading-'+side).innerHTML=`<button ${side==='a'?'id="find-place"':''} class="map-field place-field" data-pane-place="${side}" aria-expanded="false"><span class="field-label">${compare?(side==='a'?'Primary map':'Comparison map')+' · ':''}Place</span><span class="field-value">${escapeHTML(name)}${icon('down')}</span></button><button ${side==='a'?'id="metric-button"':''} class="map-field metric-field" data-pane-metric="${side}" aria-expanded="false"><span class="field-label">Indicator${compare&&state.comparison==='places'?' · shared':''}</span><span class="field-value">${escapeHTML(m.name)}${icon('down')}</span></button>`;
    const data=layer(m),caption=['idle','loading'].includes(data.status)?'Loading…':data.status==='error'?'Connection error':value(m,f?.id)==null?'No data here':`${formatPeriod(data.period)||'Latest available'}${data.unit&&data.unit!=='%'?` · ${data.unit}`:''}`;
    $('#summary-'+side).innerHTML=`<span><strong>${number(m,f?.id)}</strong><small>${escapeHTML(caption)}</small></span><span>Statistics ${icon('arrow')}</span>`;
  }
}
const prompts=[
 {title:'Where is unemployment lowest?',metric:'unemployment',place:null,rank:'lowest'},
 {title:'California or Texas?',metric:'unemployment',place:'06',other:'48',compare:true},
 {title:'A closer look at San Francisco',metric:'unemployment',place:'06075'},
 {title:'Where does a dollar go further?',metric:'cost-of-living-regional-price-parities',place:null,rank:'lowest'},
 {title:'How much does electricity cost?',metric:'electricity-price',place:null,rank:'highest'}
];
let shareTimer,saveTimer,leftScroll=0;
function sourceLink(m,f){const data=layer(m),url=observation(m,f?.id)?.sourceUrl||data.observations.values().next().value?.sourceUrl||m.sourceUrl;return url?`<a href="${escapeHTML(url)}" target="_blank" rel="noreferrer">${escapeHTML(data.source||m.source)} ↗</a>`:escapeHTML(data.source||m.source);}
function rankData(){
  const m=metric(),data=layer(m),county=state.selected?.length===5,parent=state.selected?.slice(0,2);
  const group=county?geo.counties.filter(f=>f.stateId===parent):geo.states.filter(f=>f.id!=='11');
  const available=group.map(f=>({id:f.id,name:f.name,value:value(m,f.id)})).filter(f=>f.value!=null);
  const ascending=[...available].sort((a,b)=>a.value-b.value||a.name.localeCompare(b.name));
  const descending=[...available].sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
  const direction=state.rank==='lowest'?ascending:descending;
  const rows=direction.slice(0,5).map(row=>({...row,rank:direction.findIndex(x=>x.value===row.value)+1,tied:available.filter(x=>x.value===row.value).length>1}));
  return {rows,total:group.length,count:available.length,group:county?place(parent).name+' counties':'50 US states · DC excluded',min:ascending[0]?.value??0,max:ascending.at(-1)?.value??0,cutoffTie:direction.length>5&&direction[4].value===direction[5].value,data};
}
function rankingMarkup(){
  const r=rankData(),range=r.max-r.min;
  return `<div class="rank-tabs"><button data-rank="highest" aria-pressed="${state.rank==='highest'}">Highest 5</button><button data-rank="lowest" aria-pressed="${state.rank==='lowest'}">Lowest 5</button></div><p class="rank-context">${escapeHTML(r.group)} · ${r.count}/${r.total} with data</p>${r.rows.length?`<ol class="rank-list">${r.rows.map(row=>`<li><button data-rank-place="${row.id}"><span class="rank-number">${row.rank}${row.tied?'=':''}</span><span class="rank-name">${escapeHTML(row.name)}<span class="rank-bar" style="width:${range?12+88*(row.value-r.min)/range:100}%"></span></span><b>${formatValue(row.value,r.data.unit)}</b></button><button class="rank-compare" data-rank-compare="${row.id}" aria-label="Compare ${escapeHTML(row.name)}" title="Add to comparison">${icon('plus')}</button></li>`).join('')}</ol>`:`<p class="empty-note">${['loading','idle'].includes(r.data.status)?'Loading this indicator…':'No comparable observations in this group.'}</p>`}<p class="rank-foot">${escapeHTML(formatPeriod(r.data.period)||'No loaded period')} · ${escapeHTML(r.data.unit||'—')} · Shared range ${formatValue(r.min,r.data.unit)}–${formatValue(r.max,r.data.unit)}${r.cutoffTie?' · More places share the cutoff value.':''}${r.rows.some(x=>x.tied)?' = tied rank.':''}</p>`;
}
function openRank(direction){
  state.rank=direction;persist();sheetContent($('#ranking-panel')).innerHTML=`<button class="panel-back" data-close="ranking-panel">${icon('back')} Back to ${escapeHTML(selected()?.name||'Explorer')}</button><h2>${escapeHTML(metric().name)}</h2>${rankingMarkup()}<p class="library-note">${sourceLink(metric(),selected())}. One source period. Missing values are excluded; both lists use the same scale.</p><div class="indicator-legend"><div class="legend"><strong class="legend-title">Source observations</strong><div class="color-ramp"></div><div class="legend-labels"><span>Lower</span><span>Higher</span><span class="no-data-key">No data</span></div></div><a class="indicator-legend-source" href="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html" target="_blank" rel="noreferrer">Census 2017 boundaries</a></div>`;
  openDrawer('ranking-panel',document.activeElement);renderLegend(state.concept==='compare',layer(metric()),layer(metricB()));updateMaps();
}
function photoMarkup(f){
  if(!f?.id.startsWith('06'))return '';
  const sf=f.id==='06075';
  return `<figure class="place-photo ${state.photoExpanded?'expanded':''}"><button ${sf?'data-photo="expand"':'data-open-place="06075"'} aria-label="${sf?'Expand San Francisco photo':'Explore San Francisco'}" ${sf?`aria-expanded="${Boolean(state.photoExpanded)}"`:''}><img src="assets/san-francisco-photo.jpg" alt="Golden Gate Bridge with the San Francisco skyline at blue hour"><span class="photo-action">${sf?'San Francisco':'Discover San Francisco'} ${icon(sf?'expand':'arrow')}</span></button><figcaption><a href="https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_and_San_Francisco_skyline_from_Hawk_Hill_at_Blue_Hour_dllu_(cropped).jpg" target="_blank" rel="noreferrer" title="Daniel L. Lu · cropped by King of Hearts · CC BY-SA 4.0">San Francisco, CA · © Daniel L. Lu</a></figcaption></figure>`;
}
function renderExplorer(){
  const panel=$('#explore-panel'),scroll=sheetScroll(panel).scrollTop,f=selected(),m=metric(),data=layer(m),v=value(m,f?.id),isSF=f?.id==='06075';
  const crumbs=`<button data-breadcrumb="US"${!f?' aria-current="location"':''}>United States</button>${f?`<span aria-hidden="true">/</span><button data-breadcrumb="${f.stateId}"${f.id.length===2?' aria-current="location"':''}>${escapeHTML(place(f.stateId).name)}</button>${f.id.length===5?`<span aria-hidden="true">/</span><span aria-current="location">${escapeHTML(f.name)}</span>`:''}`:''}`;
  const nationalGap=!f&&data.status==='ready'&&!observation(m,'US');
  const nationalUnit=data.unit&&data.unit!=='%'?' '+data.unit:'';
  const nationalRange=nationalGap&&data.min!=null&&data.max!=null?`${formatValue(data.min,data.unit)} – ${formatValue(data.max,data.unit)}${nationalUnit}`:'';
  const rangeLevel=m.countySupported?'County':'State';
  const averageLabel=f?.name?`${f.name} · State`:nationalGap?(nationalRange?`${rangeLevel} range · ${formatPeriod(data.period)||'Latest available'}`:`No observations · ${formatPeriod(data.period)||'Latest available'}`):`U.S. average · ${formatPeriod(data.period)||'Latest available'}`;
  const mobileValue=nationalGap?(nationalRange||'No data'):v==null?['idle','loading'].includes(data.status)?'Loading…':m.plannedState==='proposed'?'Planned':'No data':formatValue(v,data.unit);
  sheetContent(panel).innerHTML=`<button class="mobile-indicator-summary" data-pane-metric="a" aria-label="Search indicators · ${escapeHTML(m.name)} · ${escapeHTML(averageLabel)} · ${escapeHTML(mobileValue)}" aria-expanded="false"><span class="mobile-summary-grip" aria-hidden="true"></span><span class="mobile-summary-search">${icon('search')}</span><span class="mobile-summary-divider" aria-hidden="true"></span><span class="mobile-summary-copy"><b>${escapeHTML(m.name)}</b><small>${escapeHTML(averageLabel)}</small></span><strong class="mobile-summary-value${nationalRange?' is-range':''}">${escapeHTML(mobileValue)}</strong></button><div class="mobile-metric-overview profile-content"><button class="indicator-chooser" data-pane-metric="a" aria-expanded="false"><span class="indicator-search-icon" aria-hidden="true">${icon('search')}</span><span class="indicator-search-divider" aria-hidden="true"></span><span class="indicator-chooser-copy"><small class="indicator-label">Indicator</small><small class="mobile-indicator-hint">Search indicators</small><b>${escapeHTML(m.name)}</b></span>${icon('down')}</button><div class="profile-value"><strong class="${nationalRange?'is-range':''}">${nationalGap?escapeHTML(nationalRange||'No data'):v==null?['idle','loading'].includes(data.status)?'Loading…':m.plannedState==='proposed'?'Planned':'No data':formatValue(v,data.unit)}</strong>${v!=null&&data.unit!=='%'?`<span>${escapeHTML(data.unit)}</span>`:''}<button id="save-view" aria-label="Save this exploration" title="Save this exploration">${icon('bookmark')}</button></div></div><div class="profile-heading"><button class="place-sheet-back" data-dismiss-place="true" aria-label="Dismiss place card">${icon('back')}</button><button class="place-chooser" data-pane-place="a" aria-expanded="false">${brandIcon('location')}<strong>${escapeHTML(f?.name||'Find a place')}</strong>${icon('down')}</button><div class="place-path">${crumbs}</div></div>${photoMarkup(f)}<div class="profile-content">${metricSwitchMarkup(m)}<p class="value-source">${sourceLink(m,f)} · ${escapeHTML(formatPeriod(data.period)||(m.plannedState==='proposed'?'No published period':'Not loaded'))}</p>${v==null?`<p class="missing-note">${escapeHTML(nationalGap?(nationalRange?'No national total is published for this series. The map shows individual places; select one to see its own observation. No national average is substituted.':'This release has no state observations for this series. No national value is substituted.'):missingReason(m,f,data))}</p>${data.status==='error'?`<button data-retry="${m.id}" class="outline-button">Retry data</button>`:''}`:''}<div class="ranking-shortcuts"><button data-open-rank="highest">${icon('uptrend')} Highest 5</button><button data-open-rank="lowest">${icon('downtrend')} Lowest 5</button></div><div class="profile-actions"><button class="primary-button" id="compare-place">${icon('compare')} Compare</button><button class="outline-button" id="explore-more">Explore more ${icon('arrow')}</button></div><div class="explore-next"><h3>Explore next</h3>${f?.id==='06'?`<button data-open-place="06075"><span><b>San Francisco</b><small>Go from state to city & county</small></span>${icon('arrow')}</button>`:`<button data-open-prompt="1"><span><b>California & Texas</b><small>One indicator. Two perspectives.</small></span>${icon('arrow')}</button>`}<button data-open-prompt="3"><span><b>Where does a dollar go further?</b><small>Compare the cost of living</small></span>${icon('arrow')}</button></div></div><div class="indicator-legend"><div class="legend"><strong class="legend-title">Source observations</strong><div class="color-ramp"></div><div class="legend-labels"><span>Lower</span><span>Higher</span><span class="no-data-key">No data</span></div></div><button class="indicator-legend-source" data-source="a" aria-label="Open statistical source, coverage and method"></button></div>`;
  const content=sheetContent(panel),summary=content.querySelector('.mobile-indicator-summary');
  const previous=panel.querySelector(':scope > .mobile-indicator-summary');
  if(previous)previous.replaceWith(summary);else panel.append(summary);
  const chooser=panel.querySelector('.indicator-chooser');if(chooser){
    const desktop=document.createElement('div');desktop.className='desktop-indicator';
    desktop.innerHTML=`<button id="desktop-search" class="selected-indicator indicator-heading" data-pane-metric="a" aria-label="Choose indicator: ${escapeHTML(m.name)}" aria-expanded="false">${indicatorIcon(m)}<b>${escapeHTML(m.name)}</b>${icon('down')}</button>`;
    content.prepend(desktop);
  }
  const path=panel.querySelector('.place-path');path.setAttribute('role','navigation');path.setAttribute('aria-label','Selected place');
  const fullStats=document.createElement('div');fullStats.className='expanded-stats';fullStats.innerHTML=pinned.map(id=>{const item=metricById.get(id);return `<button class="quick-row" data-inspect-metric="${id}"><span><span class="quick-label">${indicatorIcon(item)}${escapeHTML(item.name.replace(' · people',''))}</span><small>${escapeHTML(layer(item).unit||'—')} · ${escapeHTML(formatPeriod(layer(item).period)||'No data')}</small></span><b title="${number(item,f?.id)}">${compactNumber(item,f?.id)}</b></button>`;}).join('');panel.querySelector('.value-source')?.after(fullStats);
  sheetScroll(panel).scrollTop=scroll;
  renderQuickStats();
}
function renderQuickStats(){
  const f=selected(),m=metric(),data=layer(m),right=$('#quick-stats');
  // First open: no side fields. The column appears with the first selected place.
  right.hidden=!f;
  if(!f){right.innerHTML='';return;}
  const rows=pinned.map(id=>metricById.get(id));
  right.innerHTML=`<section class="quick-card"><div class="quick-title"><h2>Quick stats</h2><button data-source="a" aria-label="Open source, coverage and method">${icon('info')}</button></div><p class="quick-place">${escapeHTML(f?.name||'United States')}${f?.id.length===5?' · County':''}</p>${metricSwitchMarkup(m)}<div class="quick-main"><span>${indicatorIcon(m)}${escapeHTML(m.name)}</span><b>${m.plannedState==='proposed'?'Planned':number(m,f?.id)}</b><small>${m.plannedState==='proposed'?'No published observation · ':escapeHTML(data.unit||'—')+' · '+escapeHTML(formatPeriod(data.period)||'No data')+' · '}${sourceLink(m,f)}</small></div>${rows.map(item=>`<button class="quick-row" data-inspect-metric="${item.id}"><span><span class="quick-label">${indicatorIcon(item)}${escapeHTML(item.name.replace(' · people',''))}</span><small>${escapeHTML(formatPeriod(layer(item).period)||'No data')} · ${escapeHTML(layer(item).unit||'—')}</small></span><b title="${number(item,f?.id)}">${compactNumber(item,f?.id)}</b></button>`).join('')}</section>`;
}
function savedItems(){
  try{const items=JSON.parse(localStorage.getItem('usa-atlas-explorations')||'[]');if(!Array.isArray(items))throw new Error('Invalid collection');return items.filter(x=>x&&typeof x.url==='string'&&typeof x.title==='string'&&typeof x.id==='string');}
  catch{toast('Saved explorations are unavailable in this browser.');return null;}
}
function saveView(){
  const items=savedItems();if(!items)return;const url=location.search,item={id:String(Date.now()),url,title:(selected()?.name||'United States')+(state.concept==='compare'?' + '+(selectedB()?.name||'United States'):''),metric:metric().name,period:formatPeriod(layer(metric()).period),savedAt:new Date().toISOString()};
  try{localStorage.setItem('usa-atlas-explorations',JSON.stringify([item,...items.filter(x=>x.url!==url)].slice(0,50)));analytics.action('save_success');clearTimeout(saveTimer);const button=$('#save-view');if(button){button.innerHTML=icon('check');button.setAttribute('aria-label','Exploration saved');saveTimer=setTimeout(()=>{if(button.isConnected){button.innerHTML=icon('bookmark');button.setAttribute('aria-label','Save this exploration');}},2500);}else toast('Exploration saved.');}
  catch{toast('Could not save in this browser. Use Share to keep the view link.');}
}
function showSaved(){
  const items=savedItems()||[];sheetContent($('#saved-panel')).innerHTML=`<button class="panel-back" data-close="saved-panel">${icon('back')} Back to ${escapeHTML(selected()?.name||'Explorer')}</button><div class="collection-title"><h2>Saved</h2><span>${items.length}</span></div><button class="outline-button" id="save-current">${icon('plus')} Save current exploration</button>${items.length?`<div class="saved-list">${items.map(item=>`<article><button data-restore="${escapeHTML(item.id)}"><small>${escapeHTML(item.period||'No loaded period')}</small><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.metric||'Exploration')}</p><span>Open exploration ${icon('arrow')}</span></button><button data-remove-saved="${escapeHTML(item.id)}" aria-label="Remove ${escapeHTML(item.title)}" class="remove-saved">${icon('close')}</button></article>`).join('')}</div>`:`<div class="saved-empty">${icon('bookmark')}<h3>A place for your discoveries.</h3><p>Save a place, indicator or comparison and return to the same view.</p></div>`}<p class="saved-note">Stored in this browser. Views reopen with the latest available source snapshot; the saved period is shown above.</p>`;openDrawer('saved-panel',$('#saved-open')||undefined);
}
async function restoreSaved(id){
  const item=(savedItems()||[]).find(x=>x.id===id);if(!item)return;const q=new URLSearchParams(item.url);
  secondExplicit=q.has('other');comparisonPrepared=secondExplicit;comparisonDefaultFor=null;
  if(q.get('concept')==='compare')rememberExploration();else explorationPose=null;
  state.renderer2d=renderer2dFrom(q);state.concept=concepts.includes(q.get('concept'))?q.get('concept'):'explorer';state.mode=q.get('view')==='2d'?'2d':'3d';state.selected=geo.byId.has(q.get('place'))?q.get('place'):null;state.second=geo.byId.has(q.get('other'))?q.get('other'):null;state.metric=availableIndicatorId(q.get('metric'),'unemployment');state.secondMetric=availableIndicatorId(q.get('metric2'),catalog.find(m=>m.id!==state.metric)?.id);state.comparison=q.get('comparison')==='metrics'?'metrics':'places';state.rank=q.get('rank')||null;
  closeDrawers(false);try{if(state.concept==='compare')prepareComparison();await Promise.all([geo.loadDetail(state.selected),state.concept==='compare'?geo.loadDetail(state.second):null]);rememberState(state.selected);render();analytics.action('view_restore');if(state.rank)openRank(state.rank);}catch(error){toast(error.message);}
}
async function openPrompt(index){
  const previousMetric=state.metric,p=prompts[index];if(p.compare)rememberExploration();else explorationPose=null;closeDrawers(false);state.concept=p.compare?'compare':'explorer';state.comparison='places';state.metric=p.metric;state.rank=null;if(p.other){state.second=p.other;secondExplicit=true;comparisonPrepared=true;}
  if(!await choosePlace(p.place))return;if(previousMetric!==state.metric)analytics.action('indicator_select');if(p.compare){await geo.loadDetail(state.second);render();}analytics.action('view_select',{entry:'prompt'});if(p.rank)openRank(p.rank);
}

function renderCompare(){
  const isMetrics=state.comparison==='metrics',a=selected(),b=selectedB();
  document.querySelectorAll('[data-compare]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.compare===state.comparison)));
  slidePill($('#compare-toolbar .segmented'),$('#compare-toolbar button[aria-pressed=true]'));
  const rows=isMetrics?[metric(),metricB()]:[metric(),...pinned.filter(id=>id!==state.metric).slice(0,2).map(id=>metricById.get(id))];
  sheetContent($('#compare-results')).innerHTML=`<div class="drawer-top"><h2>${isMetrics?'Two lenses on '+escapeHTML(a?.name||'United States'):'The same questions, side by side'}</h2><button data-close="compare-results" aria-label="Close comparison data" class="icon-button">×</button></div><p class="library-note">${isMetrics?'Each indicator has its own unit, period and colour/height range.':'Both maps use the same indicator snapshot and colour/height range.'}</p><div class="comparison-data"><table><thead><tr><th>Indicator · period</th><th>${escapeHTML(a?.name||'US')}</th>${!isMetrics?`<th>${escapeHTML(b?.name||'US')}</th><th>Difference</th>`:'<th>Unit</th>'}</tr></thead><tbody>${rows.map(m=>{const data=layer(m),va=value(m,a?.id),vb=value(m,b?.id),canCompare=comparable(data,data,a,b)&&va!=null&&vb!=null;return `<tr><th>${escapeHTML(m.name)}<small class="data-period">${escapeHTML(formatPeriod(data.period)||'No observation')}</small></th><td>${formatValue(va,data.unit)}</td>${!isMetrics?`<td>${formatValue(vb,data.unit)}</td><td>${canCompare?formatValue(va-vb,data.unit==='%'?'':data.unit)+' '+escapeHTML(data.unit==='%'?'percentage points':data.unit):'—'}</td>`:`<td>${escapeHTML(data.unit||'—')}</td>`}</tr>`;}).join('')}</tbody></table></div><p class="comparison-note">Original source values. Differences require the same series, period, release, unit and geographic level. A dash means no comparable observation.</p>`;
}
function updateMaps(){
  const dark=document.body.dataset.theme==='dark';
  const handleError=message=>{toast(message);state.mode='2d';render();};
  const entry={animateEntry:mapSplitEntry};
  if(!mapA)mapA=new ExplorerMap($('#map-a'),geo,{onSelect:id=>choosePlace(id),onError:handleError,onHover:info=>hover('a',info)});
  const updateA=()=>mapA.update({...entry,renderer2d:state.renderer2d,layoutKey:state.concept,mode:state.mode,selectedId:isSurfaceOpen($('#ranking-panel'))&&state.rank?(state.selected?.length===5?state.selected.slice(0,2):null):state.selected,metricKey:state.metric,values:values(metric()),heightValues:heights(metric()),countySupported:metric().countySupported,palette:paletteFor(layer(metric())),dark,cleanBackdrop:embedded,background:embedded?(dark?'#25292D':'#FFFFFF'):(dark?'#171A1D':'#EEF0F3'),settings:viewSettings,ranks:isSurfaceOpen($('#ranking-panel'))&&state.rank&&state.concept!=='compare'?rankData().rows.map(({id,rank})=>({id,rank})):[]});
  if(state.concept==='compare'){
    if(!mapB)mapB=new ExplorerMap($('#map-b'),geo,{onSelect:id=>choosePlace(id,'b'),onError:handleError,onHover:info=>hover('b',info)});
    const updateB=()=>mapB.update({...entry,renderer2d:state.renderer2d,layoutKey:state.concept,mode:state.mode,selectedId:state.comparison==='metrics'?state.selected:state.second,metricKey:metricB().id,values:values(metricB()),heightValues:heights(metricB()),countySupported:metricB().countySupported,palette:paletteFor(layer(metricB())),dark,cleanBackdrop:embedded,background:embedded?(dark?'#25292D':'#FFFFFF'):(dark?'#171A1D':'#EEF0F3'),settings:viewSettings,ranks:[]});
    // Initialize the new pane before starting the existing pane's camera tween.
    if(mapSplitEntry){updateB();updateA();}else{updateA();updateB();}
  }else updateA();
}
function hover(side,info){
  const host=$('#pane-'+side);let tooltip=host.querySelector('.map-hover');
  if(!info){tooltip?.remove();return;}
  if(!tooltip){tooltip=document.createElement('div');tooltip.className='map-hover';host.append(tooltip);}
  const m=side==='b'?metricB():metric(),data=layer(m),v=value(m,info.id);
  tooltip.innerHTML=`<b>${escapeHTML(info.name)}</b>${formatValue(v,data.unit)} ${escapeHTML(v==null?'No data':data.unit==='%'?'':data.unit)} <span>· ${escapeHTML(formatPeriod(data.period)||'No observation')} · Click to explore</span>`;
}

// The legend and the map are written from the same layer, so the ramp, the domain, the
// break labels and the painted counties always describe one scale.
function renderLegend(compare,data,other){
  const provenance=d=>d.status==='ready'?d.source+' · '+formatPeriod(d.period):d.status==='error'?'Database unavailable':'No loaded observations';
  const range=d=>d.status!=='ready'?'No data':d.scale==='diverging'?'85 – 100 – 115':`${formatValue(d.domain[0],d.unit)} – ${formatValue(d.domain[1],d.unit)}${d.unit==='%'?'':' '+d.unit}`;
  const scaleNote=d=>d.status!=='ready'?'No data':d.scale==='diverging'?'Diverging scale · 85 – 100 – 115':`${d.scale==='log'?'Logarithmic':'Linear'} scale · ${formatValue(d.domain[0],d.unit)} – ${formatValue(d.domain[1],d.unit)}`;
  const independent=compare&&state.comparison==='metrics';
  const paint=(legend,d,side,title)=>{
    if(!legend)return;
    legend.querySelector('.legend-title').textContent=title;
    legend.querySelector('.legend-labels').innerHTML=`<span>${escapeHTML(range(d))}</span><span class="no-data-key">No data</span>`;
    legend.querySelector('.legend-breaks')?.remove();
    const ramp=legend.querySelector('.color-ramp'),sample=rampColor(paletteFor(d));
    ramp.style.background=`linear-gradient(90deg,${Array.from({length:25},(_,index)=>`${sample(index/24)} ${(index*100/24).toFixed(2)}%`).join(',')})`;
    ramp.title=d.scale==='log'?'Logarithmic colour scale':d.scale==='diverging'?'Diverging colour scale':'Linear colour scale';
    const source=legend.closest('.pane-footer')?.querySelector('.indicator-legend-source');
    if(source){source.textContent=provenance(d)==='No loaded observations'?'Source, coverage & method':`${provenance(d)} · Source & method`;source.dataset.source=side;}
  };
  for(const legend of document.querySelectorAll('.legend:not(.pane-footer .legend)')){
    const ramp=legend.querySelector('.color-ramp');if(!ramp)continue;
    const sample=rampColor(paletteFor(data));ramp.style.background=`linear-gradient(90deg,${Array.from({length:25},(_,index)=>`${sample(index/24)} ${(index*100/24).toFixed(2)}%`).join(',')})`;
    ramp.title=data.scale==='log'?'Logarithmic colour scale':data.scale==='diverging'?'Diverging colour scale':'Linear colour scale';
    legend.querySelector('.legend-title').textContent=compare&&state.comparison==='metrics'?'Independent scales · primary / comparison':`${state.mode==='3d'?'Colour + height':'Colour'} · ${data.unit||'No data'}${metric().fieldId&&!metric().countySupported?' · state values':''}`;
    legend.querySelector('.legend-labels').innerHTML=`<span>${escapeHTML(independent?'Primary: '+scaleNote(data):range(data))}</span>${independent?`<span>${escapeHTML('Comparison: '+scaleNote(other))}</span>`:''}<span class="no-data-key">No data</span>`;
  }
  paint($('#footer-a .legend'),data,'a',independent?`Primary · ${metric().name}`:`${state.mode==='3d'?'Colour + height':'Colour'} · ${data.unit||'No data'}${compare?' · shared':''}`);
  paint($('#footer-b .legend'),other,'b',independent?`Comparison · ${metricB().name}`:`${state.mode==='3d'?'Colour + height':'Colour'} · ${other.unit||data.unit||'No data'}${compare?' · shared':''}`);
  $('#footer-b').hidden=!independent;
  $('#footer-a .indicator-legend-source').hidden=compare&&state.comparison==='places'&&data.status!=='ready';
  for(const source of document.querySelectorAll('.indicator-legend-source:not(.pane-footer .indicator-legend-source)')){
    const side=source.dataset.source||'a',layerData=side==='b'?other:data;
    source.textContent=provenance(layerData)==='No loaded observations'?'Source, coverage & method':`${provenance(layerData)} · Source & method`;
  }
}
function render(){
  if(conceptLoading)return;
  for(const m of needed())dataStore.load(m);
  const focused=document.activeElement,focusSelector=focused?.id?'#'+focused.id:focused?.dataset.paneMetric?`[data-pane-metric="${focused.dataset.paneMetric}"]`:focused?.dataset.panePlace?`[data-pane-place="${focused.dataset.panePlace}"]`:null;
  document.querySelectorAll('.map-hover').forEach(el=>el.remove());
  const compare=state.concept==='compare',story=state.concept==='stories';
  if(!state.selected&&matchMedia('(max-width:760px)').matches)setPlaceSheet('dismissed');
  document.body.dataset.concept=state.concept;
  document.body.dataset.comparison=state.comparison;
  pages?.syncConcept(state.concept);
  if(!document.body.classList.contains('reading')){document.querySelectorAll('.concept-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.page===(state.concept==='compare'?'compare':'map'))));slidePill($('.concept-tabs'),$('.concept-tabs button[aria-pressed=true]'));}
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  if(!$('#compare-toolbar .segment-pill'))$('#compare-toolbar .segmented').insertAdjacentHTML('afterbegin','<span class="segment-pill" aria-hidden="true"></span>');
  document.body.dataset.view=state.mode;const mobileView=$('#mobile-view-toggle');const mobileTarget=state.mode==='2d'?'3d':'2d';mobileView.innerHTML=$(`.dimension-control [data-mode="${mobileTarget}"]`).innerHTML;mobileView.setAttribute('aria-label',`Switch to ${mobileTarget.toUpperCase()}`);slidePill($('.dimension-control'),$(`.dimension-control [data-mode="${state.mode}"]`));
  syncPlaceChrome();
  const sharedPlace=state.comparison==='metrics';
  const sharedControl=$('#mobile-compare-metric');
  sharedControl.innerHTML=`<span>${escapeHTML(sharedPlace?(selected()?.name||'United States'):metric().name.replace(/ rate$/,''))}</span>${icon('down')}`;
  sharedControl.dataset.panePlace=sharedPlace?'a':'';
  sharedControl.dataset.paneMetric=sharedPlace?'':'a';
  sharedControl.setAttribute('aria-label',sharedPlace?'Choose the comparison place':'Choose the comparison indicator');
  const comparisonSource=$('#mobile-comparison-source');comparisonSource.innerHTML=`${sourceLink(metric(),selected())} · ${escapeHTML(formatPeriod(layer(metric()).period)||'No observation')} <button data-source="a" aria-label="Open comparison indicator source"> · Source ${icon('info')}</button>`;
  const data=layer(metric()),other=layer(metricB());
  $('#pane-b').hidden=!compare;$('#compare-toolbar').hidden=!compare;$('#stories-open').hidden=!story;$('#compare-data-open').hidden=!compare;
  $('#breadcrumbs').hidden=compare;$('#region-jumps').hidden=compare;
  $('#map-intro').hidden=Boolean(state.selected)||compare||story;
  $('#map-hint').textContent=state.mode==='2d'?'Click a place · Drag to pan':!state.selected?'Drag to pan · Scroll to zoom':!metric().countySupported?'State layer · county values unavailable':'Click another state · Click the background to return';
  const settingsTrigger=$('#view-settings-open');
  if(settingsTrigger)settingsTrigger.hidden=state.mode==='2d';
  if(state.mode==='2d'&&$('#view-settings-panel')&&isSurfaceOpen($('#view-settings-panel'))){showSurface($('#view-settings-panel'),false);settingsTrigger?.setAttribute('aria-expanded','false');}
  $('.dimension-control').dataset.ready='true';
  $('#story-list').innerHTML=stories.map((s,i)=>`<button class="story-item" data-story="${i}" aria-pressed="${s.metric===state.metric&&s.place===state.selected?.slice(0,2)}"><strong>${s.title}</strong><small>${s.description}</small><span class="story-action">${s.action} →</span></button>`).join('');
  renderMapHeads();renderBreadcrumbs();renderInspector();renderExplorer();if(compare)renderCompare();if(isSurfaceOpen($('#ranking-panel'))){const scroll=sheetScroll($('#ranking-panel')).scrollTop;sheetContent($('#ranking-panel')).innerHTML=`<button class="panel-back" data-close="ranking-panel">${icon('back')} Back to ${escapeHTML(selected()?.name||'Explorer')}</button><h2>${escapeHTML(metric().name)}</h2>${rankingMarkup()}<p class="library-note">${sourceLink(metric(),selected())}. Missing values excluded. Same scale for both lists.</p><div class="indicator-legend"><div class="legend"><strong class="legend-title">Source observations</strong><div class="color-ramp"></div><div class="legend-labels"><span>Lower</span><span>Higher</span><span class="no-data-key">No data</span></div></div><a class="indicator-legend-source" href="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html" target="_blank" rel="noreferrer">Census 2017 boundaries</a></div>`;sheetScroll($('#ranking-panel')).scrollTop=scroll;}persist();updateMaps();
  renderLegend(compare,data,other);
  if($('.drawer:not([hidden]):not([inert])')&&returnFocusSelector)$(returnFocusSelector)?.setAttribute('aria-expanded','true');
  if(focusSelector&&!focused.isConnected)$(focusSelector)?.focus();
  pages?.refreshSources();
  if(activeSourceSide&&isSurfaceOpen($('#source-popup'))&&$('#source-popup').dataset.variant==='indicator')showStatSource(activeSourceSide);
  analytics.observe(atlasContext(state),![data, ...(compare?[other]:[])].some(d=>['idle','loading'].includes(d.status)));
}
async function changeConcept(concept,{refresh=false}={}){
  if(!catalog||!geo)return;
  if(state.concept===concept&&!refresh){if(concept==='stories')openDrawer('story-rail',$('[data-concept=stories]'));return;}
  const request=++conceptRequest;
  conceptLoading=request;
  selectionRequest.a++;selectionRequest.b++;
  const changedLayout=(concept==='compare')!==(state.concept==='compare');
  const layout=changedLayout?captureMapLayout($('#maps'),[mapA,mapB]):null;
  if(concept==='compare')rememberExploration();
  const returning=state.concept==='compare'&&concept==='explorer'&&explorationPose;
  if(returning){state.selected=returning.selected;state.metric=returning.metric;state.mode=returning.mode;state.rank=returning.rank;}
  closeDrawers(false);state.concept=concept;
  if(returning)setPlaceSheet(returning.sheet);
  if(concept==='compare'){setPlaceSheet('half');prepareComparison(state.selected);if(!state.selected)state.selected='06';}
  else if(concept==='stories')state.mode='3d';
  try{await Promise.all([geo.loadDetail(state.selected),state.concept==='compare'?geo.loadDetail(state.second):null]);}catch(error){toast(error.message);}
  if(request!==conceptRequest)return;
  conceptLoading=0;
  mapSplitEntry=changedLayout&&concept==='compare';try{render();}finally{mapSplitEntry=false;}
  if(returning){sheetScroll($('#explore-panel')).scrollTop=returning.profileScroll||0;if(returning.rankOpen&&returning.rank){openRank(returning.rank);sheetScroll($('#ranking-panel')).scrollTop=returning.rankScroll||0;}mapA.restoreView(returning.camera);explorationPose=null;mapB?.cancelMotion();}
  animateMapLayout($('#maps'),layout,{entering:concept==='compare',pane:$('#pane-b')});
  analytics.action('view_select');if(concept==='stories')openDrawer('story-rail',$('#stories-open'));
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!catalog)return;
  if(button.hasAttribute('data-comparison-cancel')){comparisonDraft=null;document.body.classList.remove('comparison-setup');closeDrawers();if(explorationPose){setPlaceSheet(explorationPose.sheet);explorationPose=null;}return;}
  if(button.hasAttribute('data-comparison-change')){comparisonDraft.choosing=true;renderComparisonDraft();$('#comparison-place-search')?.focus();return;}
   if(button.dataset.comparisonPlace){comparisonDraft.second=button.dataset.comparisonPlace;comparisonDraft.explicit=true;comparisonDraft.choosing=false;renderComparisonDraft();return;}
   if(button.hasAttribute('data-comparison-confirm')){state.second=comparisonDraft.second;secondExplicit=secondExplicit||Boolean(comparisonDraft.explicit);comparisonPrepared=true;comparisonDefaultFor=comparisonDraft.first;state.comparison='places';comparisonDraft=null;document.body.classList.remove('comparison-setup');closeDrawers(false);pages.navigate('compare');return;}
  if(button.dataset.openRank){openRank(button.dataset.openRank);return;}
  if(button.dataset.rank){state.rank=button.dataset.rank;persist();const scroll=sheetScroll($('#ranking-panel')).scrollTop;$('#ranking-panel').querySelector('.rank-tabs').parentElement.innerHTML=`<button class="panel-back" data-close="ranking-panel">${icon('back')} Back to map</button><h2>${escapeHTML(metric().name)}</h2>${rankingMarkup()}<p class="library-note">${sourceLink(metric(),selected())}. Missing values excluded. Same scale for both lists.</p><div class="indicator-legend"><div class="legend"><strong class="legend-title">Source observations</strong><div class="color-ramp"></div><div class="legend-labels"><span>Lower</span><span>Higher</span><span class="no-data-key">No data</span></div></div><a class="indicator-legend-source" href="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html" target="_blank" rel="noreferrer">Census 2017 boundaries</a></div>`;sheetScroll($('#ranking-panel')).scrollTop=scroll;renderLegend(state.concept==='compare',layer(metric()),layer(metricB()));updateMaps();return;}
  if(button.dataset.rankPlace){state.rank=null;choosePlace(button.dataset.rankPlace);return;}
   if(button.dataset.rankCompare){rememberExploration();const id=button.dataset.rankCompare;state.second=id;secondExplicit=true;comparisonPrepared=true;state.comparison='places';state.rank=null;if(!state.selected||state.selected===id)state.selected=rankData().rows.find(x=>x.id!==id)?.id||(id==='06'?'48':'06');changeConcept('compare',{refresh:true});return;}
  if(button.dataset.openPlace){state.rank=null;choosePlace(button.dataset.openPlace);return;}
  if(button.dataset.photo){state.photoExpanded=!state.photoExpanded;renderExplorer();return;}
  if(button.dataset.openPrompt!==undefined){openPrompt(+button.dataset.openPrompt);return;}
  if(button.dataset.restore){restoreSaved(button.dataset.restore);return;}
  if(button.dataset.removeSaved){try{localStorage.setItem('usa-atlas-explorations',JSON.stringify(savedItems().filter(x=>x.id!==button.dataset.removeSaved)));closeDrawers(false);showSaved();}catch{toast('Could not update Saved in this browser.');}return;}
  if(button.dataset.page)return;
  if(button.dataset.concept){changeConcept(button.dataset.concept);return;}
  if(button.id==='mobile-view-toggle'){state.mode=state.mode==='3d'?'2d':'3d';render();return;}
  if(button.dataset.dismissPlace){setPlaceSheet('dismissed');return;}
  if(button.dataset.mode){state.mode=button.dataset.mode;render();return;}
  if(button.hasAttribute('data-browse-states')){const panel=$('#place-library');if(mobileLayout())drawerSheets.get(panel)?.setSnap('expanded');else{panel.classList.add('expanded');document.body.classList.add('sheet-expanded');}renderPlaces();sheetScroll(panel).scrollTop=0;$('#place-search').focus({preventScroll:true});return;}
  if(button.dataset.expandSheet){const panel=$('#'+button.dataset.expandSheet);if(mobileLayout()){const sheet=drawerSheets.get(panel);sheet?.setSnap(sheet.snap==='expanded'?'half':'expanded');}else{panel.classList.toggle('expanded');document.body.classList.toggle('sheet-expanded',panel.classList.contains('expanded'));}if(button.dataset.expandSheet==='metric-library')$('#metric-library-context').textContent='Current place · '+(selected()?.name||'United States');if(button.dataset.expandSheet==='place-library')renderPlaces();return;}
  if(button.dataset.close){document.body.classList.remove('sheet-expanded');closeDrawers();return;}
  if(button.dataset.camera){const map=button.dataset.side==='b'?mapB:mapA;const action=button.dataset.camera;if(action==='in')map.zoom(.8);else if(action==='out')map.zoom(1.25);else if(action==='reset')map.reset();else map.rotate(action==='left'?-1:1);return;}
  if(button.dataset.breadcrumb){choosePlace(button.dataset.breadcrumb==='US'?null:button.dataset.breadcrumb);return;}
  if(button.dataset.jump){choosePlace(button.dataset.jump);return;}
  if(button.dataset.category){state.category=button.dataset.category;for(const chip of $('#category-list').querySelectorAll('[data-category]'))chip.setAttribute('aria-pressed',String(chip.dataset.category===state.category));button.scrollIntoView({block:'nearest',inline:'nearest'});renderMetrics();return;}
  if(button.dataset.switchMetric){
    const id=button.dataset.switchMetric,previous=state.metricTarget==='b'?state.secondMetric:state.metric;
    if(state.metricTarget==='b')state.secondMetric=id;else state.metric=id;state.rank=null;render();
    if(previous!==id)analytics.action('indicator_select',{selected_indicator_id:id});return;
  }
  if(button.dataset.metric){
    const id=button.dataset.metric;
    if(state.cardMode){dataStore.load(metricById.get(id));if(pinned.includes(id)){if(pinned.length>1)pinned=pinned.filter(p=>p!==id);else toast('Keep at least one field in the card.');}else if(pinned.length<5)pinned.push(id);else toast('Your card can show up to 5 fields. Remove one first.');renderMetrics();renderInspector();renderExplorer();return;}
    const previous=state.metricTarget==='b'?state.secondMetric:state.metric;
    if(state.metricTarget==='b')state.secondMetric=id;else state.metric=id;state.rank=null;closeDrawers();render();if(previous!==id)analytics.action('indicator_select',{selected_indicator_id:id});return;
  }
  if(button.dataset.retry){dataStore.retry(metricById.get(button.dataset.retry));render();return;}
  if(button.dataset.place){choosePlace(button.dataset.place,state.placeTarget);return;}
  if(button.dataset.inspectMetric){const previous=state.inspectorSide==='b'&&state.concept==='compare'&&state.comparison==='metrics'?state.secondMetric:state.metric;if(state.inspectorSide==='b'&&state.concept==='compare'&&state.comparison==='metrics')state.secondMetric=button.dataset.inspectMetric;else state.metric=button.dataset.inspectMetric;render();if(previous!==button.dataset.inspectMetric)analytics.action('indicator_select',{selected_indicator_id:button.dataset.inspectMetric});return;}
  if(button.dataset.story){const previous=state.metric,s=stories[+button.dataset.story];state.metric=s.metric;state.rank=null;state.concept='explorer';choosePlace(s.place).then(ok=>{if(ok){if(previous!==s.metric)analytics.action('indicator_select');analytics.action('view_select',{entry:'story'});}});return;}
  if(button.dataset.compare){const previous=state.comparison;closeDrawers(false);selectionRequest.a++;selectionRequest.b++;state.comparison=button.dataset.compare;if(!state.selected)state.selected='06';if(state.comparison==='metrics'&&state.secondMetric===state.metric)state.secondMetric=state.metric==='unemployment'?'obesity-rate':'unemployment';render();if(previous!==state.comparison)analytics.action('comparison_mode_select');return;}
  if(button.dataset.panePlace){showPlaceLibrary(button.dataset.panePlace);return;}
  if(button.dataset.paneMetric){showMetricLibrary(button.dataset.paneMetric);return;}
  if(button.dataset.source){showStatSource(button.dataset.source);return;}
  if(button.dataset.statistics){state.inspectorSide=button.dataset.statistics;renderInspector();openDrawer('inspector',button,state.inspectorSide,state.concept==='compare'&&state.inspectorSide==='a'?'left':'right');return;}
  switch(button.id){
    case 'desktop-search':showMetricLibrary('a');break;
    case 'metric-button':case 'all-layers':showMetricLibrary();break;
    case 'find-place':showPlaceLibrary();break;
    case 'inspect-next':showPlaceLibrary(state.inspectorSide||'a',Boolean(state.inspectorSide==='b'?selectedB():selected()));break;
    case 'context-compare':case 'compare-place':case 'inspector-compare-place':if(matchMedia('(max-width:760px)').matches){openComparisonDraft();break;}rememberExploration();if(!state.selected)state.selected='06';state.comparison='places';pages.navigate('compare');break;
    case 'edit-card':showMetricLibrary(state.inspectorSide||'a',true);break;
    case 'stories-open':openDrawer('story-rail',button);break;
    case 'compare-data-open':openDrawer('compare-results',button);break;
    case 'saved-open':showSaved();break;
    case 'save-view':saveView();break;
    case 'save-current':saveView();closeDrawers(false);showSaved();break;
    case 'explore-more':showPlaceLibrary('a',Boolean(state.selected));break;
    case 'mobile-panel':closeDrawers(false);setPlaceSheet(document.body.classList.contains('place-expanded')?'half':'expanded');break;
  }
});
document.addEventListener('input',event=>{if(event.target.id==='comparison-place-search'&&comparisonDraft){const cursor=event.target.selectionStart;comparisonDraft.query=event.target.value;renderComparisonDraft();const input=$('#comparison-place-search');input.focus();input.setSelectionRange(cursor,cursor);}});
$('#metric-search').addEventListener('input',renderMetrics);$('#place-search').addEventListener('input',renderPlaces);
matchMedia('(max-width:760px)').addEventListener('change',()=>{setPlaceSheet(document.body.classList.contains('place-expanded')?'expanded':state.selected?'half':'dismissed');if(geo&&isSurfaceOpen($('#place-library')))renderPlaces();if(geo&&isSurfaceOpen($('#inspector')))renderInspector();});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&$('.drawer:not([hidden]):not([inert])')){event.stopImmediatePropagation();closeDrawers();}
  else if(event.key==='Escape'&&!document.body.classList.contains('reading')&&!isSurfaceOpen($('#source-popup'))&&matchMedia('(max-width:760px)').matches&&!document.body.classList.contains('panel-collapsed')){event.stopImmediatePropagation();setPlaceSheet(document.body.classList.contains('place-expanded')?'half':'dismissed');}
});
async function copyLink(){const button=$('#share');if(!button)return;clearTimeout(shareTimer);try{await navigator.clipboard.writeText(location.href);analytics.action('share_success');button.querySelector('span').textContent='Link copied';button.setAttribute('aria-label','Link copied');shareTimer=setTimeout(()=>{button.querySelector('span').textContent='Share';button.setAttribute('aria-label','Share');},5000);}catch{button.querySelector('span').textContent='Copy failed';button.setAttribute('aria-label','Copy failed. Copy the browser address.');shareTimer=setTimeout(()=>{button.querySelector('span').textContent='Share';button.setAttribute('aria-label','Share');},5000);}}
placeSheet=bottomSheet($('#explore-panel'),{initial:state.selected?'half':'min',onSnap:snap=>{
  document.body.classList.toggle('place-expanded',snap==='expanded');
  document.body.classList.toggle('panel-collapsed',snap==='min'&&mobileLayout());
  syncPlaceChrome();
}});
for(const panel of document.querySelectorAll('.drawer'))drawerSheets.set(panel,bottomSheet(panel,{onSnap:snap=>{
  panel.classList.toggle('expanded',snap==='expanded');
  if(geo&&panel.id==='place-library')renderPlaces();
}}));
pages=initPages({changeConcept,renderMaps:()=>{if(dataStore)render();},getCatalog:()=>catalog||[],getLibrary:()=>library||[],getGeography:()=>geo,openSearch:()=>{if(catalog)openDrawer('search-sheet',$('#mobile-search'));},closePlaceSheet:()=>setPlaceSheet('half'),closeOverlays:()=>closeDrawers(false),syncChrome:syncPlaceChrome,getConcept:()=>state.concept});
// The local review panel is a development tool: it is enabled only on request.
const reviewOn=['1','true','yes','on'].includes(String(params.get('review')??'').toLowerCase());
if(reviewOn){document.body.dataset.review='1';import('./feedback.js').then(({initFeedback})=>initFeedback({onStart:()=>[mapA,mapB].filter(Boolean).forEach(map=>map.settle()),getContext:point=>({settings:{...viewSettings},view:{page:document.body.dataset.page,theme:document.body.dataset.theme,concept:state.concept,mode:state.mode,selected:state.selected,second:state.second,metric:state.metric,secondMetric:state.secondMetric,comparison:state.comparison,pinned:[...pinned]},maps:[mapA,mapB].filter(Boolean).map(map=>map.feedbackSnapshot(point))})}));}
try {
  const snapshotRequest=fetch('./startup/unemployment-BLS-LAUS-2024-2024-M12.json').then(response=>response.ok?response.json():null).catch(()=>null);
  const [geography,payload,settingsData,startupSnapshot]=await Promise.all([loadGeography(),readAtlasJSON('/api/atlas/catalog'),loadViewSettings(),snapshotRequest]);
  viewSettings={...settingsData.record.settings};
  initViewSettings({...settingsData,onOpen:()=>closeDrawers(false),onChange:next=>{viewSettings=next;if(dataStore)render();}});
  if(document.body.dataset.page==='compare')state.concept='compare';
  geo=geography;catalog=collectedMapIndicators(payload.metrics);library=payload.library||[];
  if(!catalog.length)throw new Error('No map indicators have been loaded yet. Please retry later.');
  metricById=new Map(loadedMapMetrics(payload.metrics).map(m=>[m.id,m]));pinned=pinned.filter(id=>metricById.has(id));
  dataStore=createDataStore(geo,id=>{if(needed().some(m=>m.id===id))render();});
  const startupMetric=metricById.get('unemployment');
  const seeded=startupSnapshot?.snapshotVersion==='BLS-LAUS-2024/2024-M12'&&startupSnapshot.metricId==='unemployment'&&startupSnapshot.fieldId==='03.06:unemployment_rate'&&startupSnapshot.data?.sourceRelease==='BLS-LAUS-2024'&&startupSnapshot.data?.period==='2024-M12'&&state.metric==='unemployment'&&dataStore.seed(startupMetric,startupSnapshot.data);
  $('#catalog-status').textContent=`${catalog.length} indicators`;
  if(!['2d','3d'].includes(state.mode))state.mode='2d';
  state.metric=availableIndicatorId(state.metric,'unemployment');
  state.secondMetric=availableIndicatorId(state.secondMetric,catalog.find(m=>m.id!==state.metric)?.id);
  if(!geo.byId.has(state.selected))state.selected=null;if(state.second&&!geo.byId.has(state.second))state.second='48';
  if(state.concept==='compare'){prepareComparison(state.selected);if(!state.selected)state.selected='06';}
  await Promise.all([geo.loadDetail(state.selected),state.concept==='compare'?geo.loadDetail(state.second):null]);
  rememberState(state.selected);

  render();window.dispatchEvent(new Event('atlas:startup-ready'));
  if(seeded)dataStore.refresh(startupMetric);
  if(state.concept==='stories')openDrawer('story-rail',$('.concept-tabs [data-concept=stories]'));else if(state.rank)openRank(state.rank);
} catch(error) {console.error(error);window.dispatchEvent(new CustomEvent('atlas:startup-error',{detail:{message:'Map boundaries or indicator data could not be reached. Check your connection and try again. About and Support are available.'}}));}

function showStatSource(side='a'){
 activeSourceSide=side;
 if(!isSurfaceOpen($('#source-popup'))&&!comparisonDraft&&!isSurfaceOpen($('#inspector')))closeDrawers(false);
 const m=side==='b'?metricB():metric(),f=side==='b'?selectedB():selected(),current=layer(m),pending=['idle','loading'].includes(current.status),data=pending?{...current,period:'Loading…',unit:'Loading…',sourceRelease:'Loading…'}:current,row=observation(m,f?.id),url=row?.sourceUrl||m.sourceUrl;
 const sourceName=data.source==='BLS LAUS'?'BLS · Local Area Unemployment Statistics':data.source||m.source;
 const month=(data.period||'').match(/^(\d{4})-M?(\d{2})$/);
 const period=month?new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+month[1],+month[2]-1,1))):formatPeriod(data.period);
 const unit=data.unit==='%'?'Percent (%)':data.unit||m.unit||'—';
 const explanation=row?.methodologyNote||(row?(m.fieldId==='03.06:unemployment_rate'?'Share of the labor force that is unemployed. Original units and reporting period are retained.':'Original units and reference period are retained.'):missingReason(m,f,data));
 const coverage=m.fieldId?(m.countySupported?(m.stateSupported?'State and county':'County'):'State'):m.coverageNote;
 const desktop=`<div class="source-observation"><p>${escapeHTML(f?.name||'United States')} · ${escapeHTML(m.name)}</p><strong>${number(m,f?.id)}</strong></div><dl><dt>Source</dt><dd>${url?`<a href="${escapeHTML(url)}" target="_blank" rel="noreferrer">${escapeHTML(data.source||m.source)} ↗</a>`:escapeHTML(data.source||m.source)}</dd><dt>Period</dt><dd>${escapeHTML(formatPeriod(data.period)||'No published observation')}</dd><dt>Unit</dt><dd>${escapeHTML(data.unit||'—')}</dd><dt>Release</dt><dd>${escapeHTML(data.sourceRelease||'—')}</dd><dt>Coverage</dt><dd>${escapeHTML(coverage)}</dd></dl><div class="source-method"><h3>Method & data gaps</h3><p>${escapeHTML(row?.methodologyNote||'No county/state aggregation or missing-value substitution is performed. A dash means no published observation.')}</p>${current.definition?.formula?`<p>Formula: ${escapeHTML(current.definition.formula)}${current.definition.minDenominator?` · minimum denominator ${escapeHTML(String(current.definition.minDenominator))}`:''}.</p>`:''}<p>Census 2017 boundaries. ${data.excludedGeographies?.length||0} source geographies are outside this map.${current.suppressed?.size?` ${current.suppressed.size} places are suppressed below the minimum denominator.`:''} ${escapeHTML(data.selection||'The latest single period and release are used, with no older-place fallback.')}</p>${data.status==='ready'?`<p>${data.scale==='diverging'?'Colour uses a diverging 85 – 100 – 115 scale':`Colour uses a ${data.scale==='log'?'logarithmic':'linear'} scale`} across mapped places, from ${formatValue(data.min,data.unit)} to ${formatValue(data.max,data.unit)}. 3D height is linear between the same minimum and maximum. Both maps share the same scale for this indicator.</p>`:''}</div>`;
 pages.showSource(`<div class="source-desktop">${desktop}</div><div class="source-mobile"><h3>${escapeHTML(m.name)}</h3><dl><dt>Source</dt><dd>${escapeHTML(sourceName)}</dd><dt>Period</dt><dd>${escapeHTML(period||'No published observation')}</dd><dt>Unit / area</dt><dd>${escapeHTML(unit)} · ${f?.id.length===5?'County equivalent':f?'State level':'US'}</dd><dt>Release</dt><dd>${escapeHTML(data.sourceRelease||'—')}</dd></dl><p>${escapeHTML(explanation)}</p>${url?`<a class="primary-button" href="${escapeHTML(url)}" target="_blank" rel="noreferrer">Open original source</a>`:''}</div>`,{variant:'indicator'});
}
