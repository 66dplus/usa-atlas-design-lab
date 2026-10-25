/** Read-only runtime inventory. No test preferences, feedback, analytics or payment writes. */
import fs from 'node:fs/promises';
import path from 'node:path';

const {chromium}=await import(process.env.ATLAS_PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.ATLAS_BASE_URL||'http://127.0.0.1:4196';
const output=process.env.ATLAS_AUDIT_DIR||'/tmp/usa-xray-ui-audit';
const browser=await chromium.launch({headless:true,...(process.env.ATLAS_CHROME_PATH?{executablePath:process.env.ATLAS_CHROME_PATH}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const scenes=[
 ['map-overview',''],['map-state','place=06'],['map-county','place=06075'],['map-3d','place=06&view=3d'],
 ['compare-places','page=compare&place=06&other=48'],['compare-metrics','page=compare&place=06&comparison=metrics&metric2=population'],
 ['rank-highest','place=06&rank=highest'],['rank-lowest','place=06&rank=lowest'],
 ['stats','page=stats'],['blog','page=blog'],['article-mississippi','page=article&article=mississippi'],
 ['article-electricity','page=article&article=electricity'],['about','page=info'],['support','page=support']
];
const report={scope:'Live-code inventory against the configured read-only data service; not design acceptance',base,startedAt:new Date().toISOString(),scenes:[]};
await fs.mkdir(output,{recursive:true});
try{
 for(const device of ['desktop','mobile']){
  const context=await browser.newContext({viewport:device==='mobile'?{width:390,height:844}:{width:1440,height:900},isMobile:device==='mobile',hasTouch:device==='mobile',reducedMotion:'reduce'});
  await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
  for(const [name,query]of scenes){
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('response',response=>{if(response.url().includes('/api/atlas/observations?'))requests.push({url:new URL(response.url()).search,status:response.status()});});
   const record={device,name,query,errors,requests};
   try{
    const start=Date.now();
    await page.goto(base+'/ux/?'+query,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#loading')?.hidden,{timeout:30000});
    await page.waitForTimeout(700);
    record.readyMs=Date.now()-start;
    record.inventory=await page.evaluate(()=>{
     const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&!el.closest('[hidden],[inert]')&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
     const action=el=>{for(const key of ['page','paneMetric','panePlace','statistics','source','openRank','rank','mode','compare','close','expandSheet'])if(el.dataset[key])return key+':'+el.dataset[key];return el.id||el.getAttribute('href')||'';};
     const controls=[...document.querySelectorAll('button,a,input,select,textarea,summary')].filter(visible).map(el=>({tag:el.tagName,key:action(el),id:el.id,label:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('placeholder')||'').trim().replace(/\s+/g,' ').slice(0,150),disabled:Boolean(el.disabled)}));
     const ids=[...document.querySelectorAll('[id]')].map(el=>el.id),actions={};
     for(const control of controls)if(control.key)(actions[control.key]??=[]).push(control.label);
     const canvases=[...document.querySelectorAll('.geo-flat-canvas')].map(canvas=>{
      const gl=canvas.getContext('webgl2');if(!gl)return {id:canvas.parentElement.id,status:'unavailable'};
      const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixel=new Uint8Array(4),colors=new Set();
      for(let y=8;y<h;y+=32)for(let x=8;x<w;x+=32){gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);colors.add([...pixel].join(','));}
      return {id:canvas.parentElement.id,metric:canvas.parentElement.dataset.metric,width:w,height:h,sampledColorCount:colors.size,renderer:canvas.parentElement.dataset.renderer};
     });
     return {page:document.body.dataset.page,concept:document.body.dataset.concept,mode:document.body.dataset.view,classes:document.body.className,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,controls,duplicateIds:[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))],repeatedActions:Object.fromEntries(Object.entries(actions).filter(([,values])=>values.length>1)),canvases};
    });
    if(process.env.ATLAS_AUDIT_SCREENSHOTS==='1'){
     const screenshot=path.join(output,device+'-'+name+'.png');await page.screenshot({path:screenshot});record.screenshot=screenshot;
    }
   }catch(error){record.failure=error.message;}
   finally{report.scenes.push(record);await page.close();}
  }
  await context.close();console.log('Inspected '+device+' '+scenes.length+' scenes.');
 }
}finally{
 await browser.close();report.finishedAt=new Date().toISOString();
 await fs.writeFile(path.join(output,'runtime-inventory.json'),JSON.stringify(report,null,2)+'\n');
}
const summary={scenes:report.scenes.length,failedScenes:report.scenes.filter(s=>s.failure).length,unhandledErrors:report.scenes.reduce((n,s)=>n+s.errors.length,0),overflowScenes:report.scenes.filter(s=>s.inventory?.horizontalOverflow).length,duplicateIdScenes:report.scenes.filter(s=>s.inventory?.duplicateIds.length).length,output};
console.log(JSON.stringify(summary));
if(summary.failedScenes||summary.unhandledErrors)process.exitCode=1;
