// Deliberately synthetic: these coordinates shape a design field, not a dataset.
export const cities = [
 ['New York',-74.006,40.713,1],['Los Angeles',-118.244,34.052,.92],['Chicago',-87.63,41.878,.84],['Houston',-95.37,29.76,.78],['Phoenix',-112.07,33.45,.54],['Philadelphia',-75.165,39.953,.63],['San Antonio',-98.49,29.42,.45],['San Diego',-117.16,32.72,.51],['Dallas',-96.8,32.78,.68],['San Francisco',-122.42,37.77,.88],['Seattle',-122.33,47.61,.68],['Boston',-71.06,42.36,.78],['Washington',-77.04,38.907,.77],['Miami',-80.19,25.76,.68],['Atlanta',-84.39,33.75,.66],['Detroit',-83.05,42.33,.55],['Minneapolis',-93.27,44.98,.49],['Denver',-104.99,39.74,.54],['Portland',-122.68,45.52,.45],['Las Vegas',-115.14,36.17,.5],['Austin',-97.74,30.27,.55],['Nashville',-86.78,36.16,.38],['Charlotte',-80.84,35.23,.39],['Tampa',-82.46,27.95,.38],['New Orleans',-90.07,29.95,.4],['Pittsburgh',-80,40.44,.4],['Cleveland',-81.69,41.5,.34],['Columbus',-82.99,39.96,.33],['Kansas City',-94.58,39.1,.32],['St. Louis',-90.2,38.63,.34],['Salt Lake City',-111.89,40.76,.32],['Sacramento',-121.49,38.58,.34],['Indianapolis',-86.16,39.77,.31],['Albuquerque',-106.65,35.08,.23],['Oklahoma City',-97.52,35.47,.23],['Memphis',-90.05,35.15,.29],['Raleigh',-78.64,35.78,.33],['Baltimore',-76.61,39.29,.48],['Richmond',-77.44,37.54,.24],['Buffalo',-78.88,42.89,.26],['Anchorage',-149.9,61.22,.4],['Honolulu',-157.86,21.31,.53]
];
export const metrics = ['Income','Rent','Poverty','Housing','Health','Overdose','Homelessness','Millionaires','Businesses','Billionaires'];
export function noise(x,y) {const a=Math.sin(x*127.1+y*311.7)*43758.5453;return a-Math.floor(a);}
export function field(lon,lat,metric=0) {
  let broad=0, peak=0;
  for(let i=0;i<cities.length;i++){
    const c=cities[i], dx=(lon-c[1])*Math.cos(lat*Math.PI/180),dy=lat-c[2],r2=dx*dx+dy*dy;
    const weight=c[3]*(.64+.36*Math.sin(i*1.7+metric*1.4)**2);
    broad+=weight*Math.exp(-r2/(1.1+metric%3*.28));
    peak+=weight*Math.exp(-r2/.035);
  }
  const east=1/(1+Math.exp(-(lon+99)*.25));
  const texture=.025*(1+Math.sin(lon*.85+Math.sin(lat*.8))*Math.cos(lat*1.1));
  const variation=.06*(1+Math.sin(lon*.3+metric*1.7)*Math.cos(lat*.45));
  const rural=.045+east*.05+texture+variation;
  let v=rural+broad*.36+peak*.83;
  if(metric===2||metric===5) v=v*.65+.15*(1+Math.sin(lon*.39-lat*.45+metric));
  return Math.max(.015,Math.min(1,v));
}
export const palettes = {
 blue:['#fbfbc6','#c4edd0','#76d0c8','#32a6c7','#246faa','#234593','#18245f'],
 green:['#e6ecdb','#c1d6b5','#8cb79a','#4b987a','#257358','#12513c','#093a2b'],
 ember:['#fff2b1','#f8c34a','#f4942c','#e55732','#af2345','#701e51','#281c43'],
 porcelain:['#f4ece6','#e9c7c4','#d6bacf','#d49fae','#d87f83','#a74362','#481b43'],
 orbital:['#d5e9e9','#c7d6d1','#a2b7b9','#c0a0a0','#d58288','#d95169','#fa335d'],
 ink:['#c8bc9b','#ba984d','#ad842b','#957322','#786028','#4d4c38','#2d3c35']
};
export function colorAt(palette,v) {return palette[Math.min(palette.length-1,Math.floor(v*palette.length))];}
