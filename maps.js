import {field,noise,palettes,colorAt} from './field.js';
const svgOpen='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 750" width="1200" height="750">';
export function mapSVG(g,theme,metric,d3){
 const colors=palettes[theme==='blue'?'blue':theme==='relief'||theme==='neighborhood'?'green':theme==='contour'?'ember':'ink'];
 const bg={blue:'#252e33',relief:'#d6ddd7',neighborhood:'#eff1ec',contour:'#f7f2e5',dots:'#eeeee3'}[theme];
 let body=`<rect width="1200" height="750" fill="${bg}"/><defs><clipPath id="land"><path d="${g.nation}"/></clipPath></defs>`;
 if(theme==='neighborhood')return neighborhoodSVG(g,metric);
 if(theme==='dots'){
  body+=`<path d="${g.nation}" fill="#e3e4d7" stroke="#929782" stroke-width=".6"/><path d="${g.states}" fill="none" stroke="#b4b8a5" stroke-width=".6"/>`;
  for(const [x,y,lon,lat] of g.samples){const v=field(lon,lat,metric);if(noise(x*1.3,y*1.7)<v*.84)body+=`<circle cx="${x}" cy="${y}" r="${.8+v*.7}" fill="${v>.42?'#bc861f':'#495c4b'}" opacity=".85"/>`;}
 } else if(theme==='contour'||theme==='relief'){
  body+=`<path d="${g.nation}" fill="${theme==='relief'?'#dce4d6':'#f2e6c6'}"/>`;
  const w=240,h=150,values=[];
  // Geolocated field sampled from the same Albers grid; contours are data, not terrain.
  const p=d3.geoAlbers().fitExtent([[35,35],[1165,715]],g.mainland);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const [lon,lat]=p.invert([x*5,y*5]);values.push(field(lon,lat,metric));}
  body+='<g clip-path="url(#land)">';
  for(const c of d3.contours().size([w,h]).thresholds([.1,.15,.2,.25,.3,.36,.43,.52,.65,.8])(values))body+=`<path d="${d3.geoPath(d3.geoIdentity().scale(5))(c)}" fill="${colorAt(colors,theme==='relief'?c.value*1.65:c.value)}" fill-opacity="${theme==='relief'?'.65':'.8'}" stroke="${theme==='relief'?'#56826b':'#864920'}" stroke-opacity=".3" stroke-width=".5"/>`;
  body+='</g>';
  if(theme==='relief')body+=`<image href="${g.reliefShade}" width="1200" height="750" clip-path="url(#land)"/>`;
 } else {
  for(const c of g.counties){const n=noise(+c.id,metric);const v=Math.max(0,Math.min(.98,field(...c.center,metric)*1.7+n*.16-.09));body+=`<path d="${c.path}" fill="${colorAt(colors,v)}" stroke="${theme==='blue'?'#99cbd0':'#edf1e9'}" stroke-opacity=".12" stroke-width=".25"/>`;}
  if(theme==='relief'){
   body+=`<image href="${g.reliefShade}" width="1200" height="750" clip-path="url(#land)"/>`;
   body+=`<path d="${g.nation}" fill="none" stroke="#879b8d" stroke-width="1.2"/>`;
  }
 }
 body+=`<path d="${g.states}" fill="none" stroke="${theme==='blue'?'#bedcde':'#596b5f'}" stroke-opacity="${theme==='blue'?'.28':'.28'}" stroke-width=".75"/>`;
 const text=theme==='blue'?'#e1ecea':'#334538';
 const selected=theme==='blue'?['Seattle','Los Angeles','Chicago','New York','Houston']:theme==='contour'?['San Francisco','Denver','Chicago','Atlanta','New York']:['Seattle','San Francisco','Denver','Houston','Miami','Chicago','New York'];
 for(const city of g.cities.filter(c=>selected.includes(c.name))){const [x,y]=city.point;const right=x>990,dy=city.name==='New York'?-34:city.name==='Chicago'?-43:-25;body+=`<g fill="${text}" stroke="${text}"><circle cx="${x}" cy="${y}" r="2.8" stroke-width="1"/><path d="M${x},${y-5}l${right?-20:14},${dy}" fill="none" stroke-width=".6"/><text x="${x+(right?-25:19)}" y="${y+dy-5}" stroke="${theme==='blue'?'#344d5b':bg}" stroke-width="3" stroke-linejoin="round" paint-order="stroke" font-family="Arial,sans-serif" font-size="13" text-anchor="${right?'end':'start'}">${city.name}</text></g>`;}
 body+=`<g fill="${text}" opacity=".65" font-family="Arial,sans-serif" font-size="10" letter-spacing="2"><text x="86" y="480" transform="rotate(-63 86 480)">PACIFIC OCEAN</text><text x="1040" y="510" transform="rotate(-55 1040 510)">ATLANTIC OCEAN</text><text x="620" y="695">GULF OF MEXICO</text></g>`;
 return svgOpen+body+'</svg>';
}
export function neighborhoodSVG(g,metric=0){
 let body='<rect width="1200" height="750" fill="#e9ede2"/>';
 for(const a of g.neighborhood.areas)body+=`<path d="${a.path}" fill="${a.line?'none':a.water?'#c7d7d6':'#d1dfbd'}" stroke="${a.water?'#c7d7d6':'#d1dfbd'}" stroke-width="${a.line?(a.river?22:3):1}"/>`;
 for(const r of g.neighborhood.roads)body+=`<path d="${r.path}" fill="none" stroke="${r.major?'#fdfefa':'#fcfdf8'}" stroke-width="${r.major?3.3:1.25}"/>`;
 // Synthetic marks sit on observed street geometry; they are not address-level records.
 for(const [x,y,id] of g.neighborhood.marks){const v=(Math.sin(x*.009+metric*.9)*Math.cos(y*.008-metric*.3)+1)/2;const radius=2+v*5.3;body+=`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${colorAt(palettes.green,v*.9)}" fill-opacity=".72" stroke="#f9fcf7" stroke-width=".65"/>`;}
 body+='<g font-family="Arial,sans-serif" font-size="12" letter-spacing="2" fill="#456750"><text x="550" y="440">CENTER CITY</text><text x="225" y="460">UNIVERSITY CITY</text><text x="655" y="160">NORTH PHILADELPHIA</text><text x="850" y="575">CAMDEN</text><text x="700" y="655">SOUTH PHILADELPHIA</text></g>';
 return svgOpen+body+'</svg>';
}
