import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const definitions = JSON.parse(await readFile(new URL('../ux/metric-definitions.json', import.meta.url), 'utf8'));
const visibility = await import('../ux/indicator-visibility.js');
const source = await readFile(new URL('../ux/react/consumer-candidates.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm' });
const consumer = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const metrics = definitions.metrics
  .filter(metric => visibility.indicatorVisibility[metric.catalogId] === true)
  .map(metric => ({
    id: metric.id, name: metric.label, fieldId: metric.fieldId, catalogId: metric.catalogId,
    shortCategory: 'Registry input', source: metric.source, sourceUrl: metric.sourceUrl,
    unit: metric.unit, stateSupported: metric.geography.includes('state'),
    countySupported: metric.geography.includes('county'), hasObservations: true,
  }));
const registry = consumer.buildSelectionCatalog(metrics, {
  contractStatus: 'candidate_nonreleased', localCandidatePreview: true, admissionStatus:'candidate_nonreleased', metrics: [],
});
const entryTypes = registry.catalog.reduce((summary, metric) => {
  const type = metric.selectionKind || 'primary';
  summary[type] = (summary[type] || 0) + 1;
  return summary;
}, {});
assert.deepEqual(entryTypes, { primary: 41, variant: 4 });
assert.equal(registry.catalog.length, 45);
process.stdout.write(JSON.stringify({
  sourceFields: metrics.length,
  selectionCounts: { primary: entryTypes.primary, variants: entryTypes.variant, total: registry.catalog.length },
  selectableIds: registry.catalog.map(metric => metric.id).sort(),
}) + '\n');
