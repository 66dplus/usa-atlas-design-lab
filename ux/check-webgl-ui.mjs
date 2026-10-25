// WebGL-only 2D: real camera input, old links, GPU interruption and explicit retry.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright'),engine=process.env.ATLAS_TEST_BROWSER||'chrome';
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:4198',out=process.env.ATLAS_TEST_OUTPUT||'/tmp/usa-xray-webgl';await mkdir(out,{recursive:true});
const browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'}),results=[];
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<761,hasTouch:viewport.width<761}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`${base}/ux/?place=06&view=2d&renderer=svg`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.atlasStatus==='ready');await page.waitForTimeout(800);
   assert.equal(await page.locator('#map-a').getAttribute('data-renderer'),'webgl');assert.equal(new URL(page.url()).searchParams.has('renderer'),false);
   assert.equal(await page.locator('#map-a svg path').count(),0,'No legacy geographic SVG paths');
   const transform=()=>page.locator('#map-a>.geo-svg').evaluate(e=>({x:e.__zoom.x,y:e.__zoom.y,k:e.__zoom.k}));
   const x=viewport.width<761?100:900,y=viewport.width<761?145:300;
   const before=await transform();await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y+50,{steps:15});await page.mouse.up();await page.waitForTimeout(200);const panned=await transform();assert.notEqual(panned.x,before.x,'2D pan responds to input');
   const nativeWheel=engine==='chrome'||viewport.width>760;
   if(nativeWheel){await page.mouse.wheel(0,-150);await page.waitForTimeout(400);assert.notEqual((await transform()).k,panned.k,'2D zoom responds to input');}
   await page.screenshot({path:`${out}/${engine}-${viewport.width}-2d-pan.png`});
   const lost=await page.locator('#map-a>.geo-flat-canvas').evaluate(canvas=>{const ext=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});assert.equal(lost,true,'Context-loss extension available for the recovery check');
   await page.locator('#map-a-error').waitFor({state:'visible'});assert.equal(await page.locator('#map-a').getAttribute('data-renderer'),'unavailable');assert.equal(await page.locator('#map-a svg path').count(),0);
   await page.screenshot({path:`${out}/${engine}-${viewport.width}-webgl-error.png`});
   if(viewport.width<761)await page.locator('#mobile-view-toggle').click();else await page.locator('[data-mode="3d"]').click();
   await page.waitForFunction(()=>document.querySelector('#map-a').dataset.terrainStatus==='ready');
   if(viewport.width<761)await page.locator('#mobile-view-toggle').click();else await page.locator('[data-mode="2d"]').click();
   await page.locator('#map-a-error').waitFor({state:'visible'});
   await page.locator('#map-a-error button').click();await page.waitForFunction(()=>document.querySelector('#map-a').dataset.renderer==='webgl');await page.locator('#map-a-error').waitFor({state:'hidden'});assert.equal(await page.locator('#map-a>.geo-flat-canvas').count(),1);assert.deepEqual(errors,[]);
   results.push({engine,viewport,legacyModeRemoved:true,pan:true,zoom:nativeWheel,contextLoss:true,retry:true,pageErrors:errors});
  }finally{await context.close();}
 }
 const compareContext=await browser.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true}),comparePage=await compareContext.newPage();
 try{
  await comparePage.goto(`${base}/ux/?place=06&view=2d`,{waitUntil:'domcontentloaded'});await comparePage.waitForFunction(()=>document.body.dataset.atlasStatus==='ready');await comparePage.locator('.concept-tabs [data-page="compare"]').click();await comparePage.waitForFunction(()=>document.querySelector('#map-b')?.dataset.renderer==='webgl');
  for(const side of ['a','b']){
   await comparePage.locator(`#map-${side}>.geo-flat-canvas`).evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
   const retry=comparePage.locator(`#map-${side}-error button`);await retry.waitFor({state:'visible'});
   assert.equal(await retry.evaluate(e=>{const r=e.getBoundingClientRect(),pane=e.closest('.map-pane').getBoundingClientRect();return r.top>=pane.top&&r.bottom<=pane.bottom&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'Compare retry fits its pane and receives input');
   await comparePage.screenshot({path:`${out}/${engine}-360-compare-${side}-error.png`});await retry.click();await comparePage.waitForFunction(side=>document.querySelector(`#map-${side}`).dataset.renderer==='webgl',side);
  }
  results.push({engine,compareViewport:{width:360,height:640},bothRetryButtonsReachable:true});
 }finally{await compareContext.close();}
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(()=>{window.webglBlocked=true;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return window.webglBlocked&&type.startsWith('webgl')?null:get.call(this,type,...args);};});
  await page.goto(`${base}/ux/?place=06&view=2d&renderer=svg`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.dataset.atlasStatus==='ready');await page.locator('#map-a-error').waitFor({state:'visible'});assert.equal(await page.locator('#map-a svg path').count(),0);await page.evaluate(()=>window.webglBlocked=false);await page.locator('#map-a-error button').click();await page.waitForFunction(()=>document.querySelector('#map-a').dataset.renderer==='webgl');assert.deepEqual(errors,[]);results.push({engine,startupWebglUnavailable:true,retry:true,pageErrors:errors});
 }finally{await context.close();}
 console.log(`PASS: WebGL-only 2D pan/zoom, legacy link normalization, context loss and startup failure retry in ${engine}.`);
}finally{await writeFile(`${out}/webgl-results.json`,JSON.stringify(results,null,2));await browser.close();}
