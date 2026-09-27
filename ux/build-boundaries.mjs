// Convert official ACS2017 1:500,000 county GeoJSON responses into per-state detail.
// Input: a directory of <state FIPS>.json responses from the documented Census query.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
const input=process.argv[2];if(!input)throw new Error('Usage: node ux/build-boundaries.mjs <raw-response-directory>');
const base=new URL('./boundaries/',import.meta.url);fs.mkdirSync(base,{recursive:true});
const us=JSON.parse(fs.readFileSync(new URL('../node_modules/us-atlas/counties-10m.json',import.meta.url)));
const counties=topojson.feature(us,us.objects.counties).features.filter(f=>+f.id.slice(0,2)<60),states=[...new Set(counties.map(f=>f.id.slice(0,2)))].sort();
const manifest={source:'https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2017/State_County/MapServer/5',vintage:2017,scale:'1:500,000',query:{where:"STATE = '<state FIPS>'",outFields:'GEOID,BASENAME',outSR:4326,f:'geojson',returnGeometry:true,geometryPrecision:6},states:[]};
for(const state of states){
  const file=`${input}/${state}.json`;if(!fs.existsSync(file)){throw new Error('Missing '+file);}
  const raw=fs.readFileSync(file),data=JSON.parse(raw);
  const features=data.features.map(f=>{
    const feature={type:'Feature',id:f.properties.GEOID,properties:{name:f.properties.BASENAME},geometry:f.geometry};
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const polygon of polygons){if(d3.geoArea({type:'Polygon',coordinates:polygon})>2*Math.PI)polygon.forEach(ring=>ring.reverse());}
    if(!Number.isFinite(d3.geoArea(feature))||d3.geoArea(feature)>2*Math.PI)throw new Error('Invalid boundary '+feature.id);
    return feature;
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const expected=counties.filter(f=>f.id.startsWith(state)).map(f=>f.id).sort();
  if(JSON.stringify(features.map(f=>f.id))!==JSON.stringify(expected))throw new Error('County IDs mismatch for '+state);
  const bytes=JSON.stringify({type:'FeatureCollection',features})+'\n';
  fs.writeFileSync(new URL(`${state}.json`,base),bytes);
  manifest.states.push({id:state,counties:features.length,bytes:Buffer.byteLength(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex')});
}
fs.writeFileSync(new URL('manifest.json',base),JSON.stringify(manifest,null,2)+'\n');
console.log({states:manifest.states.length,counties:manifest.states.reduce((n,s)=>n+s.counties,0),bytes:manifest.states.reduce((n,s)=>n+s.bytes,0)});
