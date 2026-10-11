/** Read-only comparison. ATLAS_PLAYWRIGHT_MODULE may point to playwright-core's index.mjs. */
import fs from 'node:fs';
import path from 'node:path';
const {chromium}=await import(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.ATLAS_REVIEW_URL||'http://127.0.0.1:4438';
const output=process.env.ATLAS_EVIDENCE_DIR||'docs/evidence';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.ATLAS_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let report={capturedAt:new Date().toISOString(),viewport:{width:1440,height:900},pixelRatio:1,browser:browser.version(),gpu:'ANGLE SwiftShader (software)',scope:'Frozen read-only observations; no settings, analytics, feedback or deployment writes',baseline:'f5cd8bf: October 20261011-collected35 (hashes in docs/october-svg-baseline.json)',errors:[],parity:[],measurements:[]};
const skipMeasurements=process.env.ATLAS_SKIP_MEASUREMENTS==='1';
if(skipMeasurements&&fs.existsSync(path.join(output,'renderer-comparison.json'))){report=JSON.parse(fs.readFileSync(path.join(output,'renderer-comparison.json')));report.functionalRerunAt=new Date().toISOString();report.unavailableChecks=[{name:'US overview screenshot',result:'NOT RUN',reason:'Initial software-GPU screenshot exceeded30s; functional checks rerun without optional whole-country captures.'}];delete report.failure;}
function check(ok,name,details={}){console.log((ok?'PASS':'FAIL')+': '+name);report.parity.push({name,result:ok?'PASS':'FAIL',...details});if(!ok)throw new Error(name);}
async function open(renderer,query='place=06041&metric=unemployment',mobile=false){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:report.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
 page.on('pageerror',error=>report.errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('404'))report.errors.push(msg.text().slice(0,500));});
 await page.route('**/api/**',route=>route.request().method()==='GET'?route.continue():route.abort());
 await page.goto(`${base}/ux/?view=2d&renderer=${renderer}&${query}`);
 await page.waitForFunction(()=>document.querySelector('#map-a')?.dataset.metric==='unemployment'&&document.querySelector('#loading')?.hidden);
 await page.waitForTimeout(150);
 check(await page.locator('#map-a').getAttribute('data-renderer')===renderer,`${renderer}: requested renderer`);
 await page.evaluate(async()=>{const {FlatMapRenderer}=await import('./flat-map.js');window.testMaps=new Map();const old=FlatMapRenderer.prototype.setTransform;FlatMapRenderer.prototype.setTransform=function(...args){window.testMaps.set(this.host.id,this);return old.apply(this,args);};});
 return page;
}
async function pose(page,side='a'){return page.locator(`#map-${side} .geo-svg`).evaluate(el=>{const t=d3.zoomTransform(el);return{x:t.x,y:t.y,k:t.k};});}
function summarize(samples){const s=samples.toSorted((a,b)=>a-b);return{frames:s.length,p50Ms:+s[Math.floor(s.length*.5)].toFixed(2),p95Ms:+s[Math.floor(s.length*.95)].toFixed(2),maxMs:+s.at(-1).toFixed(2),over33ms:s.filter(x=>x>33.34).length,over50ms:s.filter(x=>x>50).length};}
async function measure(page,kind){
 const svg=page.locator('#map-a .geo-svg'),rect=await svg.boundingBox(),x=rect.x+rect.width*.57,y=rect.y+rect.height*.4;
 const before=await pose(page);if(kind==='pan'){await page.mouse.move(x,y);await page.mouse.down();}
 const result=await page.evaluate(async({kind,x,y})=>{
  const svg=document.querySelector('#map-a .geo-svg'),flat=window.testMaps.get('map-a'),startStats=flat?{...flat.stats}:null,requests=[];
  const fetchBefore=performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/atlas')||e.name.includes('/boundaries/')).length;
  const samples=[];let previous;const observer=new PerformanceObserver(list=>requests.push(...list.getEntries().map(e=>({duration:e.duration,startTime:e.startTime}))));observer.observe({type:'longtask',buffered:false});
  const started=performance.now();
  await new Promise(resolve=>{let frame=0;const step=now=>{if(previous!==undefined)samples.push(now-previous);previous=now;
    if(kind==='pan')window.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,view:window,buttons:1,clientX:x+Math.sin(frame/47*Math.PI*.75)*160,clientY:y+Math.sin(frame/47*Math.PI*.75)*70}));
    else svg.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y,deltaY:frame<24?-8:8,deltaMode:0}));
    if(++frame<48)requestAnimationFrame(step);else requestAnimationFrame(resolve);};requestAnimationFrame(step);});
  observer.disconnect();return{samples,longTasks:requests,elapsedMs:performance.now()-started,startStats,endStats:flat?{...flat.stats}:null,geographicRequests:performance.getEntriesByType('resource').filter(e=>e.name.includes('/api/atlas')||e.name.includes('/boundaries/')).length-fetchBefore};
 },{kind,x,y});
 if(kind==='pan')await page.mouse.up();
 check(JSON.stringify(before)!==JSON.stringify(await pose(page)),`${kind}: camera responds`);
 check(result.geographicRequests===0,`${kind}: no geography/data requests`);
 if(result.startStats)check(result.startStats.geometryBuilds===result.endStats.geometryBuilds&&result.startStats.colorUpdates===result.endStats.colorUpdates,`${kind}: cached geometry/colors unchanged`);
 return{...summarize(result.samples),elapsedMs:+result.elapsedMs.toFixed(2),longTasks:result.longTasks,geometryBuilds:result.endStats?.geometryBuilds,colorUpdates:result.endStats?.colorUpdates,geographicRequests:result.geographicRequests};
}
try{
 for(const renderer of skipMeasurements?[]:['svg','webgl']){
  const page=await open(renderer);await page.screenshot({path:path.join(output,`${renderer}-marin.png`),timeout:60000});
  const value=await page.locator('.quick-main>b').textContent();check(value==='3.7%',`${renderer}: frozen Marin value, period and unit`,{value});
  const t=await pose(page);report.parity.push({name:`${renderer}: Marin fitted camera`,result:'PASS',transform:t});
  // Warm the GPU/paint pipeline before sampling 47 intervals of active input.
  await page.mouse.move(800,400);await page.mouse.wheel(0,-1);await page.waitForTimeout(100);
  for(const interaction of ['pan','zoom']){report.measurements.push({renderer,place:'06041',metric:'unemployment',interaction,...await measure(page,interaction)});fs.writeFileSync(path.join(output,'renderer-comparison.json'),JSON.stringify(report,null,2)+'\n');}
  await page.close();
 }
 for(const place of ['US','06','06075','02','15']){
  const page=await open('webgl',`${place==='US'?'':`place=${place}&`}metric=unemployment`);
  check(await page.locator('#map-a').getAttribute('data-selected')===place,`WebGL geography reachable: ${place}`);
  if(process.env.ATLAS_ALL_SCREENSHOTS==='1')await page.screenshot({path:path.join(output,`webgl-${place}.png`),timeout:60000});await page.close();
 }
 const page=await open('webgl','concept=compare&place=06041&other=06075&metric=unemployment');
 check(await page.locator('#map-b').getAttribute('data-renderer')==='webgl','Compare: both panes use WebGL');
 const aBefore=await pose(page),bBefore=await pose(page,'b');await page.mouse.move(950,430);await page.mouse.wheel(0,-100);await page.waitForTimeout(100);
 check(JSON.stringify(aBefore)===JSON.stringify(await pose(page))&&JSON.stringify(bBefore)!==JSON.stringify(await pose(page,'b')),'Compare: independent cameras');
 if(process.env.ATLAS_ALL_SCREENSHOTS==='1')await page.screenshot({path:path.join(output,'webgl-compare.png'),timeout:60000});
 await page.setViewportSize({width:1000,height:800});await page.waitForTimeout(100);check(await page.locator('#map-a').getAttribute('data-renderer')==='webgl','resize retains WebGL');await page.setViewportSize(report.viewport);
 await page.getByRole('button',{name:'3D',exact:true}).click();await page.waitForTimeout(150);check(await page.locator('#map-a').getAttribute('data-renderer')==='webgl3d','3D unchanged');
 await page.getByRole('button',{name:'2D',exact:true}).click();await page.waitForTimeout(150);check(await page.locator('#map-a').getAttribute('data-renderer')==='webgl','return to 2D retains renderer choice');
 check(new URL(page.url()).searchParams.get('renderer')==='webgl','Share URL retains renderer');await page.close();
 const mobile=await open('webgl','place=06041&metric=unemployment',true);if(process.env.ATLAS_ALL_SCREENSHOTS==='1')await mobile.screenshot({path:path.join(output,'webgl-mobile.png'),timeout:60000});await mobile.close();
 // Exercise real context loss/restoration on the same live map without modifying owner settings.
 const loss=await open('webgl');await loss.evaluate(()=>{const canvas=document.querySelector('.geo-flat-canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_lose_context');window.restoreGL=()=>ext.restoreContext();ext.loseContext();});
 await loss.waitForFunction(()=>document.querySelector('#map-a').dataset.renderer==='svg');check(true,'context loss recovers to SVG');
 await loss.evaluate(()=>window.restoreGL());await loss.waitForFunction(()=>document.querySelector('#map-a').dataset.renderer==='webgl');check(true,'context restoration returns to WebGL');await loss.close();
 report.result=report.errors.length?'FAIL':'PASS';
}catch(error){report.result='FAIL';report.failure=error.message;}finally{fs.writeFileSync(path.join(output,'renderer-comparison.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({result:report.result,checks:report.parity.length,errors:report.errors,failure:report.failure,measurements:report.measurements},null,2));if(report.result!=='PASS')process.exitCode=1;
