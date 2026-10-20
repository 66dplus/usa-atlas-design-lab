const definitions=[
  ['tilt','Наклон камеры',5,55,1,'°'],
  ['sensitivity','Чувствительность зума',.05,1,.01,'×'],
  ['minZoom','Минимальный зум',.5,1,.05,'×'],
  ['maxZoom','Максимальный зум',1.1,30,.1,'×'],
  ['duration','Длительность перехода',200,2000,50,' мс'],
  ['relief','Высота округов',0,2,.05,'×']
];
const bundledDefaults={version:1,settings:{rotation:false,cameraSide:'south',tilt:40,sensitivity:.28,minZoom:.5,maxZoom:12,duration:950,hover:0,relief:1}};

export async function loadViewSettings(){
  let defaults;
  try{
    const response=await fetch('/ux/view-settings.json',{cache:'no-store'});
    if(response.ok)defaults=await response.json();
  }catch{}
  try{
    const response=await fetch('/api/view-settings',{cache:'no-store'});
    if(!response.ok)throw new Error('Settings unavailable');
    const record=await response.json();record.settings.hover=0;
    defaults ||= {version:1,settings:{...record.settings}};
    return {defaults,record,error:null};
  }catch{
    const usedFallback=!defaults;
    defaults ||= bundledDefaults;
    if(usedFallback)return {defaults,record:{...defaults,savedAt:null},error:'Настройки камеры не загрузились. Пока показаны встроенные значения по умолчанию.'};
    return {defaults,record:{...defaults,savedAt:null},error:'Не удалось прочитать настройки. Пока показаны значения по умолчанию.'};
  }
}

export function initViewSettings({defaults,record,error,onChange,onOpen=()=>{}}){
  const panel=document.createElement('section');panel.id='view-settings-panel';panel.className='view-settings';panel.hidden=true;panel.setAttribute('aria-label','Настройки 3D');
  panel.innerHTML=`<div class="settings-heading"><div><span>Настройте ощущение карты</span><h2>Камера и движение</h2></div><button id="settings-close" aria-label="Закрыть настройки">×</button></div>
    <p class="settings-intro">Меняйте значения и сразу пробуйте карту. Сохраните, когда найдёте удобное ощущение.</p>
    <label class="settings-toggle"><span>Разрешить вращение мышью</span><input id="settings-rotation" type="checkbox"></label>
    <label class="settings-side">Сторона взгляда<select id="settings-side"><option value="south">Север сверху</option><option value="north">С севера на юг</option></select></label>
    ${definitions.map(([key,label,min,max,step,unit])=>`<label class="settings-range" for="setting-${key}"><span>${label}<output id="value-${key}"></output></span><input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" data-setting="${key}" aria-label="${label}"></label>`).join('')}
    <p class="settings-note">Зум указан относительно вписанной карты. Переходы отключаются при системном уменьшении движения.</p>
    <p id="settings-status" role="status"></p><div class="settings-actions"><button id="settings-default">По умолчанию</button><button id="settings-save">Сохранить настройки</button></div>`;
  document.body.append(panel);
  const trigger=document.querySelector('#view-settings-open'),$=id=>panel.querySelector('#'+id);
  let draft={...record.settings},saved=JSON.stringify(draft),busy=false;
  function message(text,isError=false){$('settings-status').textContent=text;$('settings-status').classList.toggle('settings-error',isError);}
  function sync(){
    for(const [key,, , , ,unit] of definitions){$('setting-'+key).value=draft[key];$('value-'+key).textContent=draft[key]+unit;}
    $('settings-rotation').checked=draft.rotation;$('settings-side').value=draft.cameraSide;
  }
  function preview(){sync();onChange({...draft});message(JSON.stringify(draft)===saved&&record.savedAt?'Сохранённые настройки':'Предпросмотр · ещё не сохранено');}
  trigger.onclick=()=>{const opening=panel.hidden;if(opening)onOpen();panel.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));if(opening)$('settings-close').focus();};
  function close(){panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();}
  $('settings-close').onclick=close;
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
  panel.addEventListener('click',e=>e.stopPropagation());
  for(const [key] of definitions)$('setting-'+key).oninput=e=>{draft[key]=Number(e.target.value);preview();};
  $('settings-rotation').onchange=e=>{draft.rotation=e.target.checked;preview();};
  $('settings-side').onchange=e=>{draft.cameraSide=e.target.value;preview();};
  $('settings-default').onclick=()=>{draft={...defaults.settings};preview();};
  $('settings-save').onclick=async()=>{
    if(busy)return;busy=true;
    const chosen={...draft};panel.querySelectorAll('input,select,#settings-save,#settings-default').forEach(el=>el.disabled=true);message('Сохраняю…');
    try{
      const response=await fetch('/api/view-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,settings:chosen}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Save failed');const result=await response.json();
      if(JSON.stringify(result.settings)!==JSON.stringify(chosen)||!result.savedAt)throw new Error('Settings not acknowledged');
      record=result;saved=JSON.stringify(chosen);message('Сохранено в проекте · '+new Date(record.savedAt).toLocaleTimeString('ru-RU'));
    }catch{message('Не удалось сохранить. Значения остались здесь — попробуйте снова.',true);}
    finally{busy=false;panel.querySelectorAll('input,select,#settings-save,#settings-default').forEach(el=>el.disabled=false);}
  };
  sync();message(error|| (record.savedAt?'Загружены сохранённые настройки':'Значения по умолчанию'),Boolean(error));
}
