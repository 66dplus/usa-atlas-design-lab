// Exercise the actual first-load surface while the catalog request is held.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.ATLAS_TEST_BROWSER||'chrome',base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:4198';
const out=process.env.ATLAS_TEST_OUTPUT||'/tmp/usa-xray-startup';
await mkdir(out,{recursive:true});
const browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'}),results=[];
try{
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:1440,height:900}])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport,hasTouch:viewport.width<761,isMobile:viewport.width<761});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    let release;const gate=new Promise(r=>release=r);
    await page.route('**/api/atlas/catalog',async route=>{await gate;await route.continue().catch(()=>{});});
    try{
      await page.goto(`${base}/ux/?place=06&view=2d&theme=${theme}`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.body.dataset.theme===new URLSearchParams(location.search).get('theme'));
      await page.locator('#loading').waitFor({state:'visible'});
      const first=await page.locator('#startup-message').textContent();
      await page.waitForFunction(first=>document.querySelector('#startup-message').textContent!==first,first);
      await page.waitForTimeout(350);
      const geometry=await page.locator('.startup-card').evaluate(e=>{const r=e.getBoundingClientRect();return {centerX:r.x+r.width/2,centerY:r.y+r.height/2,border:getComputedStyle(e).borderWidth};});
      assert.ok(Math.abs(geometry.centerX-viewport.width/2)<1);
      assert.ok(Math.abs(geometry.centerY-viewport.height/2)<1);
      assert.equal(geometry.border,'0px');
      assert.equal(await page.locator('#loading a').count(),0,'The loading surface has no attribution badge');
      assert.equal(await page.locator('.app-header').evaluate(e=>getComputedStyle(e).visibility),'hidden');
      assert.equal(await page.locator('.osm-attribution').count(),1,'Map attribution is preserved');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const screenshot=`${out}/${engine}-${viewport.width}-${theme}-loading.png`;
      await page.screenshot({path:screenshot});
      if(viewport.width===390&&theme==='light'){
        await page.emulateMedia({reducedMotion:'reduce'});
        assert.equal(await page.locator('.startup-dots i').first().evaluate(e=>e.getAnimations().length),0);
        await page.evaluate(()=>window.dispatchEvent(new CustomEvent('atlas:startup-error',{detail:{message:'The connection was interrupted. Try again.'}})));
        assert.equal(await page.locator('#startup-retry').isVisible(),true);
        assert.equal(await page.locator('#startup-message').getAttribute('aria-hidden'),null);
        const failure=await page.locator('#startup-message').textContent();
        await page.waitForTimeout(2900);
        assert.equal(await page.locator('#startup-message').textContent(),failure,'Rotating phrases stop on failure');
        await page.screenshot({path:`${out}/${engine}-startup-error.png`});
      }
      release();
      await page.waitForFunction(()=>document.body.dataset.atlasStatus==='ready');
      await page.locator('#loading').waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);
      results.push({engine,viewport,theme,geometry,screenshot,errors});
    }finally{release();await context.close();}
  }
  console.log(`PASS: ${results.length} centered loading screens, rotating copy, reduced motion, error recovery and ready dismissal in ${engine}.`);
}finally{await writeFile(`${out}/startup-results.json`,JSON.stringify(results,null,2));await browser.close();}
