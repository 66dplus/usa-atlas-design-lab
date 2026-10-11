import {showSurface,isSurfaceOpen} from './motion.js';
const definitions=[
  ['tilt','Camera tilt',5,55,1,'°'],
  ['sensitivity','Zoom sensitivity',.05,1,.01,'×'],
  ['minZoom','Minimum zoom',.5,1,.05,'×'],
  ['maxZoom','Maximum zoom',1.1,30,.1,'×'],
  ['duration','Transition duration',200,2000,50,' ms'],
  ['relief','County height',0,2,.05,'×']
];
const isPreviewRuntime=()=>document.body.dataset.runtime==='preview';
const storageKey='usa-atlas-preview-settings-v1';
function localRecord(defaults){
  const raw=localStorage.getItem(storageKey);if(!raw)return {...defaults,savedAt:null};
  const record=JSON.parse(raw),settings=record.settings;
  if(record.version!==1||!settings||Object.keys(settings).sort().join()!==Object.keys(defaults.settings).sort().join()||typeof record.savedAt!=='string'||!Number.isFinite(Date.parse(record.savedAt))||typeof settings.rotation!=='boolean'||!['north','south'].includes(settings.cameraSide))throw new Error('Invalid stored settings');
  for(const [key,,min,max] of definitions)if(typeof settings[key]!=='number'||!Number.isFinite(settings[key])||settings[key]<min||settings[key]>max)throw new Error('Invalid stored range');
  if(settings.hover!==0||settings.minZoom>=settings.maxZoom)throw new Error('Invalid stored camera');
  return record;
}

export async function loadViewSettings(){
  const defaults=await fetch('./view-settings.json').then(r=>{if(!r.ok)throw new Error('View defaults unavailable');return r.json();});
  if(isPreviewRuntime()){try{return {defaults,record:localRecord(defaults),error:null};}catch{return {defaults,record:{...defaults,savedAt:null},error:'Browser settings are unavailable. Showing defaults.'};}}
  try{
    const response=await fetch('/api/view-settings',{cache:'no-store'});
    if(!response.ok)throw new Error('Settings unavailable');
    const record=await response.json();record.settings.hover=0;return {defaults,record,error:null};
  }catch{return {defaults,record:{...defaults,savedAt:null},error:'Could not read settings. Showing defaults.'};}
}

export function initViewSettings({defaults,record,error,onChange,onOpen=()=>{}}){
  const panel=document.createElement('section');panel.id='view-settings-panel';panel.className='view-settings';panel.hidden=true;panel.setAttribute('aria-label','Map settings');
  panel.innerHTML=`<div class="settings-heading"><div><span>Map settings</span><h2>Camera & motion</h2></div><button id="settings-close" aria-label="Close settings">×</button></div>
    <p class="settings-intro">Adjust the camera and movement to find the view that works for you.</p>
    <label class="settings-toggle"><span>Allow mouse rotation</span><input id="settings-rotation" type="checkbox"></label>
    <label class="settings-side">Viewing direction<select id="settings-side"><option value="south">North at the top</option><option value="north">From north to south</option></select></label>
    ${definitions.map(([key,label,min,max,step,unit])=>`<label class="settings-range" for="setting-${key}"><span>${label}<output id="value-${key}"></output></span><input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" data-setting="${key}" aria-label="${label}"></label>`).join('')}
    <p class="settings-note">Zoom is relative to the fitted map. Transitions follow your system's reduced-motion setting.</p>
    <p id="settings-status" role="status"></p><div class="settings-actions"><button id="settings-default">Reset defaults</button><button id="settings-save">Save settings</button></div>`;
  document.body.append(panel);
  const trigger=document.querySelector('#view-settings-open'),$=id=>panel.querySelector('#'+id);
  let draft={...record.settings},saved=JSON.stringify(draft),busy=false;
  function message(text,isError=false){$('settings-status').textContent=text;$('settings-status').classList.toggle('settings-error',isError);}
  function sync(){
    for(const [key,, , , ,unit] of definitions){$('setting-'+key).value=draft[key];$('value-'+key).textContent=draft[key]+unit;}
    $('settings-rotation').checked=draft.rotation;$('settings-side').value=draft.cameraSide;
  }
  function preview(){sync();onChange({...draft});message(JSON.stringify(draft)===saved&&record.savedAt?'Saved settings':'Preview - not saved yet');}
  trigger.onclick=()=>{const opening=!isSurfaceOpen(panel);if(opening)onOpen();showSurface(panel,opening);trigger.setAttribute('aria-expanded',String(opening));if(opening)$('settings-close').focus();};
  function close(){showSurface(panel,false);trigger.setAttribute('aria-expanded','false');trigger.focus();}
  $('settings-close').onclick=close;
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
  panel.addEventListener('click',e=>e.stopPropagation());
  for(const [key] of definitions)$('setting-'+key).oninput=e=>{draft[key]=Number(e.target.value);preview();};
  $('settings-rotation').onchange=e=>{draft.rotation=e.target.checked;preview();};
  $('settings-side').onchange=e=>{draft.cameraSide=e.target.value;preview();};
  $('settings-default').onclick=()=>{draft={...defaults.settings};preview();};
  $('settings-save').onclick=async()=>{
    if(busy)return;busy=true;
    const chosen={...draft};panel.querySelectorAll('input,select,#settings-save,#settings-default').forEach(el=>el.disabled=true);message('Saving...');
    try{
      if(isPreviewRuntime()){
        const result={version:1,settings:chosen,savedAt:new Date().toISOString()};
        localStorage.setItem(storageKey,JSON.stringify(result));
        if(localStorage.getItem(storageKey)!==JSON.stringify(result))throw new Error('Settings not stored');
        record=result;saved=JSON.stringify(chosen);message('Saved in this browser - '+new Date(record.savedAt).toLocaleTimeString('en-US'));return;
      }
      const response=await fetch('/api/view-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,settings:chosen}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Save failed');const result=await response.json();
      if(JSON.stringify(result.settings)!==JSON.stringify(chosen)||!result.savedAt)throw new Error('Settings not acknowledged');
      record=result;saved=JSON.stringify(chosen);message('Saved in the project - '+new Date(record.savedAt).toLocaleTimeString('en-US'));
    }catch{message('Could not save. Your values remain here; try again.',true);}
    finally{busy=false;panel.querySelectorAll('input,select,#settings-save,#settings-default').forEach(el=>el.disabled=false);}
  };
  sync();message(error|| (record.savedAt?'Saved settings loaded':'Default settings'),Boolean(error));
}
