import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPlaceIndex,canonicalPath,countySlug,parsePath,resolveHouseQuery,resolveRoute,routeParams,slugify} from './routes.js';
import {createPageMetadata,mapPageMetadata,screenPageMetadata} from './seo.js';

const states=[
  {id:'06',name:'California'},{id:'17',name:'Illinois'},{id:'24',name:'Maryland'},
  {id:'28',name:'Mississippi'},{id:'29',name:'Missouri'},{id:'48',name:'Texas'},{id:'51',name:'Virginia'},
];
const counties=[
  {id:'06075',stateId:'06',name:'San Francisco'},{id:'17031',stateId:'17',name:'Cook'},
  {id:'24005',stateId:'24',name:'Baltimore'},{id:'24510',stateId:'24',name:'Baltimore city'},
  {id:'29510',stateId:'29',name:'St. Louis city'},{id:'51059',stateId:'51',name:'Fairfax'},
  {id:'51600',stateId:'51',name:'Fairfax city'},{id:'06001',stateId:'06',name:'Alpha'},
  {id:'06003',stateId:'06',name:'Alpha'},
];
const index=buildPlaceIndex(states,counties);
const districtIndex=buildPlaceIndex(states,counties,[{id:'0606',districtCode:'06',name:'California · Congressional District 6'},
  {id:'0607',districtCode:'07',name:'California · Congressional District 7'}]);
const metrics=new Set(['unemployment','elections-house','adjusted-gross-income-agi','adjusted-gross-income-agi--per-resident','median-household-income','electricity-price','electricity-price--08-05-sector-res','access-to-a-grocery-store']);
const resolve=path=>resolveRoute(parsePath(path),index,metrics);

assert.equal(slugify('District of Columbia'),'district-of-columbia');
assert.equal(countySlug('Baltimore city','24510'),'baltimore-city-county');
assert.deepEqual(resolve('/united-states/unemployment'),{page:'map',concept:'explorer',place:null,metric:'unemployment'});
assert.equal(resolve('/united-states/california/unemployment').place,'06');
assert.equal(resolve('/united-states/california/san-francisco-county/unemployment').place,'06075');
assert.equal(resolve('/united-states/maryland/baltimore-city-county/unemployment').place,'24510');
assert.equal(resolve('/united-states/virginia/fairfax-city-county/unemployment').place,'51600');
assert.deepEqual(resolve('/compare/places/unemployment/california/vs/texas'),{
  page:'compare',concept:'compare',comparison:'places',place:'06',second:'48',metric:'unemployment',
});
assert.deepEqual(resolve('/compare/places/unemployment/california/san-francisco-county/vs/illinois/cook-county'),{
  page:'compare',concept:'compare',comparison:'places',place:'06075',second:'17031',metric:'unemployment',
});
assert.deepEqual(resolve('/compare/places/unemployment/california/vs/united-states'),{
  page:'compare',concept:'compare',comparison:'places',place:'06',second:null,metric:'unemployment',
});
assert.deepEqual(resolve('/compare/indicators/unemployment-vs-adjusted-gross-income-agi'),{
  page:'compare',concept:'compare',comparison:'metrics',place:null,metric:'unemployment',secondMetric:'adjusted-gross-income-agi',
});
assert.equal(resolve('/compare/places/electricity-price-residential/california/vs/texas').metric,'electricity-price--08-05-sector-res');
assert.equal(resolve('/united-states/california/electricity-price-residential').metric,'electricity-price--08-05-sector-res');
assert.equal(resolve('/compare/indicators/unemployment-vs-adjusted-gross-income-agi-per-resident').secondMetric,'adjusted-gross-income-agi--per-resident');
assert.equal(resolve('/united-states/mississippi/access-to-a-grocery-store').metric,'access-to-a-grocery-store');
assert.equal(resolve('/compare/indicators/median-household-income-vs-adjusted-gross-income-agi/in/california').place,'06');
assert.equal(resolve('/stats').page,'stats');
assert.equal(resolve('/about').page,'info');
assert.equal(resolve('/blog/mississippi').article,'mississippi');
assert.equal(resolve('/united-states/california/alpha-county/unemployment'),null,'ambiguous in-state county slug must not resolve');
assert.equal(resolve('/united-states/alpha-county/unemployment'),null,'ambiguous national county slug must not resolve');
assert.equal(resolve('/united-states/california/alpha-county-06001/unemployment').place,'06001');
assert.equal(resolve('/united-states/california/alpha-county-06003/unemployment').place,'06003');
assert.equal(resolve('/united-states/california-vs-texas/unemployment').comparison,'places','old clean comparison paths remain resolvable');
assert.equal(resolve('/united-states/unemployment-vs-adjusted-gross-income-agi').comparison,'metrics','old clean metric-comparison paths remain resolvable');
assert.equal(parsePath('/united-states/california/%2F/unemployment'),null);

assert.equal(canonicalPath({page:'map',metric:'unemployment'},index),'/united-states/unemployment');
assert.equal(canonicalPath({page:'map',metric:'unemployment',place:'06'},index),'/united-states/california/unemployment');
assert.equal(canonicalPath({page:'map',metric:'unemployment',selected:'06'},index),'/united-states/california/unemployment');
assert.equal(canonicalPath({page:'map',metric:'unemployment',place:'06075'},index),'/united-states/california/san-francisco-county/unemployment');
assert.equal(canonicalPath({page:'map',metric:'electricity-price--08-05-sector-res',place:'06'},index),'/united-states/california/electricity-price-residential');
assert.equal(canonicalPath({page:'compare',concept:'compare',comparison:'places',metric:'unemployment',place:'06',second:'48'},index),'/compare/places/unemployment/california/vs/texas');
assert.equal(canonicalPath({page:'compare',concept:'compare',comparison:'places',metric:'unemployment',place:'06075',second:'17031'},index),'/compare/places/unemployment/california/san-francisco-county/vs/illinois/cook-county');
assert.equal(canonicalPath({page:'compare',concept:'compare',comparison:'places',metric:'unemployment',place:'06',second:null},index),'/compare/places/unemployment/california/vs/united-states');
assert.equal(canonicalPath({page:'compare',concept:'compare',comparison:'places',metric:'electricity-price--08-05-sector-res',place:'06',second:'48'},index),'/compare/places/electricity-price-residential/california/vs/texas');
assert.equal(canonicalPath({page:'compare',concept:'compare',comparison:'metrics',metric:'unemployment',secondMetric:'adjusted-gross-income-agi'},index),'/compare/indicators/unemployment-vs-adjusted-gross-income-agi');
assert.equal(canonicalPath({page:'compare',concept:'compare',comparison:'metrics',metric:'unemployment',secondMetric:'adjusted-gross-income-agi',selected:'06'},index),'/compare/indicators/unemployment-vs-adjusted-gross-income-agi/in/california');
assert.equal(canonicalPath({page:'stats'},null),'/stats');
assert.equal(canonicalPath({page:'article',article:'mississippi'},null),'/blog/mississippi');
assert.equal(canonicalPath({page:'map',metric:'elections-house',selected:'0606'},districtIndex),'/united-states/elections-house');

const retained=routeParams(new URLSearchParams('place=06&metric=unemployment&theme=dark&renderer=svg&page=map&embed=1'));
assert.equal(new URLSearchParams(retained).has('theme'),false);
assert.equal(new URLSearchParams(retained).has('renderer'),false);
assert.equal(new URLSearchParams(retained).get('embed'),'1');
assert.equal(new URLSearchParams(retained).has('place'),false);
assert.equal(routeParams(new URLSearchParams('review=1&preview=1&embed=1&expanded=1&view=3d&rank=highest')),'embed=1&review=1&preview=1');
const selections=new URLSearchParams(routeParams(new URLSearchParams('period=2025-M01&party=REPUBLICAN&district=invalid'),{state:{selected:'0606'},index:districtIndex}));
assert.equal(selections.get('period'),'2025-M01');
assert.equal(selections.get('party'),'REPUBLICAN');
assert.equal(selections.get('district'),'0606');
assert.equal(new URLSearchParams(routeParams(new URLSearchParams('period=2026-M01&party=OTHER'))).has('period'),false);
assert.equal(new URLSearchParams(routeParams(new URLSearchParams('period=2026-M01&party=OTHER'))).has('party'),false);
const houseState={page:'compare',concept:'compare',comparison:'places',metric:'elections-house',selected:'0606',second:'0607'};
const houseQuery=new URLSearchParams(routeParams(new URLSearchParams('party=REPUBLICAN'),{state:houseState,index:districtIndex,metricIds:metrics}));
assert.equal(canonicalPath(houseState,districtIndex),'/united-states/elections-house');
assert.deepEqual(resolveHouseQuery(houseQuery,districtIndex,metrics,'/united-states/elections-house'),{
  selected:'0606',page:'compare',concept:'compare',comparison:'places',second:'0607',
});
const houseMetrics={page:'compare',concept:'compare',comparison:'metrics',metric:'elections-house',secondMetric:'adjusted-gross-income-agi',selected:'0606'};
const metricQuery=new URLSearchParams(routeParams(new URLSearchParams(),{state:houseMetrics,index:districtIndex,metricIds:metrics}));
assert.deepEqual(resolveHouseQuery(metricQuery,districtIndex,metrics,'/united-states/elections-house'),{
  selected:'0606',page:'compare',concept:'compare',comparison:'metrics',metric:'elections-house',secondMetric:'adjusted-gross-income-agi',
});
assert.equal(resolveHouseQuery(new URLSearchParams('district=0608&compare=places&secondDistrict=0607'),districtIndex,metrics,'/united-states/elections-house'),null,
  'an unknown selected district is rejected');
assert.equal(resolveHouseQuery(new URLSearchParams('district=0606&compare=places&secondDistrict=0608'),districtIndex,metrics,'/united-states/elections-house').comparison,undefined,
  'unknown second districts are never interpreted as counties or accepted');
assert.equal(resolveHouseQuery(new URLSearchParams('district=0606'),districtIndex,metrics,'/united-states/california/unemployment'),null,
  'House query state never overrides an existing state or county route');

const metadata=createPageMetadata({title:'Unemployment in California | USA X-Ray',description:'Explore unemployment in California.',path:'/united-states/california/unemployment?theme=dark'});
assert.equal(metadata.canonical,'https://usa-xray.online/united-states/california/unemployment');
assert.equal(metadata.openGraph.url,metadata.canonical);
assert.equal(metadata.robots,'index,follow');
assert.equal(metadata.structuredData['@type'],'WebPage');
assert.equal(metadata.structuredData.name,metadata.title);
assert.equal(metadata.structuredData.description,metadata.description);
assert.equal(mapPageMetadata({state:{concept:'compare',comparison:'places'},metricName:'Unemployment rate',placeName:'California',path:'/compare/places/unemployment/california/vs/united-states'}).title,'Unemployment rate: California vs the United States | USA X-Ray');
assert.equal(createPageMetadata({path:'/blog/mississippi',noindex:true}).robots,'noindex,follow');
const articleMetadata=screenPageMetadata('article','/blog/mississippi',{article:{title:'A Mississippi story',description:'County data from USDA.'},noindex:true});
assert.equal(articleMetadata.structuredData['@type'],'Article');
assert.equal(articleMetadata.structuredData.mainEntityOfPage,articleMetadata.canonical);
assert.equal(articleMetadata.robots,'noindex,follow');
assert.equal(screenPageMetadata('blog','/blog').structuredData['@type'],'Blog');
assert.equal(screenPageMetadata('stats','/stats',{noindex:true}).robots,'noindex,follow');
assert.equal(screenPageMetadata('blog','/blog',{noindex:true}).robots,'noindex,follow');

const sitemap=fs.readFileSync(new URL('../sitemap.xml',import.meta.url),'utf8');
assert.doesNotMatch(fs.readFileSync(new URL('./index.html',import.meta.url),'utf8'),/<meta property="og:url"/,'the app shell must not advertise one route as every page URL');
const shell=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
for(const href of ['/united-states/unemployment','/compare/places/unemployment/california/vs/texas','/stats','/blog','/support','/about'])assert.ok(shell.includes(`href="${href}"`),`${href} must be discoverable through a crawlable anchor`);
assert.match(shell,/<a href="\/united-states\/unemployment" data-page="map"/);
assert.match(shell,/<a href="\/compare\/places\/unemployment\/california\/vs\/texas" data-page="compare"/);
assert.match(sitemap,/<loc>https:\/\/usa-xray\.online\/united-states\/unemployment<\/loc>/);
assert.match(sitemap,/<loc>https:\/\/usa-xray\.online\/united-states\/california\/unemployment<\/loc>/);
assert.match(sitemap,/<loc>https:\/\/usa-xray\.online\/compare\/places\/unemployment\/california\/vs\/texas<\/loc>/);
assert.match(sitemap,/<loc>https:\/\/usa-xray\.online\/compare\/indicators\/unemployment-vs-adjusted-gross-income-agi<\/loc>/);
assert.match(sitemap,/<loc>https:\/\/usa-xray\.online\/compare\/places\/electricity-price-residential\/california\/vs\/texas<\/loc>/);
assert.doesNotMatch(sitemap,/<loc>https:\/\/usa-xray\.online\/(?:stats|blog)<\/loc>/,'empty analytics and unpublished journal pages must not be discoverable in the sitemap');
assert.doesNotMatch(sitemap,/\/blog\/(?:mississippi|electricity)/,'editorial drafts must stay outside the sitemap');
assert.match(fs.readFileSync(new URL('../robots.txt',import.meta.url),'utf8'),/Sitemap: https:\/\/usa-xray\.online\/sitemap\.xml/);

const journal=fs.readFileSync(new URL('./react/journal.tsx',import.meta.url),'utf8');
assert.doesNotMatch(journal,/href=["']\.\/\?/,'journal navigation should use readable paths rather than query URLs');
assert.match(journal,/article-map-note/,'unavailable historical indicators should not link to a different live measure');
assert.match(fs.readFileSync(new URL('../scripts/seo_render.py',import.meta.url),'utf8'),/def render_route\(/,'the server must render route metadata before JavaScript');
assert.match(fs.readFileSync(new URL('../scripts/preview_server.py',import.meta.url),'utf8'),/redirect_target\(/,'the read-only runtime must permanently normalize legacy URLs');

console.log('PASS: canonical routes, county ambiguity, metadata, server rendering, redirects and sitemap policy');
