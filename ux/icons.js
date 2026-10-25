import {interfaceIcons,thematicIcons,indicatorIcons as byIndicator,additionalIndicatorIcons as byLabel} from './approved-icons.js';

// Original bitmap descriptors remain only as compatibility/recovery fallback.
const assets = {
  "search": {
    "file": "search.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "186.8261 178.8261 879.3478 879.3478"
  },
  "back": {
    "file": "back.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "154.4348 169.9348 914.1304 914.1304"
  },
  "saved": {
    "file": "saved.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "196.0217 193.5217 861.9565 861.9565"
  },
  "check": {
    "file": "check.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "180.9130 160.4130 902.1739 902.1739"
  },
  "compare": {
    "file": "compare.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "185.1087 168.6087 884.7826 884.7826"
  },
  "house": {
    "file": "house.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "148.8261 123.8261 954.3478 954.3478"
  },
  "shuffle": {
    "file": "shuffle.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "120.4348 108.4348 1014.1304 1014.1304"
  },
  "close": {
    "file": "close.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "219.4783 218.4783 813.0435 813.0435"
  },
  "plus": {
    "file": "plus.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "217.2174 217.2174 819.5652 819.5652"
  },
  "minus": {
    "file": "minus.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "186.7391 187.2391 881.5217 881.5217"
  },
  "chevron-down": {
    "file": "chevron-down.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "139.1739 136.1739 970.6522 970.6522"
  },
  "location": {
    "file": "location.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "184.0652 142.5652 885.8696 885.8696"
  },
  "forward": {
    "file": "forward.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "210.6087 191.1087 859.7826 859.7826"
  },
  "share": {
    "file": "share.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "161.7826 160.7826 930.4348 930.4348"
  },
  "indicators": {
    "file": "indicators.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "182.3913 181.3913 890.2174 890.2174"
  },
  "explorer": {
    "file": "explorer.png",
    "width": 1254,
    "height": 1254,
    "viewBox": "143.3913 134.3913 965.2174 965.2174"
  }
};

// Shared semantic definitions for both the renderer tooling and React SVGs.
export const interfaceIconDefinition = name => interfaceIcons[name] || null;
export function indicatorIconDefinition(metric) {
  const id=String(metric.id||'').split('--')[0],name=byIndicator[id]||byLabel[metric.name];
  return name&&thematicIcons[name] || null;
}

const vector=(definition,className)=>`<svg class="${className}" viewBox="${definition.viewBox}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${definition.body}</svg>`;
let renderId = 0;
export function brandIcon(name) {
  const definition=interfaceIconDefinition(name);
  if(definition)return vector(definition,'brand-icon');
  const asset = assets[name];
  if (!asset) throw new Error(`Unknown Brand 02 icon: ${name}`);
  const filterId = `brand-ink-${++renderId}`;
  // Render the original black-on-white bitmap in currentColor, with white transparent.
  // Each placement owns its filter so light and dark controls inherit their own ink.
  return `<svg class="brand-icon" viewBox="${asset.viewBox}" aria-hidden="true"><defs><filter id="${filterId}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.2126 -.7152 -.0722 0 1" result="cutout"/><feComposite in="cutout" in2="SourceAlpha" operator="in" result="opaque-cutout"/><feFlood flood-color="currentColor"/><feComposite in2="opaque-cutout" operator="in"/></filter></defs><image href="${new URL(`./assets/brand-icons/${asset.file}`, import.meta.url)}" width="${asset.width}" height="${asset.height}" filter="url(#${filterId})" /></svg>`;
}

export function indicatorIcon(metric) {
  const definition=indicatorIconDefinition(metric);
  if(definition)return `<span class="indicator-icon">${vector(definition,'thematic-icon')}</span>`;
  // Employment glyph from the final Mobile indicator picker (Paper 1Y69-1).
  // Other catalog topics keep the approved Brand 02 indicator symbol.
  const employment=metric.catalogId?.startsWith('03.06')||metric.id.startsWith('unemployment');
  const health=metric.shortCategory==='Health'||metric.id==='obesity-rate';
  const glyph=employment?'<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>':health?'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M4 12h4l2-4 4 8 2-4h4"/>':null;
  return `<span class="indicator-icon">${glyph?`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`:brandIcon('indicators')}</span>`;
}
