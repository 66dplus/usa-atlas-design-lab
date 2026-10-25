// Approved Compare 01 and the single responsive copyright-link owner.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:4198';
const out=process.env.ATLAS_TEST_OUTPUT||'/tmp/usa-xray-compare-release-20261024/compare';
const engine=process.env.ATLAS_TEST_BROWSER||'chrome';
await mkdir(out,{recursive:true});
const browser=engine==='webkit'?await webkit.launch():await chromium.launch({channel:'chrome'}),results=[];
try {
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:1440,height:900},{width:1440,height:640}].filter(v=>!process.env.ATLAS_TEST_WIDTH||v.width===Number(process.env.ATLAS_TEST_WIDTH)))for(const theme of ['light','dark'].filter(t=>!process.env.ATLAS_TEST_THEME||t===process.env.ATLAS_TEST_THEME)){
    const mobile=viewport.width<=760,key=`${engine}-${viewport.width}-${theme}`;
    const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    async function settle(){
      await page.waitForFunction(()=>document.body.dataset.atlasStatus==='ready',null,{timeout:45000});
      await page.waitForFunction(()=>!['map','compare'].includes(document.body.dataset.page)||document.body.dataset.concept===(document.body.dataset.page==='compare'?'compare':'explorer'));
      await page.waitForFunction(()=>![...document.querySelectorAll('.map-host')].some(e=>['focusing','restoring'].includes(e.dataset.phase)||e.dataset.terrainStatus==='building'));
      await page.waitForFunction(()=>![...document.querySelectorAll('.geo-svg')].some(e=>d3.active(e))&&!document.querySelector('#maps').getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect.getTiming().iterations!==Infinity));
      await page.waitForTimeout(350);
    }
    async function check(name){
      const data=await page.evaluate(()=>{
        const box=e=>e.getBoundingClientRect().toJSON(),visible=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getBoundingClientRect().width>0;};
        const hit=e=>{const r=box(e);return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
        const a=document.querySelector('.osm-attribution'),parent=a.parentElement,frame=a.closest('.desktop-compare-card,.indicator-legend,.sheet-map-footer')||parent,source=frame.querySelector('.indicator-legend-source');
        return {count:document.querySelectorAll('.osm-attribution').length,overflow:document.documentElement.scrollWidth>innerWidth,loadingHidden:document.querySelector('#loading').hidden,
          compareDataButton:!!document.querySelector('#compare-data-open'),page:document.body.dataset.page,mode:document.body.dataset.view,viewport:{width:innerWidth,height:innerHeight},
          attribution:{parent:parent.id||parent.className,body:parent===document.body,placement:a.dataset.placement,position:getComputedStyle(a).position,fontSize:getComputedStyle(a).fontSize,visible:visible(a),hit:hit(a),rect:box(a),frame:box(frame),sharedCompare:frame.matches('.desktop-compare-card'),source:source?box(source):null},
          desktopCompare:(()=>{const card=document.querySelector('#desktop-compare-card');if(!visible(card))return null;const row=card.querySelector('.desktop-compare-source-row'),source=row.querySelector('.indicator-legend-source'),ramp=card.querySelector('.desktop-compare-ramp');return {rect:box(card),workspace:box(document.querySelector('.map-workspace')),footer:box(row),footerPosition:getComputedStyle(row).position,ramp:box(ramp),sourceReachable:hit(source),places:[...card.querySelectorAll('.desktop-compare-place')].map(place=>{const metric=place.querySelector('.desktop-compare-value button'),value=place.querySelector('.desktop-compare-value strong');return {metric:box(metric),value:box(value),valueReachable:hit(metric),nameReachable:hit(place.querySelector('.desktop-compare-name'))};})};})(),
          panes:[...document.querySelectorAll('.map-pane')].filter(visible).map(pane=>{const host=pane.querySelector('.map-host'),heading=pane.querySelector('.pane-heading'),value=pane.querySelector('.map-summary strong'),button=pane.querySelector('.map-summary'),label=[...pane.querySelectorAll('.field-value')].find(visible);return {rect:box(pane),map:box(host),heading:box(heading),label:label?{rect:box(label),color:getComputedStyle(label).color}:null,value:{rect:box(value),color:getComputedStyle(value).color,fontSize:getComputedStyle(value).fontSize,text:value.textContent},valueButton:box(button),valueReachable:hit(button),footer:visible(pane.querySelector('.pane-footer')),card:box(pane.querySelector('.compare-map-card')),metric:box(pane.querySelector('.metric-field')),ramp:box(pane.querySelector('.color-ramp')),sourceReachable:hit(pane.querySelector('.indicator-legend-source')),meshes:Number(host.dataset.terrainStateCount)};})};
      });
      await writeFile(`${out}/${key}-${name}-geometry.json`,JSON.stringify(data,null,2));
      assert.deepEqual(errors,[],`${name}: console/page errors`);assert.equal(data.count,1,`${name}: exactly one copyright link`);assert.equal(data.overflow,false);assert.equal(data.loadingHidden,true);
      assert.equal(data.attribution.visible,true,`${name}: credit visible`);assert.equal(data.attribution.hit,true,`${name}: credit reachable`);
      if(data.viewport.width<=760){assert.equal(data.attribution.body,true);assert.equal(data.attribution.position,'fixed');assert.equal(data.attribution.rect.top,56);assert.equal(data.attribution.fontSize,'8px');}
      else {
        assert.equal(data.attribution.placement,'source');assert.equal(data.attribution.position,'static');
        assert.ok(data.attribution.source,`${name}: source resolves in the canonical attribution frame`);
        if(data.attribution.sharedCompare)assert.ok(data.attribution.rect.left>=data.attribution.source.right,`${name}: shared Compare credit and source do not overlap`);
        else assert.ok(data.attribution.rect.top>=data.attribution.source.bottom,`${name}: OSM is below Source & method`);
        assert.ok(data.attribution.rect.bottom<=data.attribution.frame.bottom&&data.attribution.rect.left>=data.attribution.frame.left,`${name}: credit stays inside the frame`);
      }
      assert.equal(data.compareDataButton,false,'Compare data trigger removed');
      if(!mobile&&data.page==='compare'){
        const card=data.desktopCompare;assert.ok(card,'Canonical shared Desktop comparison card is visible');
        assert.equal(card.workspace.bottom-card.rect.bottom,10,'Shared card keeps the accepted lower map inset');
        assert.ok(card.rect.height<160,'Place, observation and sources stay compact');
        assert.equal(card.places.length,2);
        for(const place of card.places){
          assert.ok(Math.abs(place.metric.y+place.metric.height/2-place.value.y-place.value.height/2)<1,'Observation shares the indicator row');
          assert.ok(place.value.left>=place.metric.right,'Indicator and observation never overlap');
          assert.equal(place.valueReachable,true);assert.equal(place.nameReachable,true);
        }
        assert.equal(card.ramp.height,4,'Shared card keeps the accepted compact 4px colour key');
        assert.ok(card.ramp.width>0&&card.ramp.left>=card.rect.left&&card.ramp.right<=card.rect.right,'Colour key fits the canonical shared card');
        assert.equal(card.sourceReachable,true);assert.equal(card.footerPosition,'static');
        assert.ok(card.footer.top>=card.rect.top&&card.footer.bottom<=card.rect.bottom&&card.footer.left>=card.rect.left&&card.footer.right<=card.rect.right,'Shared source footer stays inside the card');
      }
      if(mobile&&data.page==='compare'){
        assert.equal(data.panes.length,2);assert.ok(Math.abs(data.panes[0].rect.height-data.panes[1].rect.height)<=1,'Equal map halves');
        for(const pane of data.panes){
          assert.ok(Math.abs(pane.map.height-pane.rect.height)<=1,'Map fills the pane inside its 1px divider');assert.equal(pane.map.width,pane.rect.width);assert.equal(pane.footer,false,'No BLS/legend row in the map composition');
          assert.equal(pane.label.color,'rgb(255, 255, 255)');assert.equal(pane.value.color,'rgb(255, 255, 255)');assert.equal(pane.valueReachable,true);
          assert.ok(pane.value.rect.right<=data.viewport.width&&pane.value.rect.left>=pane.heading.right,`${name}: names and full values do not overlap`);
          if(data.mode==='3d')assert.equal(pane.meshes,51);
        }
      }
      await page.evaluate(()=>document.activeElement?.blur());const screenshot=`${out}/${key}-${name}.png`;await page.screenshot({path:screenshot});results.push({name,key,...data,screenshot,errors:[...errors]});
    }
    try{
      await page.goto(`${base}/ux/?place=06&other=48&view=2d&theme=${theme}`,{waitUntil:'domcontentloaded'});await settle();await check('map-source');
      const original=await page.locator('.osm-attribution').elementHandle();
      await page.locator('.concept-tabs [data-page="compare"]').click();await settle();await check('compare-2d');
      if(mobile)await page.locator('#mobile-view-toggle').click();else await page.locator('[data-mode="3d"]').click();await settle();await check('compare-3d');
      if(!mobile){await page.locator('[data-compare=metrics]').click();await settle();await check('compare-two-indicators');await page.locator('[data-compare=places]').click();await settle();}
      if(mobile){await page.locator('#summary-a').click();await page.waitForTimeout(350);assert.equal(await page.locator('#inspector').isVisible(),true,'Percentage still opens place statistics');await page.keyboard.press('Escape');await settle();}
      await page.locator('.concept-tabs [data-page="map"]').click();await settle();await check('map-return');
      assert.equal(await page.evaluate(a=>a===document.querySelector('.osm-attribution'),original),true,'Renders preserve the unique copyright node');
      if(!mobile){
        await page.setViewportSize({width:390,height:844});await settle();await check('mobile-breakpoint');
        await page.setViewportSize(viewport);await settle();await check('desktop-breakpoint-return');
      }
    }finally{await context.close();}
  }
  console.log(`PASS: ${results.length} ${engine} selected-Compare and responsive copyright checks.`);
}finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');}
