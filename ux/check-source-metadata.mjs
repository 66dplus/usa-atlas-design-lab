import assert from 'node:assert/strict';
import { prepareLayer, displayLayer, comparable, formatPeriod } from './model.js';

const source={fieldId:'01.01:B01003_001E',period:'2024',displayPeriod:'2020–2024',
  sourceRelease:'2024-acs-acs5',unit:'people',sourceUnit:'source_defined',excludedGeographies:[],
  observations:[{id:'US',geoType:'nation',value:334922499},{id:'06',geoType:'state',value:39287377},{id:'06001',geoType:'county',value:1648065},{id:'06075',geoType:'county',value:873965}]};
const geo={byId:new Map([['06',{}],['06001',{}],['06075',{}]])};
const native=prepareLayer(source,geo),presentation=displayLayer(native);
assert.equal(native.period,'2024');assert.equal(presentation.sourcePeriod,'2024');
assert.equal(formatPeriod(presentation.period),'2020–2024');assert.equal(native.observations.get('US').value,334922499);
assert.equal(native.max,1648065,'A national value and a state total must not rescale county colours');
assert.equal(native.min,873965);assert.equal(native.values.get('06'),1,'a state value is clamped outside the county domain');assert.equal(native.values.get('06001'),1);assert.equal(native.values.get('06075'),0);
assert.equal(native.heightValues.get('06'),1,'relief keeps the native range');assert.equal(native.heightValues.get('06001'),1);assert.equal(native.heightValues.get('06075'),0);
assert.equal(presentation.values,native.values);assert.equal(presentation.observations,native.observations);
assert.ok(comparable(native,presentation,{id:'06'},{id:'48'}));
assert.ok(!comparable(native,{...presentation,sourcePeriod:'2023'},{id:'06'},{id:'48'}));
assert.ok(!comparable({...native,source:'Census ACS'},{...presentation,source:'Other provider'},{id:'06'},{id:'48'}));
assert.equal(formatPeriod('2024-M12'),'Dec 2024');
console.log('PASS: native facts, ACS five-year labels, county-only colour domain, national/state range exclusion and native-period comparisons.');
