import {indicatorVisibility} from './indicator-visibility.js';

// Raw observations and the map scale stay separate: normalized values are never statistics.

export function loadedMapMetrics(metrics) {
  // Native ZIP/monitor/tract data alone cannot be shown on the state/county map.
  // Observation totals may be null when the production inventory is uncounted.
  // A normalization definition describes a series; it does not prove it is loaded.
  return metrics.filter(metric=>indicatorVisibility[metric.catalogId]===true&&metric.hasObservations!==false&&metric.fieldId&&(metric.stateSupported||metric.countySupported));
}

export function collectedMapIndicators(metrics) {
  // Keep primary indicators and the requested standalone race/ethnicity lenses.
  // Other ACS columns and internal series variants remain data sources, not
  // hundreds of extra user-facing indicators.
  const raceVariants=new Set(metrics.filter(metric=>metric.switchGroup==='race-ethnicity').map(metric=>metric.id));
  return loadedMapMetrics(metrics).filter(metric=>!metric.id.includes('--')||raceVariants.has(metric.id));
}

// Rendering may use a source-defined period label; the store/API retain the native period.
export function displayLayer(layer) {
  return layer.displayPeriod?{...layer,sourcePeriod:layer.period,period:layer.displayPeriod}:layer;
}

export function unemploymentPeriodKey(period={type:'annual',year:2025}) {
  return period.type==='month'?`${period.year}-M${String(period.month).padStart(2,'0')}`:`${period.year}-M13`;
}

export function unemploymentPeriodLabel(period={type:'annual',year:2025}) {
  return period.type==='month'
    ? new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(period.year,period.month-1,1)))
    : `Annual average ${period.year}`;
}

export function parseUnemploymentPeriod(value) {
  if(value==='2025')return {type:'annual',year:2025};
  const match=/^2025-M(0[1-9]|1[0-2])$/.exec(value||'');
  return match?{type:'month',year:2025,month:Number(match[1])}:{type:'annual',year:2025};
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
  const observations=new Map(),excluded=[...(data.excludedGeographies||[])];
  const suppressed=new Set(data.suppressedGeographies||[]);
  for(const row of data.observations){
    if(row.id!=='US'&&!geo.byId.has(row.id)){excluded.push(row.sourceGeoId);continue;}
    const quality=row.qualityState||'observed';
    if(!['observed','no_election','missing','suppressed','invalid','nonmapping_geography'].includes(quality)||
       (row.value!==null&&!Number.isFinite(row.value))||
       (quality==='observed'&&!Number.isFinite(row.value))||
       (quality!=='observed'&&row.value!==null)||observations.has(row.id))
      throw new Error('The series has invalid or ambiguous observations.');
    observations.set(row.id,row);
  }
  // County values define the colour domain when the series maps counties.
  // State totals stay in the store for the state cards but never compress a county map.
  const countyNumbers=[...observations].filter(([id,row])=>id.length===5&&Number.isFinite(row.value)).map(([,row])=>row.value);
  const stateNumbers=[...observations].filter(([id,row])=>id!=='US'&&Number.isFinite(row.value)).map(([,row])=>row.value);
  const numbers=countyNumbers.length?countyNumbers:stateNumbers;
  const min=numbers.length?Math.min(...numbers):null,max=numbers.length?Math.max(...numbers):null;
  const requested=data.scale==='log'?'log':data.scale==='diverging'?'diverging':'linear';
  const scale=requested==='log'&&!(min>0)?'linear':requested;
  const approvedDomain=Array.isArray(data.fixedDomain)&&data.fixedDomain.length===2&&data.fixedDomain.every(Number.isFinite)&&data.fixedDomain[1]>data.fixedDomain[0]?data.fixedDomain:null;
  const domain=scale==='diverging'?[85,115]:approvedDomain||[min,max];
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
  function key(metric,selection={}){
    const period=metric.periodControl==='unemployment-2025'?unemploymentPeriodKey(selection.period):'';
    const candidate=metric.consumerDataset?`${metric.switchGroup==='elections'?(selection.party||'DEMOCRAT'):''}:${selection.contestId||''}`:'';
    return [metric.id,period,candidate].filter(Boolean).join('::');
  }
  function requestUrl(metric,selection={}){
    if(metric.periodControl==='unemployment-2025'){
      const period=selection.period||{type:'annual',year:2025};
      const params=new URLSearchParams({field:metric.fieldId,period_type:period.type,year:String(period.year)});
      if(period.type==='month')params.set('month',String(period.month));
      return '/api/atlas/period-observations?'+params.toString();
    }
    if(metric.consumerDataset){
      const params=new URLSearchParams({dataset_id:metric.consumerDataset,period_type:metric.periodType||'annual',year:String(metric.periodYear||2024),geography_type:metric.geographyType||'state_and_county'});
      if(metric.switchGroup==='elections')params.set('party',selection.party||'DEMOCRAT');
      if(selection.contestId)params.set('contest_id',selection.contestId);
      return '/api/atlas/reader/v2/observations?'+params.toString();
    }
    return '/api/atlas/observations?field='+encodeURIComponent(metric.fieldId);
  }
  function get(metric,selection={}){
    const id=key(metric,selection);
    if(!layers.has(id)){
      const period=metric.periodControl==='unemployment-2025'?(selection.period||{type:'annual',year:2025}):null;
      const canRead=metric.candidateRequired?Boolean(metric.consumerDataset&&metric.candidateAvailable===true):
        Boolean(metric.fieldId)&&metric.availability!=='not_admitted'&&metric.hasObservations!==false||
        Boolean(metric.consumerDataset&&metric.candidateAvailable===true);
      layers.set(id,{status:canRead?'idle':'unavailable',values:new Map(),observations:new Map(),
        ...(period?{period:unemploymentPeriodKey(period),displayPeriod:unemploymentPeriodLabel(period),unit:'%',source:'BLS LAUS',scale:'linear'}:{}),
        ...(!canRead&&metric.candidateRequired?{error:metric.coverageNote||'The matching local refresh candidate is unavailable; no older period or denominator is substituted.'}:{}),
        ...(metric.availability==='not_admitted'&&!metric.candidateRequired?{error:'This candidate dataset has not been admitted.'}:{})});
    }
    return layers.get(id);
  }
  function load(metric,{refresh=false,period,party,contestId}={}){
    const selection={period,party,contestId},id=key(metric,selection);
    if(pending.has(id))return pending.get(id);
    const current=get(metric,selection);
    const canRead=metric.candidateRequired?Boolean(metric.consumerDataset&&metric.candidateAvailable===true):
      Boolean(metric.fieldId)&&metric.availability!=='not_admitted'&&metric.hasObservations!==false||
      Boolean(metric.consumerDataset&&metric.candidateAvailable===true);
    if(!canRead||(!refresh&&(current.status==='ready'||current.status==='error')))return Promise.resolve(current);
    const fallback=current.status==='ready'?current:null;
    if(fallback)layers.set(id,{...fallback,refreshing:true,refreshError:null});
    else layers.set(id,{...current,status:'loading',values:new Map(),observations:new Map()});
    const promise=(async()=>{
      await Promise.resolve(); // Install request ownership before callbacks, including synchronous fetch failures.
      try{
        const data=await readAtlasJSON(requestUrl(metric,selection),request);
        if(metric.consumerDataset){
          const localReview=data.localCandidatePreview===true&&data.candidateStatus==='local_candidate'&&data.admissionStatus==='candidate_nonreleased';
          const productionAdmitted=data.localCandidatePreview===false&&data.candidateStatus==='admitted'&&data.admissionStatus==='admitted';
          if(data.datasetId!==metric.consumerDataset||!(localReview||productionAdmitted))
            throw new Error('The requested reader-v2 data are unavailable or do not match the configured admission mode.');
          if(metric.switchGroup==='elections'&&data.selectedParty!==(party||'DEMOCRAT'))throw new Error('The server returned a different party selection.');
      const expectedType=metric.periodType||'annual',expectedYear=metric.periodYear||2024,
            expectedField=metric.consumerFieldId||(metric.consumerDataset==='aian_broad_share'?'01.04:aian_share':metric.catalogId),
            expectedReleases=metric.candidateSourceReleases||[],
            allowedReleases=new Set(expectedReleases.length?expectedReleases:(data.sourceRelease?[data.sourceRelease]:[])),
            expectedUnit=metric.switchGroup==='elections'||metric.consumerDataset==='aian_broad_share'?'%':metric.unit||'%';
          if(data.periodType!==expectedType||data.year!==expectedYear||
             data.geographyType!==(metric.geographyType||'state_and_county')||
             data.fieldId!==expectedField||
             (metric.candidateSourceRelease&&data.sourceRelease!==metric.candidateSourceRelease)||
             (expectedReleases.length&&JSON.stringify([...expectedReleases].sort())!==JSON.stringify([...(data.sourceReleases||[])].sort()))||
             (metric.candidateSourceUnit&&data.sourceUnit!==metric.candidateSourceUnit)||
             data.unit!==expectedUnit)
            throw new Error('The candidate response does not match its reviewed period, geography, field, unit, or release.');
          if(metric.switchGroup==='elections'&&
             (!Array.isArray(data.fixedDomain)||data.fixedDomain[0]!==0||data.fixedDomain[1]!==100))
            throw new Error('Election vote shares must use a fixed 0–100 percent domain.');
          for(const row of data.observations||[]){
            const quality=row.qualityState||'observed';
            const percentValue=expectedUnit==='%'||metric.switchGroup==='elections'||metric.consumerDataset==='aian_broad_share';
            const rowRelease=row.sourceRelease||data.sourceRelease;
            if(!['observed','no_election','missing','suppressed','invalid','nonmapping_geography'].includes(quality)||
               (quality==='observed'&&(!Number.isFinite(row.value)||row.value<0||(percentValue&&row.value>100)))||
               (quality!=='observed'&&row.value!==null)||
               (row.sourceRelease&&!allowedReleases.has(row.sourceRelease))||
               (expectedReleases.length>1&&quality==='observed'&&!row.sourceRelease)||
               (rowRelease&&!allowedReleases.has(rowRelease)))
              throw new Error('The candidate response contains an invalid value, quality state, or source release.');
            if(metric.switchGroup==='elections'&&quality==='observed'&&
               (!Number.isFinite(row.votes)||!Number.isFinite(row.totalVotes)||row.votes<0||
                row.totalVotes<=0||Math.abs(row.value-100*row.votes/row.totalVotes)>.02))
              throw new Error('Election vote shares do not match selected-party votes and contest totals.');
          }
        }else if(data.fieldId!==metric.fieldId)throw new Error('The server returned a different series.');
        if(metric.periodControl==='unemployment-2025'){
          const requested=selection.period||{type:'annual',year:2025}, expectedPeriod=unemploymentPeriodKey(requested);
          if(data.periodType!==requested.type||data.year!==requested.year||data.month!==(requested.type==='month'?requested.month:null)||data.period!==expectedPeriod)
            throw new Error('The server returned a different unemployment period.');
          if(data.sourceSeasonalAdjustment!=='NSA'||typeof data.sourceRelease!=='string'||!data.sourceRelease)
            throw new Error('The selected unemployment period has no verified NSA source identity.');
          if(data.unit!=='%'||data.observations.some(row=>row.value!=null&&(row.value<0||row.value>100)))
            throw new Error('The unemployment response has an invalid unit or rate.');
          if(!Array.isArray(data.fixedDomain)||data.fixedDomain[0]!==0||!Number.isFinite(data.fixedDomain[1])||data.fixedDomain[1]<=0)
            throw new Error('The unemployment response has no shared monthly scale.');
          if(data.observations.some(row=>row.value!=null&&row.value>data.fixedDomain[1]))
            throw new Error('The unemployment response exceeds its shared monthly scale.');
        }
        const next=prepareLayer(data,geo);
        delete next.refreshing;delete next.refreshError;
        layers.set(id,next);
      }catch(error){
        layers.set(id,fallback?{...fallback,refreshing:false,refreshError:error.message}:{status:'error',error:error.message,values:new Map(),observations:new Map()});
      }
      finally{pending.delete(id);onChange(id);}
      return layers.get(id);
    })();
    pending.set(id,promise);
    if(fallback)onChange(id);
    return promise;
  }
  function retry(metric,selection={}){layers.delete(key(metric,selection));return load(metric,selection);}
  function seed(metric,data,selection={}){
    if(!metric?.fieldId||data?.fieldId!==metric.fieldId)return false;
    layers.set(key(metric,selection),prepareLayer(data,geo));return true;
  }
  function refresh(metric,selection={}){return load(metric,{...selection,refresh:true});}
  return {get,load,retry,seed,refresh};
}

export function missingReason(metric,feature,layer) {
  if(layer.status==='error')return layer.error;
  if(layer.status==='unavailable')return metric.coverageNote||'This candidate source is unavailable for the selected period.';
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
  const annual=period.match(/^(\d{4})-M13$/);
  if(annual)return `Annual average ${annual[1]}`;
  const match=period.match(/^(\d{4})-M(\d{2})$/);
  return match?new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+match[1],+match[2]-1,1))):period;
}
export function comparable(a,b,placeA,placeB) {
  return a.status==='ready'&&b.status==='ready'&&a.fieldId===b.fieldId&&(a.sourcePeriod||a.period)===(b.sourcePeriod||b.period)&&
    a.sourceRelease===b.sourceRelease&&a.source===b.source&&a.unit===b.unit&&Boolean(placeA)&&Boolean(placeB)&&placeA.id.length===placeB.id.length;
}
