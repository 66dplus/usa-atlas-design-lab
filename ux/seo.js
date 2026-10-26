export const SITE_ORIGIN = 'https://usa-xray.online';
export const SITE_NAME = 'USA X-Ray';
export const SITE_DESCRIPTION = 'Explore U.S. places through source-based maps, geographic comparisons and public data.';

export function createPageMetadata({title, description, path, type = 'website', noindex = false, structuredData = null, image = null}) {
  const canonicalPath = typeof path === 'string' && path.startsWith('/') ? path.split(/[?#]/, 1)[0] || '/' : '/';
  const canonical = new URL(canonicalPath, SITE_ORIGIN).href;
  const imageUrl = image ? new URL(image, SITE_ORIGIN).href : null;
  return {
    title: title || `${SITE_NAME} — Explore the map`,
    description: description || SITE_DESCRIPTION,
    canonical,
    robots: noindex ? 'noindex,follow' : 'index,follow',
    openGraph: {type, title: title || SITE_NAME, description: description || SITE_DESCRIPTION, url: canonical, siteName: SITE_NAME, locale: 'en_US', ...(imageUrl ? {image: imageUrl} : {})},
    twitter: {card: imageUrl ? 'summary_large_image' : 'summary', title: title || SITE_NAME, description: description || SITE_DESCRIPTION, ...(imageUrl ? {image: imageUrl} : {})},
    structuredData: structuredData || {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title || `${SITE_NAME} — Explore the map`,
      description: description || SITE_DESCRIPTION,
      url: canonical,
      isPartOf: {'@type': 'WebSite', name: SITE_NAME, url: SITE_ORIGIN},
    },
  };
}

function upsertMeta(document, key, value, property = false) {
  const attribute = property ? 'property' : 'name';
  let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attribute, key);
    document.head.append(node);
  }
  node.content = value;
}

function removeMeta(document, key, property = false) {
  document.head.querySelector(`meta[${property ? 'property' : 'name'}="${key}"]`)?.remove();
}

export function applyPageMetadata(metadata, document = globalThis.document) {
  if (!document?.head || !metadata) return;
  document.title = metadata.title;
  upsertMeta(document, 'description', metadata.description);
  upsertMeta(document, 'robots', metadata.robots);
  upsertMeta(document, 'og:type', metadata.openGraph.type, true);
  upsertMeta(document, 'og:title', metadata.openGraph.title, true);
  upsertMeta(document, 'og:description', metadata.openGraph.description, true);
  upsertMeta(document, 'og:url', metadata.openGraph.url, true);
  upsertMeta(document, 'og:site_name', metadata.openGraph.siteName, true);
  upsertMeta(document, 'og:locale', metadata.openGraph.locale, true);
  if (metadata.openGraph.image) upsertMeta(document, 'og:image', metadata.openGraph.image, true);
  else removeMeta(document, 'og:image', true);
  upsertMeta(document, 'twitter:card', metadata.twitter.card);
  upsertMeta(document, 'twitter:title', metadata.twitter.title);
  upsertMeta(document, 'twitter:description', metadata.twitter.description);
  if (metadata.twitter.image) upsertMeta(document, 'twitter:image', metadata.twitter.image);
  else removeMeta(document, 'twitter:image');
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = metadata.canonical;
  let schema = document.head.querySelector('#atlas-jsonld');
  if (!schema) {
    schema = document.createElement('script');
    schema.id = 'atlas-jsonld';
    schema.type = 'application/ld+json';
    document.head.append(schema);
  }
  schema.textContent = JSON.stringify(metadata.structuredData);
}

export function mapPageMetadata({state, index, metricName, placeName, path, noindex = false}) {
  const metric = metricName || 'Public data';
  const place = placeName || 'the United States';
  let title;
  let description;
  if (state?.concept === 'compare' && state.comparison === 'metrics') {
    const otherMetric = state.secondMetricName || 'another indicator';
    const scoped = Boolean(state.selected || state.place);
    title = `${metric} vs ${otherMetric}${scoped ? ` in ${place}` : ''} | ${SITE_NAME}`;
    description = `Compare ${metric} and ${otherMetric}${scoped ? ` in ${place}` : ' across the United States'} using the atlas’s source, period and geography details.`;
  } else if (state?.concept === 'compare') {
    const other = state.secondName || 'the United States';
    title = `${metric}: ${place} vs ${other} | ${SITE_NAME}`;
    description = `Compare ${metric} for ${place} and ${other}. Explore published observations with their source, reference period and geographic coverage.`;
  } else {
    title = `${metric} in ${place} | ${SITE_NAME}`;
    description = `Explore ${metric} in ${place} with source-based observations, reference periods and geographic coverage on the USA X-Ray map.`;
  }
  return createPageMetadata({title, description, path, noindex});
}

/** @param {string} page @param {string} path
 * @param {{article?: {title:string,seoTitle?:string,description:string,cover?:string}|null,noindex?:boolean}} options */
export function screenPageMetadata(page, path, {article = null, noindex = false} = {}) {
  const pages = {
    stats: ['Atlas statistics | USA X-Ray', 'Explore how visitors use USA X-Ray. Visitor analytics are not connected yet.'],
    support: ['Support USA X-Ray | USA X-Ray', 'Learn how to support the maps, data and stories behind USA X-Ray. Contributions are not open yet.'],
    info: ['About USA X-Ray | USA X-Ray', 'Learn how USA X-Ray maps public data to places, preserves source units and periods, and handles gaps.'],
    blog: ['USA X-Ray journal | USA X-Ray', 'Explore stories about public data, places and the sources behind the map.'],
    article: [(article?.seoTitle || article?.title) ? `${article.seoTitle || article.title} | USA X-Ray` : 'Article | USA X-Ray', article?.description || 'A USA X-Ray journal article.'],
  };
  const [title, description] = pages[page] || ['USA X-Ray — Explore the map', SITE_DESCRIPTION];
  const canonical = new URL(path, SITE_ORIGIN).href;
  const image = page === 'article' && article?.cover ? new URL(article.cover, SITE_ORIGIN).href : null;
  const structuredData = page === 'article' ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    mainEntityOfPage: canonical,
    publisher: {'@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN},
    ...(image ? {image: [image]} : {}),
  } : page === 'blog' ? {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: SITE_NAME + ' journal',
    description,
    url: canonical,
    publisher: {'@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN},
  } : {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonical,
    isPartOf: {'@type': 'WebSite', name: SITE_NAME, url: SITE_ORIGIN},
  };
  return createPageMetadata({title, description, path, type: page === 'article' ? 'article' : 'website', noindex, structuredData, image});
}
