export const exampleImage = 'assets/san-francisco-photo.jpg';
export const supportsDevice=(format,device)=>format!=='ticker'||device==='desktop';
export function isTargeted(ad, device, metric, place) {
  return ad.devices.includes(device) && ad.indicators.includes(metric) &&
    supportsDevice(ad.format,device) && (!ad.locations||ad.locations.includes(place));
}
const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
// This renderer owns the creative in both placements. Copy is always plain text.
export function renderCreative(host,ad,device) {
  host.replaceChildren();
  host.classList.remove('banner','ticker','light','dark','desktop','mobile');host.classList.add('creative',ad.format,ad.theme,device);
  let destination;
  try{const url=new URL(ad.url);if(['http:','https:'].includes(url.protocol))destination=url.href;}catch{}
  host.style.setProperty('--image-area',ad.imageArea+'%');
  host.style.setProperty('--image-ratio',ad.imageArea/100);
  if(ad.format==='ticker'){
    host.style.setProperty('--duration',({slow:32,normal:22,fast:14})[ad.speed]+'s');
    host.classList.toggle('paused',ad.paused);
    host.append(element('span','sponsor-label','Sponsored'));
    const viewport=element('div','ticker-viewport'),track=element('div','ticker-track');
    for(let i=0;i<2;i++){
      const copy=element('div','ticker-copy');if(i)copy.setAttribute('aria-hidden','true');
      const cta=element(destination?'a':'span','',ad.cta||'Learn more');if(destination){cta.href=destination;cta.target='_blank';cta.rel='noopener noreferrer';if(i)cta.tabIndex=-1;}
      copy.append(element('b','',ad.headline||'Your headline'),cta);
      track.append(copy);
    }
    viewport.append(track);host.append(viewport);return;
  }
  const media=element('div','creative-media'),photo=document.createElement('img');
  photo.src=ad.image||exampleImage;photo.alt='Advertiser creative';photo.style.objectPosition=`${ad.imagePosition}% 50%`;
  photo.style.transform=`scale(${ad.imageZoom/100})`;media.append(photo);
  const body=element('div','creative-body');body.append(element('span','sponsor-label','Sponsored'),element('h3','',ad.headline||'Your headline'));
  if(ad.subtitle)body.append(element('p','',ad.subtitle));
  const cta=element(destination?'a':'span','creative-cta',ad.cta||'Learn more');
  if(destination){cta.href=destination;cta.target='_blank';cta.rel='noopener noreferrer';}
  body.append(cta);host.append(media,body);
}
