import {showSurface,slidePill,animateReplacement,isSurfaceOpen,reducedMotion} from './motion.js';
import {indicatorIcon} from './icons.js';
import {articleExists,articleMetadata,articleView,journalView,featureView,features,hasPublishedArticles} from './journal-view.js';
import {aboutView,legacyInfoView,supportView,milestoneDialogView} from './support-about-views.js';
const $=s=>document.querySelector(s);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=(title,copy)=>`<div class="empty-state"><h3>${title}</h3><p>${copy}</p></div>`;
export function initPages({changeConcept,renderMaps,getCatalog,getLibrary,getGeography,getReportContext=()=>({}),openSearch,closePlaceSheet,closeOverlays,syncChrome,getConcept,initialPage=null,initialArticle=null,syncURL=()=>{},beginHistory=()=>{},setSEO=()=>{}}) {
  const host=$('#reading-page'),cache=new Map(),scrolls=new Map();
  const returns=[];
  let articleSlug=initialArticle||new URLSearchParams(location.search).get('article')||'mississippi',featureIndex=0;
  const preview=document.body.dataset.runtime==='preview';
  const pageKey=page=>page==='article'?'article:'+articleSlug:page;
  let current=initialPage|| (getConcept()==='compare'?'compare':'map'),prior=current,contentPage,theme='light',sourceFocus,sourceFocusSelector,navigation=0,infoTab='methodology',infoSurface=location.hash==='#info-methodology'?'legacy':'about',activeDialog=null,dialogSerial=0,pendingDialogPop=null;
  let reportDraft={description:'',contact:'',pageUrl:'',context:{},website:'',status:'',submitted:false,initialized:false};
  document.body.dataset.page=current;
  try{theme=localStorage.getItem('usa-atlas-theme')==='dark'?'dark':'light';}catch{}
  const requestedTheme=new URLSearchParams(location.search).get('theme');if(['light','dark'].includes(requestedTheme))theme=requestedTheme;
  document.body.dataset.theme=theme;
  function sourceRows(){
    const admitted=getCatalog().filter(metric=>metric.hasObservations||metric.fieldId);
    if(!admitted.length)return '<li>No admitted source observations are available yet.</li>';
    const providers=[...new Map(admitted.map(metric=>[metric.source,{name:metric.source,url:metric.sourceUrl,metric}])).values()];
    const priority=name=>/BLS/.test(name)?0:/USDA/.test(name)?1:/EIA/.test(name)?2:3;
    providers.sort((a,b)=>priority(a.name)-priority(b.name)||a.name.localeCompare(b.name));
    return providers.map(source=>`<li>${indicatorIcon(source.metric)}<div>${source.url?`<a href="${escapeHTML(source.url)}" target="_blank" rel="noreferrer">${escapeHTML(source.name)} ↗</a>`:escapeHTML(source.name)}<small>Original units, geography and source period retained</small></div></li>`).join('');
  }
  function libraryRows(){
    const library=getLibrary?.()||[];
    if(!library.length)return '<li>No additional loaded data is waiting for review.</li>';
    return library.map(item=>`<li><strong>${escapeHTML(item.label)}</strong><small>${escapeHTML(item.unit)} · ${escapeHTML(item.period)}${item.formula?` · ${escapeHTML(item.formula)}`:''}</small><span>${escapeHTML(item.reason)}</span></li>`).join('');
  }
  function audienceGeography(){
    const geography=getGeography?.();if(!geography)return '';
    const states=geography.collection.features.filter(state=>!['02','15'].includes(state.id));
    // The reading chart owns its projection; it does not inherit a map camera or
    // the mutable high-detail state outlines used by the interactive map.
    const projection=d3.geoAlbersUsa().fitExtent([[0,0],[980,535]],{type:'FeatureCollection',features:states}),path=d3.geoPath(projection).digits(2);
    return `<svg class="audience-geography" viewBox="0 0 980 535" role="img" aria-label="US state boundaries. Audience data is unavailable; every state uses the neutral no-data colour.">${states.map(state=>`<path d="${escapeHTML(path(state))}"/>`).join('')}</svg>`;
  }
  const stats=()=>`<p class="page-eyebrow">AUDIENCE</p><h1>Follow the curiosity.</h1><p class="page-intro">Explore what Atlas visitors choose, compare and spend time discovering.</p><section class="audience-unavailable"><div class="section-heading"><div><h2>Audience data is not connected yet</h2><p>Verified visits, popular places and search trends will appear here when a public analytics source is configured. No counts are estimated or inferred from map activity.</p></div><span class="status-note">Not available</span></div><div class="audience-metrics"><div>Visitors<strong>—</strong><small>Not connected</small></div><div>Views<strong>—</strong><small>Not connected</small></div><div>Online now<strong>—</strong><small>Not connected</small></div></div><p class="fine-print">Nothing on this page counts visits, clicks or search terms. A dash means unavailable, not zero.</p><button class="primary-button" data-page="map">Explore the map →</button><div class="audience-map"><p class="audience-caption">State boundaries · orientation only</p><div id="audience-geography">${audienceGeography()}</div></div></section>`;
  const info=()=>`${aboutView()}${legacyInfoView(sourceRows(),libraryRows())}`;
  const support=()=>supportView();
  const blog=()=>preview?journalView(theme):`<p class="page-eyebrow">THE JOURNAL</p><h1>Look closer. See the whole picture.</h1><p class="page-intro">Thoughtful stories about the numbers and places behind the map.</p>${empty('The journal is taking shape','There are no published articles yet. Editorial drafts remain private until approved for publication.')}<button class="primary-button" data-page="map">Explore the map →</button>`;
  const article=()=>preview&&articleExists(articleSlug)?articleView(articleSlug):`<button class="article-back" data-page="blog">← Blog</button><h1>Article unavailable</h1>${empty('No published article at this address','Return to the journal or explore the source observations on the map.')}<button class="outline-button" data-page="blog">Return to Blog</button>`;
  const markup={stats,info,support,blog,article};
  document.body.classList.toggle('reading',Boolean(markup[current]));
  function syncJournalTheme(){host.querySelectorAll('.journal-map').forEach(frame=>frame.contentWindow?.postMessage({type:'atlas-embed-theme',theme},location.origin));}
  // A cached iframe may reload its original URL when its fragment is restored.
  // Reapply the current theme after that load as well as on an active theme change.
  host.addEventListener('load',event=>{if(event.target.matches?.('.journal-map'))syncJournalTheme();},true);
  function showInfoSection(name=infoTab){
    const root=host.querySelector('#info-content');if(!root)return;
    root.querySelectorAll('.info-section').forEach(section=>{
      section.hidden=section.id!=='info-'+name;
    });
    host.querySelectorAll('.info-tabs button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.info===name)));
    host.scrollTop=0;
  }
  function showAboutSurface(){
    const about=host.querySelector('#about-main'),legacy=host.querySelector('#info-legacy');
    if(!about||!legacy)return;
    about.hidden=false;legacy.hidden=true;infoSurface='about';host.scrollTop=0;
  }
  function showLegacyInfo(name=infoTab){
    const about=host.querySelector('#about-main'),legacy=host.querySelector('#info-legacy');
    if(!about||!legacy)return;
    about.hidden=true;legacy.hidden=false;infoSurface='legacy';infoTab=['sources','methodology','data'].includes(name)?name:'methodology';showInfoSection(infoTab);
  }
  function reportPageUrl(){
    const allowedPath=/^\/(?:about|support|stats|blog(?:\/[a-z0-9-]{1,64})?|compare(?:\/[a-z0-9-]{1,64}){1,7}|united-states(?:\/[a-z0-9-]{1,64}){0,4})$/;
    const fallback=({info:'/about',support:'/support',stats:'/stats',blog:'/blog',article:'/blog'})[document.body.dataset.page]||'/about';
    const path=allowedPath.test(location.pathname)?location.pathname:fallback;
    const rules={embed:/^1$/,preview:/^1$/,review:/^1$/,view:/^(?:2d|3d)$/,place:/^(?:US|[0-9]{2,5})$/,other:/^(?:US|[0-9]{2,5})$/,metric:/^[A-Za-z0-9._:-]{1,100}$/,metric2:/^[A-Za-z0-9._:-]{1,100}$/,comparison:/^(?:metrics|places)$/,rank:/^(?:highest|lowest)$/};
    const source=new URLSearchParams(location.search),clean=new URLSearchParams();
    for(const [key,rule] of Object.entries(rules)){
      const values=source.getAll(key);
      if(values.length===1&&rule.test(values[0]))clean.set(key,values[0]);
    }
    const query=clean.toString();return path+(query?`?${query}`:'');
  }
  function visibleReportPageUrl(){return new URL(reportDraft.pageUrl,location.origin).href;}
  function bugReportMarkup(){
    const context=reportDraft.context||{};
    const included=[context.indicator&&`Indicator: ${context.indicator}`,context.place&&`Place: ${context.place}`,context.period&&`Period: ${context.period}`].filter(Boolean).join(' · ');
    const frozen=reportDraft.submitting||reportDraft.submitted;
    return `<div class="app-dialog-panel app-dialog-panel--bug-report" role="dialog" aria-modal="true" aria-labelledby="bug-report-title" tabindex="-1">
      <header class="app-dialog-heading"><div><p class="page-eyebrow">REPORT A BUG</p><h2 id="bug-report-title">Tell us what went wrong.</h2></div><button class="app-dialog-close" type="button" data-close-dialog aria-label="Close report form">×</button></header>
      <p class="bug-report-help">Describe what happened. We’ll include the current indicator, place and period when they’re available.</p>
      <form id="bug-report-form" class="bug-report-form">
        <label for="bug-report-description">What went wrong? <span aria-hidden="true">*</span><textarea id="bug-report-description" name="description" required minlength="8" maxlength="4000" rows="5" placeholder="Describe the issue" aria-describedby="bug-report-context bug-report-status" ${frozen?'readonly':''}>${escapeHTML(reportDraft.description)}</textarea></label>
        <label for="bug-report-contact">Contact (optional)<input id="bug-report-contact" name="contact" type="text" maxlength="254" autocomplete="email" placeholder="Email or profile link" value="${escapeHTML(reportDraft.contact)}" ${frozen?'readonly':''}></label>
        <label for="bug-report-url">Current page URL<input id="bug-report-url" type="url" readonly value="${escapeHTML(visibleReportPageUrl())}"></label>
        <p id="bug-report-context" class="bug-report-context">${included?`Included automatically: ${escapeHTML(included)}.`:'No indicator, place or period is currently selected.'}</p>
        <label class="bug-report-honeypot" aria-hidden="true" tabindex="-1">Website<input name="website" type="text" tabindex="-1" autocomplete="off" value="${escapeHTML(reportDraft.website)}"></label>
        <p id="bug-report-status" class="bug-report-status" role="status" aria-live="polite" data-state="${reportDraft.submitted?'success':'idle'}">${escapeHTML(reportDraft.status)}</p>
        <button class="primary-button" type="submit" ${reportDraft.submitted||reportDraft.submitting?'disabled':''}>${reportDraft.submitted?'Report received':reportDraft.submitting?'Sending…':'Send report'} <span aria-hidden="true">→</span></button>
      </form>
    </div>`;
  }
  const dialogMemory=new Map();
  function openDialog(kind,trigger,{historyToken=null,historyAlreadyOpen=false}={}){
    if(activeDialog)return;
    if(kind==='report'){
      if(reportDraft.submitted)reportDraft={description:'',contact:'',pageUrl:'',context:{},website:'',status:'',submitted:false,initialized:false};
      if(!reportDraft.initialized){
        reportDraft.pageUrl=reportPageUrl();
        try{reportDraft.context={...getReportContext()};}catch{reportDraft.context={};}
        reportDraft.initialized=true;
      }
    }
    const token=historyToken||`dialog-${Date.now()}-${++dialogSerial}`;
    const root=document.createElement('div');root.className='app-dialog-backdrop';root.dataset.dialog=kind;
    root.innerHTML=kind==='milestone'?milestoneDialogView():bugReportMarkup();
    const panel=root.querySelector('[role="dialog"]');
    const inertBefore=[...document.body.children].filter(node=>node!==root).map(node=>[node,node.inert]);
    document.body.append(root);
    inertBefore.forEach(([node])=>{node.inert=true;});
    if(!historyAlreadyOpen)history.pushState({...history.state,usaAtlasDialog:{kind,token}},'',location.href);
    activeDialog={kind,root,panel,trigger,token,inertBefore,history:!historyAlreadyOpen};
    dialogMemory.set(token,{kind,trigger});
    root.addEventListener('click',event=>{if(event.target===root)closeDialog();});
    const initial=kind==='report'?panel.querySelector('#bug-report-description'):panel.querySelector('.app-dialog-close');
    (initial||panel).focus({preventScroll:true});
  }
  function closeDialog({fromPopState=false,restoreFocus=true}={}){
    if(!activeDialog)return;
    const dialog=activeDialog;activeDialog=null;dialog.root.remove();
    dialog.inertBefore.forEach(([node,inert])=>{if(node.isConnected)node.inert=inert;});
    if(!fromPopState&&history.state?.usaAtlasDialog?.token===dialog.token){pendingDialogPop=dialog.token;history.back();}
    const target=dialog.trigger?.isConnected?dialog.trigger:host;
    if(restoreFocus&&target?.isConnected&&!target.closest('[inert]'))target.focus?.({preventScroll:true});
  }
  function focusSupportMethods(){
    const section=host.querySelector('#support-methods');if(!section)return;
    section.focus({preventScroll:true});
    section.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'start'});
  }
  function modalTabStops(panel){
    return [...panel.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(node=>node.tabIndex>=0&&!node.hidden&&!node.closest('[inert],[hidden],[aria-hidden="true"]')&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&(!node.closest('details')||node.tagName==='SUMMARY'||node.closest('details').open));
  }
  window.addEventListener('popstate',event=>{
    const stateDialog=event.state?.usaAtlasDialog;
    if(pendingDialogPop&&stateDialog?.token!==pendingDialogPop){event.stopImmediatePropagation();pendingDialogPop=null;return;}
    if(activeDialog&&stateDialog?.token!==activeDialog.token){event.stopImmediatePropagation();closeDialog({fromPopState:true});return;}
    if(!activeDialog&&stateDialog&&dialogMemory.has(stateDialog.token)){
      event.stopImmediatePropagation();const remembered=dialogMemory.get(stateDialog.token);openDialog(remembered.kind,remembered.trigger,{historyToken:stateDialog.token,historyAlreadyOpen:true});
    }
  });
  function cacheContent(){if(!contentPage)return;scrolls.set(contentPage,host.scrollTop);const fragment=document.createDocumentFragment();fragment.append(...host.childNodes);cache.set(contentPage,fragment);contentPage=null;}
  async function navigate(page,slug,{replace=false,force=false,fromPopState=false}={}){
    if(!['map','compare',...Object.keys(markup)].includes(page))page='map';
    const nextSlug=page==='article'?(slug||articleSlug):articleSlug;
    if(current===page&&nextSlug===articleSlug&&!force)return;
    if(!replace&&!fromPopState&&(current!==page||nextSlug!==articleSlug))beginHistory();
    articleSlug=nextSlug;
    const outgoing=current,request=++navigation;
    // Popping a return destination preserves nested Info → Support → Info → Map.
    if(outgoing==='article'&&page==='blog'){const index=returns.lastIndexOf('blog');if(index>=0)returns.splice(index);}
    else if(returns.at(-1)===page)returns.pop();
    else if(outgoing!==page)returns.push(outgoing);
    prior=returns.at(-1)||'map';
    current=page;document.body.dataset.page=page;
    const reading=Boolean(markup[page]);document.body.classList.toggle('reading',reading);
    closeOverlays();
    if(reading){cacheContent();host.replaceChildren();if(cache.has(pageKey(page)))host.append(cache.get(pageKey(page)));else host.innerHTML=markup[page]();contentPage=pageKey(page);if(page==='info'){if(infoSurface==='legacy')showLegacyInfo(infoTab);else showAboutSurface();placeAppearanceControl();}host.scrollTop=scrolls.get(pageKey(page))||0;showSurface(host,true,{distance:36});$('#workspace').inert=true;document.querySelectorAll('.segmented').forEach(group=>{if(!group.querySelector('.segment-pill'))group.insertAdjacentHTML('afterbegin','<span class="segment-pill" aria-hidden="true"></span>');slidePill(group,group.querySelector('button[aria-pressed=true]'));});}
    else{showSurface(host,false,{distance:36}).then(ended=>{if(ended&&request===navigation)cacheContent();});$('#workspace').inert=false;}
    const pageName=page==='article'?(host.querySelector('h1')?.textContent||'Article'):({map:'Explore the map',compare:'Compare',stats:'Stats',info:'About',support:'Support',blog:'Journal'}[page]||'Explore the map');
    document.title=`USA X-Ray — ${pageName}`;
    const navPage=['info','support'].includes(page)?null:page==='article'?'blog':page;
    $('.concept-tabs').querySelectorAll('a[data-page]').forEach(link=>{
      if(link.dataset.page===navPage)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    $('.concept-tabs>.nav-pill').hidden=navPage===null;
    slidePill($('.concept-tabs'),$('.concept-tabs a[aria-current="page"]'));
    syncChrome();
    $('#sheet-back').setAttribute('aria-label',page==='article'?'Return to Blog':'Return to previous page');
    if(reading){host.setAttribute('tabindex','-1');host.focus({preventScroll:true});}
    else await changeConcept(page==='compare'?'compare':'explorer',{refresh:force});
    syncURL({page,article:page==='article'?articleSlug:null});
    const articleInfo=page==='article'?articleMetadata(articleSlug):null;
    setSEO({page,article:articleSlug,title:articleInfo?.title,description:articleInfo?.description,
      noindex:page==='stats'||(page==='blog'&&!hasPublishedArticles)||(page==='article'&&(!articleInfo||articleInfo.draft))});
  }
  function closeSource(){
    showSurface($('#source-popup'),false);showSurface($('#source-backdrop'),false,{distance:0});
    const target=sourceFocus?.isConnected?sourceFocus:sourceFocusSelector?[...document.querySelectorAll(sourceFocusSelector)].find(node=>node.getClientRects().length):null;
    if(target?.getClientRects().length&&!target.closest('[inert]'))target.focus({preventScroll:true});
  }
  function showSource(html,{variant=''}={}){
    const popup=$('#source-popup'),refresh=isSurfaceOpen(popup)&&popup.dataset.variant===variant;
    const focused=popup.contains(document.activeElement)?document.activeElement:null;
    const focusId=focused?.id,focusHref=focused?.href,scroll=popup.scrollTop;
    if(!refresh){
      sourceFocus=document.activeElement;const scope=sourceFocus?.closest('[id]');
      sourceFocusSelector=sourceFocus?.id?'#'+sourceFocus.id:sourceFocus?.dataset.source&&scope?'#'+scope.id+' [data-source="'+sourceFocus.dataset.source+'"]':null;
    }
    popup.dataset.variant=variant;popup.innerHTML=`<div class="drawer-top"><h2 id="source-heading">${variant==='indicator'?'<span class="source-desktop">Sources & method</span><span class="source-mobile">Sources</span>':'Sources'}</h2><button id="source-close" aria-label="Close sources">×</button></div>${html}`;
    if(refresh){
      popup.scrollTop=scroll;
      if(focused)(focusId?popup.querySelector('#'+focusId):[...popup.querySelectorAll('a')].find(node=>node.href===focusHref)||$('#source-close'))?.focus({preventScroll:true});
    }else{showSurface($('#source-backdrop'),true,{distance:0});showSurface(popup,true,{distance:32});$('#source-close').focus({preventScroll:true});}
  }
  function showMapSource(){showSource('<h3>About this map</h3><dl><dt>Boundaries</dt><dd>Census-derived · us-atlas</dd><dt>Geography</dt><dd>2017 county equivalents</dd><dt>Relief</dt><dd>Selected indicator on a labelled visual scale</dd><dt>Coverage</dt><dd>50 states + DC · 3,142 county equivalents</dd></dl><p>Relief is a visual scale of the selected indicator. Open its Sources for the unit, period and data gaps.</p><a class="primary-button" href="https://github.com/topojson/us-atlas" target="_blank" rel="noreferrer">Open geometry source ↗</a>',{variant:'geometry'});}
  function refreshSources(){const map=host.querySelector('#audience-geography')||cache.get('stats')?.querySelector('#audience-geography');if(map&&!map.firstChild)map.innerHTML=audienceGeography();const list=host.querySelector('#info-sources-list')||cache.get('info')?.querySelector('#info-sources-list');if(list){const html=sourceRows();if(list.innerHTML!==html)list.innerHTML=html;}const libraryList=host.querySelector('#info-library-list')||cache.get('info')?.querySelector('#info-library-list');if(libraryList){const html=libraryRows();if(libraryList.innerHTML!==html)libraryList.innerHTML=html;}}
  $('#source-backdrop').onclick=closeSource;
  document.addEventListener('click',e=>{
    if(activeDialog){
      const dialog=activeDialog,b=e.target.closest('button');
      if(e.target===dialog.root){closeDialog();return;}
      if(b?.hasAttribute('data-close-dialog')){closeDialog();return;}
      if(b?.hasAttribute('data-dialog-support')){closeDialog();focusSupportMethods();return;}
      return;
    }
    const link=e.target.closest('a[data-page],a#info-open,a#support-open');
    if(link?.getAttribute('aria-disabled')==='true'){e.preventDefault();return;}
    if(link&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){
      e.preventDefault();
      if(link.id==='info-open'){infoSurface='about';if(current==='info'){showAboutSurface();navigate(prior);}else navigate('info');return;}
      if(link.id==='support-open'){navigate(current==='support'?prior:'support');return;}
      if(link.dataset.page==='info'){infoSurface='about';if(current==='info')showAboutSurface();navigate('info');return;}
      navigate(link.dataset.page,link.dataset.article);return;
    }
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.page){navigate(b.dataset.page,b.dataset.article);return;}
    if(b.dataset.feature){featureIndex=(featureIndex+(b.dataset.feature==='next'?1:-1)+features.length)%features.length;animateReplacement($('#journal-feature'),()=>{$('#journal-feature').innerHTML=featureView(featureIndex,theme);});return;}
    if(b.id==='sheet-back'){if(document.body.classList.contains('place-expanded')&&!markup[current])closePlaceSheet();else navigate(current==='article'?'blog':prior);return;}
    if(b.id==='mobile-search')openSearch();
    if(b.id==='source-close')closeSource();
    if(b.id==='map-sources'||b.id==='info-map-sources')showMapSource();
    if(b.id==='theme-toggle'){theme=theme==='light'?'dark':'light';document.body.dataset.theme=theme;try{localStorage.setItem('usa-atlas-theme',theme);}catch{}renderMaps();syncJournalTheme();b.textContent=theme==='dark'?'Light theme':'Dark theme';}
    if(b.closest('.page-period,.activity-tabs,.wallet-tabs')){const group=b.parentElement;group.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));slidePill(group,b);if(group.classList.contains('activity-tabs'))animateReplacement($('.activity .empty-state'),()=>{$('.activity .empty-state h3').textContent=({Visits:'No visits to report',Online:'No online count available','Time on website':'No visit duration available'})[b.textContent];});if(group.classList.contains('wallet-tabs')){$('#wallet-name').textContent={BTC:'Bitcoin',ETH:'Ethereum',USDC:'USD Coin'}[b.textContent];}}
      if(b.dataset.openInfo){const section=b.dataset.openInfo;if(current==='info')showLegacyInfo(section);else navigate('info').then(()=>showLegacyInfo(section));return;}
    if(b.hasAttribute('data-open-report')){openDialog('report',b);return;}
    if(b.hasAttribute('data-open-milestone')){openDialog('milestone',b);return;}
    if(b.hasAttribute('data-support-methods')){focusSupportMethods();return;}
    if(b.dataset.info){showLegacyInfo(b.dataset.info);return;}
    if(b.id==='about-legacy-back'){showAboutSurface();return;}
    if(b.id==='open-local-feedback')$('#feedback-add')?.click();
  });
  document.addEventListener('keydown',e=>{
    if(activeDialog){
      const stops=modalTabStops(activeDialog.panel),first=stops[0],last=stops.at(-1);
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeDialog();return;}
      if(e.key==='Tab'){
        if(!stops.length){e.preventDefault();activeDialog.panel.focus();}
        else if(e.shiftKey&&(document.activeElement===first||!activeDialog.panel.contains(document.activeElement))){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||!activeDialog.panel.contains(document.activeElement))){e.preventDefault();first.focus();}
      }
      e.stopImmediatePropagation();return;
    }
    if(isSurfaceOpen($('#source-popup'))){if(e.key==='Escape'){e.stopImmediatePropagation();closeSource();}if(e.key==='Tab'){const list=[...$('#source-popup').querySelectorAll('a,button,input,summary')].filter(el=>el.getClientRects().length&&(!el.closest('details')||el.tagName==='SUMMARY'||el.closest('details').open));const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
    else if(e.key==='Escape'&&markup[current])navigate(current==='article'?'blog':prior);
    const group=e.target.closest('.concept-tabs,.segmented');if(group&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){const buttons=[...group.querySelectorAll(group.matches('.concept-tabs')?'a[data-page]':'button:not(:disabled)')],index=buttons.indexOf(e.target);if(!buttons.length||index<0)return;const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;e.preventDefault();buttons[next].focus();buttons[next].click();}
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='bug-report-description'){reportDraft.description=event.target.value;if(!reportDraft.submitted)reportDraft.status='';}
    if(event.target.id==='bug-report-contact'){reportDraft.contact=event.target.value;if(!reportDraft.submitted)reportDraft.status='';}
    if(event.target.name==='website'&&event.target.form?.id==='bug-report-form')reportDraft.website=event.target.value;
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(form.id==='info-contact'){event.preventDefault();return;}
    if(form.id!=='bug-report-form')return;
    event.preventDefault();
    if(!form.reportValidity()||reportDraft.submitting||reportDraft.submitted)return;
    reportDraft.description=form.elements.description.value;
    reportDraft.contact=form.elements.contact.value;
    reportDraft.website=form.elements.website.value;
    reportDraft.submitting=true;
    reportDraft.status='Sending your report…';
    const root=activeDialog?.root;
    const status=form.querySelector('#bug-report-status'),button=form.querySelector('[type="submit"]');
    status.textContent=reportDraft.status;status.dataset.state='sending';button.disabled=true;button.firstChild.textContent='Sending… ';
    form.elements.description.readOnly=true;form.elements.contact.readOnly=true;
    try{
      const response=await fetch('/api/bug-reports',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageUrl:reportDraft.pageUrl,description:reportDraft.description,contact:reportDraft.contact,context:reportDraft.context,website:reportDraft.website})});
      let result={};try{result=await response.json();}catch{}
      if(response.status!==201||result.saved!==true||typeof result.id!=='string')throw new Error(result.error||'The server did not confirm that the report was saved.');
      reportDraft.submitted=true;reportDraft.status='Your report was received. Thank you for helping improve USA X-Ray.';
    }catch(error){
      reportDraft.status=error instanceof TypeError?'The report could not reach the server. Your details are still here; please retry.':error.message||'The report could not be saved. Your details are still here; please retry.';
    }finally{
      reportDraft.submitting=false;
      if(root?.isConnected){
        const currentStatus=root.querySelector('#bug-report-status'),currentButton=root.querySelector('[type="submit"]');
        if(currentStatus){currentStatus.textContent=reportDraft.status;currentStatus.dataset.state=reportDraft.submitted?'success':'error';}
        if(currentButton){currentButton.disabled=reportDraft.submitted;currentButton.firstChild.textContent=reportDraft.submitted?'Report received ':'Send report ';}
        root.querySelector('#bug-report-description').readOnly=reportDraft.submitted;
        root.querySelector('#bug-report-contact').readOnly=reportDraft.submitted;
      }else if(activeDialog?.kind==='report'){
        const currentStatus=activeDialog.root.querySelector('#bug-report-status'),currentButton=activeDialog.root.querySelector('[type="submit"]');
        if(currentStatus){currentStatus.textContent=reportDraft.status;currentStatus.dataset.state=reportDraft.submitted?'success':'error';}
        if(currentButton){currentButton.disabled=reportDraft.submitted;currentButton.firstChild.textContent=reportDraft.submitted?'Report received ':'Send report ';}
        activeDialog.root.querySelector('#bug-report-description').readOnly=reportDraft.submitted;
        activeDialog.root.querySelector('#bug-report-contact').readOnly=reportDraft.submitted;
      }
    }
  });
  const themeControl=document.createElement('button');themeControl.id='theme-toggle';themeControl.className='theme-toggle';themeControl.textContent=theme==='dark'?'Light theme':'Dark theme';$('#info-open').after(themeControl);
  function placeAppearanceControl(){const appearance=host.querySelector('.info-appearance');if(appearance&&!appearance.contains(themeControl))appearance.append(themeControl);}
  placeAppearanceControl();
  $('.concept-tabs').querySelectorAll('a[data-page]').forEach(link=>{if(link.dataset.page===current)link.setAttribute('aria-current','page');});
  slidePill($('.concept-tabs'),$('.concept-tabs a[aria-current="page"]'));
  function syncConcept(concept){if(!markup[current]){current=concept==='compare'?'compare':'map';document.body.dataset.page=current;}}
  return {navigate,showSource,closeSource,syncConcept,refreshSources};
}
