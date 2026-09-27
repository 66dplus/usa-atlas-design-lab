import {AtlasScene} from './scene.js';
import {mapSVG} from './maps.js';
import {metrics,palettes} from './field.js';
const $=s=>document.querySelector(s);
export const studies={
 '3d':[
  {id:'orbital',title:'Orbital observatory',short:'Orbital',form:'Satellite globe',subtitle:'The shape of a nation.<br>The texture of its differences.',note:'Radial columns follow the curvature of the Earth. A national view with the presence of a physical object.',ref:'China globe → atmospheric rim, real Earth imagery and dense radial columns.',palette:'orbital'},
  {id:'ember',title:'Where intensity rises',short:'Ember',form:'Fine density peaks',subtitle:'A field of light.<br>A landscape of concentration.',note:'Fine columns make the geography legible at a glance. Height amplifies a synthetic spatial field.',ref:'Egypt → fine amber-to-plum peaks, generous paper ground, editorial restraint.',palette:'ember'},
  {id:'porcelain',title:'A softer topography',short:'Porcelain',form:'Pastel data sculpture',subtitle:'Peaks, plains and everything<br>in between.',note:'Rose, lavender and porcelain turn the same field into a quieter, tactile-looking surface.',ref:'Bangladesh → pastel colour fields, delicate vertical peaks and a sculptural national outline.',palette:'porcelain'},
  {id:'strata',title:'Layers of a nation',short:'Strata',form:'Exploded atlas',subtitle:'One geography.<br>Three ways of seeing it.',note:'Three separate fields share exact geographic registration. Bottom: selected layer. Middle and top: alternate demo lenses.',ref:'Geological reference → physically separated geographic layers with visible registration.',palette:'green'},
  {id:'engraved',title:'An atlas in ink',short:'Engraved',form:'Stippled globe',subtitle:'The world, drawn quietly.<br>America, brought into focus.',note:'A fine graticule and restrained stippling borrow the clarity of an engraved printed globe.',ref:'Cream globe → fine boundaries and graticule, amber stippling, restrained editorial type.',palette:'ink'}
 ],
 '2d':[
  {id:'blue',title:'A thousand local stories',short:'Blue hour',form:'County mosaic',subtitle:'Across the country.<br>Down to the county.',note:'Detailed county boundaries carry a seven-step blue, cyan and pale-yellow colour scale.',ref:'UK precipitation → precise county mosaic, mineral-dark ground and a blue-to-yellow scale.',palette:'blue'},
  {id:'neighborhood',title:'Closer to home',short:'Neighborhood',form:'OSM street atlas',subtitle:'Read the city<br>one neighbourhood at a time.',note:'Real Philadelphia streets and waterways from OpenStreetMap. Circular marks are synthetic, not address-level records.',ref:'Philadelphia → quiet street context with green overlays. No hexagons.',palette:'green'},
  {id:'relief',title:'The underlying landscape',short:'Fieldwork',form:'Relief & regions',subtitle:'Geography is more<br>than a boundary.',note:'A green regional field over real geographic relief. Terrain texture provides context, not a second statistical variable.',ref:'South America → shaded geographic relief, botanical green and anchored city labels.',palette:'green'},
  {id:'contour',title:'Contours of difference',short:'Isopleth',form:'Continuous fields',subtitle:'When boundaries soften,<br>patterns emerge.',note:'Continuous contours show a synthetic data surface. These are not elevation contours or measured estimates.',ref:'Density-map references → the vertical field translated into planar contours on a printed atlas.',palette:'ember'},
  {id:'dots',title:'Every mark, a possibility',short:'Census ink',form:'Dot-density atlas',subtitle:'Less interface.<br>More geography.',note:'Small, unevenly distributed marks create a national texture. Each dot is a design sample, not a person.',ref:'Engraved globe → geographic stippling, olive ink and a single ochre accent.',palette:'ink'}
 ]
};
let mode='3d',index=0,metric=0,geo,scene,request=0;
const studyLocation=id=>{
 const n=Number(id);
 if(!Number.isInteger(n)||n<1||n>10)return null;
 return n<=5?{mode:'3d',index:n-1}:{mode:'2d',index:n-6};
};
const studyNumber=()=>String(index+(mode==='3d'?1:6)).padStart(2,'0');
function readURL(){
 const params=new URLSearchParams(location.search),selected=studyLocation(params.get('study'));
 if(selected){mode=selected.mode;index=selected.index;}
 const selectedMetric=Number(params.get('metric'));
 if(Number.isInteger(selectedMetric)&&selectedMetric>=0&&selectedMetric<metrics.length)metric=selectedMetric;
}
function writeURL(){
 const url=new URL(location.href);url.searchParams.set('study',studyNumber());
 if(metric)url.searchParams.set('metric',String(metric));else url.searchParams.delete('metric');
 history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);
}
function fail(message){$('#status').hidden=false;$('#status').textContent=message;}
metrics.forEach((name,i)=>$('#metric').add(new Option(name,i)));
readURL();$('#metric').value=String(metric);
function renderNav(){
 $('#directions').replaceChildren(...studies[mode].map((s,i)=>{const b=document.createElement('button');b.setAttribute('aria-pressed',String(i===index));b.dataset.index=i;b.innerHTML=`<span class="study-no">${String(i+(mode==='3d'?1:6)).padStart(2,'0')}</span><span class="study-label">${s.short}<small>${s.form}</small></span>`;b.addEventListener('click',()=>{index=i;show();});return b;}));
 $('#collection-name').textContent=mode==='3d'?'Spatial studies':'Flat studies';$('#collection-count').textContent=mode==='3d'?'01 — 05':'06 — 10';
}
async function show(){
 if(!geo)return;const token=++request,s=studies[mode][index];document.body.dataset.theme=s.id;
 writeURL();
 $('#title').textContent=s.title;$('#subtitle').innerHTML=s.subtitle;$('#reference-note').textContent=s.ref;$('#legend-name').textContent=metrics[metric];
 $('#study-note').innerHTML=`<strong>${s.id==='neighborhood'?'Philadelphia':mode==='3d'&&s.id!=='engraved'?geo.samples.length.toLocaleString('en-US'):s.id==='blue'?geo.counties.length.toLocaleString('en-US'):'Lower 48'}</strong>${s.id==='neighborhood'?'Real OSM streets & waterways':mode==='3d'&&s.id!=='engraved'?'Geographically registered samples':s.id==='blue'?'Real county boundaries':'Contiguous United States'}`;
 $('#color-ramp').innerHTML=palettes[s.palette].map(c=>`<i style="background:${c}"></i>`).join('');
 $('#encoding').textContent=s.id==='strata'?`Bottom: ${metrics[metric]} · Middle: ${metrics[(metric+3)%10]} · Top: ${metrics[(metric+6)%10]}. All synthetic.`:mode==='3d'&&s.id!=='engraved'?'Colour + height = relative intensity':s.id==='dots'||s.id==='engraved'?'Density = relative intensity':'Colour = relative intensity';
 $('#view-hint').textContent=mode==='3d'?'Lower 48 · Drag to orbit · Scroll to zoom':s.id==='neighborhood'?'Geographic composition · Philadelphia':'Geographic composition · Lower 48';
 $('#attribution').innerHTML=s.id==='neighborhood'?'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> · ODbL':'Boundaries: US Census / Natural Earth'+(s.id==='orbital'||s.id==='relief'?' · Earth imagery: Three.js examples':'');
 $('#scene').hidden=mode!=='3d';$('#flat').hidden=mode!=='2d';$('.view-controls').hidden=mode!=='3d';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 renderNav();$('#status').hidden=false;$('#status').textContent='Drawing the geographic field…';
 try{
  if(mode==='3d'){
   if(!scene)scene=new AtlasScene($('#scene'),geo,fail);
   await scene.show(s.id,metric);scene.resize();
  }else {
   if(scene){scene.dispose();scene=null;}
   $('#flat').innerHTML=mapSVG(geo,s.id,metric,d3);
   $('#flat').setAttribute('aria-label',`${s.title}. ${metrics[metric]} synthetic index. Real geographic boundaries.`);
  }
  if(token===request)$('#status').hidden=true;
 }catch(e){console.error(e);if(token===request)fail(`Unable to render this study: ${e.message}. Try 2D cartography or reload.`);}
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;show();}));
$('#metric').addEventListener('change',e=>{metric=+e.target.value;show();});
$('#reset').addEventListener('click',()=>scene?.reset());$('#rotate').addEventListener('click',()=>scene?.rotate());$('#zoom-in').addEventListener('click',()=>scene?.zoom(.9));$('#zoom-out').addEventListener('click',()=>scene?.zoom(1.1));
try{const response=await fetch('assets/geography.json');if(!response.ok)throw new Error(`Geography asset HTTP ${response.status}`);geo=await response.json();await show();}catch(e){console.error(e);fail(`The geographic assets could not be loaded. ${e.message}. Run npm run assets, then reload.`);}
