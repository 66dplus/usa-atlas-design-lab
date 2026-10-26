import { useLayoutEffect, useRef } from 'react';
import { animateReplacement } from '../motion.js';
import { articles } from '../journal.js';
import { ArticleMap } from './article-map';
import { articleExamples, ArticleExampleBody } from './article-examples';
import type { Atlas } from './use-atlas';
const headings = new Set([
  'What USDA means by low access',
  'Thirty counties reached at least 25%',
  'Start with a county, then read the definition',
  'What this historical map cannot answer',
  'Sources and calculation notes',
  'The same sector, year and unit',
  'How large was the gap?',
  'What equal electricity use would cost',
  'The price table does not explain the causes',
  'Check the observation before comparing',
]);
const explorePaths: Record<string, string> = {
  electricity: '/compare/places/electricity-price-residential/california/vs/texas',
};
const explorePath = (slug: string) => explorePaths[slug] || `/blog/${slug}`;
export const articleExists = (slug: string) => Object.hasOwn(articles, slug);
export const hasPublishedArticles = Object.values(articles).some(
  (article) => !/owner review pending/i.test(article.meta || ''),
);
export function articleMetadata(slug: string) {
  const article = (articles as Record<string, (typeof articles)[keyof typeof articles]>)[slug];
  return article
    ? {
        title: article.title,
        description: article.description,
        draft: /owner review pending/i.test(article.meta || ''),
      }
    : null;
}
export function ArticlePage({ slug, atlas }: { slug: string; atlas: Atlas }) {
  if (slug === 'pitkin-income-comparison' || slug === 'los-alamos-doctorates-and-income') {
    const pitkin = slug === 'pitkin-income-comparison';
    const example = pitkin ? articleExamples.pitkin : articleExamples.losAlamos;
    const map = (kind: 'primary' | 'household' = 'primary') => {
      const household = kind === 'household';
      return (
        <ArticleMap
          key={kind}
          atlas={atlas}
          title={pitkin ? 'Per-capita income · Pitkin and San Francisco' : household ? 'Median household income · Los Alamos County' : 'Adults with a doctorate · Los Alamos County'}
          place={pitkin ? '08097' : '35028'}
          second={pitkin ? '06075' : null}
          metric={pitkin ? 'per-capita-income' : household ? 'median-household-income' : 'doctorate'}
          comparison={pitkin}
          caption={pitkin
            ? 'Pitkin County, Colorado and San Francisco County, California · per-capita income (dollars per person) · Census ACS, latest admitted period'
            : household
              ? 'Los Alamos County, New Mexico · median household income · Census ACS, latest admitted period'
              : 'Los Alamos County, New Mexico · adults with a doctorate · Census ACS, latest admitted period'}
        />
      );
    };
    return (
      <>
        <button className="article-back" data-page="blog">{'← Article examples'}</button>
        <article className="journal-article article-example" data-article={slug}>
          <header className="article-hero">
            <p className="article-eyebrow">{'LOCAL ARTICLE EXAMPLE · LIVE MAP'}</p>
            <h1>{example.title}</h1>
            <p className="article-deck">{example.deck}</p>
            {map()}
          </header>
          <div className="article-body">
            <ArticleExampleBody article={example} householdMap={pitkin ? undefined : map('household')} />
            <h2>{'Primary sources'}</h2>
            <ul className="article-sources">
              {(pitkin
                ? [
                    ['ACS per-capita income · B19301', 'https://data.census.gov/table/ACSDT5Y2024.B19301'],
                    ['ACS median household income · B19013', 'https://data.census.gov/table/ACSDT5Y2024.B19013'],
                    ['ACS household income sources · B19064', 'https://data.census.gov/table/ACSDT5Y2024.B19064'],
                    ['ACS full-time earnings · B20018', 'https://data.census.gov/table/ACSDT5Y2024.B20018'],
                    ['Census income definition', 'https://www2.census.gov/programs-surveys/acs/tech_docs/subject_definitions/2024_ACSSubjectDefinitions.pdf'],
                    ['Aspen Journalism', 'https://www.aspentimes.com/news/aspen-journalism-pitkin-countys-per-capita-income-third-highest-in-the-u-s-highlights-growing-disparity-with-wages/'],
                  ]
                : [
                    ['ACS educational attainment · B15003', 'https://data.census.gov/table/ACSDT5Y2024.B15003'],
                    ['ACS median household income · B19013', 'https://data.census.gov/table/ACSDT5Y2024.B19013'],
                    ['ACS full-time earnings · B20018', 'https://data.census.gov/table/ACSDT5Y2024.B20018'],
                    ['U.S. Department of Energy · Manhattan Project', 'https://www.energy.gov/em/manhattan-project-department-energy-formation-1939-1977'],
                    ['Los Alamos National Laboratory · FY2024 economic-impact report', 'https://cdn.lanl.gov/files/economic-impact-25-st-v4_73055.pdf'],
                    ['LANL scientific job listings', 'https://lanl.jobs/'],
                  ]
              ).map(([label, url]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{label} ↗</a></li>)}
            </ul>
            <nav className="article-example-links" aria-label="Other local article examples">
              <a href={'/blog/' + (pitkin ? 'los-alamos-doctorates-and-income' : 'pitkin-income-comparison')}>
                {pitkin ? 'Read the Los Alamos example →' : 'Read the Pitkin and San Francisco example →'}
              </a>
            </nav>
          </div>
        </article>
      </>
    );
  }
  const article = (articles as Record<string, (typeof articles)[keyof typeof articles]>)[slug];
  if (!article) return null;
  const href = explorePaths[slug];
  const mapAction = href ? (
    <a href={href}>{article.mapLink}</a>
  ) : (
    <p className="article-map-note">
      {'This historical indicator is not available in the live atlas yet.'}
    </p>
  );
  const map = (
    <figure className="article-map">
      <h2>{href ? 'Explore the data' : 'Historical map preview'}</h2>
      <picture>
        <source media="(max-width:760px)" srcSet={article.mapMobileImage} />
        <img
          src={article.mapImage}
          alt={'Historical ' + article.period + ' source-data map preview'}
          loading="lazy"
        />
      </picture>
      <figcaption>{article.caption}</figcaption>
      {mapAction}
    </figure>
  );
  const blockMarkup = (block: string) =>
    block === '__MAP__' ? map : headings.has(block) ? <h2>{block}</h2> : <p>{block}</p>;
  // The electricity master places this whole passage beside its map on Desktop.
  // Mobile reads the passage first and then the same figure, without duplicating copy.
  const splitStart = slug === 'electricity' ? article.blocks.indexOf('How large was the gap?') : -1;
  const splitEnd = article.blocks.indexOf('__MAP__');
  const body = article.blocks.flatMap((block, index) => {
    if (splitStart < 0 || index < splitStart || index > splitEnd) return blockMarkup(block);
    if (index !== splitStart) return [];
    return (
      <div className="article-split">
        <div className="article-split-copy">
          {article.blocks.slice(splitStart, splitEnd).map(blockMarkup)}
        </div>
        {map}
      </div>
    );
  });
  return (
    <>
      <button className="article-back" data-page="blog">
        {'← Blog'}
      </button>
      <article className="journal-article" data-article={slug}>
        <header className="article-hero">
          <p className="article-eyebrow">{article.eyebrow}</p>
          <h1>{article.title}</h1>
          <p className="article-deck">{article.description}</p>
          <p className="article-meta">{article.meta}</p>
        </header>
        <div className="article-body">
          {body}
          <h2>{'Primary sources'}</h2>
          <ul className="article-sources">
            {article.sources.map((source, jsxIndex) => (
              <li key={jsxIndex}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.role}
                  {' ↗'}
                </a>
              </li>
            ))}
          </ul>
          <p className="article-preview-note">
            {
              'Historical article draft · owner review pending. The map image preserves its original period. Explore opens the production atlas, which chooses the latest admitted snapshot.'
            }
          </p>
        </div>
      </article>
    </>
  );
}
export const features = [
  {
    label: 'FEATURED · FOOD & PLACE',
    ...articles.mississippi,
    slug: 'mississippi',
    snapshotCaption: 'Mississippi counties · low grocery access · 2019 · USDA-FEA-2025',
    atlasView: articles.mississippi.atlasView,
  },
  {
    label: 'ENERGY & PLACE · DRAFT',
    ...articles.electricity,
    slug: 'electricity',
    snapshotCaption:
      'California and Texas · residential electricity price · 2024 · EIA-electricity-retail-sales-2024',
    atlasView: articles.electricity.atlasView,
  },
];
export function JournalFeature({ index }: { index: number; theme: string }) {
  const feature = features[index],
    alt = `${feature.title} · ${feature.snapshotCaption}`,
    path = explorePath(feature.slug),
    action = explorePaths[feature.slug] ? 'Open interactive map' : 'Read the draft';
  return (
    <>
      <a className="journal-preview-link" href={path} aria-label={action + ': ' + feature.title}>
        <img className="journal-map" src={feature.mapImage} alt={alt} loading="lazy" />
      </a>
      <div className="feature-copy">
        <p className="page-eyebrow">{feature.label}</p>
        <h2>{feature.title}</h2>
        <p>{feature.description}</p>
        <p className="snapshot-caption">
          {feature.snapshotCaption}
          {' · '}
          {feature.sources[0].role}
        </p>
        <button data-page="article" data-article={feature.slug}>
          {'Read the draft →'}
        </button>
        <div className="feature-controls">
          <span>
            {'FEATURED · '}
            {String(index + 1).padStart(2, '0')}
            {' / '}
            {features.length}
          </span>
          <button data-feature="previous" aria-label="Previous featured story">
            {'‹'}
          </button>
          <button data-feature="next" aria-label="Next featured story">
            {'›'}
          </button>
        </div>
      </div>
    </>
  );
}
export function JournalPage({ theme, index = 0 }: { theme: string; index?: number }) {
  const feature = useRef<HTMLElement>(null),
    previous = useRef(index);
  useLayoutEffect(() => {
    if (feature.current && previous.current !== index)
      animateReplacement(feature.current, () => {});
    previous.current = index;
  }, [index]);
  const electricity = articles.electricity,
    mississippi = articles.mississippi;
  return (
    <>
      <p className="page-eyebrow">{'The USA X-Ray journal'}</p>
      <h1>{'Look closer. See the whole picture.'}</h1>
      <p className="page-intro">
        {'Thoughtful stories about the numbers and places behind the map.'}
      </p>
      <section ref={feature} id="journal-feature" className="journal-feature">
        <JournalFeature index={index} theme={theme} />
      </section>
      <h2 className="more-heading">{'More to explore'}</h2>
      <div className="journal-cards">
        <article>
          <a
            className="journal-preview-link"
            href={explorePath('electricity')}
            aria-label="Open interactive map: California and Texas electricity prices"
          >
            <img
              className="journal-card-map"
              src={electricity.mapImage}
              alt={'California and Texas · ' + electricity.caption}
              loading="lazy"
            />
          </a>
          <p className="snapshot-caption">
            {electricity.caption}
            {' · EIA-electricity-retail-sales-2024'}
          </p>
          <p className="page-eyebrow">{'COMPARISONS'}</p>
          <h3>{'California and Texas, side by side'}</h3>
          <p>
            {'A careful comparison starts with the same measure, geography and reference period.'}
          </p>
          <button data-page="article" data-article="electricity">
            {'Read the electricity draft →'}
          </button>
        </article>
        <article>
          <a
            className="journal-preview-link"
            href={explorePath('mississippi')}
            aria-label="Read the draft: Mississippi grocery access"
          >
            <img
              className="journal-card-map"
              src={mississippi.mapImage}
              alt={'Mississippi · ' + mississippi.caption}
              loading="lazy"
            />
          </a>
          <p className="snapshot-caption">
            {mississippi.caption}
            {' · USDA-FEA-2025'}
          </p>
          <p className="page-eyebrow">{'METHODS'}</p>
          <h3>{'Reading a map without losing the source'}</h3>
          <p>{'Displayed values keep their unit, date and source.'}</p>
          <button data-page="info">{'Read about the sources →'}</button>
        </article>
        <article>
          <img
            src="assets/san-francisco-photo.jpg"
            alt="San Francisco skyline and Golden Gate Bridge"
            loading="lazy"
          />
          <p className="photo-credit">
            {'San Francisco, California · Daniel L. Lu · CC BY-SA 4.0'}
          </p>
          <p className="page-eyebrow">{'PLACES'}</p>
          <h3>{'A closer look at San Francisco'}</h3>
          <p>{'One city scene offers place context without standing in for the whole state.'}</p>
          <a href="/united-states/california/san-francisco-county/unemployment">
            {'Explore San Francisco →'}
          </a>
        </article>
      </div>
      {document.body.dataset.runtime === 'preview' && (
        <nav className="article-examples-nav" aria-label="Local article examples">
          <p className="page-eyebrow">{'LOCAL ARTICLE EXAMPLES'}</p>
          <a href="/blog/pitkin-income-comparison">{'Pitkin County vs San Francisco · per-capita income →'}</a>
          <a href="/blog/los-alamos-doctorates-and-income">{'Los Alamos · doctorates and household income →'}</a>
        </nav>
      )}
      <p className="journal-review-note">
        {
          'Temporary review preview · article drafts remain owner review pending; no final journal publication is implied.'
        }
      </p>
    </>
  );
}
