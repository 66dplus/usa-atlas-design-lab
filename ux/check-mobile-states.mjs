// Regressions from the owner's 24 October panel, chrome and attribution captures.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:4198';
const out=process.env.ATLAS_TEST_OUTPUT||'/tmp/usa-xray-mobile-states-20261024/states';
const engine=process.env.ATLAS_TEST_BROWSER||'chrome';
await mkdir(out,{recursive:true});
const browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'});
const results=[];
try {
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:1440,height:900}])for(const theme of ['light','dark']) {
    const mobile=viewport.width<=760,key=`${engine}-${viewport.width}-${theme}`;
    const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    async function settle() {
      await page.waitForFunction(()=>document.body.dataset.atlasStatus==='ready',null,{timeout:45000});
      await page.waitForFunction(()=>![...document.querySelectorAll('.map-host')].some(e=>['focusing','restoring'].includes(e.dataset.phase)));
      await page.waitForTimeout(400);
    }
    async function sample(name,capture=false) {
      const data=await page.evaluate(()=>{
        const box=e=>e.getBoundingClientRect().toJSON();
        const visible=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getBoundingClientRect().width>0;};
        const hit=e=>{const r=box(e);return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
        const attr=document.querySelector('.osm-attribution'),s=getComputedStyle(attr);
        const controls=[...document.querySelectorAll('#mobile-search,#support-open,#info-open,.dimension-control')];
        const picker=document.querySelector('#metric-library'),content=picker.querySelector('.sheet-content'),search=picker.querySelector('.search-field');
        return {
          page:document.body.dataset.page,overflow:document.documentElement.scrollWidth>innerWidth,
          loading:document.querySelector('#loading').hidden,scrollY,viewport:{height:innerHeight,visualHeight:visualViewport.height,offset:visualViewport.offsetTop},
          controls:controls.map(e=>({id:e.id||e.className,visible:visible(e),rect:box(e),hit:hit(e),position:getComputedStyle(e).position})),
          attribution:{rect:box(attr),visible:visible(attr),hit:hit(attr),href:attr.href,style:{fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,borderRadius:s.borderRadius,opacity:s.opacity,position:s.position}},
          picker:picker.hidden?null:{snap:picker.dataset.snap,padding:getComputedStyle(picker).padding,contentPadding:getComputedStyle(content).padding,searchX:box(search).x,searchWidth:box(search).width},
          nav:[document.querySelector('.concept-tabs'),...document.querySelectorAll('.concept-tabs button,.nav-pill')].map(e=>({radius:getComputedStyle(e).borderRadius,rect:box(e)}))
        };
      });
      assert.equal(data.overflow,false,`${name}: overflow`);
      assert.equal(data.loading,true,`${name}: loading`);
      assert.deepEqual(errors,[],`${name}: errors`);
      if(mobile) {
        for(const c of data.controls) {
          if(['map','compare'].includes(data.page))assert.equal(c.visible,true,`${name}: ${c.id} stays visible`);
          if(c.visible){assert.equal(c.rect.top,8,`${name}: ${c.id} stays at the available top edge`);assert.equal(c.hit,true,`${name}: ${c.id} is reachable`);}
        }
        if(data.picker){assert.equal(data.picker.padding,'0px',`${name}: sheet root has no second inset`);assert.equal(data.picker.contentPadding,'0px 20px 24px');assert.equal(data.picker.searchX,21);assert.equal(data.picker.searchWidth,viewport.width-42);}
        assert.equal(data.nav[0].radius,'0px',`${name}: mobile web menu has square outside edges`);
        assert.ok(data.nav.slice(1).every(e=>e.radius==='28px'),`${name}: mobile menu items retain their rounded shape`);
      }
      if(mobile&&['map','compare'].includes(data.page)) {
        assert.deepEqual(data.attribution.style,{fontSize:'10px',lineHeight:'14px',padding:'3px 7px',borderRadius:'4px',opacity:'1',position:'fixed'},`${name}: stable attribution treatment`);
        assert.equal(data.attribution.visible,true,`${name}: attribution visible`);
        assert.equal(data.attribution.hit,true,`${name}: attribution link reachable`);
        assert.equal(data.attribution.href,'https://www.openstreetmap.org/copyright');
        assert.ok(data.attribution.rect.width<180,`${name}: compact attribution`);
      }
      const screenshot=capture?`${out}/${key}-${name}.png`:null;
      if(screenshot)await page.screenshot({path:screenshot});
      results.push({key,name,...data,screenshot,errors:[...errors]});
    }
    async function snap(selector,name) {
      const h=page.locator(`${selector}>.sheet-handle`);
      await h.press(name==='min'?'End':'Home');
      if(name==='half')await h.press('ArrowDown');
      for(const delay of [30,70,220]){await page.waitForTimeout(delay);await sample(`${selector.slice(1)}-${name}-motion-${delay}`);}
    }
    try {
      await page.goto(`${base}/ux/?place=06&view=2d&theme=${theme}`,{waitUntil:'domcontentloaded'});await settle();await sample('state-half',true);
      if(mobile) {
        await snap('#explore-panel','expanded');await sample('state-expanded',true);
        await page.locator('#explore-panel>.sheet-content').evaluate(e=>e.scrollTop=e.scrollHeight);await sample('state-scrolled',true);
        await snap('#explore-panel','min');
        await page.locator('#mobile-search').click();await page.waitForTimeout(350);await sample('search-half',true);
        await snap('#search-sheet','expanded');await sample('search-expanded',true);
        await page.locator('#search-sheet [data-pane-metric]').click();await page.waitForTimeout(350);await sample('indicator-half',true);
        for(const name of ['expanded','min','half','expanded'])await snap('#metric-library',name);
        await page.locator('#metric-library>.sheet-content').evaluate(e=>e.scrollTop=400);await sample('indicator-scrolled',true);
        await page.locator('#metric-search').focus();await sample('indicator-focused');
        for(const height of [viewport.height-100,viewport.height-180,viewport.height]){await page.setViewportSize({width:viewport.width,height});await page.waitForTimeout(400);await sample(`available-height-${height}`,true);}
        await page.locator('#metric-search').blur();
        await page.locator('#metric-library>.sheet-content').evaluate(e=>e.scrollTop=0);
        await page.locator('#metric-library [data-close]').click();
      }
      await page.goto(`${base}/ux/?place=06075&view=2d&theme=${theme}`,{waitUntil:'domcontentloaded'});await settle();await sample('county',true);
      if(mobile){await snap('#explore-panel','expanded');await page.locator('#explore-panel>.sheet-content').evaluate(e=>e.scrollTop=300);await sample('county-scrolled',true);}
      await page.locator('.concept-tabs [data-page="compare"]').click();await settle();await sample('compare',true);
      if(mobile){await page.locator('#mobile-search').click();await page.waitForTimeout(350);await sample('compare-search',true);await page.locator('#search-sheet [data-pane-metric]').click();await page.waitForTimeout(350);await snap('#metric-library','expanded');await sample('compare-indicator',true);await page.locator('#metric-library [data-close]').click();}
      await page.locator('.concept-tabs [data-page="stats"]').click();await settle();await sample('stats',true);
      await page.locator('#support-open').click();await settle();await sample('support',true);
    } finally {await context.close();}
  }
  console.log(`PASS: ${results.length} ${engine} panel/chrome/attribution computed-style samples.`);
} finally {await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');}
