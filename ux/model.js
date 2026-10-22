import {indicatorVisibility} from './indicator-visibility.js';

// Raw observations and the map scale stay separate: normalized values are never statistics.

export function loadedMapMetrics(metrics) {
  // Native ZIP/monitor/tract data alone cannot be shown on the state/county map.
  // Observation totals may be null when the production inventory is uncounted.
  return metrics.filter(metric=>indicatorVisibility[metric.catalogId]===true&&metric.fieldId&&(metric.stateSupported||metric.countySupported));
}

export function collectedMapIndicators(metrics) {
  // The adapter keeps the original indicator ID on its default series; variants use --.
  // Keep variants for existing data cards, but do not turn them into extra picker fields.
  return loadedMapMetrics(metrics).filter(metric=>!metric.id.includes('--'));
}

// Rendering may use a source-defined period label; the store/API retain the native period.
export function displayLayer(layer) {
  return layer.displayPeriod?{...layer,sourcePeriod:layer.period,period:layer.displayPeriod}:layer;
}

export async function readAtlasJSON(url,request=fetch) {
  for(let attempt=0;attempt<2;attempt++){
    let response,data;
    try{
      response=await request(url);
      try{data=await response.json();}
      catch{throw new Error('The data service returned an unreadable response. Please retry.');}
    }catch(error){
      if(attempt===0){await new Promise(resolve=>setTimeout(resolve,600));continue;}
      throw new Error(response?'The data service returned an unreadable response. Please retry.':'The data service could not be reached. Please retry.');
    }
    if(response.ok)return data;
    // A tunnel or bounded reader can briefly be busy; only idempotent GETs retry.
    if(attempt===0&&[408,429,502,503,504,530].includes(response.status)){
      await new Promise(resolve=>setTimeout(resolve,600));continue;
    }
    throw new Error(data.error||'The selected data could not be loaded. Please retry.');
  }
}

export function prepareLayer(data,geo) {
  const observations=new Map(),excluded=[...data.excludedGeographies];
  const suppressed=new Set(data.suppressedGeographies||[]);
  for(const row of data.observations){
    if(row.id!=='US'&&!geo.byId.has(row.id)){excluded.push(row.sourceGeoId);continue;}
    if(!Number.isFinite(row.value)||observations.has(row.id))throw new Error('The series has invalid or ambiguous observations.');
    observations.set(row.id,row);
  }
  // County values define the colour domain when the series maps counties.
  // State totals stay in the store for the state cards but never compress a county map.
  const countyNumbers=[...observations].filter(([id])=>id.length===5).map(([,row])=>row.value);
  const stateNumbers=[...observations].filter(([id])=>id!=='US').map(([,row])=>row.value);
  const numbers=countyNumbers.length?countyNumbers:stateNumbers;
  const min=numbers.length?Math.min(...numbers):null,max=numbers.length?Math.max(...numbers):null;
  const requested=data.scale==='log'?'log':data.scale==='diverging'?'diverging':'linear';
  const scale=requested==='log'&&!(min>0)?'linear':requested;
  const domain=scale==='diverging'?[85,115]:[min,max];
  const normalize=value=>{
    if(value==null)return null;
    const [low,high]=domain;
    if(!(high>low))return .5;
    if(scale==='log')return Math.min(1,Math.max(0,(Math.log(value)-Math.log(low))/(Math.log(high)-Math.log(low))));
    return Math.min(1,Math.max(0,(value-low)/(high-low)));
  };
  const height=value=>value==null?null:domain[1]===domain[0]?.5:Math.min(1,Math.max(0,(value-domain[0])/(domain[1]-domain[0])));
  const values=new Map([...geo.byId.keys()].map(id=>[id,normalize(observations.get(id)?.value)]));
  const heightValues=new Map([...geo.byId.keys()].map(id=>[id,height(observations.get(id)?.value)]));
  return {...data,status:'ready',observations,values,heightValues,scale,domain,min,max,suppressed,excludedGeographies:excluded};
}

export function createDataStore(geo,onChange,request=fetch) {
  const layers=new Map(),pending=new Map();
  function get(metric){
    if(!layers.has(metric.id))layers.set(metric.id,{status:metric.fieldId?'idle':'unavailable',values:new Map(),observations:new Map()});
    return layers.get(metric.id);
  }
  function load(metric,{refresh=false}={}){
    if(pending.has(metric.id))return pending.get(metric.id);
    const current=get(metric);
    if(!metric.fieldId||(!refresh&&(current.status==='ready'||current.status==='error')))return Promise.resolve(current);
    const fallback=current.status==='ready'?current:null;
    if(!fallback)layers.set(metric.id,{...current,status:'loading'});
    const promise=(async()=>{
      await Promise.resolve(); // Install request ownership before callbacks, including synchronous fetch failures.
      try{
        const data=await readAtlasJSON('/api/atlas/observations?field='+encodeURIComponent(metric.fieldId),request);
        if(data.fieldId!==metric.fieldId)throw new Error('The server returned a different series.');
        layers.set(metric.id,prepareLayer(data,geo));
      }catch(error){layers.set(metric.id,fallback||{status:'error',error:error.message,values:new Map(),observations:new Map()});}
      finally{pending.delete(metric.id);onChange(metric.id);}
      return layers.get(metric.id);
    })();
    pending.set(metric.id,promise);return promise;
  }
  function retry(metric){layers.delete(metric.id);return load(metric);}
  function seed(metric,data){
    if(!metric?.fieldId||data?.fieldId!==metric.fieldId)return false;
    layers.set(metric.id,prepareLayer(data,geo));return true;
  }
  function refresh(metric){return load(metric,{refresh:true});}
  return {get,load,retry,seed,refresh};
}

export function missingReason(metric,feature,layer) {
  if(layer.status==='error')return layer.error;
  if(['loading','idle'].includes(layer.status))return 'Loading observations from PostgreSQL…';
  if(!metric.fieldId)return metric.coverageNote;
  if(!feature)return 'No published US observation in this snapshot. Choose a state or county; no average is substituted.';
  if(feature.id.length===5&&!metric.countySupported)return 'This is a state-level series. No county value is inferred from the state value.';
  if(feature.id.length===2&&!metric.stateSupported)return 'This series contains county observations. Choose a county; no state value is inferred.';
  if(layer.suppressed?.has(feature.id))return 'Insufficient sample: the denominator is below the minimum for this indicator.';
  return `No observation for this FIPS in the ${formatPeriod(layer.period)} snapshot. The map uses Census 2017 boundaries; unmatched or missing places remain empty.`;
}
export function formatValue(value,unit='') {
  if(value==null)return '—';
  if(unit.startsWith('USD')&&Math.abs(value)>=1e6){
    return new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(value);
  }
  const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:unit==='per 1,000 people'?6:2}).format(value);
  return unit==='%'?number+'%':number;
}
export function formatPeriod(period='') {
  const match=period.match(/^(\d{4})-M(\d{2})$/);
  return match?new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+match[1],+match[2]-1,1))):period;
}
export function comparable(a,b,placeA,placeB) {
  return a.status==='ready'&&b.status==='ready'&&a.fieldId===b.fieldId&&(a.sourcePeriod||a.period)===(b.sourcePeriod||b.period)&&
    a.sourceRelease===b.sourceRelease&&a.source===b.source&&a.unit===b.unit&&Boolean(placeA)&&Boolean(placeB)&&placeA.id.length===placeB.id.length;
}
