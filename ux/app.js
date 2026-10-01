import {ExplorerMap,loadGeography} from './map.js';
import {createDataStore,formatValue,formatPeriod,missingReason,comparable} from './model.js?v=postgres-1';
import {initFeedback} from './feedback.js';
import {loadViewSettings,initViewSettings} from './settings.js';
const $=s=>document.querySelector(s);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>`<svg viewBox="0 0 20 20" aria-hidden="true">${{
 search:'<circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/>',back:'<path d="M17 10H3l5-5m-5 5 5 5"/>',bookmark:'<path d="M5 3h10v15l-5-3-5 3Z"/>',check:'<path d="m4 10 4 4 8-8"/>',expand:'<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>',compare:'<path d="M2 6h15l-3-3M18 14H3l3 3"/>',uptrend:'<path d="m3 15 5-5 4 2 5-8M12 4h5v5"/>',downtrend:'<path d="m3 5 5 5 4-2 5 8M12 16h5v-5"/>',home:'<path d="m3 9 7-6 7 6v8H3ZM8 17v-5h4v5"/>',shuffle:'<path d="M3 5h3l8 10h3l-2-3m0 6 2-3M3 15h3l8-10h3l-2-3m0 6 2-3"/>',close:'<path d="m5 5 10 10M15 5 5 15"/>',plus:'<path d="M4 10h12M10 4v12"/>',minus:'<path d="M4 10h12"/>',rotate:'<path d="M4 8a6 6 0 1 1 0 5M4 3v5h5"/>',left:'<path d="M16 8a6 6 0 1 0 0 5M16 3v5h-5"/>',reset:'<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>',down:'<path d="m5 8 5 5 5-5"/>',pin:'<path d="M10 18s6-6 6-11a6 6 0 1 0-12 0c0 5 6 11 6 11Z"/><circle cx="10" cy="7" r="2"/>',arrow:'<path d="M3 10h14m-5-5 5 5-5 5"/>'
}[name]}</svg>`;
const params=new URLSearchParams(location.search);
const concepts=['explorer','stories','compare'];
const initialConcept=concepts.includes(params.get('concept'))?params.get('concept'):'explorer';
const state={concept:initialConcept,mode:params.get('view')||(initialConcept==='compare'?'2d':'3d'),selected:params.get('place')||null,second:params.get('other')==='US'?null:params.get('other')||'48',metric:params.get('metric')||'unemployment',secondMetric:params.get('metric2')||'obesity-rate',comparison:params.get('comparison')==='metrics'?'metrics':'places',category:'All',metricTarget:'a',placeTarget:'a',cardMode:false,rank:['highest','lowest'].includes(params.get('rank'))?params.get('rank'):null};
const stories=[
 {title:'The cost of calling it home',description:'Where does your dollar go further?',metric:'cost-of-living-regional-price-parities',place:'06',action:'Compare the cost of living'},
 {title:'Where work is changing',description:'Explore employment, place by place.',metric:'unemployment',place:'48',action:'Explore Texas'},
 {title:'A closer look at city life',description:'San Francisco, from state to city & county.',metric:'unemployment',place:'06075',action:'Explore San Francisco'}
];
let geo,catalog,metricById,mapA,mapB,viewSettings,dataStore,toastTimer,returnFocus,returnFocusSelector;
let pinned=['unemployment--03-06-employment','unemployment--03-06-labor-force','unemployment--03-06-unemployment','obesity-rate'];
const metric=()=>metricById.get(state.metric);
const metricB=()=>metricById.get(state.comparison==='metrics'?state.secondMetric:state.metric);
const layer=m=>dataStore.get(m);
const values=m=>layer(m).values;
const needed=()=>[...new Set([state.metric,...(state.concept==='compare'?[metricB()?.id]:[]),...pinned])].map(id=>metricById.get(id)).filter(Boolean);
const place=id=>geo.byId.get(id);
const selected=()=>place(state.selected);
const selectedB=()=>place(state.comparison==='metrics'?state.selected:state.second);
const observation=(m,id)=>layer(m).observations.get(id||'US');
const value=(m,id)=>observation(m,id)?.value??null;
const number=(m,id)=>formatValue(value(m,id),layer(m).unit);
function persist() {
  const q=new URLSearchParams({concept:state.concept,view:state.mode,metric:state.metric,metric2:state.secondMetric,comparison:state.comparison,other:state.second||'US'});
  if(state.selected)q.set('place',state.selected);if(state.rank)q.set('rank',state.rank);
  history.replaceState(null,'',`${location.pathname}?${q}`);
}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
function closeDrawers(restore=true){
  const hadRanks=!$('#ranking-panel').hidden;
  document.body.classList.remove('left-replaced');$('#explore-panel').inert=false;if(leftScroll)$('#explore-panel').scrollTop=leftScroll;
  document.querySelectorAll('.drawer:not([hidden]),#view-settings-panel:not([hidden])').forEach(el=>el.hidden=true);
  if(hadRanks&&geo&&dataStore){state.rank=null;persist();updateMaps();}
  document.querySelectorAll('[aria-expanded=true]').forEach(el=>el.setAttribute('aria-expanded','false'));
  if(restore){
    const target=returnFocus?.isConnected?returnFocus:returnFocusSelector?$(returnFocusSelector):null;
    if(target?.getClientRects().length)target.focus();
    else (state.concept==='compare'?$('#summary-'+(state.inspectorSide==='b'?'b':'a')):$('#explore-panel .place-chooser'))?.focus();
  }
}
function openDrawer(id,trigger=document.activeElement,side='a',edge=side==='b'?'right':'left'){
  const panel=$('#'+id),wasOpen=!panel.hidden&&returnFocus===trigger;
  closeDrawers(false);if(wasOpen){trigger?.focus();return;}
  returnFocus=trigger;returnFocusSelector=trigger?.id?'#'+trigger.id:trigger?.dataset.paneMetric?`[data-pane-metric="${side}"]`:trigger?.dataset.panePlace?`[data-pane-place="${side}"]`:null;panel.dataset.edge=edge;
  // The visual side belongs to the clicked pane, even when both panes share a metric/place.
  (id==='compare-results'?$('.map-workspace'):$('#pane-'+side)).append(panel);
  if(id!=='inspector'&&id!=='compare-results'){leftScroll=$('#explore-panel').scrollTop;document.body.classList.add('left-replaced');$('#explore-panel').inert=true;}
  panel.hidden=false;trigger?.setAttribute('aria-expanded','true');
  (panel.querySelector('input')||panel.querySelector('button'))?.focus();
}
let selectionRequest=0;
async function choosePlace(id,side='a') {
  const request=++selectionRequest;closeDrawers();
  try{await geo.loadDetail(id);}catch(error){toast(error.message);return;}
  if(request!==selectionRequest)return;
  if(side==='b'&&state.concept==='compare'&&state.comparison==='places')state.second=id;
  else state.selected=id;
  closeDrawers();render();
}
function showMetricLibrary(side='a',cardMode=false){
  state.metricTarget=state.concept==='compare'&&state.comparison==='metrics'?side:'a';state.cardMode=cardMode;state.category='All';
  $('#metric-search').value='';$('#metric-library-context').textContent=cardMode?'Fields in your data card':state.concept==='compare'?`${side==='a'?'Left':'Right'} map · ${state.comparison==='places'?'Applies to both maps':'Changes this map only'}`:'Colour and height on the map';
  renderCategories();renderMetrics();renderPopular();openDrawer('metric-library',document.activeElement,side);
}
function showPlaceLibrary(side='a',countiesOnly=false){
  state.placeTarget=side;state.countiesOnly=countiesOnly;$('#place-search').value='';
  $('#place-library-title').textContent=countiesOnly?'Explore the counties':'Choose a place';
  $('#place-library-context').textContent=state.concept==='compare'?`${side==='a'?'Left':'Right'} map · ${state.comparison==='metrics'?'Applies to both maps':'Changes this map only'}`:'Search states and counties';
  renderPlaces();openDrawer('place-library',document.activeElement,side);
}
function renderCategories(){
  const categories=['All',...new Set(catalog.map(m=>m.shortCategory))];
  $('#category-list').innerHTML=categories.map(c=>`<button data-category="${escapeHTML(c)}" aria-pressed="${state.category===c}">${escapeHTML(c)}</button>`).join('');
}
function renderMetrics(){
  const query=$('#metric-search').value.trim().toLowerCase();
  const list=catalog.filter(m=>(state.category==='All'||m.shortCategory===state.category)&&`${m.name} ${m.shortCategory} ${m.source}`.toLowerCase().includes(query)).sort((a,b)=>Number(Boolean(b.fieldId))-Number(Boolean(a.fieldId)));
  $('#metric-list').innerHTML=list.length?list.map(m=>`<button class="metric-item" data-metric="${m.id}" aria-pressed="${state.cardMode?pinned.includes(m.id):m.id===(state.metricTarget==='b'?state.secondMetric:state.metric)}"><span><strong>${escapeHTML(m.name)}</strong><small>${escapeHTML(m.shortCategory)} · ${escapeHTML(m.source)}</small></span><span>${state.cardMode?'Add to card':!m.fieldId?(m.observations?'Other geography':'Not loaded'):m.countySupported?(m.stateSupported?'State / county data':'County data'):'State data'}</span></button>`).join(''):'<p class="library-note">No indicators match. Try a shorter word or choose another category.</p>';
}
function renderPlaces(){
  const query=$('#place-search').value.trim().toLowerCase(),parent=(state.placeTarget==='b'?selectedB()?.id:state.selected)?.slice(0,2);
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
  const stat=v==null?`<h3 class="empty-stat">${loading?'Loading data…':data.status==='error'?'Data unavailable':'No data here'}</h3><p class="no-data-detail">${escapeHTML(missingReason(m,f,data))}</p>${data.status==='error'?`<button class="outline-button" data-retry="${m.id}">Retry data</button>`:''}`:`<div class="value-line"><strong title="${v}">${formatValue(v,data.unit)}</strong><span>${escapeHTML(data.unit==='%'?'':data.unit)}</span></div><span class="demo-tag">${escapeHTML(formatPeriod(data.period))} · ${escapeHTML(data.source)}</span><p class="explanation">Published observation from the loaded source snapshot.</p>`;
  const sourceUrl=row?.sourceUrl||data.observations.values().next().value?.sourceUrl||m.sourceUrl;
  $('#inspector').innerHTML=`<div class="drawer-top"><div><p class="panel-context">${state.concept==='compare'?(right?'Right map':'Left map')+' · ':''}Place statistics</p><h2>${escapeHTML(f?.name||'United States')}</h2></div><button data-close="inspector" aria-label="Close statistics" class="icon-button">×</button></div><p class="place-type">${f?(isCounty?escapeHTML(place(f.stateId).name)+' · County equivalent':'State profile'):'50 states + Washington, DC'}${f?' · '+f.id:''}</p>
    <p class="metric-caption">${escapeHTML(m.name)}</p>${stat}
    <div class="local-position"><span>Observation period</span><strong>${escapeHTML(formatPeriod(data.period)||'—')}</strong></div>
    <div class="inspector-actions"><button class="primary-button" id="inspect-next">${!f?'Choose a state':isCounty?'Browse nearby counties':'Explore counties'} ${icon('arrow')}</button>${state.concept!=='compare'?`<button class="outline-button" id="compare-place">Compare ${f?'this place':'two places'} ${icon('arrow')}</button>`:''}</div>
    <div class="stats-title"><h3>Your data card</h3><button id="edit-card">Choose fields</button></div>
    ${rows.map(item=>`<div class="stat-row"><button data-inspect-metric="${item.id}">${escapeHTML(item.name)}<small class="data-period">${escapeHTML(formatPeriod(layer(item).period)||(layer(item).status==='error'?'Connection error · select to retry':!item.fieldId?(item.observations?'Other geography':'Not loaded'):'Loading…'))}${layer(item).unit?' · '+escapeHTML(layer(item).unit):''}</small></button><strong>${number(item,f?.id)}</strong></div>`).join('')}
    <p class="explanation">Each field keeps its own unit and period. A dash means no observation.</p>
    <details class="source-details"><summary>Source, coverage & method</summary><dl><dt>Source</dt><dd>${sourceUrl?`<a href="${escapeHTML(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHTML(data.source||m.source)} ↗</a>`:escapeHTML(data.source||m.source)}</dd><dt>Status</dt><dd>${data.status==='ready'?'Read from PostgreSQL · usa_atlas':escapeHTML(missingReason(m,f,data))}</dd><dt>Period</dt><dd>${escapeHTML(formatPeriod(data.period)||'No observation')}</dd><dt>Unit</dt><dd>${escapeHTML(data.unit||'—')}</dd><dt>Series</dt><dd>${escapeHTML(m.fieldId||m.catalogId)}</dd><dt>Release</dt><dd>${escapeHTML(data.sourceRelease||'—')}</dd><dt>Coverage</dt><dd>${escapeHTML(m.fieldId?(m.countySupported?(m.stateSupported?'State and county':'County'):'State'):m.coverageNote)}</dd></dl><p>${escapeHTML(row?.methodologyNote||'No county/state aggregation or missing-value substitution is performed.')}</p><p>Boundaries: Census 2017. ${data.excludedGeographies?.length||0} source geographies are outside this map. ${escapeHTML(data.selection||'')}</p>${data.status==='ready'?`<p>Colour and height: linear range ${formatValue(data.min,data.unit)}–${formatValue(data.max,data.unit)} across mapped places, shared by both maps for the same indicator.</p>`:''}</details>
    ${!f?'<div class="note-box"><b>Start with a place.</b><p>Click a state on the map, or use search. Your selection stays with you in 2D and 3D.</p></div>':''}`;
}
function cameraTools(side){
  return [['left','Rotate left','left'],['rotate','Rotate right','right'],['plus','Zoom in','in'],['minus','Zoom out','out'],['reset','Fit selected place','reset']].filter(([, ,action])=>!['left','right'].includes(action)||(state.mode==='3d'&&viewSettings.rotation)).map(([image,label,action])=>`<button data-camera="${action}" data-side="${side}" aria-label="${label}${side==='b'?' · second map':''}">${icon(image)}</button>`).join('');
}
function renderMapHeads(){
  const compare=state.concept==='compare';
  for(const side of ['a','b']){
    const f=side==='b'?selectedB():selected(),m=side==='b'?metricB():metric(),name=f?.name||'United States';
    $('#heading-'+side).innerHTML=`<button ${side==='a'?'id="find-place"':''} class="map-field" data-pane-place="${side}" aria-expanded="false"><span class="field-label">${compare?(side==='a'?'Left':'Right')+' map · ':''}Place</span><span class="field-value">${escapeHTML(name)}${icon('down')}</span></button><button ${side==='a'?'id="metric-button"':''} class="map-field metric-field" data-pane-metric="${side}" aria-expanded="false"><span class="field-label">Indicator${compare&&state.comparison==='places'?' · shared':''}</span><span class="field-value">${escapeHTML(m.name)}${icon('down')}</span></button>`;
    const data=layer(m),caption=['idle','loading'].includes(data.status)?'Loading…':data.status==='error'?'Connection error':value(m,f?.id)==null?'No data here':`${formatPeriod(data.period)} · ${data.unit}`;
    $('#summary-'+side).innerHTML=`<span><strong>${number(m,f?.id)}</strong><small>${escapeHTML(caption)}</small></span><span>Statistics ${icon('arrow')}</span>`;
  }
}
const popular=['unemployment','cost-of-living-regional-price-parities','electricity-price','violent-crime'];
const prompts=[
 {title:'Where is unemployment lowest?',metric:'unemployment',place:null,rank:'lowest'},
 {title:'California or Texas?',metric:'unemployment',place:'06',other:'48',compare:true},
 {title:'A closer look at San Francisco',metric:'unemployment',place:'06075'},
 {title:'Where does a dollar go further?',metric:'cost-of-living-regional-price-parities',place:null,rank:'lowest'},
 {title:'How much does electricity cost?',metric:'electricity-price',place:null,rank:'highest'}
];
let shareTimer,saveTimer,leftScroll=0,lastSurprise=-1;
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
  state.rank=direction;persist();$('#ranking-panel').innerHTML=`<button class="panel-back" data-close="ranking-panel">${icon('back')} Back to ${escapeHTML(selected()?.name||'Explorer')}</button><h2>${escapeHTML(metric().name)}</h2>${rankingMarkup()}<p class="library-note">${sourceLink(metric(),selected())}. One source period. Missing values are excluded; both lists use the same scale.</p>`;
  openDrawer('ranking-panel',document.activeElement);updateMaps();
}
function photoMarkup(f){
  if(!f?.id.startsWith('06'))return '';
  const sf=f.id==='06075';
  return `<figure class="place-photo ${state.photoExpanded?'expanded':''}"><button ${sf?'data-photo="expand"':'data-open-place="06075"'} aria-label="${sf?'Expand San Francisco photo':'Explore San Francisco'}" ${sf?`aria-expanded="${Boolean(state.photoExpanded)}"`:''}><img src="assets/san-francisco-photo.jpg" alt="Golden Gate Bridge with the San Francisco skyline at blue hour"><span class="photo-action">${sf?'San Francisco':'Discover San Francisco'} ${icon(sf?'expand':'arrow')}</span></button><figcaption><a href="https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_and_San_Francisco_skyline_from_Hawk_Hill_at_Blue_Hour_dllu_(cropped).jpg" target="_blank" rel="noreferrer" title="Daniel L. Lu · cropped by King of Hearts · CC BY-SA 4.0">© Daniel L. Lu ↗</a></figcaption></figure>`;
}
function renderExplorer(){
  const panel=$('#explore-panel'),scroll=panel.scrollTop,f=selected(),m=metric(),data=layer(m),v=value(m,f?.id),isSF=f?.id==='06075';
  const crumbs=`${f?.id.length===5?`<button data-breadcrumb="${f.stateId}">${escapeHTML(place(f.stateId).name)}</button><span>·</span>`:''}<button data-breadcrumb="US">United States</button>${f?`<span>·</span><span>${f.id.length===2?'State':isSF?'City & county':'County'}</span>`:''}`;
  panel.innerHTML=`<div class="profile-heading"><button class="place-chooser" data-pane-place="a" aria-expanded="false">${icon('search')}<strong>${escapeHTML(f?.name||'Find your state')}</strong>${icon('down')}</button><div class="place-path">${crumbs}</div></div>${photoMarkup(f)}<div class="profile-content"><button class="indicator-chooser" data-pane-metric="a" aria-expanded="false"><span><small>Indicator</small><b>${escapeHTML(m.name)}</b></span>${icon('down')}</button><div class="profile-value"><strong>${v==null?['idle','loading'].includes(data.status)?'Loading…':'No data':formatValue(v,data.unit)}</strong>${v!=null&&data.unit!=='%'?`<span>${escapeHTML(data.unit)}</span>`:''}<button id="save-view" aria-label="Save this exploration" title="Save this exploration">${icon('bookmark')}</button></div><p class="value-source">${sourceLink(m,f)} · ${escapeHTML(formatPeriod(data.period)||'Not loaded')}</p>${v==null?`<p class="missing-note">${escapeHTML(missingReason(m,f,data))}</p>${data.status==='error'?`<button data-retry="${m.id}" class="outline-button">Retry data</button>`:''}`:''}<div class="ranking-shortcuts"><button data-open-rank="highest">${icon('uptrend')} Highest 5</button><button data-open-rank="lowest">${icon('downtrend')} Lowest 5</button></div><div class="profile-actions"><button class="primary-button" id="compare-place">Compare ${icon('compare')}</button><button class="outline-button" id="explore-more">Explore more ${icon('arrow')}</button></div><div class="explore-next"><h3>Explore next</h3>${f?.id==='06'?`<button data-open-place="06075"><span><b>San Francisco</b><small>Go from state to city & county</small></span>${icon('arrow')}</button>`:`<button data-open-prompt="1"><span><b>California & Texas</b><small>One indicator. Two perspectives.</small></span>${icon('arrow')}</button>`}<button data-open-prompt="3"><span><b>Where does a dollar go further?</b><small>Compare the cost of living</small></span>${icon('arrow')}</button></div><button class="source-button" data-statistics="a">Sources & details ${icon('arrow')}</button></div>`;
  panel.scrollTop=scroll;
  renderQuickStats();
}
function renderQuickStats(){
  const f=selected(),m=metric(),data=layer(m),right=$('#quick-stats');
  const countMetric=metricById.get('unemployment--03-06-unemployment'),forceMetric=metricById.get('unemployment--03-06-labor-force');
  const count=countMetric?value(countMetric,f?.id):null,force=forceMetric?value(forceMetric,f?.id):null;
  const canChart=countMetric&&forceMetric&&count!=null&&force>0&&layer(countMetric).period===layer(forceMetric).period;
  const rows=pinned.map(id=>metricById.get(id));
  right.innerHTML=`<section class="quick-card"><div class="quick-title"><h2>Quick stats</h2><button data-statistics="a" aria-label="Open sources and all statistics">${icon('expand')}</button></div><p class="quick-place">${escapeHTML(f?.name||'United States')}${f?.id.length===5?' · County':''}</p><div class="quick-main"><span>${escapeHTML(m.name)}</span><b>${number(m,f?.id)}</b><small>${escapeHTML(data.unit||'—')} · ${escapeHTML(formatPeriod(data.period)||'No data')} · ${sourceLink(m,f)}</small></div>${rows.map(item=>`<button class="quick-row" data-inspect-metric="${item.id}"><span>${escapeHTML(item.name.replace(' · people',''))}<small>${escapeHTML(formatPeriod(layer(item).period)||'No data')} · ${escapeHTML(layer(item).unit||'—')}</small></span><b>${number(item,f?.id)}</b></button>`).join('')}${canChart?`<div class="labor-chart"><div class="labor-bar"><span style="width:${100*count/force}%"></span></div><span>Unemployed / labor force <b>${formatValue(100*count/force,'%')}</b></span><small>${sourceLink(metricById.get('unemployment'),f)} · ${escapeHTML(formatPeriod(layer(metricById.get('unemployment--03-06-unemployment')).period))} · ratio of published counts</small></div>`:''}<button class="source-button" data-statistics="a">All stats & sources ${icon('arrow')}</button></section><section class="ad-card" aria-label="Advertisement placeholder"><span>Advertisement · preview</span><div>${icon('home')}<h3>Your next chapter,<br>somewhere new.</h3><p>Space for a relevant local partner.</p></div><small>Reserved placement · no live advertiser</small></section>`;
}
function renderPopular(){
  $('#popular-metrics').innerHTML=`<h3>Popular indicators</h3><p>Curated shortcuts</p><div>${popular.map(id=>`<button data-metric="${id}">${escapeHTML(metricById.get(id).name)} ${icon('arrow')}</button>`).join('')}</div>`;
}
function savedItems(){
  try{const items=JSON.parse(localStorage.getItem('usa-atlas-explorations')||'[]');if(!Array.isArray(items))throw new Error('Invalid collection');return items.filter(x=>x&&typeof x.url==='string'&&typeof x.title==='string'&&typeof x.id==='string');}
  catch{toast('Saved explorations are unavailable in this browser.');return null;}
}
function saveView(){
  const items=savedItems();if(!items)return;const url=location.search,item={id:String(Date.now()),url,title:(selected()?.name||'United States')+(state.concept==='compare'?' + '+(selectedB()?.name||'United States'):''),metric:metric().name,period:formatPeriod(layer(metric()).period),savedAt:new Date().toISOString()};
  try{localStorage.setItem('usa-atlas-explorations',JSON.stringify([item,...items.filter(x=>x.url!==url)].slice(0,50)));clearTimeout(saveTimer);const button=$('#save-view');if(button){button.innerHTML=icon('check');button.setAttribute('aria-label','Exploration saved');saveTimer=setTimeout(()=>{if(button.isConnected){button.innerHTML=icon('bookmark');button.setAttribute('aria-label','Save this exploration');}},2500);}else toast('Exploration saved.');}
  catch{toast('Could not save in this browser. Use Share to keep the view link.');}
}
function showSaved(){
  const items=savedItems()||[];$('#saved-panel').innerHTML=`<button class="panel-back" data-close="saved-panel">${icon('back')} Back to ${escapeHTML(selected()?.name||'Explorer')}</button><div class="collection-title"><h2>Saved</h2><span>${items.length}</span></div><button class="outline-button" id="save-current">${icon('plus')} Save current exploration</button>${items.length?`<div class="saved-list">${items.map(item=>`<article><button data-restore="${escapeHTML(item.id)}"><small>${escapeHTML(item.period||'No loaded period')}</small><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.metric||'Exploration')}</p><span>Open exploration ${icon('arrow')}</span></button><button data-remove-saved="${escapeHTML(item.id)}" aria-label="Remove ${escapeHTML(item.title)}" class="remove-saved">${icon('close')}</button></article>`).join('')}</div>`:`<div class="saved-empty">${icon('bookmark')}<h3>A place for your discoveries.</h3><p>Save a place, indicator or comparison and return to the same view.</p></div>`}<p class="saved-note">Stored in this browser. Views reopen with the latest available source snapshot; the saved period is shown above.</p>`;openDrawer('saved-panel',$('#saved-open'));
}
async function restoreSaved(id){
  const item=(savedItems()||[]).find(x=>x.id===id);if(!item)return;const q=new URLSearchParams(item.url);
  state.concept=concepts.includes(q.get('concept'))?q.get('concept'):'explorer';state.mode=q.get('view')==='2d'?'2d':'3d';state.selected=geo.byId.has(q.get('place'))?q.get('place'):null;state.second=geo.byId.has(q.get('other'))?q.get('other'):null;state.metric=metricById.has(q.get('metric'))?q.get('metric'):'unemployment';state.secondMetric=metricById.has(q.get('metric2'))?q.get('metric2'):'obesity-rate';state.comparison=q.get('comparison')==='metrics'?'metrics':'places';state.rank=q.get('rank')||null;
  closeDrawers(false);try{await Promise.all([geo.loadDetail(state.selected),state.concept==='compare'?geo.loadDetail(state.second):null]);render();if(state.rank)openRank(state.rank);}catch(error){toast(error.message);}
}
function showSurprise(){
  $('#surprise-panel').innerHTML=`<button class="panel-back" data-close="surprise-panel">${icon('back')} Back to map</button><h2>Follow your curiosity.</h2><p class="library-note">A few questions to take you somewhere new.</p><button class="primary-button" id="random-prompt">Surprise me ${icon('shuffle')}</button><div class="prompt-list">${prompts.map((p,i)=>`<button data-open-prompt="${i}">${icon('arrow')}<span>${p.title}</span></button>`).join('')}</div><p class="library-note">Prepared explorations, using the available source snapshots.</p>`;openDrawer('surprise-panel',$('#surprise-open'));
}
async function openPrompt(index){
  const p=prompts[index];lastSurprise=index;closeDrawers(false);state.concept=p.compare?'compare':'explorer';state.comparison='places';state.metric=p.metric;state.mode='3d';state.rank=null;if(p.other)state.second=p.other;
  await choosePlace(p.place);if(p.compare){await geo.loadDetail(state.second);render();}if(p.rank)openRank(p.rank);
  $('#surprise-open').innerHTML='Try another '+icon('shuffle');$('#surprise-open').dataset.another='true';
}
function randomPrompt(){const indexes=prompts.map((_,i)=>i).filter(i=>i!==lastSurprise);openPrompt(indexes[Math.floor(Math.random()*indexes.length)]);}

function renderCompare(){
  const isMetrics=state.comparison==='metrics',a=selected(),b=selectedB();
  document.querySelectorAll('[data-compare]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.compare===state.comparison)));
  const rows=isMetrics?[metric(),metricB()]:[metric(),...pinned.filter(id=>id!==state.metric).slice(0,2).map(id=>metricById.get(id))];
  $('#compare-results').innerHTML=`<div class="drawer-top"><h2>${isMetrics?'Two lenses on '+escapeHTML(a?.name||'United States'):'The same questions, side by side'}</h2><button data-close="compare-results" aria-label="Close comparison data" class="icon-button">×</button></div><p class="library-note">${isMetrics?'Each indicator has its own unit, period and colour/height range.':'Both maps use the same indicator snapshot and colour/height range.'}</p><div class="comparison-data"><table><thead><tr><th>Indicator · period</th><th>${escapeHTML(a?.name||'US')}</th>${!isMetrics?`<th>${escapeHTML(b?.name||'US')}</th><th>Difference</th>`:'<th>Unit</th>'}</tr></thead><tbody>${rows.map(m=>{const data=layer(m),va=value(m,a?.id),vb=value(m,b?.id),canCompare=comparable(data,data,a,b)&&va!=null&&vb!=null;return `<tr><th>${escapeHTML(m.name)}<small class="data-period">${escapeHTML(formatPeriod(data.period)||'No observation')}</small></th><td>${formatValue(va,data.unit)}</td>${!isMetrics?`<td>${formatValue(vb,data.unit)}</td><td>${canCompare?formatValue(va-vb,data.unit==='%'?'':data.unit)+' '+escapeHTML(data.unit==='%'?'percentage points':data.unit):'—'}</td>`:`<td>${escapeHTML(data.unit||'—')}</td>`}</tr>`;}).join('')}</tbody></table></div><p class="comparison-note">Original source values. Differences require the same series, period, release, unit and geographic level. A dash means no comparable observation.</p>`;
}
function updateMaps(){
  const dark=false;
  const handleError=message=>{toast(message);state.mode='2d';render();};
  if(!mapA)mapA=new ExplorerMap($('#map-a'),geo,{onSelect:id=>choosePlace(id),onError:handleError,onHover:info=>hover('a',info)});
  mapA.update({layoutKey:state.concept,mode:state.mode,selectedId:!$('#ranking-panel').hidden&&state.rank?(state.selected?.length===5?state.selected.slice(0,2):null):state.selected,metricKey:state.metric,values:values(metric()),countySupported:metric().countySupported,dark,settings:viewSettings,ranks:!$('#ranking-panel').hidden&&state.rank&&state.concept!=='compare'?rankData().rows.map(({id,rank})=>({id,rank})):[]});
  if(state.concept==='compare'){
    if(!mapB)mapB=new ExplorerMap($('#map-b'),geo,{onSelect:id=>choosePlace(id,'b'),onError:handleError,onHover:info=>hover('b',info)});
    mapB.update({layoutKey:state.concept,mode:state.mode,selectedId:state.comparison==='metrics'?state.selected:state.second,metricKey:metricB().id,values:values(metricB()),countySupported:metricB().countySupported,dark:false,settings:viewSettings,ranks:[]});
  }else if(mapB){mapB.dispose();mapB=null;}
}
function hover(side,info){
  const host=$('#pane-'+side);let tooltip=host.querySelector('.map-hover');
  if(!info){tooltip?.remove();return;}
  if(!tooltip){tooltip=document.createElement('div');tooltip.className='map-hover';host.append(tooltip);}
  const m=side==='b'?metricB():metric(),data=layer(m),v=value(m,info.id);
  tooltip.innerHTML=`<b>${escapeHTML(info.name)}</b>${formatValue(v,data.unit)} ${escapeHTML(v==null?'No data':data.unit==='%'?'':data.unit)} <span>· ${escapeHTML(formatPeriod(data.period)||'No observation')} · Click to explore</span>`;
}
function render(){
  for(const m of needed())dataStore.load(m);
  const focused=document.activeElement,focusSelector=focused?.id?'#'+focused.id:focused?.dataset.paneMetric?`[data-pane-metric="${focused.dataset.paneMetric}"]`:focused?.dataset.panePlace?`[data-pane-place="${focused.dataset.panePlace}"]`:null;
  document.querySelectorAll('.map-hover').forEach(el=>el.remove());
  const compare=state.concept==='compare',story=state.concept==='stories';
  document.body.dataset.concept=state.concept;
  document.querySelectorAll('.concept-tabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.concept===state.concept)));
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  document.body.dataset.view=state.mode;
  const data=layer(metric()),other=layer(metricB());
  const range=d=>d.status==='ready'?`${formatValue(d.min,d.unit)} – ${formatValue(d.max,d.unit)}${d.unit==='%'?'':' '+d.unit}`:'No data';
  $('#legend-title').textContent=compare&&state.comparison==='metrics'?'Independent ranges · left / right':`${state.mode==='3d'?'Colour + height':'Colour'} · ${data.unit||'No data'}${metric().fieldId&&!metric().countySupported?' · state values':''}`;
  $('.legend-labels').innerHTML=`<span>${escapeHTML(compare&&state.comparison==='metrics'?'Left: '+range(data):range(data))}</span>${compare&&state.comparison==='metrics'?`<span>${escapeHTML('Right: '+range(other))}</span>`:''}<span class="no-data-key">No data</span>`;
  const provenance=d=>d.status==='ready'?d.source+' · '+formatPeriod(d.period):d.status==='error'?'Database unavailable':'No loaded observations';
  $('.map-provenance').textContent=`Census 2017 boundaries · ${compare&&state.comparison==='metrics'?'Left: '+provenance(data)+' · Right: '+provenance(other):provenance(data)}`;
  $('#pane-b').hidden=!compare;$('#compare-toolbar').hidden=!compare;$('#stories-open').hidden=!story;$('#compare-data-open').hidden=!compare;
  $('#breadcrumbs').hidden=compare;$('#region-jumps').hidden=compare;
  $('#map-intro').hidden=Boolean(state.selected)||compare||story;
  $('#map-hint').textContent=state.mode==='2d'?'Click a place · Drag to pan':!state.selected?'Drag to pan · Scroll to zoom':!metric().countySupported?'State layer · county values unavailable':'Click another state · Click the background to return';
  $('#camera-a').innerHTML=cameraTools('a');$('#camera-b').innerHTML=cameraTools('b');
  $('#story-list').innerHTML=stories.map((s,i)=>`<button class="story-item" data-story="${i}" aria-pressed="${s.metric===state.metric&&s.place===state.selected?.slice(0,2)}"><strong>${s.title}</strong><small>${s.description}</small><span class="story-action">${s.action} →</span></button>`).join('');
  renderMapHeads();renderBreadcrumbs();renderInspector();renderExplorer();if(compare)renderCompare();if(!$('#ranking-panel').hidden){const scroll=$('#ranking-panel').scrollTop;$('#ranking-panel').innerHTML=`<button class="panel-back" data-close="ranking-panel">${icon('back')} Back to ${escapeHTML(selected()?.name||'Explorer')}</button><h2>${escapeHTML(metric().name)}</h2>${rankingMarkup()}<p class="library-note">${sourceLink(metric(),selected())}. Missing values excluded. Same scale for both lists.</p>`;$('#ranking-panel').scrollTop=scroll;}persist();updateMaps();
  if($('.drawer:not([hidden])')&&returnFocusSelector)$(returnFocusSelector)?.setAttribute('aria-expanded','true');
  if(focusSelector&&!focused.isConnected)$(focusSelector)?.focus();
}
async function changeConcept(concept){
  if(state.concept===concept){if(concept==='stories')openDrawer('story-rail',$('[data-concept=stories]'));return;}
  closeDrawers(false);state.concept=concept;
  if(concept==='compare'){if(!state.selected)state.selected='06';if(state.second===state.selected)state.second=state.selected==='06'?'48':'06';}
  else if(concept==='stories')state.mode='3d';
  try{await Promise.all([geo.loadDetail(state.selected),state.concept==='compare'?geo.loadDetail(state.second):null]);}catch(error){toast(error.message);}
  render();if(concept==='stories')openDrawer('story-rail',$('#stories-open'));
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||!catalog)return;
  if(button.dataset.openRank){openRank(button.dataset.openRank);return;}
  if(button.dataset.rank){state.rank=button.dataset.rank;persist();const scroll=$('#ranking-panel').scrollTop;$('#ranking-panel').querySelector('.rank-tabs').parentElement.innerHTML=`<button class="panel-back" data-close="ranking-panel">${icon('back')} Back to map</button><h2>${escapeHTML(metric().name)}</h2>${rankingMarkup()}<p class="library-note">${sourceLink(metric(),selected())}. Missing values excluded. Same scale for both lists.</p>`;$('#ranking-panel').scrollTop=scroll;updateMaps();return;}
  if(button.dataset.rankPlace){state.rank=null;choosePlace(button.dataset.rankPlace);return;}
  if(button.dataset.rankCompare){const id=button.dataset.rankCompare;state.second=id;state.comparison='places';state.rank=null;if(!state.selected||state.selected===id)state.selected=rankData().rows.find(x=>x.id!==id)?.id||(id==='06'?'48':'06');changeConcept('compare');return;}
  if(button.dataset.openPlace){state.rank=null;choosePlace(button.dataset.openPlace);return;}
  if(button.dataset.photo){state.photoExpanded=!state.photoExpanded;renderExplorer();return;}
  if(button.dataset.openPrompt!==undefined){openPrompt(+button.dataset.openPrompt);return;}
  if(button.dataset.restore){restoreSaved(button.dataset.restore);return;}
  if(button.dataset.removeSaved){try{localStorage.setItem('usa-atlas-explorations',JSON.stringify(savedItems().filter(x=>x.id!==button.dataset.removeSaved)));closeDrawers(false);showSaved();}catch{toast('Could not update Saved in this browser.');}return;}
  if(button.dataset.concept){changeConcept(button.dataset.concept);return;}
  if(button.dataset.mode){state.mode=button.dataset.mode;render();return;}
  if(button.dataset.close){closeDrawers();return;}
  if(button.dataset.camera){const map=button.dataset.side==='b'?mapB:mapA;const action=button.dataset.camera;if(action==='in')map.zoom(.8);else if(action==='out')map.zoom(1.25);else if(action==='reset')map.reset();else map.rotate(action==='left'?-1:1);return;}
  if(button.dataset.breadcrumb){choosePlace(button.dataset.breadcrumb==='US'?null:button.dataset.breadcrumb);return;}
  if(button.dataset.jump){choosePlace(button.dataset.jump);return;}
  if(button.dataset.category){state.category=button.dataset.category;renderCategories();renderMetrics();return;}
  if(button.dataset.metric){
    const id=button.dataset.metric;
    if(state.cardMode){dataStore.load(metricById.get(id));if(pinned.includes(id)){if(pinned.length>1)pinned=pinned.filter(p=>p!==id);else toast('Keep at least one field in the card.');}else if(pinned.length<5)pinned.push(id);else toast('Your card can show up to 5 fields. Remove one first.');renderMetrics();renderInspector();return;}
    if(state.metricTarget==='b')state.secondMetric=id;else state.metric=id;state.rank=null;closeDrawers();render();return;
  }
  if(button.dataset.retry){dataStore.retry(metricById.get(button.dataset.retry));render();return;}
  if(button.dataset.place){choosePlace(button.dataset.place,state.placeTarget);return;}
  if(button.dataset.inspectMetric){if(state.inspectorSide==='b'&&state.concept==='compare'&&state.comparison==='metrics')state.secondMetric=button.dataset.inspectMetric;else state.metric=button.dataset.inspectMetric;render();return;}
  if(button.dataset.story){const s=stories[+button.dataset.story];state.metric=s.metric;state.rank=null;state.concept='explorer';choosePlace(s.place);return;}
  if(button.dataset.compare){closeDrawers(false);state.comparison=button.dataset.compare;if(!state.selected)state.selected='06';if(state.comparison==='metrics'&&state.secondMetric===state.metric)state.secondMetric=state.metric==='unemployment'?'obesity-rate':'unemployment';render();return;}
  if(button.dataset.panePlace){showPlaceLibrary(button.dataset.panePlace);return;}
  if(button.dataset.paneMetric){showMetricLibrary(button.dataset.paneMetric);return;}
  if(button.dataset.statistics){state.inspectorSide=button.dataset.statistics;renderInspector();openDrawer('inspector',button,state.inspectorSide,state.concept==='compare'&&state.inspectorSide==='a'?'left':'right');return;}
  switch(button.id){
    case 'metric-button':case 'all-layers':showMetricLibrary();break;
    case 'find-place':showPlaceLibrary();break;
    case 'inspect-next':showPlaceLibrary(state.inspectorSide||'a',Boolean(state.inspectorSide==='b'?selectedB():selected()));break;
    case 'compare-place':if(!state.selected)state.selected='06';state.comparison='places';changeConcept('compare');break;
    case 'edit-card':showMetricLibrary(state.inspectorSide||'a',true);break;
    case 'stories-open':openDrawer('story-rail',button);break;
    case 'compare-data-open':openDrawer('compare-results',button);break;
    case 'share':copyLink();break;
    case 'saved-open':showSaved();break;
    case 'save-view':saveView();break;
    case 'save-current':saveView();closeDrawers(false);showSaved();break;
    case 'explore-more':showPlaceLibrary('a',Boolean(state.selected));break;
    case 'surprise-open':button.dataset.another?randomPrompt():showSurprise();break;
    case 'random-prompt':randomPrompt();break;
    case 'surprise-pause':{const paused=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(paused));button.setAttribute('aria-label',paused?'Resume suggestions':'Pause suggestions');$('.surprise-bar').classList.toggle('paused',paused);break;}
    case 'mobile-panel':{closeDrawers(false);const collapsed=document.body.classList.toggle('panel-collapsed');button.textContent=collapsed?'Explore':'Hide panel';button.setAttribute('aria-expanded',String(!collapsed));break;}
  }
});
$('#metric-search').addEventListener('input',renderMetrics);$('#place-search').addEventListener('input',renderPlaces);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&$('.drawer:not([hidden])')){event.stopImmediatePropagation();closeDrawers();}
});
async function copyLink(){const button=$('#share');clearTimeout(shareTimer);try{await navigator.clipboard.writeText(location.href);button.querySelector('span').textContent='Link copied';button.setAttribute('aria-label','Link copied');shareTimer=setTimeout(()=>{button.querySelector('span').textContent='Share';button.setAttribute('aria-label','Share');},5000);}catch{button.querySelector('span').textContent='Copy failed';button.setAttribute('aria-label','Copy failed. Copy the browser address.');shareTimer=setTimeout(()=>{button.querySelector('span').textContent='Share';button.setAttribute('aria-label','Share');},5000);}}
try {
  const [geography,response,settingsData]=await Promise.all([loadGeography(),fetch('/api/atlas/catalog'),loadViewSettings()]);
  viewSettings={...settingsData.record.settings};
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||'The indicator catalog could not be loaded.');
  geo=geography;catalog=payload.metrics;metricById=new Map(catalog.map(m=>[m.id,m]));pinned=pinned.filter(id=>metricById.has(id));
  dataStore=createDataStore(geo,id=>{if(needed().some(m=>m.id===id))render();});
  $('#catalog-status').textContent=`${payload.catalogCount} catalog indicators · ${payload.availableSeries} loaded map series${Number.isFinite(payload.observationCount)?` · ${payload.observationCount.toLocaleString()} observations`:''}`;
  if(!['2d','3d'].includes(state.mode))state.mode='3d';
  if(!metricById.has(state.metric))state.metric='unemployment';if(!metricById.has(state.secondMetric))state.secondMetric='obesity-rate';
  if(!geo.byId.has(state.selected))state.selected=null;if(state.second&&!geo.byId.has(state.second))state.second='48';
  if(state.concept==='compare'&&!state.selected)state.selected='06';
  await Promise.all([geo.loadDetail(state.selected),state.concept==='compare'?geo.loadDetail(state.second):null]);
  $('#surprise-track').innerHTML=[0,1].map(copy=>`<div class="surprise-copy" ${copy?'aria-hidden="true"':''}>${prompts.map((p,i)=>`<button data-open-prompt="${i}" ${copy?'tabindex="-1"':''}>${escapeHTML(p.title)} ${icon('arrow')}</button>`).join('')}</div>`).join('');
  render();$('#loading').hidden=true;
  if(state.concept==='stories')openDrawer('story-rail',$('.concept-tabs [data-concept=stories]'));else if(state.rank)openRank(state.rank);
  initViewSettings({...settingsData,onOpen:()=>closeDrawers(false),onChange:next=>{viewSettings=next;render();}});
  initFeedback({onStart:()=>[mapA,mapB].filter(Boolean).forEach(map=>map.settle()),getContext:point=>({settings:{...viewSettings},view:{concept:state.concept,mode:state.mode,selected:state.selected,second:state.second,metric:state.metric,secondMetric:state.secondMetric,comparison:state.comparison,pinned:[...pinned]},maps:[mapA,mapB].filter(Boolean).map(map=>map.feedbackSnapshot(point))})});
} catch(error) {console.error(error);$('#loading').innerHTML=`<p>${escapeHTML(error.message)}</p><button id="retry">Reload atlas</button>`;$('#retry').onclick=()=>location.reload();}
