import {studioIcon} from './icons.js';
import {exampleImage,isTargeted} from './creative.js';
import {catalogSnapshot} from './snapshot/catalog.js';
const $=selector=>document.querySelector(selector);
document.querySelectorAll('[data-icon]').forEach(node=>{node.innerHTML=studioIcon(node.dataset.icon);});
let catalog=[],image=exampleImage,imageVersion=0,delivery=false,sending=false;
let requestId=crypto.randomUUID(),requestFingerprint='',toastTimer;
const selected=new Set(['unemployment--03-06-employment','unemployment']);
const preview={device:'desktop',mode:'2d',place:'06',metric:'unemployment',paused:false};
const tabs=[...document.querySelectorAll('[data-tab]')];

function activateTab(name,focus=false){
  for(const button of tabs){
    const active=button.dataset.tab===name;
    button.setAttribute('aria-selected',active);button.tabIndex=active?0:-1;
    $('#panel-'+button.dataset.tab).hidden=!active;
    if(active&&focus)button.focus();
  }
  $('.inspector-scroll').scrollTop=0;
}
for(const button of tabs){
  button.onclick=()=>activateTab(button.dataset.tab);
  button.onkeydown=event=>{
    const index=tabs.indexOf(button);
    const target=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
    if(target!==null){event.preventDefault();activateTab(tabs[target].dataset.tab,true);}
  };
}
$('#review-request').onclick=()=>{activateTab('request');$('#contact-name').focus();};
$('#placement-shortcut').onclick=()=>activateTab('placement',true);
function notify(message){
  clearTimeout(toastTimer);$('#studio-status').textContent=message;$('#studio-status').hidden=false;
  toastTimer=setTimeout(()=>{$('#studio-status').hidden=true;},5000);
}
function adState(){
  return {format:$('#ad-form').elements.format.value,headline:$('#ad-headline').value.trim(),subtitle:$('#ad-subtitle').value.trim(),cta:$('#ad-cta').value.trim(),url:$('#ad-url').value.trim(),theme:$('#ad-theme').value,image,imageArea:+$('#image-area').value,imageZoom:+$('#image-zoom').value,imagePosition:+$('#image-position').value,speed:$('#ticker-speed').value,paused:preview.paused,indicators:[...selected],devices:['desktop','mobile'].filter(device=>$('#target-'+device).checked)};
}
function update(){
  const ad=adState(),banner=ad.format==='banner';
  $('#image-controls').hidden=!banner;$('#subtitle-field').hidden=!banner;$('#ticker-speed-field').hidden=banner;$('#pause-preview').hidden=banner;
  $('#headline-count').textContent=ad.headline.length+' / 70';$('#subtitle-count').textContent=ad.subtitle.length+' / 140';
  $('#area-value').textContent=ad.imageArea+'%';$('#zoom-value').textContent=ad.imageZoom+'%';$('#crop-value').textContent=ad.imagePosition+'%';
  const show=isTargeted(ad,preview.device,preview.metric),metric=catalog.find(m=>m.id===preview.metric);
  $('#placement-status').textContent=show?`${banner?'Your banner':'Scrolling text'} · ${preview.device} placement`:'Ad hidden · '+(!ad.devices.includes(preview.device)?'device':'indicator')+' outside your selection';
  $('#placement-status').classList.toggle('inactive',!show);
  $('#target-summary').textContent=`${selected.size} indicator${selected.size===1?'':'s'} · ${ad.devices.length?ad.devices.map(d=>d==='desktop'?'Desktop':'Mobile').join(' + '):'No devices'}`;
  const summary=$('#request-summary');summary.replaceChildren();
  const title=document.createElement('b');title.textContent=ad.headline||'Add a headline';summary.append(title);
  const detail=document.createElement('small');detail.textContent=`${banner?'Banner':'Scrolling text'} · ${selected.size} indicators · ${ad.devices.join(' + ')||'No devices selected'}`;summary.append(detail);
  $('#submit-request').disabled=sending||!delivery||!ad.indicators.length||!ad.devices.length;
  $('#map-preview').contentWindow?.postMessage({type:'atlas-ad-state',state:{...preview,ad}},location.origin);
}
function renderFields(){
  const query=$('#field-search').value.trim().toLowerCase(),list=catalog.filter(m=>`${m.name} ${m.shortCategory}`.toLowerCase().includes(query));
  $('#field-list').replaceChildren();
  for(const metric of list){
    const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),detail=document.createElement('small');
    input.type='checkbox';input.checked=selected.has(metric.id);input.dataset.metric=metric.id;
    text.append(document.createTextNode(metric.name));detail.textContent=metric.shortCategory+(metric.fieldId?'':' · No loaded observations');text.append(detail);label.append(input,text);$('#field-list').append(label);
  }
  if(!list.length){const p=document.createElement('p');p.textContent='No matching indicators. Try another name.';$('#field-list').append(p);}
  $('#field-count').textContent=`${selected.size} selected · ${list.length} matching`;
  $('#selected-fields').replaceChildren();
  for(const id of selected){
    const button=document.createElement('button');button.type='button';button.dataset.remove=id;
    const name=catalog.find(m=>m.id===id)?.name||id;button.textContent=name;button.insertAdjacentHTML('beforeend',studioIcon('close'));button.setAttribute('aria-label','Remove '+name);$('#selected-fields').append(button);
  }
  update();
}
$('#field-search').oninput=renderFields;
$('#field-list').onchange=event=>{const id=event.target.dataset.metric;if(!id)return;if(event.target.checked)selected.add(id);else selected.delete(id);renderFields();};
$('#selected-fields').onclick=event=>{const button=event.target.closest('button');if(button){selected.delete(button.dataset.remove);renderFields();}};
$('#ad-form').addEventListener('input',event=>{if(event.target.type!=='file')update();});
document.querySelectorAll('[data-device]').forEach(button=>button.onclick=()=>{
  preview.device=button.dataset.device;document.querySelectorAll('[data-device]').forEach(b=>b.setAttribute('aria-pressed',b===button));$('.preview-stage').classList.toggle('mobile',preview.device==='mobile');update();
});
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{
  preview.mode=button.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b===button));update();
});
$('#preview-metric').onchange=event=>{preview.metric=event.target.value;update();};
$('#preview-place').onchange=event=>{preview.place=event.target.value;update();};
$('#pause-preview').onclick=()=>{preview.paused=!preview.paused;$('#pause-preview').textContent=preview.paused?'Resume':'Pause';$('#pause-preview').setAttribute('aria-pressed',preview.paused);update();};
$('#map-preview').onload=update;
$('#retry-map').onclick=()=>{$('#retry-map').hidden=true;$('#map-preview').src='ad-preview.html';};
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==$('#map-preview').contentWindow)return;
  if(event.data?.type==='atlas-ad-ready'){$('#retry-map').hidden=true;update();}
  if(event.data?.type==='atlas-ad-place'){
    preview.place=event.data.place;const select=$('#preview-place');let option=[...select.options].find(o=>o.value===preview.place);
    if(!option){select.querySelector('[data-custom]')?.remove();option=document.createElement('option');option.value=preview.place;option.textContent=event.data.name;option.dataset.custom='true';select.append(option);}select.value=option.value;
  }
  if(event.data?.type==='atlas-ad-map-error'){$('#placement-status').textContent=event.data.message;$('#retry-map').hidden=false;}
  if(event.data?.type==='atlas-ad-mode'){preview.mode=event.data.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===preview.mode));}
});
$('#ad-image').onchange=async event=>{
  const file=event.target.files[0],version=++imageVersion;if(!file)return;$('#image-error').hidden=true;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('#image-error').textContent='Choose a JPG, PNG or WebP image smaller than 5 MB.';$('#image-error').hidden=false;return;}
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read. Choose it again.'));reader.readAsDataURL(file);});
    const photo=new Image();photo.src=data;await photo.decode();if(version!==imageVersion)return;
    image=data;$('#upload-thumb').src=image;$('#upload-name').textContent=file.name;$('#upload-label').textContent='Replace image';$('#sample-credit').hidden=true;update();
  }catch(error){if(version!==imageVersion)return;$('#image-error').textContent=error.message;$('#image-error').hidden=false;}
};
function requestPayload(){
  const ad=adState();delete ad.paused;
  const payload={version:1,creative:ad,contact:{name:$('#contact-name').value.trim(),company:$('#contact-company').value.trim(),email:$('#contact-email').value.trim(),message:$('#contact-message').value.trim()}};
  const fingerprint=JSON.stringify(payload);if(fingerprint!==requestFingerprint){requestId=crypto.randomUUID();requestFingerprint=fingerprint;}
  return {...payload,requestId};
}
function downloadDraft(){
  const blob=new Blob([JSON.stringify(requestPayload(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='usa-atlas-ad-draft.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Draft downloaded with your creative and placement settings.');
}
$('#save-draft').onclick=downloadDraft;$('#download-request').onclick=downloadDraft;
function validateRequest(){
  const ad=adState();
  if(!ad.indicators.length||!ad.devices.length){activateTab('placement',true);notify('Select at least one indicator and one device.');return false;}
  for(const id of ['ad-headline','ad-cta','ad-url','contact-name','contact-email']){
    const input=$('#'+id);input.setCustomValidity(input.value.trim()?'':'Fill in this field.');
    if(id==='ad-url'&&input.value.trim()){
      try{if(!['http:','https:'].includes(new URL(input.value).protocol))input.setCustomValidity('Enter an http or https website address.');}catch{input.setCustomValidity('Enter a complete website address, such as https://example.com.');}
    }
    if(!input.checkValidity()){
      activateTab(id.startsWith('ad-')?'creative':'request');input.closest('details')?.setAttribute('open','');input.focus();input.reportValidity();return false;
    }
  }
  return true;
}
$('#ad-form').onsubmit=async event=>{
  event.preventDefault();if(sending||!delivery||!validateRequest())return;
  const button=$('#submit-request');sending=true;button.disabled=true;button.textContent='Sending…';$('#request-status').hidden=true;
  try{
    const response=await fetch('/api/advertising/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestPayload())});const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Your request could not be sent.');$('#request-status').textContent='Request sent. We’ll reply to your email about the next steps.';
  }catch(error){$('#request-status').textContent=error.message+' Your draft is still here.';}
  finally{sending=false;$('#request-status').hidden=false;button.innerHTML='Send ad request '+studioIcon('forward');update();}
};
async function loadCatalog(){
  $('#catalog-error').hidden=true;$('#retry-catalog').hidden=true;
  try{
    const data=catalogSnapshot;
    catalog=data.metrics.filter(m=>m.plannedState!=='proposed');for(const id of selected)if(!catalog.some(m=>m.id===id))selected.delete(id);
    $('#preview-metric').replaceChildren(...catalog.map(m=>{const option=document.createElement('option');option.value=m.id;option.textContent=m.name;return option;}));
    if(!catalog.some(m=>m.id===preview.metric))preview.metric=catalog[0]?.id||'';
    $('#preview-metric').value=preview.metric;renderFields();
  }catch(error){$('#catalog-error').textContent=error.message;$('#catalog-error').hidden=false;$('#retry-catalog').hidden=false;$('#field-list').replaceChildren();}
}
$('#retry-catalog').onclick=loadCatalog;
update();await loadCatalog();
try{const response=await fetch('/api/advertising/config');if(!response.ok)throw new Error('Delivery status unavailable.');delivery=(await response.json()).enabled;}
catch{$('#delivery-note').textContent='Email status could not be checked. Download your draft or reload to retry.';}
if(!$('#delivery-note').textContent.startsWith('Email status'))$('#delivery-note').textContent=delivery?'Send your creative and contact details for review. Nothing is published automatically.':'Email delivery is not connected yet. Save your draft to send it later.';
update();
