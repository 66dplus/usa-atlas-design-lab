import {exampleImage,supportsDevice} from './advertising/creative.js';
import {validateRequest,characterCount,copyLimits} from './advertising/request.js';
import {readAtlasJSON,collectedMapIndicators} from './model.js';
const $=selector=>document.querySelector(selector);
const targetLabels=new Map([['01.01:B01003_001E','Population'],['02.01:B19013_001E','Median household income'],['02.03:B25064_001E','Median rent'],['02.04:B25077_001E','Median home value'],['02.08:B17001_002E','People below poverty level'],['03.06:unemployment','Unemployed']]);
const selectedLocations=new Set(['06']),selectedIndicators=new Set(['unemployment']);
let catalog=[],locations=[],format='banner',channel='whatsapp',days='7',kind='placement',tab='creative',image=exampleImage,imageVersion=0;
let device=matchMedia('(max-width:760px)').matches?'mobile':'desktop',theme='light',previewReady=false,dirty=false,creativeSignature,previewRevision=0;
const fitsByDevice=new Map();
try{theme=localStorage.getItem('usa-atlas-theme')==='dark'?'dark':'light';}catch{}
const value=id=>$('#'+id).value.trim();
const button=(text,click)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=click;return b;};
function status(message){$('#studio-status').textContent=message;}
function creative(){return {format,headline:$('#ad-headline').value,subtitle:$('#ad-subtitle').value,cta:$('#ad-cta').value,url:value('ad-url'),image,imageArea:+value('image-area'),imageZoom:+value('image-zoom'),imagePosition:+value('image-position'),speed:value('ticker-speed'),paused:false,theme,locations:[...selectedLocations],indicators:[...selectedIndicators],devices:['desktop','mobile'].filter(d=>$('#target-'+d).checked)};}
function request(){return {version:2,kind,creative:kind==='placement'?creative():null,idea:kind==='inquiry'?value('inquiry-idea'):'',durationDays:kind==='inquiry'?null:days==='custom'?Number(value('custom-days')):Number(days),contact:{channel,whatsapp:channel==='whatsapp'?value('contact-whatsapp'):'',email:channel==='email'?value('contact-email'):'',name:value('contact-name'),message:value('contact-message')}};}
function pressed(selector,key,selected){document.querySelectorAll(selector).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[key]===selected)));}
function activateTab(next){
  tab=next;pressed('[data-tab]','tab',tab);$('.studio-tabs').style.setProperty('--tab',tab==='request'?1:0);
  $('#creative-settings').hidden=tab!=='creative';$('#request-settings').hidden=tab!=='request';$('#submit-request').hidden=tab!=='request';$('#mobile-review').hidden=tab==='request';
  $('.studio-scroll').scrollTop=0;update();
}
function renderTargets(type){
  const isLocation=type==='location',set=isLocation?selectedLocations:selectedIndicators,list=isLocation?locations:catalog;
    const query=$('#'+type+'-search').value.toLowerCase().trim(),options=$('#'+type+'-options'),tags=$('#'+type+'-tags');
  const name=item=>isLocation?item.name:targetLabels.get(item.fieldId)||item.name.replace(' · people',''),matching=list.filter(item=>(!isLocation||query||item.id.length===2)&&(name(item)+' '+item.name).toLowerCase().includes(query));
  options.replaceChildren(...matching.slice(0,80).map(item=>{const b=button(name(item),()=>{dirty=true;set.has(item.id)?set.delete(item.id):set.add(item.id);renderTargets(type);update();});b.setAttribute('aria-pressed',String(set.has(item.id)));b.title=item.name;b.dataset.targetId=item.id;return b;}));
  if(!matching.length){const p=document.createElement('p');p.className='note';p.textContent=list.length?'No matches. Try another name.':'Choices are unavailable. Reload to retry.';options.append(p);}
  if(matching.length>80){const p=document.createElement('p');p.className='note';p.textContent='Keep typing to narrow the results.';options.append(p);}
  tags.replaceChildren(...[...set].map(id=>{
    const item=list.find(item=>item.id===id),text=item?name(item):id,chooser=isLocation&&set.size===1&&!matchMedia('(max-width:760px)').matches;
    const b=button('',()=>{if(chooser){const input=$('#location-search');input.closest('details').open=true;input.focus();return;}dirty=true;set.delete(id);renderTargets(type);update();});
    const label=document.createElement('span');label.textContent=text;const action=document.createElement('span');action.textContent=chooser?'⌄':'×';action.setAttribute('aria-hidden','true');b.append(label,action);b.title=item?.name||id;b.dataset.targetId=id;b.setAttribute('aria-label',chooser?'Choose locations':'Remove '+text);return b;
  }));
  tags.dataset.count=String(set.size);$('#'+type+'-count').textContent=set.size+' selected';
}
function update(){
  const ad=creative(),banner=format==='banner';
  if(image.startsWith('data:image/'))$('#image-credit').textContent='Your uploaded image. It remains in this browser and your exported draft.';
  const signature=JSON.stringify(ad);if(signature!==creativeSignature){fitsByDevice.clear();creativeSignature=signature;previewRevision++;}
  for(const id of ['crop-controls','subtitle-field','image-credit'])$('#'+id).hidden=!banner;
  $('.upload').hidden=!banner;$('#ticker-speed-field').hidden=banner;$('#mobile-format-note').hidden=banner&&!matchMedia('(max-width:760px)').matches;
  $('#target-mobile').disabled=!supportsDevice(format,'mobile');
  $('[data-format=ticker]').disabled=matchMedia('(max-width:760px)').matches;
  $('button[data-device=mobile]').disabled=!supportsDevice(format,'mobile');
  if(!supportsDevice(format,device)){device='desktop';resizePreview();}
  for(const [id,limit] of Object.entries(copyLimits(format)))$('#'+id+'-count').textContent=characterCount(ad[id])+' / '+limit;
  for(const [id,key] of [['area','imageArea'],['zoom','imageZoom'],['position','imagePosition']])$('#'+id+'-output').textContent=ad[key]+'%';
  $('#inquiry-field').hidden=kind!=='inquiry';$('#duration-settings').hidden=kind==='inquiry';$('#custom-days-field').hidden=days!=='custom';$('#whatsapp-field').hidden=channel!=='whatsapp';$('#email-field').hidden=channel!=='email';
  const inquiry=kind==='inquiry',requestTab=tab==='request';document.body.dataset.requestKind=kind;
  $('#studio-heading').textContent=inquiry?'Custom campaign':requestTab?'Send your request':'Create your ad';
  $('.studio-tabs').hidden=inquiry;
  $('.studio-subtitle').hidden=inquiry;
  $('.studio-subtitle').textContent=requestTab?"We'll review your ad and contact you to agree on the placement.":'Choose your audience. See your ad in place.';
  $('#studio-explanation').textContent=inquiry?'Tell us your idea. A finished ad is optional.':requestTab?'Send your ad for review or discuss a custom idea.':'Ready to place your ad or have a custom idea? Open Request.';
  $('#message-field').hidden=inquiry;
  $('#message-count').textContent=characterCount($('#contact-message').value)+' / 2000';
  $('#submit-request').disabled=validateRequest(request()).length>0;
  $('#review-request').textContent=requestTab?'Back to creative':'Review & send';
  const locationCount=ad.locations.length+' location'+(ad.locations.length===1?'':'s'),indicatorCount=ad.indicators.length+' indicator'+(ad.indicators.length===1?'':'s');
  if(!requestTab&&(ad.locations.length>1||ad.indicators.length>2))$('.studio-subtitle').textContent=locationCount+' · '+indicatorCount;
  $('#target-summary').textContent=locationCount+' · '+indicatorCount+' · '+(banner?'Banner':'Scrolling text');
  const summary=$('#request-summary');summary.replaceChildren();summary.dataset.kind=kind;
  const meta=document.createElement('p');meta.className='request-meta';
  const audience=ad.locations.length===1&&!matchMedia('(max-width:760px)').matches?(locations.find(place=>place.id===ad.locations[0])?.name||ad.locations[0]):locationCount;
  meta.textContent=inquiry?'Placement, sponsorship or help with creative':`${banner?'Banner':'Scrolling text'} · ${audience} · ${indicatorCount}`;
  summary.append(meta);
  if(!inquiry){
    const detail=document.createElement('div');detail.className='request-creative';
    const title=document.createElement('strong');title.textContent=ad.headline;
    const duration=days==='custom'?value('custom-days'):days;
    const devices=document.createElement('p');devices.textContent=(ad.devices.map(d=>d==='desktop'?'Desktop':'Mobile').join(' + ')||'No devices selected')+' · '+duration+(duration==='1'?' day':' days');
    const back=button('Back to creative',()=>activateTab('creative'));back.id='back-to-creative';
    detail.append(title,devices,back);summary.append(detail);
  }
  document.body.dataset.theme=theme;$('#preview-theme').textContent=theme==='dark'?'Light theme':'Dark theme';
  if(previewReady)$('#map-preview').contentWindow.postMessage({type:'atlas-ad-preview',revision:previewRevision,creative:ad,theme,highlight:$('#preview-highlight').getAttribute('aria-pressed')==='true'},location.origin);
}
function resizePreview(){
  const frame=$('.preview-frame'),iframe=$('#map-preview');
  $('.preview-panel').dataset.device=device;$('button[data-device=desktop]').textContent=matchMedia('(max-width:760px)').matches?(device==='desktop'?'Mobile preview':'Desktop preview'):'Desktop';pressed('button[data-device]','device',device);$('#preview-size').textContent=device==='mobile'?'390 × 844 · actual size':'1440 × 900 · actual size';
  const width=device==='mobile'?390:1440,height=device==='mobile'?844:900,scale=Math.min(1,frame.clientWidth/width,frame.clientHeight/height);
  iframe.style.transform=`translateX(-50%) scale(${scale})`;iframe.style.setProperty('--preview-transform',iframe.style.transform);
}
function download(payload){
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='usa-atlas-ad-request.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function saveDraft(){
  const draft={request:request(),creative:creative(),imageName:$('#image-filename').textContent,days,kind,channel,form:Object.fromEntries([...$('#ad-form').querySelectorAll('input[id],textarea[id],select[id]')].filter(el=>el.type!=='file'&&!el.id.endsWith('-search')).map(el=>[el.id,el.type==='checkbox'?el.checked:el.value]))};
  try{localStorage.setItem('usa-atlas-ad-draft-v2',JSON.stringify(draft));dirty=false;status('Draft saved in this browser. Nothing was sent.');}
  catch{download(draft);status('Browser storage is unavailable or full. A draft download was started; keep this page open until you have the file.');return false;}
  return !dirty;
}
function checkRequest(){
  document.querySelectorAll('[aria-invalid]').forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');});$('#studio-field-error')?.remove();
  const payload=request(),errors=validateRequest(payload);
  if(errors.length){const first=errors[0],input=$('#'+first.id);activateTab(first.id.startsWith('ad-')||first.id.includes('-search')||first.id.startsWith('target-')?'creative':'request');input.closest('details')?.setAttribute('open','');const error=document.createElement('p');error.id='studio-field-error';error.className='field-error';error.textContent=first.message;input.after(error);input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',error.id);input.focus();status(first.message);return false;}
  status(kind==='placement'&&!payload.creative.devices.every(d=>fitsByDevice.get(d)===true)?'Draft fields are valid. Placement fit still needs review; delivery is pending.':'Request is ready to download for review. Delivery is pending; nothing has been sent or published.');return true;
}
// An in-page guard keeps the ordinary Stats navigation safe even when a browser
// suppresses beforeunload prompts. Closing the tab still uses the native guard.
$('.studio-header>a').addEventListener('click',event=>{if(dirty){event.preventDefault();$('#leave-draft-dialog').showModal();$('#stay-in-studio').focus();}});
$('#leave-draft-dialog').addEventListener('click',event=>{if(event.target.id==='stay-in-studio')$('#leave-draft-dialog').close();if(event.target.id==='save-and-leave'&&saveDraft())location.href=$('.studio-header>a').href;});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.tab){kind='placement';activateTab(b.dataset.tab);}
  if(b.dataset.format){dirty=true;format=b.dataset.format;if(format==='ticker')$('#target-mobile').checked=false;pressed('[data-format]','format',format);update();}
  if(b.dataset.channel){dirty=true;channel=b.dataset.channel;pressed('[data-channel]','channel',channel);update();}
  if(b.dataset.days){dirty=true;days=b.dataset.days;pressed('[data-days]','days',days);update();}
  if(b.dataset.device){device=matchMedia('(max-width:760px)').matches&&b.dataset.device==='desktop'?(device==='desktop'?'mobile':'desktop'):b.dataset.device;resizePreview();update();}
  if(['save-draft','save-mobile'].includes(b.id))saveDraft();
  if(['review-request','mobile-review'].includes(b.id)){const next=b.id==='review-request'&&tab==='request'?'creative':'request';if(next==='creative')kind='placement';activateTab(next);}
  if(b.id==='custom-campaign'){kind='inquiry';activateTab('request');$('#inquiry-idea').focus();}
  if(b.id==='check-request')checkRequest();
  if(b.id==='preview-theme'){theme=theme==='dark'?'light':'dark';update();}
  if(b.id==='preview-highlight'){b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));update();}
  if(b.id==='preview-in-place'){document.body.classList.add('show-preview');resizePreview();update();$('#close-preview').focus();}
  if(b.id==='close-preview'){document.body.classList.remove('show-preview');$('#preview-in-place').focus();}
});
$('#ad-form').oninput=e=>{if(e.target.type!=='file'){dirty=true;if(e.target.hasAttribute('aria-invalid')){e.target.removeAttribute('aria-invalid');e.target.removeAttribute('aria-describedby');$('#studio-field-error')?.remove();status('');}update();}};
$('#ad-form').onsubmit=e=>{e.preventDefault();if(checkRequest())download(request());};
for(const type of ['location','indicator'])$('#'+type+'-search').oninput=()=>renderTargets(type);
$('#ad-image').onchange=async e=>{
  const file=e.target.files[0],version=++imageVersion;if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){status('Choose a JPG, PNG or WebP image up to 5 MB.');return;}
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Image could not be read.'));reader.readAsDataURL(file);});const photo=new Image();photo.src=data;await photo.decode();if(version!==imageVersion)return;dirty=true;image=data;$('#image-filename').textContent=file.name;$('#upload-thumb').src=image;update();}
  catch(error){status(error.message);}
};
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==$('#map-preview').contentWindow)return;
  if(e.data?.type==='atlas-preview-ready'){previewReady=true;update();}
  if(e.data?.type==='atlas-preview-status'&&e.data.revision===previewRevision){if(e.data.targeted)fitsByDevice.set(e.data.device,e.data.fits);$('#preview-status').dataset.state=!e.data.targeted||e.data.fits===false?'error':'normal';$('#preview-status').textContent=kind==='inquiry'?'Placement reference. Your creative draft is retained.':!e.data.targeted?'Creative hidden: this preview location, indicator or device is outside your selection.':e.data.fits===false?'Creative does not fit. Shorten the copy or give it more image/text space.':e.data.fits===true?'Your creative fits this visitor placement.':'Your creative in the visitor placement. Fit has not been verified.';}
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('show-preview'))$('#close-preview').click();const group=e.target.closest('.studio-tabs,.format-tabs,.contact-tabs,.duration-options,.device-tabs');if(group&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){const buttons=[...group.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(e.target),n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;e.preventDefault();buttons[n].focus();buttons[n].click();}});
new ResizeObserver(resizePreview).observe($('.preview-frame'));
matchMedia('(max-width:760px)').addEventListener('change',()=>{renderTargets('location');renderTargets('indicator');update();});
try{const raw=localStorage.getItem('usa-atlas-ad-draft-v2');if(raw){const draft=JSON.parse(raw);for(const [id,v] of Object.entries(draft.form)){const el=$('#'+id);if(!el||el.type==='file')continue;if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v;}format=draft.creative.format;image=draft.creative.image;selectedLocations.clear();draft.creative.locations.forEach(id=>selectedLocations.add(id));selectedIndicators.clear();draft.creative.indicators.forEach(id=>selectedIndicators.add(id));days=draft.days;kind=draft.kind;channel=draft.channel;$('#upload-thumb').src=image;$('#image-filename').textContent=draft.imageName||'Saved creative image';status('Saved draft restored.');}}
catch{status('Saved draft could not be restored. The form is available for a new draft.');}
pressed('[data-format]','format',format);pressed('[data-channel]','channel',channel);pressed('[data-days]','days',days);resizePreview();activateTab(kind==='inquiry'?'request':'creative');
try{
  const [data,topology]=await Promise.all(['/api/atlas/catalog','../node_modules/us-atlas/counties-10m.json'].map(url=>readAtlasJSON(url)));
  catalog=collectedMapIndicators(data.metrics);const states=topology.objects.states.geometries.filter(f=>Number(f.id)<60);const stateNames=new Map(states.map(f=>[f.id,f.properties.name]));locations=[...states.map(f=>({id:f.id,name:f.properties.name})),...topology.objects.counties.geometries.filter(f=>stateNames.has(f.id.slice(0,2))).map(f=>({id:f.id,name:f.properties.name+' · '+stateNames.get(f.id.slice(0,2))+' · County'}))];
  const admittedIds=new Set(catalog.map(item=>item.id));let removed=false;
  for(const id of selectedIndicators){if(!admittedIds.has(id)){selectedIndicators.delete(id);removed=true;}}
  if(removed){dirty=true;status('Unavailable indicator selections were removed. Choose from the collected fields.');}
  renderTargets('location');renderTargets('indicator');update();
}catch(error){status(error.message+' Reload to retry. Your draft is retained.');renderTargets('location');renderTargets('indicator');}
