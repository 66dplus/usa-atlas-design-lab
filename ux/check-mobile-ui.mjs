// Real Chrome flow. Run against an isolated server, with feedback under /tmp.
// PLAYWRIGHT_MODULE may point to the desktop's bundled Playwright installation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.ATLAS_TEST_BROWSER||'chrome';
assert.ok(['chrome','webkit'].includes(engine),'Supported browser: chrome or webkit');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:4198';
const out=process.env.ATLAS_TEST_OUTPUT||'/tmp/usa-xray-ui-architecture-20261023';
await mkdir(out,{recursive:true});
const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true});
const results=[];
let page,context,errors;
const settle=async()=>{
  await page.waitForFunction(()=>document.body.dataset.atlasStatus==='ready',null,{timeout:45000});
  await page.waitForFunction(()=>!['map','compare'].includes(document.body.dataset.page)||document.body.dataset.concept===(document.body.dataset.page==='compare'?'compare':'explorer'));
  await page.waitForFunction(()=>![...document.querySelectorAll('.map-host')].some(n=>['focusing','restoring'].includes(n.dataset.phase)||n.dataset.terrainStatus==='building'),null,{timeout:15000});
  await page.waitForFunction(()=>![...document.querySelectorAll('.geo-svg')].some(e=>d3.active(e))&&!document.querySelector('#maps').getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect.getTiming().iterations!==Infinity));
  await page.waitForTimeout(350);
};
async function check(name,screenshot=true){
  const state=await page.evaluate(()=>{
    const rect=s=>{const e=document.querySelector(s);return e&&!e.hidden?e.getBoundingClientRect().toJSON():null;};
    const terrainPixels=document.body.dataset.view==='3d'&&['map','compare'].includes(document.body.dataset.page)?[...document.querySelectorAll('.map-host[data-mode="3d"]>canvas:not(.geo-flat-canvas):not(.map-transition-cover)')].filter(c=>c.getBoundingClientRect().width).map(c=>{
      const sample=document.createElement('canvas');sample.width=60;sample.height=60;const ctx=sample.getContext('2d');ctx.drawImage(c,0,0,60,60);const pixels=ctx.getImageData(0,0,60,60).data;let count=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]>90&&pixels[i]-pixels[i+2]>40)count++;
      return count;
    }):null;
    const terrainStateCounts=terrainPixels?[...document.querySelectorAll('.map-host[data-mode="3d"]')].filter(e=>e.getBoundingClientRect().width).map(e=>Number(e.dataset.terrainStateCount)):null;
    return {theme:document.body.dataset.theme,page:document.body.dataset.page,view:document.body.dataset.view,terrainPixels,terrainStateCounts,
      overflow:document.documentElement.scrollWidth>innerWidth,loadingHidden:document.querySelector('#loading').hidden,
      nav:rect('.concept-tabs'),map:rect('#maps'),handle:rect('#explore-panel > .sheet-handle'),snap:document.querySelector('#explore-panel').dataset.snap,
      viewport:{width:innerWidth,height:innerHeight},themeColor:document.querySelector('meta[name="theme-color"]').content,
      coveredControls:[...document.querySelectorAll('.concept-tabs button,#mobile-view-toggle,#support-open,#info-open')].filter(e=>{
        const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !e.contains(hit);
      }).map(e=>e.id||e.textContent.trim())};
  });
  assert.equal(state.overflow,false,`${name}: horizontal overflow`);
  assert.equal(state.loadingHidden,true,`${name}: loading overlay`);
  assert.deepEqual(errors,[],`${name}: page/console errors`);
  assert.deepEqual(state.coveredControls,[],`${name}: covered primary controls`);
  if(state.terrainPixels){assert.ok(state.terrainPixels.length>0,`${name}: visible 3D canvas`);assert.ok(state.terrainPixels.every(n=>n>10),`${name}: rendered 3D geography, not an empty backdrop`);assert.ok(state.terrainStateCounts.every(n=>n===51),`${name}: all state meshes are built`);}
  if(state.viewport.width<=760){assert.equal(state.nav.x,0,`${name}: nav left`);assert.equal(state.nav.width,state.viewport.width,`${name}: nav width`);assert.equal(state.nav.height,56,`${name}: nav height`);assert.equal(state.nav.bottom,state.viewport.height,`${name}: nav bottom`);}
  const file=screenshot?path.join(out,`${name}.png`):null;
  if(file)await page.screenshot({path:file});
  results.push({name,engine,...state,errors:[...errors],screenshot:file});
}
async function snap(name){
  const handle=page.locator('#explore-panel > .sheet-handle');
  await handle.focus();await handle.press(name==='min'?'End':'Home');
  if(name==='half')await handle.press('ArrowDown');
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),name);
  assert.equal(await page.locator('#explore-panel > .mobile-indicator-summary').evaluate(e=>e.inert),name!=='min','Only the visible summary is accessible');
  if(name!=='min')assert.equal(await page.locator('#explore-panel > .mobile-indicator-summary').evaluate(e=>{e.focus();return e===document.activeElement;}),false,'Invisible summary cannot receive keyboard focus');
}
async function sheetGeometry(selector){
  const geometry=await page.locator(selector).evaluate(root=>{const r=root.getBoundingClientRect(),h=root.querySelector(':scope > .sheet-handle').getBoundingClientRect();return {x:r.x,width:r.width,padding:getComputedStyle(root).padding,handleInset:h.y-r.y};});
  assert.equal(geometry.x,0,'Shared sheet starts at the viewport edge');
  assert.equal(geometry.width,page.viewportSize().width,'All mobile sheets share one width');
  assert.equal(geometry.padding,'0px','Only sheet content owns padding');
  assert.ok(geometry.handleInset<=1,'Grip sits at the sheet lip');
}
async function dragHandle(delta,options={}){
  const handle=page.locator('#explore-panel > .sheet-handle'),r=await handle.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+16);await page.mouse.down();
  await page.mouse.move(r.x+r.width/2,r.y+16+delta,{steps:12});
  if(options.pause)await page.waitForTimeout(options.pause);
  if(options.cancel)await handle.dispatchEvent('pointercancel',{pointerId:1});
  await page.mouse.up();await page.waitForTimeout(350);
}
async function touchDrag(x,y,delta,steps=15){
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+delta*i/steps}]});await page.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(400);await cdp.detach();
}
try{
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:1440,height:900},{width:1440,height:640}].filter(v=>!process.env.ATLAS_TEST_WIDTH||v.width===Number(process.env.ATLAS_TEST_WIDTH))){
    for(const theme of ['light','dark'].filter(t=>!process.env.ATLAS_TEST_THEME||t===process.env.ATLAS_TEST_THEME)){
      const mobile=viewport.width<=760,key=`after-${viewport.width}x${viewport.height}-${theme}`;
      context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
      page=await context.newPage();errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      await page.goto(`${base}/ux/?place=06&view=2d&theme=${theme}`,{waitUntil:'domcontentloaded'});await settle();
      await check(`${key}-state-half`);
      if(mobile){
        const tops=await page.locator('#mobile-search,#support-open,.dimension-control,#info-open').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().top));
        assert.ok(tops.every(top=>Math.abs(top-8)<1),'All four top controls sit 8px from the available viewport edge');
      }
      if(mobile){
        const original=await page.evaluateHandle(()=>({handle:document.querySelector('#explore-panel > .sheet-handle'),content:document.querySelector('#explore-panel > .sheet-content'),map:document.querySelector('#map-a'),canvas:document.querySelector('#map-a canvas')}));
        const mapBefore=await page.locator('#maps').boundingBox();
        if(engine==='chrome'){
        const sheetBeforeZoom=await page.locator('#explore-panel').evaluate(e=>({top:e.style.getPropertyValue('--sheet-top'),height:e.style.getPropertyValue('--sheet-height')}));
        const zoomSession=await context.newCDPSession(page);
        await zoomSession.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await page.waitForTimeout(150);
        assert.deepEqual(await page.locator('#explore-panel').evaluate(e=>({top:e.style.getPropertyValue('--sheet-top'),height:e.style.getPropertyValue('--sheet-height')})),sheetBeforeZoom,'Pinch zoom must not reframe only the sheet');
        await zoomSession.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await page.waitForTimeout(150);await zoomSession.detach();

        }
        // Complete bidirectional cycle with actual pointer drags.
        await dragHandle(-210);assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'expanded');
        await check(`${key}-state-expanded`);
        await sheetGeometry('#explore-panel');
        await dragHandle(200,{pause:150});assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'half');
        await dragHandle(350,{pause:150});assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'min');
        assert.equal(await page.locator('#explore-panel').evaluate(e=>e.inert),false,'Minimum handle must remain reachable');
        await check(`${key}-state-minimum`);
        await dragHandle(-250,{pause:150});assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'half');
        await dragHandle(-210);assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'expanded');
        const scroll=page.locator('#explore-panel > .sheet-content');
        await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);
        const topBefore=await page.locator('#explore-panel > .sheet-handle').boundingBox();
        await dragHandle(200,{pause:150});assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'half','Handle works with content scrolled to bottom');
        await snap('expanded');
        if(engine==='chrome'){
        await page.evaluate(()=>{window.sheetTouchTrace=[];const root=document.querySelector('#explore-panel');for(const type of ['touchstart','touchmove','touchend','touchcancel'])root.addEventListener(type,e=>window.sheetTouchTrace.push({type,contacts:e.touches.length,target:e.target.className,y:e.touches[0]?.clientY,cancelable:e.cancelable,prevented:e.defaultPrevented,scroll:root.querySelector('.sheet-content').scrollTop,dragging:root.dataset.dragging,snap:root.dataset.snap}));});
        await scroll.evaluate(e=>e.scrollTop=Math.min(65,e.scrollHeight-e.clientHeight));
        await touchDrag(12,topBefore.y+100,18);
        assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'expanded','Middle content scroll must not drag sheet');
        await scroll.evaluate(e=>e.scrollTop=0);
        await touchDrag(12,topBefore.y+180,210);
        await writeFile(path.join(out,`${key}-touch-trace.json`),JSON.stringify(await page.evaluate(()=>({trace:sheetTouchTrace,viewport:{scale:visualViewport.scale,top:visualViewport.offsetTop},handle:document.querySelector('#explore-panel>.sheet-handle').getBoundingClientRect().toJSON()})),null,2));
        assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'half','Top edge pull hands off to sheet');
        }else{
          // WebKit's public automation API has no native touch-drag injection.
          // Exercise the real pointer path; do not represent it as iPhone touch.
          await dragHandle(200,{pause:150});
        }
        await dragHandle(100,{cancel:true});assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'half','Cancel keeps committed snap');
        // Interrupt an in-flight settle with a reverse drag.
        const h=page.locator('#explore-panel > .sheet-handle');await h.press('Home');
        // Freeze a real in-flight animation at its midpoint so protocol latency
        // cannot move a 32px grip away between measuring and pointerdown.
        await page.locator('#explore-panel').evaluate(e=>e.getAnimations().forEach(a=>{a.pause();a.currentTime=80;}));
        await page.waitForTimeout(20);await dragHandle(300,{pause:150});
        assert.notEqual(await page.locator('#explore-panel').getAttribute('data-snap'),'expanded');
        await snap('half');
        assert.deepEqual(await page.locator('#maps').boundingBox(),mapBefore,'Map viewport does not resize on snap');
        // Mode/data render must preserve the captured DOM and map host.
        if(viewport.width===390&&theme==='light')await page.evaluate(()=>{const toggle=document.querySelector('#mobile-view-toggle');toggle.click();toggle.click();toggle.click();});
        else await page.locator('#mobile-view-toggle').click();
        await settle();
        assert.equal(await page.evaluate(old=>old.handle===document.querySelector('#explore-panel > .sheet-handle')&&old.content===document.querySelector('#explore-panel > .sheet-content')&&old.map===document.querySelector('#map-a'),original),true);
        await check(`${key}-state-3d`);
        await page.locator('#mobile-view-toggle').click();await settle();
        // Shared search drawer: normal typing, max scrolling and minimum handle.
        await page.locator('#mobile-search').click();
        await page.locator('#search-sheet [data-pane-place]').click();

        const libraryFirstRow=await page.locator('#place-list').evaluateHandle(e=>e.firstElementChild);
        const libraryGeometry=()=>page.locator('#place-library').evaluate(root=>{const h=root.querySelector('.drawer-top'),input=root.querySelector('input');return {headerHeight:h.getBoundingClientRect().height,inputOffset:Math.round(input.getBoundingClientRect().top-root.getBoundingClientRect().top)};});
        const compactLibrary=await libraryGeometry();
        await sheetGeometry('#place-library');
        await page.locator('#place-library>.sheet-handle').press('Home');await page.waitForTimeout(350);
        await sheetGeometry('#place-library');
        assert.deepEqual(await libraryGeometry(),compactLibrary,'Library content geometry must not jump at a snap threshold');
        assert.equal(await page.evaluate(old=>old===document.querySelector('#place-list').firstElementChild,libraryFirstRow),true,'Snapping must not replace recent states with another list');
        await page.locator('#place-library>.sheet-handle').press('End');await page.waitForTimeout(350);
        assert.equal(await page.locator('#place-library>.sheet-content').evaluate(e=>getComputedStyle(e).visibility),'visible','Minimum drawer keeps its title visible');
        assert.ok(await page.locator('#place-search').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=16,'Mobile search text is at least 16px');
        await page.locator('#place-library>.sheet-handle').press('Home');await page.waitForTimeout(350);await libraryFirstRow.dispose();
        await page.locator('#place-search').fill('San Francisco');
        await page.locator('#place-library [data-place="06075"]').click();await settle();
        await check(`${key}-county`);
        await snap('expanded');await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(60);
        await check(`${key}-county-scrolled`);
        // Resizing simulates toolbar/orientation viewport changes, separately from
        // real-device Safari checks which this test cannot claim.
        await page.setViewportSize({width:viewport.width,height:viewport.height-100});await page.waitForTimeout(400);
        assert.equal(await page.locator('#explore-panel').getAttribute('data-snap'),'expanded');await check(`${key}-resized`,false);
        await page.setViewportSize(viewport);await page.waitForTimeout(400);
        await page.emulateMedia({reducedMotion:'reduce'});await snap('min');await snap('expanded');
        assert.equal(await page.locator('#explore-panel').evaluate(e=>e.getAnimations().length),0,'Reduced motion settles without animation');
        await page.emulateMedia({reducedMotion:'no-preference'});
        await snap('half');await original.dispose();
      }else{
        await page.locator('.dimension-control [data-mode="3d"]').click();await settle();await check(`${key}-state-3d`);
        await page.locator('.dimension-control [data-mode="2d"]').click();await settle();
      }
      // Every applicable drawer shares its grip, snaps and fixed navigation.
      if(mobile){
        await snap('expanded');
        await page.locator('#explore-panel > .sheet-content').evaluate(e=>e.scrollTop=0);
        await page.locator('[data-open-rank="highest"]').click();
        const rankHandle=page.locator('#ranking-panel > .sheet-handle');
        await rankHandle.press('Home');await page.waitForTimeout(350);
        const rankIdentity=await rankHandle.elementHandle();
        await page.locator('#ranking-panel [data-rank="lowest"]').click();
        assert.equal(await page.evaluate(old=>old===document.querySelector('#ranking-panel > .sheet-handle'),rankIdentity),true,'Ranking refresh preserves handle');
        await rankHandle.press('End');await page.waitForTimeout(350);
        assert.equal(await page.locator('#ranking-panel').getAttribute('data-snap'),'min');
        await rankHandle.press('Home');await page.waitForTimeout(350);
        await page.locator('#ranking-panel [data-close]').first().click();
        await snap('expanded');
        await page.locator('#compare-place').click();await page.waitForTimeout(350);
        assert.equal(await page.locator('#comparison-setup-panel').getAttribute('data-snap'),'expanded');
        await sheetGeometry('#comparison-setup-panel');
        await page.locator('[data-comparison-change]').first().click();await page.waitForTimeout(150);
        const nested=page.locator('.comparison-place-list');
        await nested.evaluate(e=>e.scrollTop=500);
        if(engine==='chrome'){
          const r=await nested.boundingBox();await touchDrag(r.x+r.width/2,r.y+35,140);
          assert.ok(await nested.evaluate(e=>e.scrollTop)<500,'Downward swipe scrolls the nested list before moving the sheet');
          assert.equal(await page.locator('#comparison-setup-panel').getAttribute('data-snap'),'expanded','Nested scrolling keeps the sheet expanded');
        }
        assert.equal(await page.locator('.concept-tabs').evaluate(e=>e.inert),false,'Draft keeps navigation available');
        await page.locator('.concept-tabs [data-page="map"]').click();await settle();
        // Simulated orientation and insets exercise document geometry only.
        await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.setViewportSize(viewport);await page.waitForTimeout(400);
        await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-bottom','34px');document.documentElement.style.setProperty('--safe-top','59px');window.dispatchEvent(new Event('resize'));});
        await page.waitForTimeout(400);
        const safe=await page.evaluate(()=>({nav:document.querySelector('.concept-tabs').getBoundingClientRect().toJSON(),handle:document.querySelector('#explore-panel > .sheet-handle').getBoundingClientRect().toJSON(),control:document.querySelector('#info-open').getBoundingClientRect().toJSON()}));
        assert.equal(safe.nav.height,90);assert.equal(safe.nav.bottom,viewport.height);assert.ok(safe.control.top>=59);
        await page.evaluate(()=>{document.documentElement.style.removeProperty('--safe-bottom');document.documentElement.style.removeProperty('--safe-top');window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(400);
        results.push({name:`${key}-drawer-orientation-safe-area`,pass:true,safe,errors:[...errors]});
      }else{
        await page.locator('#explore-panel .place-chooser').click();
        await page.locator('#place-search').fill('San Francisco');
        await page.locator('#place-library [data-place="06075"]').click();await settle();
        await check(`${key}-county`,false);
      }
      for(const destination of ['compare','stats','blog']){
        await page.locator(`.concept-tabs [data-page="${destination}"]`).click();
        if(destination==='compare'){await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Compare entrance stays inside the viewport throughout motion');}
        await settle();await check(`${key}-${destination}`);
        if(destination==='compare'){
          if(mobile)await page.locator('#mobile-view-toggle').click();else await page.locator('.dimension-control [data-mode="3d"]').click();
          await settle();await check(`${key}-compare-3d`,false);
          if(mobile)await page.locator('#mobile-view-toggle').click();else await page.locator('.dimension-control [data-mode="2d"]').click();
          await settle();
        }
      }
      await page.locator('#support-open').click();await settle();await check(`${key}-support`);
      await page.locator('.concept-tabs [data-page="map"]').click();await settle();await check(`${key}-map-return`);
      await page.locator('#info-open').click();await settle();
      const beforeColor=await page.locator('meta[name="theme-color"]').getAttribute('content');
      await page.locator('#theme-toggle').click();await page.waitForTimeout(400);
      assert.notEqual(await page.locator('meta[name="theme-color"]').getAttribute('content'),beforeColor,'Browser chrome color follows the theme');
      await page.locator('#theme-toggle').click();await page.waitForTimeout(400);
      if(mobile&&engine==='chrome'){
        // Run the browser-owned pinch last: its compositor contacts must not
        // overlap the subsequent single-finger CDP handoff scenarios.
        await page.locator('.concept-tabs [data-page="map"]').click();await settle();await snap('expanded');
        const pinch=await context.newCDPSession(page);
        await pinch.send('Input.synthesizePinchGesture',{x:viewport.width/2,y:viewport.height*.5,scaleFactor:2,relativeSpeed:600,gestureSourceType:'touch'});
        await page.waitForFunction(()=>visualViewport.scale>1.5);
        assert.ok(await page.evaluate(()=>visualViewport.scale)>1.5,'Native touch pinch remains available inside sheet content');
        await page.waitForTimeout(600);await pinch.detach();
      }
      await context.close();
    }
  }
  console.log(`PASS: ${results.length} ${engine} states and sheet gesture/scroll/resize/reduced-motion assertions.`);
}finally{
  await browser.close();
  await writeFile(path.join(out,'browser-results.json'),JSON.stringify(results,null,2)+'\n');
  await writeFile(path.join(out,'browser-capabilities.json'),JSON.stringify({engine,nativeTouchDrag:engine==='chrome',physicalIPhone:false,limitation:engine==='webkit'?'WebKit desktop runtime with mobile viewport; native iPhone/Safari toolbar/touch not certified.':'Chrome CDP touch input does not certify iPhone Safari.'},null,2)+'\n');
}
