// Independent browser acceptance suite for the restored English release runtime.
// Run with node ux/check-release-regressions.mjs against an isolated read-only server.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=(process.env.ATLAS_TEST_URL||'http://127.0.0.1:4198').replace(/\/$/,'');
const timestamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=process.env.ATLAS_TEST_OUTPUT||`/tmp/usa-xray-release-regressions-${timestamp}-${process.pid}`;
const mutation=process.env.ATLAS_TEST_MUTATION||'';
const viewports=[{width:390,height:844},{width:360,height:640},{width:1440,height:900},{width:1440,height:640}]
  .filter(v=>!process.env.ATLAS_TEST_WIDTH||v.width===Number(process.env.ATLAS_TEST_WIDTH));
const themes=['light','dark'].filter(t=>!process.env.ATLAS_TEST_THEME||t===process.env.ATLAS_TEST_THEME);
const results={suite:'release-regressions',base,startedAt:new Date().toISOString(),mutation:mutation||null,checks:[],failures:[],artifacts:[],expectedNegative:mutation?{
  command:`ATLAS_TEST_MUTATION=${mutation} node ux/check-release-regressions.mjs`,
  expectation:'The suite exits nonzero because its normal footer containment/overlap assertion detects the injected legacy layout regression.'
}:null};
await mkdir(out,{recursive:true});
let browser;
let currentPage=null;
function recordFailure(name,error){results.failures.push({name,message:error?.stack||String(error)});}
function slug(value){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function visibleLocator(locator){return locator.isVisible().catch(()=>false);}
async function capture(page,key,status){
  if(!page||page.isClosed())return null;
  const path=join(out,`${slug(key)}-${status}.png`);
  try{await page.screenshot({path,fullPage:false,animations:'disabled',timeout:10000});results.artifacts.push(path);return path;}
  catch(error){results.artifacts.push({path,error:String(error)});return null;}
}
async function save(){
  results.finishedAt=new Date().toISOString();
  results.pass=results.failures.length===0;
  await writeFile(join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
  await writeFile(join(out,'failures.json'),JSON.stringify({pass:results.pass,mutation:results.mutation,failures:results.failures},null,2)+'\n');
}
function addPageListeners(page,errors,expectedNetwork){
  page.on('pageerror',error=>errors.push({type:'pageerror',message:error.message}));
  page.on('console',message=>{
    const text=message.text();
    const expectedMessages=expectedNetwork.consoleMessages||[];
    const expectedInjected=[...expectedMessages].some(expected=>text===expected||text.startsWith(expected));
    if(message.type()==='error'&&!expectedInjected&&!([...expectedNetwork.urls].some(url=>text.includes(url))))errors.push({type:'console',message:text});
  });
  page.on('requestfailed',request=>{
    if(!expectedNetwork.urls.has(request.url()))errors.push({type:'requestfailed',url:request.url(),error:request.failure()?.errorText||'failed'});
  });
}
async function ready(page){
  await page.waitForFunction(()=>document.body.dataset.atlasStatus==='ready',null,{timeout:60000});
  await page.waitForFunction(()=>![...document.querySelectorAll('.map-host')].some(e=>['focusing','restoring'].includes(e.dataset.phase)||e.dataset.terrainStatus==='building'),null,{timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#maps')?.getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect.getTiming().iterations!==Infinity),null,{timeout:20000});
  await page.waitForTimeout(250);
}
async function initPage(context,theme,errors,expectedNetwork){
  await context.addInitScript(value=>{try{localStorage.setItem('usa-atlas-theme',value);}catch{}},theme);
  const page=await context.newPage();currentPage=page;addPageListeners(page,errors,expectedNetwork);
  await page.goto(`${base}/united-states/california/unemployment`,{waitUntil:'domcontentloaded'});
  await ready(page);
  assert.equal(await page.locator('body').getAttribute('data-theme'),theme,`Persisted ${theme} theme is applied`);
  const canonical=await page.locator('link[rel=canonical]').getAttribute('href');
  assert.match(canonical,/\/united-states\/california\/unemployment$/,'Canonical state route is present and theme-independent');
  return page;
}
async function settleMap(page){
  await ready(page);
  await page.waitForFunction(()=>![...document.querySelectorAll('.map-host')].some(e=>e.dataset.phase==='focusing'||e.dataset.phase==='restoring'),null,{timeout:20000});
  await page.waitForTimeout(120);
}
async function checkConsole(errors,name){assert.deepEqual(errors,[],`${name}: unexpected browser console, page, or network errors`);}
async function assertBaseGeometry(page,viewport,name){
  const info=await page.evaluate(()=>{
    const box=e=>e?.getBoundingClientRect().toJSON()||null;
    const visible=e=>!!e&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
    const hit=e=>{if(!visible(e))return false;const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));};
    const pane=document.querySelector('#pane-a'),footer=pane?.querySelector('.pane-footer'),legend=document.querySelector('#explore-panel .indicator-legend'),heading=pane?.querySelector('.pane-heading'),summary=pane?.querySelector('.map-summary');
    const primaryValue=[...document.querySelectorAll('#explore-panel .mobile-summary-value,#explore-panel .profile-value strong')].find(visible);
    const attribution=document.querySelector('.osm-attribution');
    return {status:document.body.dataset.atlasStatus,page:document.body.dataset.page,theme:document.body.dataset.theme,concept:document.body.dataset.concept,
      overflow:document.documentElement.scrollWidth>innerWidth,loadingHidden:document.querySelector('#loading')?.hidden,
      mapHost:visible(document.querySelector('#map-a')),mapRenderer:document.querySelector('#map-a')?.dataset.renderer||null,
      geographicSvgPathCount:[...document.querySelectorAll('#map-a svg.geo-svg')].reduce((count,svg)=>count+svg.querySelectorAll('path').length,0),
      mapCanvasCount:document.querySelectorAll('#map-a canvas.geo-flat-canvas').length,webgl:document.querySelector('#map-a')?.dataset.terrainStatus||null,
      attribution:{count:document.querySelectorAll('.osm-attribution').length,visible:visible(attribution),hit:hit(attribution)},
      pane:box(pane),footer:{visible:visible(footer),position:footer?getComputedStyle(footer).position:null,rect:box(footer),hit:hit(footer)},
      explorerLegend:{visible:visible(legend),position:legend?getComputedStyle(legend).position:null,rect:box(legend),frame:box(document.querySelector('#explore-panel'))},
      primaryValue:{visible:visible(primaryValue),hit:hit(primaryValue),text:primaryValue?.innerText?.trim()||null,rect:box(primaryValue)},
      heading:{visible:visible(heading),rect:box(heading),hit:hit(heading)},summary:{visible:visible(summary),rect:box(summary),hit:hit(summary)},
      viewport:{width:innerWidth,height:innerHeight}};
  });
  await writeFile(join(out,`${slug(name)}-geometry.json`),JSON.stringify(info,null,2)+'\n');
  assert.equal(info.status,'ready',`${name}: app booted`);assert.equal(info.theme,viewport.theme,`${name}: theme verified in DOM`);
  assert.equal(info.overflow,false,`${name}: no horizontal document overflow`);assert.equal(info.loadingHidden,true,`${name}: startup layer is dismissed`);
  assert.equal(info.mapHost,true,`${name}: primary map host is visible`);assert.equal(info.mapRenderer,'webgl',`${name}: map selects the WebGL renderer`);assert.ok(info.mapCanvasCount>0,`${name}: active map uses its WebGL canvas`);
  assert.equal(info.geographicSvgPathCount,0,`${name}: SVG gesture/text overlays contain no geographic paths`);
  assert.equal(info.attribution.count,1,`${name}: one map attribution link`);assert.equal(info.attribution.visible,true);assert.equal(info.attribution.hit,true,`${name}: attribution is reachable`);
  assert.equal(info.primaryValue.visible,true,`${name}: primary metric value is visible`);assert.equal(info.primaryValue.hit,true,`${name}: primary metric value is reachable`);
  if(viewport.width>760)assert.ok(info.explorerLegend.visible,`${name}: primary map metric legend is present`);
  if(viewport.width>760)assert.equal(info.primaryValue.hit,true,`${name}: desktop primary metric value is reachable`);
  return info;
}
async function navigationChecks(page,name){
  const paths=[['map','/united-states/california/unemployment'],['compare','/compare/places/unemployment/california/vs/texas'],['stats','/stats'],['blog','/blog'],['support','/support'],['about','/about']];
  for(const [target,path] of paths){
    if(target==='map'){
      const link=page.locator('.concept-tabs a[data-page="map"]');await link.click();
    }else if(['compare','stats','blog'].includes(target))await page.locator(`.concept-tabs a[data-page="${target}"]`).click();
    else await page.locator(target==='support'?'#support-open':'#info-open').click();
    await page.waitForFunction(expected=>document.body.dataset.page===expected,({map:'map',compare:'compare',stats:'stats',blog:'blog',support:'support',about:'info'})[target]);
    const pathname=new URL(page.url()).pathname;
    if(target==='compare')assert.match(pathname,/^\/compare\/places\/[^/]+\/[^/]+\/vs\/[^/]+$/,`${name}: Compare navigation updates the route for the selected places`);
    else assert.ok(pathname.startsWith(path),`${name}: ${target} navigation updates canonical route`);
    if(target==='stats')assert.ok(await page.locator('.audience-unavailable').isVisible(),`${name}: audience figures are explicitly unavailable`);
    if(target==='about')assert.ok(await page.locator('#info-content h1, #reading-page h1').count(),`${name}: About content mounted`);
    if(target==='compare'&&viewportForName(name)>760)await assertCompareFooter(page,name);
  }
  await page.locator('.concept-tabs a[data-page="map"]').click();await page.waitForFunction(()=>document.body.dataset.page==='map');await settleMap(page);
}
function viewportForName(name){return Number(name.match(/-(\d+)x/)?.[1]||0);}
async function assertCompareFooter(page,name){
  const footer=page.locator('#desktop-compare-card .desktop-compare-source-row');await footer.waitFor({state:'visible'});
  const geometry=await page.evaluate(()=>{const pane=document.querySelector('#desktop-compare-card'),footer=pane.querySelector('.desktop-compare-source-row'),r=footer.getBoundingClientRect(),p=pane.getBoundingClientRect();return {position:getComputedStyle(footer).position,rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},pane:{top:p.top,bottom:p.bottom,left:p.left,right:p.right}};});
  assert.equal(geometry.position,'static',`${name}: comparison source footer remains in the compare card layout`);
  assert.ok(geometry.rect.top>=geometry.pane.top-1&&geometry.rect.bottom<=geometry.pane.bottom+1&&geometry.rect.left>=geometry.pane.left-1&&geometry.rect.right<=geometry.pane.right+1,`${name}: comparison footer stays inside the pane instead of covering the viewport`);
  await writeFile(join(out,`${slug(name)}-compare-footer.json`),JSON.stringify(geometry,null,2)+'\n');
}
async function shortDesktopPanel(page,name){
  const geometry=await page.evaluate(()=>{
    const panel=document.querySelector('#explore-panel'),content=panel.querySelector('.profile-content:not(.mobile-metric-overview)'),legend=panel.querySelector('.indicator-legend');
    const max=Math.max(0,content.scrollHeight-content.clientHeight);content.scrollTop=max;
    const cr=content.getBoundingClientRect(),lr=legend.getBoundingClientRect(),pr=panel.getBoundingClientRect();
    return {max,scrollTop:content.scrollTop,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,content:{top:cr.top,bottom:cr.bottom},legend:{top:lr.top,bottom:lr.bottom,visible:getComputedStyle(legend).visibility!=='hidden'&&lr.height>0},panel:{top:pr.top,bottom:pr.bottom}};
  });
  await writeFile(join(out,`${slug(name)}-short-panel.json`),JSON.stringify(geometry,null,2)+'\n');
  if(geometry.max>0)assert.equal(geometry.scrollTop,geometry.max,`${name}: panel content reaches its lower scroll boundary`);
  else assert.ok(geometry.scrollHeight<=geometry.clientHeight+1,`${name}: short panel content fits without an unnecessary scroll range`);
  assert.equal(geometry.legend.visible,true,`${name}: source/footer remains visible while panel content scrolls`);
  assert.ok(geometry.legend.top>=geometry.panel.top-1&&geometry.legend.bottom<=geometry.panel.bottom+1,`${name}: source/footer remains inside the short panel`);
  if(geometry.max>0)assert.ok(geometry.legend.top>=geometry.content.bottom-1,`${name}: source/footer stays below the scroll viewport`);
}
async function countyCheck(page,name){
  const current=await page.locator('#explore-panel').getAttribute('data-snap').catch(()=>null);
  const chooser=page.locator('#explore-panel [data-pane-place="a"]').first();
  if(await visibleLocator(chooser)){
    await chooser.click();
    const search=page.locator('#place-search');await search.fill('San Francisco');
    await page.locator('#place-list [data-place="06075"]').click();
    await settleMap(page);
  }else{
    await page.goto(`${base}/united-states/california/san-francisco-county/unemployment`,{waitUntil:'domcontentloaded'});await settleMap(page);
  }
  assert.equal(await page.locator('body').getAttribute('data-page'),'map');
  assert.match(await page.locator('#heading-a').innerText(),/San Francisco/i,`${name}: San Francisco county route/selection reaches map heading`);
  assert.match(await page.locator('link[rel=canonical]').getAttribute('href'),/san-francisco-county\/unemployment$/);
  if(current)await page.locator('#explore-panel').getAttribute('data-snap');
  await page.goto(`${base}/united-states/california/unemployment`,{waitUntil:'domcontentloaded'});await settleMap(page);
}
async function sheetBehavior(page,name){
  const sheet=page.locator('#explore-panel'),handle=sheet.locator(':scope > .sheet-handle');
  const visible=await sheet.isVisible();assert.equal(await sheet.getAttribute('data-snap'),'min',`${name}: map starts at reachable mobile minimum`);
  const before=await page.evaluate(()=>({top:document.querySelector('#explore-panel').style.getPropertyValue('--sheet-offset'),footer:document.querySelector('.concept-tabs').getBoundingClientRect().bottom,map:document.querySelector('#maps').getBoundingClientRect().toJSON()}));
  const box=await handle.boundingBox();assert.ok(box&&box.height>0,`${name}: sheet handle remains reachable at minimum`);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y-112,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#explore-panel').dataset.dragging==='false');
  await page.waitForTimeout(350);
  const offset=await sheet.evaluate(e=>parseFloat(e.style.getPropertyValue('--sheet-offset')));
  assert.ok(offset<535,`${name}: upward pointer drag moves the place sheet from its minimum position`);
  const custom=await sheet.getAttribute('data-user-position');
  // The production controller supports free-drag custom offsets. Drag again and
  // confirm the released position remains the controller's committed position.
  const handleBox=await handle.boundingBox();await page.mouse.move(handleBox.x+20,handleBox.y+12);await page.mouse.down();await page.mouse.move(handleBox.x+20,handleBox.y-38,{steps:5});await page.mouse.up();await page.waitForTimeout(300);
  const released=await sheet.evaluate(e=>({offset:parseFloat(e.style.getPropertyValue('--sheet-offset')),user:e.dataset.userPosition,dragging:e.dataset.dragging}));
  assert.equal(released.dragging,'false');assert.equal(released.user,'true',`${name}: free drag commits a user-positioned sheet`);
  assert.ok(Number.isFinite(released.offset),`${name}: released sheet offset is retained`);
  await handle.click();await page.waitForTimeout(150);
  if(await sheet.getAttribute('data-snap')!=='half')await handle.click();
  await page.waitForTimeout(350);
  assert.equal(await sheet.getAttribute('data-snap'),'half',`${name}: handle clears free-drag position into a supported half snap`);
  await handle.click();await page.waitForTimeout(350);
  assert.equal(await sheet.getAttribute('data-snap'),'expanded',`${name}: panel control opens expanded state`);
  await page.locator('#explore-panel > .sheet-content').evaluate(e=>e.scrollTop=e.scrollHeight);
  const scrolled=await page.locator('#explore-panel > .sheet-content').evaluate(e=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight}));
  assert.ok(scrolled.max===0||scrolled.top>=scrolled.max-1,`${name}: expanded sheet content reaches its lower scroll boundary`);
  await page.locator('#explore-panel > .sheet-content').evaluate(e=>e.scrollTop=0);
  await page.locator('#explore-panel .place-chooser').click();
  await page.locator('#place-library').waitFor({state:'visible'});
  await page.locator('#place-library [data-close="place-library"]').click();
  await page.locator('#place-library').waitFor({state:'hidden'});
  assert.equal(await sheet.getAttribute('data-snap'),'min',`${name}: closing the place picker returns the place sheet to its minimum`);
  assert.ok(await handle.boundingBox(),`${name}: minimum-state sheet handle remains available after picker closes`);
  await handle.click();await page.waitForTimeout(350);
  assert.equal(await sheet.getAttribute('data-snap'),'half',`${name}: handle opens a compact half state from minimum`);
  const after=await page.evaluate(()=>({footer:document.querySelector('.concept-tabs').getBoundingClientRect().bottom,map:document.querySelector('#maps').getBoundingClientRect().toJSON()}));
  assert.equal(after.footer,before.footer,`${name}: fixed navigation/footer geometry does not move with sheet`);
  assert.deepEqual(after.map,before.map,`${name}: sheet snaps do not resize the map viewport`);
  assert.equal(visible,true);void custom;
}
async function metricDefinition(page,name){
  if(name.startsWith('chrome-')&&viewportForName(name)<=760){
    const sheet=page.locator('#explore-panel');
    const handle=sheet.locator(':scope > .sheet-handle');
    if(await sheet.getAttribute('data-snap')==='min')await handle.click();
    if(await sheet.getAttribute('data-snap')==='half')await handle.click();
    await sheet.locator(':scope > .sheet-content').evaluate(e=>e.scrollTop=e.scrollHeight);
    await page.waitForTimeout(350);
  }
  await page.locator('#explore-panel [data-source="a"]').last().click();
  const dialog=page.locator('#source-popup');await dialog.waitFor({state:'visible'});
  const text=await dialog.innerText();
  await writeFile(join(out,`${slug(name)}-metric-definition.txt`),text+'\n');
  if(viewportForName(name)>760){
    assert.match(text,/Unemployment rate[\s\S]*BLS LAUS/i,`${name}: unemployment metric and source are shown in the tooltip`);
    assert.match(text,/One latest month and release; no annual averaging|Unemployed people divided by the civilian labor force/i,`${name}: unemployment period or denominator and method are defined`);
  }else{
    assert.match(text,/Unemployment rate[\s\S]*BLS · Local Area Unemployment Statistics/i,`${name}: unemployment metric and source are shown in the tooltip`);
    assert.match(text,/Unemployed people divided by the civilian labor force[\s\S]*not of all residents/i,`${name}: unemployment denominator and interpretation are defined`);
  }
  await page.keyboard.press('Escape');
}
async function startupDefinitionBeforeRefresh(){
  const name='startup-definition-before-refresh';
  const context=await browser.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});
  const errors=[],expectedNetwork={urls:new Set(),consoleMessages:new Set()};let page,releaseResponse,apiResponse,apiFailure;
  const responseHeld=new Promise(resolve=>{apiResponse=resolve;});
  const responseGate=new Promise(resolve=>{releaseResponse=resolve;});
  const item={name,pass:false};results.checks.push(item);
  try{
    const definitions=JSON.parse(await readFile(new URL('./metric-definitions.json',import.meta.url),'utf8'));
    const canonical=definitions.metrics.find(metric=>metric.id==='unemployment')?.method;
    assert.ok(canonical,'canonical unemployment definition is present');
    await context.addInitScript(()=>{try{localStorage.setItem('usa-atlas-theme','light');}catch{}});
    page=await context.newPage();currentPage=page;addPageListeners(page,errors,expectedNetwork);
    await page.route('**/api/atlas/observations?field=*',async route=>{
      const requestURL=new URL(route.request().url());
      if(requestURL.searchParams.get('field')!=='03.06:unemployment_rate')return route.continue();
      try{
        const response=await route.fetch();
        apiResponse({status:response.status(),ok:response.ok()});
        await responseGate;
        await route.fulfill({response});
      }catch(error){apiFailure=error;apiResponse({error:String(error)});await route.abort();}
    });
    await page.goto(`${base}/united-states/california/unemployment`,{waitUntil:'domcontentloaded'});
    await ready(page);
    let startupTimeout;
    const live=await Promise.race([responseHeld,new Promise((resolve,reject)=>{
      startupTimeout=setTimeout(()=>reject(new Error(`${name}: real observations request never reached its held response`)),60000);
    })]).finally(()=>clearTimeout(startupTimeout));
    assert.equal(live.ok,true,`real observations API returned HTTP ${live.status}`);
    const sheet=page.locator('#explore-panel'),handle=sheet.locator(':scope > .sheet-handle');
    if(await sheet.getAttribute('data-snap')==='min')await handle.click();
    if(await sheet.getAttribute('data-snap')==='half')await handle.click();
    await sheet.locator(':scope > .sheet-content').evaluate(element=>element.scrollTop=element.scrollHeight);
    await page.locator('#explore-panel [data-source="a"]').last().click();
    await page.locator('#source-popup').waitFor({state:'visible'});
    const startupText=await page.locator('#source-popup').innerText();
    assert.ok(startupText.includes(canonical),`${name}: full canonical explanation is visible while the real API response is held`);
    assert.equal(apiFailure,undefined,'holding the real API response did not produce a network error');
    const deliveredResponse=page.waitForResponse(response=>{
      const responseURL=new URL(response.url());
      return responseURL.pathname==='/api/atlas/observations'&&responseURL.searchParams.get('field')==='03.06:unemployment_rate';
    },{timeout:60000});
    releaseResponse();
    const response=await deliveredResponse;
    assert.equal(response.ok(),true,'the held real observations API response is delivered successfully');
    const responseBody=await response.body();
    assert.ok(responseBody.length>0,'the held real observations API response body is complete');
    JSON.parse(responseBody.toString('utf8'));
    await checkConsole(errors,name);item.pass=true;
  }catch(error){item.error=error.stack||String(error);recordFailure(name,error);await capture(page,name,'failure');throw error;
  }finally{releaseResponse?.();await capture(page,name,item.pass?'pass':'failure');await context.close();currentPage=null;}
}
async function runMatrixCase(viewport,theme){
  const name=`chrome-${viewport.width}x${viewport.height}-${theme}`;const context=await browser.newContext({viewport,isMobile:viewport.width<=760,hasTouch:viewport.width<=760});
  const errors=[],expectedNetwork={urls:new Set()};let page;
  const item={name,viewport,theme,pass:false,errors};results.checks.push(item);
  try{
    page=await initPage(context,theme,errors,expectedNetwork);
    if(mutation==='legacy-drag'&&viewport.width<=760){
      await page.locator('#explore-panel').evaluate(e=>{e.style.setProperty('--sheet-offset','0px');e.dataset.userPosition='false';});
    }
    item.geometry=await assertBaseGeometry(page,{...viewport,theme},name);
    if(viewport.width>760&&viewport.height<=700)await shortDesktopPanel(page,name);
    if(mutation==='legacy-footer'&&viewport.width>760){
      await page.locator('.concept-tabs a[data-page="compare"]').click();await page.waitForFunction(()=>document.body.dataset.page==='compare');await settleMap(page);
      await page.locator('#desktop-compare-card .desktop-compare-source-row').evaluate(e=>{e.style.setProperty('transform','translateY(100vh)','important');});
      await assertCompareFooter(page,name);
    }
    await navigationChecks(page,name);
    await countyCheck(page,name);
    if(viewport.width<=760)await sheetBehavior(page,name);
    await metricDefinition(page,name);
    await checkConsole(errors,name);
    item.pass=true;
  }catch(error){item.error=error.stack||String(error);recordFailure(name,error);await capture(page,name,'failure');throw error;
  }finally{await capture(page,name,item.pass?'pass':'failure');await context.close();currentPage=null;}
}
async function apiFailureAndRetry(){
  const name='api-failure-retry';const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[],expectedNetwork={urls:new Set([`${base}/api/atlas/catalog`]),consoleMessages:new Set([
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
    'Error: isolated acceptance failure\n    at readAtlasJSON'
  ])};let page,calls=0;
  const item={name,pass:false};results.checks.push(item);
  try{
    await context.addInitScript(()=>{try{localStorage.setItem('usa-atlas-theme','light');}catch{}});
    page=await context.newPage();currentPage=page;addPageListeners(page,errors,expectedNetwork);
    await page.route('**/api/atlas/catalog',async route=>{
      calls++;
      if(calls<=2){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'isolated acceptance failure'})});}
      else await route.continue();
    });
    await page.goto(`${base}/united-states/california/unemployment`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body.dataset.atlasStatus==='error',{timeout:60000});
    assert.equal(await page.locator('#startup-retry').isVisible(),true,'failed API displays actionable retry');
    assert.equal(await page.locator('#loading').isHidden(),false,'failed API keeps an explicit error surface');
    await capture(page,name,'expected-error');
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('#startup-retry').click()]);await ready(page);
    assert.equal(await page.locator('#loading').isHidden(),true,'successful retry dismisses error surface');
    assert.ok(calls>=3,'retry made a fresh catalog request');
    await checkConsole(errors,name);item.pass=true;
  }catch(error){item.error=error.stack||String(error);recordFailure(name,error);await capture(page,name,'failure');throw error;
  }finally{await capture(page,name,item.pass?'pass':'failure');await context.close();currentPage=null;}
}

try{
  assert.ok(!mutation||mutation==='legacy-footer',`Unsupported test mutation: ${mutation}`);
  browser=await chromium.launch({channel:'chrome'});
  await startupDefinitionBeforeRefresh();
  for(const viewport of viewports)for(const theme of themes)await runMatrixCase(viewport,theme);
  await apiFailureAndRetry();
}catch(error){if(!results.failures.length)recordFailure('suite',error);}
finally{
  if(currentPage&&!currentPage.isClosed())await capture(currentPage,'suite-final','failure');
  if(browser)await browser.close().catch(error=>recordFailure('browser-close',error));
  await save();
}
console.log(`${results.pass?'PASS':'FAIL'}: release regressions; ${results.checks.filter(c=>c.pass).length}/${results.checks.length} checks; artifacts ${out}`);
if(!results.pass)process.exitCode=1;
