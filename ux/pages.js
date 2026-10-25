import {showSurface,slidePill,animateReplacement,isSurfaceOpen,reducedMotion} from './motion.js';
import {indicatorIcon} from './icons.js';
import {articleExists,articleMetadata,articleView,journalView,featureView,features,hasPublishedArticles} from './journal-view.js';
const $=s=>document.querySelector(s);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=(title,copy)=>`<div class="empty-state"><h3>${title}</h3><p>${copy}</p></div>`;
export function initPages({changeConcept,renderMaps,getCatalog,getLibrary,getGeography,openSearch,closePlaceSheet,closeOverlays,syncChrome,getConcept,initialPage=null,initialArticle=null,syncURL=()=>{},beginHistory=()=>{},setSEO=()=>{}}) {
  const host=$('#reading-page'),cache=new Map(),scrolls=new Map();
  const returns=[];
  let articleSlug=initialArticle||new URLSearchParams(location.search).get('article')||'mississippi',featureIndex=0;
  const preview=document.body.dataset.runtime==='preview';
  const pageKey=page=>page==='article'?'article:'+articleSlug:page;
  let current=initialPage|| (getConcept()==='compare'?'compare':'map'),prior=current,contentPage,theme='light',sourceFocus,sourceFocusSelector,navigation=0,infoTab='about';
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
  const info=()=>`<h1>About USA X-Ray</h1><p class="page-intro">Explore places through maps, comparisons and the sources behind the numbers.</p><div class="info-tabs segmented"><button data-info="about" aria-pressed="true">About</button><button data-info="sources" aria-pressed="false">Sources</button><button data-info="methodology" aria-pressed="false">Methodology</button><button data-info="data" aria-pressed="false">Data library</button><button data-info="feedback" aria-pressed="false">Feedback</button></div><div id="info-content"><section id="info-about" class="info-section"><h2>A closer look at places</h2><p>USA X-Ray brings geographic data into one place. Start with the map, compare locations, follow trends or read a story in the journal.</p><p>Each observation keeps its original geography, value, unit, reference period and source. A missing observation stays a visible gap.</p><p class="about-credit">Built and maintained by <strong>Dmitrii Rybkin</strong>.</p></section><section id="info-sources" class="info-section"><h2>Sources</h2><ul id="info-sources-list" class="source-list">${sourceRows()}</ul><p>Open Sources beside a map or indicator for its specific definition, period, attribution and limitations.</p><button class="outline-button" id="info-map-sources">Map geometry sources →</button></section><section id="info-data" class="info-section"><h2>Data library</h2><p>Loaded series that stay off the map until their period, unit or coverage is reviewed and promoted. They remain available for review here, with the reason they are not mapped.</p><ul id="info-library-list" class="library-list">${libraryRows()}</ul></section><section id="info-methodology" class="info-section"><h2>Original values, exact geography</h2><p>Only admitted observations are read. County joins use exact Census 2017 FIPS. The interface never allocates state, ZIP, monitor, tract or block-group observations to counties. Admitted county series retain the source methodology. Each series uses one latest period and release.</p><p>Colour is continuous from the lowest to the highest mapped value. Money and population use a logarithmic scale so that both small and large places stay readable, other values use a linear scale, and the cost-of-living index keeps a diverging 85–100–115 scale. 3D height is linear between the same minimum and maximum. The legend states the same range as the map paints. Relief is a visual scale, not an additional measurement.</p></section><section id="info-feedback" class="info-section"><h2>Feedback & contact</h2><p>Found something unclear, spotted a data issue or have a partnership idea? Tell us.</p><form id="info-contact" aria-describedby="info-delivery"><label>Name<input name="name" autocomplete="name" placeholder="Your name"></label><label>Email<input name="email" type="email" autocomplete="email" placeholder="you@example.com"></label><label>Message<textarea name="message" rows="4" placeholder="Your question, feedback or partnership idea"></textarea></label><button type="submit" class="primary-button" disabled>Send message</button><p id="info-delivery" class="fine-print">Sending is not available yet. Your text is kept while you browse these pages; reloading clears it.</p></form>${document.body.dataset.review==='1'?'<p>For a comment on a visible result, use the local review tools.</p><button id="open-local-feedback" class="outline-button">Open local review tools</button>':''}</section><section class="info-section info-appearance"><h2>Appearance</h2><p>Choose the theme used throughout the atlas.</p><div id="theme-control-home"></div></section><section class="info-section info-support"><h2>Support USA X-Ray</h2><p>Help us keep exploring.</p><button class="outline-button" data-page="support">Explore ways to support →</button></section></div>`;
  const support=()=>`<div class="support-layout"><div><p class="page-eyebrow">SUPPORT</p><h1>Help us keep<br>exploring.</h1><p class="page-intro">Support the maps, the data and the stories behind USA X-Ray.</p><dl class="support-purpose"><dt>Maps</dt><dd>A clear way to explore places.</dd><dt>Data</dt><dd>Sources and context behind every number.</dd><dt>Stories</dt><dd>Articles that make the map easier to understand.</dd></dl></div><section class="wallet-panel support-goal"><p class="page-eyebrow">CURRENT GOAL</p><h2>$2,500</h2><p>Support the next release of maps, source checks and stories.</p><div class="support-goal-status"><strong>Contributions are not open yet.</strong><p>No payment is collected on this page. A verified progress total will appear only when a payment method is confirmed.</p></div><h3>What the goal covers</h3><p class="support-uses">The work behind the atlas: maps, source checks and the stories that explain them.</p><p class="fine-print">Wallet addresses and external payment links will be published only after they are confirmed. Nothing here accepts money.</p></section></div><div class="membership"><div><h2>Other ways to help</h2><p>No payment is needed to make the atlas more useful.</p></div><div class="membership-pending"><h3>Share a map or comparison</h3><p>Send a place, an indicator or a story to someone who would find it useful.</p></div></div><div class="support-footer"><p>Built and maintained by Dmitrii Rybkin.</p></div>`;
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
      const permanent=section.classList.contains('info-appearance')||section.classList.contains('info-support');
      section.hidden=!permanent&&section.id!=='info-'+name;
    });
    host.querySelectorAll('.info-tabs button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.info===name)));
    host.scrollTop=0;
  }
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
    if(reading){cacheContent();host.replaceChildren();if(cache.has(pageKey(page)))host.append(cache.get(pageKey(page)));else host.innerHTML=markup[page]();contentPage=pageKey(page);if(page==='info'){host.querySelector('#theme-control-home').append(themeControl);showInfoSection(infoTab);}host.scrollTop=scrolls.get(pageKey(page))||0;showSurface(host,true,{distance:36});$('#workspace').inert=true;document.querySelectorAll('.segmented').forEach(group=>{if(!group.querySelector('.segment-pill'))group.insertAdjacentHTML('afterbegin','<span class="segment-pill" aria-hidden="true"></span>');slidePill(group,group.querySelector('button[aria-pressed=true]'));});}
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
    const link=e.target.closest('a[data-page],a#info-open,a#support-open');
    if(link?.getAttribute('aria-disabled')==='true'){e.preventDefault();return;}
    if(link&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){
      e.preventDefault();
      if(link.id==='info-open'){navigate(current==='info'?prior:'info');return;}
      if(link.id==='support-open'){navigate(current==='support'?prior:'support');return;}
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
    if(b.dataset.info){infoTab=b.dataset.info;showInfoSection(infoTab);return;}
    if(b.id==='open-local-feedback')$('#feedback-add')?.click();
  });
  document.addEventListener('keydown',e=>{
    if(isSurfaceOpen($('#source-popup'))){if(e.key==='Escape'){e.stopImmediatePropagation();closeSource();}if(e.key==='Tab'){const list=[...$('#source-popup').querySelectorAll('a,button,input,summary')].filter(el=>el.getClientRects().length&&(!el.closest('details')||el.tagName==='SUMMARY'||el.closest('details').open));const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
    else if(e.key==='Escape'&&markup[current])navigate(current==='article'?'blog':prior);
    const group=e.target.closest('.concept-tabs,.segmented');if(group&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){const buttons=[...group.querySelectorAll(group.matches('.concept-tabs')?'a[data-page]':'button:not(:disabled)')],index=buttons.indexOf(e.target);if(!buttons.length||index<0)return;const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;e.preventDefault();buttons[next].focus();buttons[next].click();}
  });
  document.addEventListener('submit',event=>{if(event.target.id==='info-contact')event.preventDefault();});
  const themeControl=document.createElement('button');themeControl.id='theme-toggle';themeControl.className='theme-toggle';themeControl.textContent=theme==='dark'?'Light theme':'Dark theme';$('#info-open').after(themeControl);
  $('.concept-tabs').querySelectorAll('a[data-page]').forEach(link=>{if(link.dataset.page===current)link.setAttribute('aria-current','page');});
  slidePill($('.concept-tabs'),$('.concept-tabs a[aria-current="page"]'));
  function syncConcept(concept){if(!markup[current]){current=concept==='compare'?'compare':'map';document.body.dataset.page=current;}}
  return {navigate,showSource,closeSource,syncConcept,refreshSources};
}
