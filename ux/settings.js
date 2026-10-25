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
