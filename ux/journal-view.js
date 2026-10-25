import {articles} from './journal.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headings=new Set(['What USDA means by low access','Thirty counties reached at least 25%','Start with a county, then read the definition','What this historical map cannot answer','Sources and calculation notes','The same sector, year and unit','How large was the gap?','What equal electricity use would cost','The price table does not explain the causes','Check the observation before comparing']);
const explorePaths={electricity:'/compare/places/electricity-price-residential/california/vs/texas'};
const explorePath=slug=>explorePaths[slug]||`/blog/${slug}`;
export const articleExists=slug=>Object.hasOwn(articles,slug);
export const hasPublishedArticles=Object.values(articles).some(article=>!(/owner review pending/i.test(article.meta||'')));
export function articleMetadata(slug){
  const article=articles[slug];
  return article?{title:article.title,description:article.description,draft:/owner review pending/i.test(article.meta||'')}:null;
}
export function articleView(slug){
  const article=articles[slug];if(!article)return null;
  const href=explorePaths[slug];
  const mapAction=href?`<a href="${escape(href)}">${escape(article.mapLink)}</a>`:'<p class="article-map-note">This historical indicator is not available in the live atlas yet.</p>';
  const map=`<figure class="article-map"><h2>${href?'Explore the data':'Historical map preview'}</h2><picture><source media="(max-width:760px)" srcset="${article.mapMobileImage}"><img src="${article.mapImage}" alt="Historical ${escape(article.period)} source-data map preview" loading="lazy"></picture><figcaption>${escape(article.caption)}</figcaption>${mapAction}</figure>`;
  const blockMarkup=block=>block==='__MAP__'?map:headings.has(block)?`<h2>${escape(block)}</h2>`:`<p>${escape(block)}</p>`;
  // The electricity master places this whole passage beside its map on Desktop.
  // Mobile reads the passage first and then the same figure, without duplicating copy.
  const splitStart=slug==='electricity'?article.blocks.indexOf('How large was the gap?'):-1;
  const splitEnd=article.blocks.indexOf('__MAP__');
  const body=article.blocks.flatMap((block,index)=>{
    if(splitStart<0||index<splitStart||index>splitEnd)return blockMarkup(block);
    if(index!==splitStart)return [];
    return `<div class="article-split"><div class="article-split-copy">${article.blocks.slice(splitStart,splitEnd).map(blockMarkup).join('')}</div>${map}</div>`;
  }).join('');
  return `<button class="article-back" data-page="blog">← Blog</button><article class="journal-article" data-article="${slug}"><header class="article-hero"><p class="article-eyebrow">${escape(article.eyebrow)}</p><h1>${escape(article.title)}</h1><p class="article-deck">${escape(article.description)}</p><p class="article-meta">${escape(article.meta)}</p></header><div class="article-body">${body}<h2>Primary sources</h2><ul class="article-sources">${article.sources.map(source=>`<li><a href="${escape(source.url)}" target="_blank" rel="noreferrer">${escape(source.role)} ↗</a></li>`).join('')}</ul><p class="article-preview-note">Historical article draft · owner review pending. The map image preserves its original period. Explore opens the production atlas, which chooses the latest admitted snapshot.</p></div></article>`;
}
export const features=[
  {label:'FEATURED · FOOD & PLACE',...articles.mississippi,slug:'mississippi',snapshotCaption:'Mississippi counties · low grocery access · 2019 · USDA-FEA-2025',atlasView:articles.mississippi.atlasView},
  {label:'ENERGY & PLACE · DRAFT',...articles.electricity,slug:'electricity',snapshotCaption:'California and Texas · residential electricity price · 2024 · EIA-electricity-retail-sales-2024',atlasView:articles.electricity.atlasView}
];
export function featureView(index,theme){
  const feature=features[index],alt=`${feature.title} · ${feature.snapshotCaption}`,path=explorePath(feature.slug),action=explorePaths[feature.slug]?'Open interactive map':'Read the draft';
  return `<a class="journal-preview-link" href="${escape(path)}" aria-label="${action}: ${escape(feature.title)}"><img class="journal-map" src="${escape(feature.mapImage)}" alt="${escape(alt)}" loading="lazy"></a><div class="feature-copy"><p class="page-eyebrow">${escape(feature.label)}</p><h2>${escape(feature.title)}</h2><p>${escape(feature.description)}</p><p class="snapshot-caption">${escape(feature.snapshotCaption)} · ${escape(feature.sources[0].role)}</p><button data-page="article" data-article="${feature.slug}">Read the draft →</button><div class="feature-controls"><span>FEATURED · ${String(index+1).padStart(2,'0')} / ${features.length}</span><button data-feature="previous" aria-label="Previous featured story">‹</button><button data-feature="next" aria-label="Next featured story">›</button></div></div>`;
}
export function journalView(theme){const electricity=articles.electricity,mississippi=articles.mississippi;return `<p class="page-eyebrow">The USA X-Ray journal</p><h1>Look closer. See the whole picture.</h1><p class="page-intro">Thoughtful stories about the numbers and places behind the map.</p><section id="journal-feature" class="journal-feature">${featureView(0,theme)}</section><h2 class="more-heading">More to explore</h2><div class="journal-cards"><article><a class="journal-preview-link" href="${escape(explorePath('electricity'))}" aria-label="Open interactive map: California and Texas electricity prices"><img class="journal-card-map" src="${escape(electricity.mapImage)}" alt="California and Texas · ${escape(electricity.caption)}" loading="lazy"></a><p class="snapshot-caption">${escape(electricity.caption)} · EIA-electricity-retail-sales-2024</p><p class="page-eyebrow">COMPARISONS</p><h3>California and Texas, side by side</h3><p>A careful comparison starts with the same measure, geography and reference period.</p><button data-page="article" data-article="electricity">Read the electricity draft →</button></article><article><a class="journal-preview-link" href="${escape(explorePath('mississippi'))}" aria-label="Read the draft: Mississippi grocery access"><img class="journal-card-map" src="${escape(mississippi.mapImage)}" alt="Mississippi · ${escape(mississippi.caption)}" loading="lazy"></a><p class="snapshot-caption">${escape(mississippi.caption)} · USDA-FEA-2025</p><p class="page-eyebrow">METHODS</p><h3>Reading a map without losing the source</h3><p>Displayed values keep their unit, date and source.</p><button data-page="info">Read about the sources →</button></article><article><img src="assets/san-francisco-photo.jpg" alt="San Francisco skyline and Golden Gate Bridge" loading="lazy"><p class="photo-credit">San Francisco, California · Daniel L. Lu · CC BY-SA 4.0</p><p class="page-eyebrow">PLACES</p><h3>A closer look at San Francisco</h3><p>One city scene offers place context without standing in for the whole state.</p><a href="/united-states/california/san-francisco-county/unemployment">Explore San Francisco →</a></article></div><p class="journal-review-note">Temporary review preview · article drafts remain owner review pending; no final journal publication is implied.</p>`;}
