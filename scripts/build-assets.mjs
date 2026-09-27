import fs from 'node:fs';
import * as d3 from 'd3';
import * as topo from 'topojson-client';
import sharp from 'sharp';
import {cities,field,noise} from '../field.js';
import {mapSVG} from '../maps.js';
const us=JSON.parse(fs.readFileSync('node_modules/us-atlas/counties-10m.json'));
const world=JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-110m.json'));
const states=topo.feature(us,us.objects.states);
const lower=s=>+s.id<60&&!['02','15'].includes(s.id);
const lowerGeoms=us.objects.states.geometries.filter(lower);
const mainland=topo.merge(us,lowerGeoms);
const projection=d3.geoAlbers().fitExtent([[35,35],[1165,715]],mainland);
const path=d3.geoPath(projection).digits(2);
const counties=topo.feature(us,us.objects.counties).features.filter(f=>lower({id:f.id.slice(0,2)}));
const rings=mainland.coordinates.map(poly=>poly.map(ring=>ring.map(projection)));
const contains=(x,y)=>rings.some(poly=>d3.polygonContains(poly[0],[x,y])&&!poly.slice(1).some(r=>d3.polygonContains(r,[x,y])));
const samples=[];
for(let y=38;y<712;y+=3.6)for(let x=38;x<1165;x+=3.6){
 if(!contains(x,y))continue;
 const [lon,lat]=projection.invert([x,y]);
 samples.push([+x.toFixed(2),+y.toFixed(2),+lon.toFixed(5),+lat.toFixed(5)]);
}
const geo={
 width:1200,height:750,nation:path(mainland),
 states:path(topo.mesh(us,{type:'GeometryCollection',geometries:lowerGeoms},(a,b)=>a!==b)),
 counties:counties.map(f=>({id:f.id,name:f.properties.name,path:path(f),center:d3.geoCentroid(f)})),
 samples,cities:cities.filter(c=>c[1]>-130).map(c=>({name:c[0],point:projection([c[1],c[2]]),lon:c[1],lat:c[2]})),
 mainland,world:topo.feature(world,world.objects.countries),
 globeLines:topo.mesh(world,world.objects.countries),
 usLines:topo.mesh(us,us.objects.states),
 insets:states.features.filter(f=>['02','15'].includes(f.id)).map(f=>({name:f.properties.name,path:d3.geoPath(d3.geoAlbersUsa().scale(260).translate([190,270])).digits(2)(f)}))
};
const osm=JSON.parse(fs.readFileSync('assets/philadelphia-osm.json'));
if(osm.remark)throw new Error(osm.remark);
const merc=d3.geoMercator().center([-75.158,39.956]).scale(420000).translate([600,375]);
const roads=[],areas=[],marks=[];
for(const way of osm.elements){
 if(!way.geometry?.length)continue;
 const pts=way.geometry.map(p=>merc([p.lon,p.lat]));
 if(!pts.some(p=>p[0]>-200&&p[0]<1400&&p[1]>-200&&p[1]<950))continue;
 const path=pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
 const t=way.tags||{};
 if(t.highway){roads.push({path,major:['motorway','trunk','primary'].includes(t.highway)});if(way.id%5===0){const p=pts[Math.floor(pts.length/2)];if(p[0]>0&&p[0]<1200&&p[1]>0&&p[1]<750)marks.push([...p,way.id]);}}
 else if(t.waterway)areas.push({path,water:true,line:true,river:t.waterway==='river'});
 else {const a=way.geometry[0],b=way.geometry.at(-1);if(a.lat===b.lat&&a.lon===b.lon)areas.push({path:path+'Z',water:t.natural==='water'});}
}
geo.neighborhood={roads,areas,marks,features:osm.elements.length};
// Derive registered relief shading from the real Earth normal map, not invented mountains.
const normal=await sharp('assets/earth-normal.jpg').resize(8192,4096,{kernel:'cubic'}).raw().toBuffer({resolveWithObject:true});
const shade=Buffer.alloc(1200*750*4);
for(let y=0;y<750;y++)for(let x=0;x<1200;x++){
 const [lon,lat]=projection.invert([x,y]);const u=Math.max(0,Math.min(normal.info.width-1,Math.floor((lon+180)/360*normal.info.width))),v=Math.max(0,Math.min(normal.info.height-1,Math.floor((90-lat)/180*normal.info.height)));
 const p=(v*normal.info.width+u)*normal.info.channels;
 const nx=normal.data[p]/127.5-1,ny=normal.data[p+1]/127.5-1;
 const i=(y*1200+x)*4,amount=Math.min(115,Math.abs(nx*.75+ny*.55)*210);
 shade[i]=shade[i+1]=shade[i+2]=nx+ny>0?255:18;shade[i+3]=amount;
}
const shadePng=await sharp(shade,{raw:{width:1200,height:750,channels:4}}).png().toBuffer();
fs.writeFileSync('assets/relief-shade.png',shadePng);geo.reliefShade='data:image/png;base64,'+shadePng.toString('base64');
fs.writeFileSync('assets/geography.json',JSON.stringify(geo));
for(const theme of ['blue','neighborhood','relief','contour','dots']){
 const svg=mapSVG(geo,theme,0,d3);fs.writeFileSync(`assets/map-${theme}.svg`,svg);
 await sharp(Buffer.from(svg)).png().toFile(`assets/map-${theme}.png`);
}
fs.writeFileSync('assets/geometry-stats.json',JSON.stringify({counties:counties.length,samples:samples.length,source:'us-atlas@3.0.1 / Census 2017; world-atlas@2.0.2 / Natural Earth',coordinateSystem:'Albers, lower 48',synthetic:true},null,2));
console.log(`Built ${counties.length} counties and ${samples.length} geographic samples; five SVG compositions`);
