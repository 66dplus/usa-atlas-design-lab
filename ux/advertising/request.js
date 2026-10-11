// Version 2 preserves the master's location, duration and contact choices.
// The legacy email endpoint accepts version 1 only; v2 remains a review export.
import {supportsDevice} from './creative.js';
const graphemes=new Intl.Segmenter('en',{granularity:'grapheme'});
export const characterCount=text=>[...graphemes.segment(text)].length;
export const copyLimits=format=>({headline:format==='ticker'?100:40,subtitle:60,cta:18});
export function validateRequest(request) {
  const errors=[],required=(id,value,message)=>{if(!value?.trim())errors.push({id,message});};
  const {creative,contact,durationDays}=request;
  if(request.kind==='inquiry')required('inquiry-idea',request.idea,'Tell us about your idea.');
  else {
    for(const [key,limit] of Object.entries(copyLimits(creative.format)))if((key!=='subtitle'||creative.format==='banner')&&characterCount(creative[key])>limit)errors.push({id:'ad-'+key,message:`Keep ${key} within ${limit} characters, including spaces.`});
    if(!creative.locations.length)errors.push({id:'location-search',message:'Choose at least one location.'});
    if(!creative.indicators.length)errors.push({id:'indicator-search',message:'Choose at least one indicator.'});
    if(!creative.devices.length)errors.push({id:'target-desktop',message:'Choose at least one device.'});
    if(creative.devices.some(device=>!supportsDevice(creative.format,device)))errors.push({id:'target-mobile',message:'Scrolling text is available on Desktop only.'});
    required('ad-headline',creative.headline,'Add a headline.');
    required('ad-cta',creative.cta,'Add button text.');
    try{if(!['http:','https:'].includes(new URL(creative.url).protocol))throw new Error();}
    catch{errors.push({id:'ad-url',message:'Enter a complete http or https website address.'});}
  }
  if(request.kind!=='inquiry'&&(!Number.isSafeInteger(durationDays)||durationDays<1))errors.push({id:'custom-days',message:'Enter a whole number of days, at least 1.'});
  if(contact.channel==='whatsapp'){
    if(!/^\+?[0-9 ()-]+$/.test(contact.whatsapp)||contact.whatsapp.replace(/\D/g,'').length<7||contact.whatsapp.replace(/\D/g,'').length>15)errors.push({id:'contact-whatsapp',message:'Enter your WhatsApp number with country code.'});
  }else if(contact.channel==='email'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))errors.push({id:'contact-email',message:'Enter a valid email address.'});
  }else errors.push({id:'contact-whatsapp',message:'Choose a contact method.'});
  return errors;
}
