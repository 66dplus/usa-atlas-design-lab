import html2canvas from '../node_modules/html2canvas/dist/html2canvas.esm.js';

const ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h6"/></svg>';
const CLOSE='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const rectJSON=r=>({x:r.x,y:r.y,width:r.width,height:r.height});

// Explicit component ownership, ordered from specific controls to their containing surface.
const OWNERS=[
 ['#view-settings-panel','view-settings'],['#view-settings-open','view-settings'],['.focus-caption','focus-controls'],['.camera-tools','camera-controls'],['.dimension-control','view-controls'],['.concept-tabs','concept-tabs'],
 ['[data-pane-metric]','metric-select'],['#metric-button','metric-select'],['#share','share'],['[data-pane-place]','place-search'],['#find-place','place-search'],
 ['#metric-library','metric-library'],['#place-library','place-library'],['#breadcrumbs','breadcrumbs'],
 ['#region-jumps','region-jumps'],['#inspector','inspector'],['.map-summary','inspector'],['.pane-heading','comparison'],
 ['#compare-toolbar','comparison'],['#compare-results','comparison'],['#compare-data-open','comparison'],['#story-rail','stories'],['#stories-open','stories'],
 ['#explore-panel','place-profile'],['#quick-stats','quick-stats'],['#ranking-panel','rankings'],['#saved-panel','saved'],['#saved-open','saved'],['#surprise-panel','surprise'],['.surprise-bar','surprise'],
 ['.map-footer','legend'],['.app-header','shell'],['.map-intro','shell']
];

function elementSelector(element){
  const parts=[];
  for(let node=element;node&&node!==document.body;node=node.parentElement){
    if(node.id){parts.unshift('#'+CSS.escape(node.id));break;}
    let part=node.localName;
    const stable=[...node.attributes].find(a=>/^data-(geo|mode|metric|place|camera|concept|inspect-metric|pane-place|pane-metric|story|compare)$/.test(a.name));
    if(stable)part+=`[${stable.name}="${CSS.escape(stable.value)}"]`;
    else if(node.parentElement){const siblings=[...node.parentElement.children].filter(n=>n.localName===node.localName);if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(node)+1})`;}
    parts.unshift(part);
  }
  return parts.join(' > ').slice(0,1500)||'body';
}

function identifyTarget(element){
  const target=element.closest('button,a,input,summary,[data-geo]')||element;
  const map=target.closest('.map-host');
  const owner=map?[map.dataset.renderer==='webgl'?'.geo-flat-canvas':map.dataset.mode==='2d'?'.geo-svg':'.geo-canvas',map.dataset.renderer==='webgl'?'map-webgl-2d':'map-'+(map.dataset.renderMode||map.dataset.mode)]:OWNERS.find(([selector])=>target.closest(selector))||['body','shell'];
  return {component:owner[1],styleSelector:owner[0],selector:elementSelector(target),tag:target.localName,
    label:(target.getAttribute('aria-label')||target.innerText||target.textContent||'').trim().slice(0,300),
    bounds:rectJSON(target.getBoundingClientRect()),geo:target.closest('[data-geo]')?.dataset.geo||null};
}

export function initFeedback({getContext,onStart=()=>{}}){
  const root=document.createElement('div');root.id='feedback-root';root.setAttribute('data-html2canvas-ignore','');
  root.innerHTML=`<div class="feedback-launcher"><button id="feedback-add">${ICON}<span>Comment</span></button><button id="feedback-show" aria-label="Saved comments">All <span id="feedback-count">0</span></button></div>
    <div id="feedback-stage" hidden role="dialog" aria-modal="true" aria-label="Prototype comment" tabindex="-1">
      <img id="feedback-frozen" alt="Frozen prototype view" hidden>
      <div id="feedback-pick" tabindex="0" aria-label="Point at a place: mouse or arrow keys and Enter"></div>
      <div id="feedback-hint"><span id="feedback-hint-text">Click the place you want to discuss</span><button id="feedback-cancel-top">Cancel · Esc</button></div>
      <div id="feedback-crosshair" aria-hidden="true" hidden></div>
      <div id="feedback-region" hidden aria-label="Snapshot area"><span id="feedback-region-size"></span>${['nw','ne','sw','se'].map(c=>`<span class="feedback-handle" data-corner="${c}" aria-hidden="true"></span>`).join('')}</div>
      <div id="feedback-pin" aria-hidden="true" hidden></div>
      <form id="feedback-editor" hidden><div class="feedback-panel-heading"><h2>What should change?</h2><button type="button" id="feedback-cancel" aria-label="Cancel comment">${CLOSE}</button></div>
        <p class="feedback-help">Drag the frame or its corners. The point marks where you pointed.</p>
        <div class="feedback-dimensions"><label>Width<input id="feedback-width" type="number" min="80" step="1"></label><label>Height<input id="feedback-height" type="number" min="80" step="1"></label><button type="button" id="feedback-reset">480 × 320</button></div>
        <canvas id="feedback-preview" aria-label="Snapshot that will be saved"></canvas>
        <label class="feedback-text-label" for="feedback-text">Comment</label><textarea id="feedback-text" rows="3" maxlength="10000" placeholder="For example: choosing an indicator is awkward here…" required></textarea>
        <p id="feedback-anchor"></p><p id="feedback-error" role="alert" hidden></p>
        <div class="feedback-form-actions"><button type="button" id="feedback-repick">Another point</button><button id="feedback-save" type="submit">Save</button></div>
      </form>
    </div>
    <aside id="feedback-list-panel" hidden aria-label="Saved comments"><div class="feedback-panel-heading"><h2>Comments <span id="feedback-list-count"></span></h2><button id="feedback-list-close" aria-label="Close comments">${CLOSE}</button></div><p class="feedback-help">Saved in the project folder with the snapshot and the code anchor.</p><div id="feedback-list"></div></aside>
    <div id="feedback-status" role="status" hidden></div>`;
  document.body.append(root);
  const $=id=>root.querySelector('#'+id);
  let phase='idle',draft,bitmap,records=[],inertState=[],focusBefore,operation=0,drag,payload,overflowBefore;

  function status(text){$('feedback-status').textContent=text;$('feedback-status').hidden=false;}
  function error(text){$('feedback-error').textContent=text;$('feedback-error').hidden=!text;}
  function lock(){
    overflowBefore=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
    inertState=[...document.body.children].filter(el=>el!==root).map(el=>[el,el.inert]);
    inertState.forEach(([el])=>el.inert=true);
    root.querySelector('.feedback-launcher').inert=true;
  }
  function unlock(){document.documentElement.style.overflow=overflowBefore||'';inertState.forEach(([el,value])=>el.inert=value);inertState=[];root.querySelector('.feedback-launcher').inert=false;}
  function close(){
    if(phase==='saving')return;
    operation++;phase='idle';bitmap=null;draft=null;payload=null;drag=null;
    $('feedback-stage').hidden=true;unlock();focusBefore?.focus();
  }
  function begin(keepText=false){
    onStart();
    const text=keepText?$('feedback-text').value:'';
    if(phase==='idle'){focusBefore=document.activeElement;lock();}
    operation++;phase='picking';bitmap=null;payload=null;
    draft={id:crypto.randomUUID(),viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY,dpr:devicePixelRatio},point:{x:innerWidth/2,y:innerHeight/2}};
    $('feedback-list-panel').hidden=true;$('feedback-status').hidden=true;
    $('feedback-stage').hidden=false;$('feedback-pick').hidden=false;$('feedback-frozen').hidden=true;
    $('feedback-editor').hidden=true;$('feedback-region').hidden=true;$('feedback-pin').hidden=true;
    $('feedback-crosshair').hidden=false;$('feedback-hint').hidden=false;
    $('feedback-hint-text').textContent='Point with the mouse or arrow keys and Enter';
    $('feedback-text').value=text;moveCrosshair();$('feedback-pick').focus();
  }
  function moveCrosshair(){Object.assign($('feedback-crosshair').style,{left:draft.point.x+'px',top:draft.point.y+'px'});}
  async function selectPoint(point){
    if(phase!=='picking')return;
    // Inert suppresses hit testing as well as focus. Restore it only for this synchronous read;
    // the full-screen picking layer still intercepts all pointer events.
    inertState.forEach(([el,value])=>el.inert=value);
    try{
      const element=document.elementsFromPoint(point.x,point.y).find(el=>!root.contains(el)&&el!==document.documentElement);
      if(!element)return;
      draft.point=point;draft.target=identifyTarget(element);draft.context={url:location.href,...getContext(point)};
    }finally{inertState.forEach(([el])=>el.inert=true);}
    phase='capturing';const token=++operation;
    $('feedback-hint-text').textContent='Preparing the snapshot…';$('feedback-crosshair').hidden=true;
    try{
      await document.fonts.ready;
      const captured=await html2canvas(document.body,{logging:false,scale:Math.min(devicePixelRatio,2),x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,windowWidth:innerWidth,windowHeight:innerHeight,scrollX,scrollY,useCORS:true,backgroundColor:getComputedStyle(document.body).getPropertyValue('--bg').trim(),
        ignoreElements:el=>el===root||el.classList?.contains('map-hover')||(el.classList?.contains('geo-svg')&&getComputedStyle(el).display==='none')});
      if(token!==operation)return;
      bitmap=captured;phase='editing';$('feedback-frozen').src=bitmap.toDataURL('image/png');$('feedback-frozen').hidden=false;
      $('feedback-pick').hidden=true;$('feedback-hint').hidden=true;
      $('feedback-editor').hidden=false;$('feedback-region').hidden=false;$('feedback-pin').hidden=false;
      $('feedback-editor').classList.toggle('on-left',point.x>innerWidth/2);
      $('feedback-anchor').textContent='Anchored: '+(draft.target.label||draft.target.selector).slice(0,90);
      $('feedback-width').max=innerWidth;$('feedback-height').max=innerHeight;
      error('');resetRegion();$('feedback-text').focus();
    }catch(e){if(token!==operation)return;phase='picking';$('feedback-hint-text').textContent='The snapshot failed. Point again or cancel.';$('feedback-pick').focus();}
  }
  function constrain(r){
    const v=draft.viewport,p=draft.point;
    r.width=clamp(r.width,Math.min(80,v.width),v.width);r.height=clamp(r.height,Math.min(80,v.height),v.height);
    r.x=clamp(r.x,Math.max(0,p.x-r.width),Math.min(p.x,v.width-r.width));
    r.y=clamp(r.y,Math.max(0,p.y-r.height),Math.min(p.y,v.height-r.height));
    const rounded=Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v)]));
    rounded.x=clamp(rounded.x,Math.max(0,Math.ceil(p.x-rounded.width)),Math.min(Math.floor(p.x),v.width-rounded.width));
    rounded.y=clamp(rounded.y,Math.max(0,Math.ceil(p.y-rounded.height)),Math.min(Math.floor(p.y),v.height-rounded.height));
    return rounded;
  }
  function resetRegion(){const p=draft.point;draft.region=constrain({x:p.x-240,y:p.y-160,width:480,height:320});drawRegion();}
  function drawRegion(syncInputs=true){
    const r=draft.region,p=draft.point;
    Object.assign($('feedback-region').style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
    Object.assign($('feedback-pin').style,{left:p.x+'px',top:p.y+'px'});
    $('feedback-region-size').textContent=`${r.width} × ${r.height}`;
    if(syncInputs){$('feedback-width').value=r.width;$('feedback-height').value=r.height;}
    const canvas=$('feedback-preview'),scale=bitmap.width/draft.viewport.width;
    canvas.width=Math.round(r.width*scale);canvas.height=Math.round(r.height*scale);
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,r.x*scale,r.y*scale,r.width*scale,r.height*scale,0,0,canvas.width,canvas.height);
    const x=(p.x-r.x)*scale,y=(p.y-r.y)*scale;
    ctx.beginPath();ctx.arc(x,y,7*scale,0,Math.PI*2);ctx.fillStyle='#742e51';ctx.fill();ctx.lineWidth=3*scale;ctx.strokeStyle='#fff';ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,2*scale,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
  }
  function setBusy(busy){
    $('feedback-editor').querySelectorAll('button,input,textarea').forEach(el=>el.disabled=busy);
    $('feedback-save').textContent=busy?'Saving…':'Save';
    $('feedback-region').style.pointerEvents=busy?'none':'';
  }
  async function save(event){
    event.preventDefault();if(phase!=='editing'||!$('feedback-text').value.trim())return;
    draft.region=constrain({...draft.region,width:Number($('feedback-width').value)||draft.region.width,height:Number($('feedback-height').value)||draft.region.height});drawRegion();
    // Preserve the exact payload after an uncertain response: retry cannot create a second record.
    const next={id:draft.id,text:$('feedback-text').value.trim(),image:$('feedback-preview').toDataURL('image/png'),target:draft.target,context:draft.context,viewport:draft.viewport,point:draft.point,region:draft.region};
    if(payload&&JSON.stringify({...next,id:payload.id})!==JSON.stringify(payload)){next.id=crypto.randomUUID();draft.id=next.id;}
    payload=next;phase='saving';setBusy(true);error('');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      if(!response.ok)throw new Error('Save failed');
      const result=await response.json();if(result.comment?.id!==draft.id)throw new Error('Save was not acknowledged');
      phase='editing';setBusy(false);close();
      status('Comment saved to the project.');await showList(result.comment.id);
    }catch(e){phase='editing';setBusy(false);error('Could not save. The text and snapshot stayed here — try again.');}
    finally{clearTimeout(timeout);}
  }
  function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function displayRecords(expanded){
    const list=$('feedback-list');list.replaceChildren();$('feedback-count').textContent=records.length;$('feedback-list-count').textContent=records.length;
    if(!records.length){list.append(node('p','Your notes will appear here. Press Comment, point at a place, then save the text with its snapshot.','feedback-empty'));return;}
    for(const record of records){
      const details=node('details',undefined,'feedback-record');details.open=record.id===expanded;
      const summary=node('summary');summary.append(node('strong',record.text.slice(0,110)),node('small',new Date(record.createdAt).toLocaleString('ru-RU')));details.append(summary);
      const image=document.createElement('img');image.src='/api/feedback/'+record.id+'/capture.png';image.alt='Area marked in the comment';image.loading='lazy';details.append(image,node('p',record.text,'feedback-saved-text'));
      const link=node('a','Open this map view');link.href=record.context.url;details.append(link);
      const code=node('details',undefined,'feedback-code');code.append(node('summary','Code anchor'),node('code',record.target.selector));
      record.sources.forEach(source=>code.append(node('p',`${source.file}:${source.line}\n${source.symbol}\n${source.sha256.slice(0,12)}`)));
      details.append(code);list.append(details);
    }
  }
  async function refreshRecords(){
    const response=await fetch('/api/feedback',{cache:'no-store'});if(!response.ok)throw new Error('Read failed');
    records=(await response.json()).comments;$('feedback-count').textContent=records.length;
  }
  async function showList(expanded){
    $('feedback-list-panel').hidden=false;$('feedback-list').textContent='Loading comments…';
    try{await refreshRecords();displayRecords(expanded);}catch{$('feedback-list').textContent='Could not load comments. Close the panel and try again.';}
    $('feedback-list-close').focus();
  }
  root.addEventListener('click',event=>event.stopPropagation());
  $('feedback-add').onclick=()=>begin();$('feedback-show').onclick=()=>showList();
  $('feedback-list-close').onclick=()=>{$('feedback-list-panel').hidden=true;$('feedback-show').focus();};
  for(const id of ['feedback-cancel','feedback-cancel-top'])$(id).onclick=close;
  $('feedback-repick').onclick=()=>begin(true);$('feedback-reset').onclick=resetRegion;
  $('feedback-editor').onsubmit=save;
  for(const [id,key] of [['feedback-width','width'],['feedback-height','height']]){
    $(id).oninput=()=>{if(!$(id).value)return;draft.region=constrain({...draft.region,[key]:Number($(id).value)||80});drawRegion(false);};
    $(id).onchange=()=>drawRegion();
  }
  $('feedback-pick').onpointermove=event=>{if(phase==='picking'){draft.point={x:event.clientX,y:event.clientY};moveCrosshair();}};
  $('feedback-pick').onpointerdown=event=>{event.preventDefault();selectPoint({x:event.clientX,y:event.clientY});};
  $('feedback-region').onpointerdown=event=>{
    if(phase!=='editing')return;event.preventDefault();
    drag={x:event.clientX,y:event.clientY,rect:{...draft.region},corner:event.target.dataset.corner};
    $('feedback-region').setPointerCapture(event.pointerId);
  };
  $('feedback-region').onpointermove=event=>{
    if(!drag)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y,r={...drag.rect},c=drag.corner;
    if(!c){r.x+=dx;r.y+=dy;}
    else{if(c.includes('e'))r.width+=dx;else{r.x+=dx;r.width-=dx;}if(c.includes('s'))r.height+=dy;else{r.y+=dy;r.height-=dy;}}
    draft.region=constrain(r);drawRegion();
  };
  $('feedback-region').onpointerup=$('feedback-region').onpointercancel=()=>drag=null;
  document.addEventListener('keydown',event=>{
    if(phase==='idle')return;
    if(event.key==='Tab'){
      const focusable=[...$('feedback-stage').querySelectorAll('button,input,textarea,[tabindex]')].filter(el=>!el.disabled&&el.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
    if(phase==='picking'){
      if(event.key==='Enter'){event.preventDefault();selectPoint(draft.point);}
      if(event.key.startsWith('Arrow')){event.preventDefault();const step=event.shiftKey?50:10;const p=draft.point;p.x=clamp(p.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),0,innerWidth-1);p.y=clamp(p.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0),0,innerHeight-1);moveCrosshair();}
    }
  },true);
  window.addEventListener('resize',()=>{if(!['idle','saving'].includes(phase)){begin(true);$('feedback-hint-text').textContent='The window changed. The text is kept — point at the area again.';}});
  refreshRecords().catch(()=>{$('feedback-count').textContent='—';});
}
