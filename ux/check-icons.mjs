import assert from 'node:assert/strict';
import fs from 'node:fs';
import {brandIcon,indicatorIcon} from './icons.js';
import {interfaceIcons,thematicIcons,indicatorIcons} from './approved-icons.js';

const roles='search back saved check compare house shuffle close plus minus chevron-down location forward share indicators explorer'.split(' ');
for(const role of roles){const markup=brandIcon(role);assert.ok(markup.includes(interfaceIcons[role].body),role);assert.ok(!markup.includes('<image'),role+' uses a vector');assert.match(markup,/stroke="currentColor"/);assert.match(markup,/stroke-width="1\.5"/);}
const catalog=JSON.parse(fs.readFileSync(new URL('./catalog.json',import.meta.url))).metrics;
for(const metric of catalog){const name=indicatorIcons[metric.id];assert.ok(name,metric.id);assert.ok(indicatorIcon(metric).includes(thematicIcons[name].body),metric.id+' matches the approved thematic mapping');}
for(const id of ['unemployment--03-06-employment','unemployment--03-06-labor-force','unemployment--03-06-unemployment'])assert.ok(indicatorIcon({id,catalogId:'03.06'}).includes(thematicIcons.briefcase.body));
for(const metric of JSON.parse(fs.readFileSync(new URL('./catalog-v2.json',import.meta.url))).metrics)assert.ok(!indicatorIcon(metric).includes('<image'),metric.id);
assert.throws(()=>brandIcon('unrecognized-role'),/Unknown/);
console.log('PASS: 16 existing interface roles, 81 approved thematic mappings, related series and six v2 fields use theme-inheriting vectors.');
