import * as d3 from 'd3';
import * as topojson from 'topojson-client';
// Existing ExplorerMap uses these same two globals in the live atlas.
globalThis.d3=d3;globalThis.topojson=topojson;
await import('./preview.js');
