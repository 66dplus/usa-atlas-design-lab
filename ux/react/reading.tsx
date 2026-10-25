import { useLayoutEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import type { Atlas } from './use-atlas';
import { AboutPage, DataMethodology, SupportPage } from './support-about';
import { ArticlePage, JournalPage, articleExists } from './journal';
import { IndicatorIcon } from './components';
import { SourceContent } from './source-content';
import { showSurface } from '../motion.js';
export function ReadingPages({ atlas }: { atlas: Atlas }) {
  const { state } = atlas,
    host = useRef<HTMLElement>(null),
    previous = useRef(state.page),
    scrolls = useRef(new Map<string, number>());
  const reading = !['map', 'compare'].includes(state.page),
    key = state.page === 'article' ? 'article:' + state.article : state.page;
  const cached = useRef(new Map<string, { page: typeof state.page; article: string }>()),
    lastReading = useRef<string | null>(null);
  if (reading) {
    cached.current.set(key, { page: state.page, article: state.article });
    lastReading.current = key;
  }
  const displayKey = reading ? key : lastReading.current;
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    void showSurface(node, reading, { distance: 36 });
    if (reading) {
      node.scrollTop = scrolls.current.get(key) || 0;
      node.focus({ preventScroll: true });
    }
    previous.current = state.page;
  }, [state.page, state.article]);
  return (
    <section
      ref={host}
      id="reading-page"
      className="reading-page"
      hidden={true}
      aria-label="Atlas page"
      tabIndex={-1}
      onScroll={(event) => scrolls.current.set(key, event.currentTarget.scrollTop)}
    >
      {[...cached.current].map(([cachedKey, entry]) => (
        <div
          className="reading-content"
          key={cachedKey}
          style={{ display: cachedKey === displayKey ? 'contents' : 'none' }}
        >
          <ReadingContent atlas={atlas} page={entry.page} article={entry.article} />
        </div>
      ))}
    </section>
  );
}
function ReadingContent({
  atlas,
  page,
  article,
}: {
  atlas: Atlas;
  page: Atlas['state']['page'];
  article: string;
}) {
  const { state } = atlas;
  return (
    <>
      {page === 'info' && (
        <>
          <div
            className="reading-content"
            style={{
              display: state.infoSurface === 'about' ? 'contents' : 'none',
            }}
          >
            <AboutPage />
          </div>
          <div
            className="reading-content"
            style={{
              display: state.infoSurface === 'legacy' ? 'contents' : 'none',
            }}
          >
            <DataMethodology
              sourceRows={<SourceRows atlas={atlas} />}
              libraryRows={<LibraryRows atlas={atlas} />}
              appearanceControl={
                <button
                  id="theme-toggle"
                  className="theme-toggle"
                  onClick={() => atlas.setTheme(state.theme === 'dark' ? 'light' : 'dark', true)}
                >
                  {state.theme === 'dark' ? 'Light theme' : 'Dark theme'}
                </button>
              }
              visible={state.infoSurface === 'legacy'}
              tab={state.infoTab}
            />
          </div>
        </>
      )}
      {page === 'support' && <SupportPage />}
      {page === 'stats' && <Stats atlas={atlas} />}
      {page === 'blog' &&
        (document.body.dataset.runtime === 'preview' ? (
          <JournalPage theme={state.theme} index={state.featureIndex} />
        ) : (
          <>
            <p className="page-eyebrow">THE JOURNAL</p>
            <h1>Look closer. See the whole picture.</h1>
            <p className="page-intro">
              Thoughtful stories about the numbers and places behind the map.
            </p>
            <div className="empty-state">
              <h3>The journal is taking shape</h3>
              <p>
                There are no published articles yet. Editorial drafts remain private until approved
                for publication.
              </p>
            </div>
            <button className="primary-button" data-page="map">
              Explore the map →
            </button>
          </>
        ))}
      {page === 'article' &&
        (document.body.dataset.runtime === 'preview' && articleExists(article) ? (
          <ArticlePage slug={article} />
        ) : (
          <>
            <button className="article-back" data-page="blog">
              ← Blog
            </button>
            <h1>Article unavailable</h1>
            <div className="empty-state">
              <h3>No published article at this address</h3>
              <p>Return to the journal or explore the source observations on the map.</p>
            </div>
            <button className="outline-button" data-page="blog">
              Return to Blog
            </button>
          </>
        ))}
    </>
  );
}

function SourceRows({ atlas }: { atlas: Atlas }) {
  const admitted = atlas.resources?.catalog.filter((m) => m.hasObservations || m.fieldId) || [];
  if (!admitted.length) return <li>No admitted source observations are available yet.</li>;
  const providers = [
    ...new Map(
      admitted.map((metric) => [
        metric.source,
        { name: metric.source, url: metric.sourceUrl, metric },
      ]),
    ).values(),
  ];
  const priority = (name: string) =>
    /BLS/.test(name) ? 0 : /USDA/.test(name) ? 1 : /EIA/.test(name) ? 2 : 3;
  providers.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name));
  return (
    <>
      {providers.map((source) => (
        <li key={source.name}>
          <IndicatorIcon metric={source.metric} />
          <div>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name} ↗
              </a>
            ) : (
              source.name
            )}
            <small>Original units, geography and source period retained</small>
          </div>
        </li>
      ))}
    </>
  );
}
function LibraryRows({ atlas }: { atlas: Atlas }) {
  const library = atlas.resources?.library || [];
  return library.length ? (
    <>
      {library.map((item) => (
        <li key={item.label}>
          <strong>{item.label}</strong>
          <small>
            {item.unit} · {item.period}
            {item.formula ? ' · ' + item.formula : ''}
          </small>
          <span>{item.reason}</span>
        </li>
      ))}
    </>
  ) : (
    <li>No additional loaded data is waiting for review.</li>
  );
}
function Stats({ atlas }: { atlas: Atlas }) {
  const geography = atlas.resources?.geo.collection,
    { states, path } = useMemo(() => {
      const states = geography?.features.filter(
        (state) => !['02', '15'].includes(String(state.id)),
      );
      const projection = states
        ? d3.geoAlbersUsa().fitExtent(
            [
              [0, 0],
              [980, 535],
            ],
            { type: 'FeatureCollection', features: states },
          )
        : null;
      return {
        states,
        path: projection ? d3.geoPath(projection).digits(2) : null,
      };
    }, [geography]);
  return (
    <>
      <p className="page-eyebrow">AUDIENCE</p>
      <h1>Follow the curiosity.</h1>
      <p className="page-intro">
        Explore what Atlas visitors choose, compare and spend time discovering.
      </p>
      <section className="audience-unavailable">
        <div className="section-heading">
          <div>
            <h2>Audience data is not connected yet</h2>
            <p>
              Verified visits, popular places and search trends will appear here when a public
              analytics source is configured. No counts are estimated or inferred from map activity.
            </p>
          </div>
          <span className="status-note">Not available</span>
        </div>
        <div className="audience-metrics">
          {['Visitors', 'Views', 'Online now'].map((label) => (
            <div key={label}>
              {label}
              <strong>—</strong>
              <small>Not connected</small>
            </div>
          ))}
        </div>
        <p className="fine-print">
          Nothing on this page counts visits, clicks or search terms. A dash means unavailable, not
          zero.
        </p>
        <button className="primary-button" data-page="map">
          Explore the map →
        </button>
        <div className="audience-map">
          <p className="audience-caption">State boundaries · orientation only</p>
          <div id="audience-geography">
            {states && path && (
              <svg
                className="audience-geography"
                viewBox="0 0 980 535"
                role="img"
                aria-label="US state boundaries. Audience data is unavailable; every state uses the neutral no-data colour."
              >
                {states.map((state) => (
                  <path key={String(state.id)} d={path(state) || undefined} />
                ))}
              </svg>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
export function SourceDialog({ atlas }: { atlas: Atlas }) {
  const root = useRef<HTMLElement>(null),
    source = atlas.state.source,
    lastSource = useRef(source);
  if (source) lastSource.current = source;
  const displayedSource = source || lastSource.current;
  useLayoutEffect(() => {
    const node = root.current,
      backdrop = document.querySelector<HTMLElement>('#source-backdrop');
    if (!node || !backdrop) return;
    void showSurface(backdrop, Boolean(source), { distance: 0 });
    void showSurface(node, Boolean(source), { distance: 32 });
    if (source) node.querySelector<HTMLElement>('#source-close')?.focus({ preventScroll: true });
  }, [Boolean(source)]);
  return (
    <>
      <div id="source-backdrop" hidden={true} onClick={() => atlas.closeSource()} />
      <section
        ref={root}
        id="source-popup"
        className="source-popup"
        hidden={true}
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-heading"
        data-variant={displayedSource === 'geometry' ? 'geometry' : 'indicator'}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            atlas.closeSource();
          }
          if (event.key === 'Tab') {
            const list = [
              ...event.currentTarget.querySelectorAll<HTMLElement>('a,button,input,summary'),
            ].filter(
              (el) =>
                el.getClientRects().length &&
                (!el.closest('details') || el.tagName === 'SUMMARY' || el.closest('details')!.open),
            );
            if (event.shiftKey && document.activeElement === list[0]) {
              event.preventDefault();
              list.at(-1)?.focus();
            } else if (!event.shiftKey && document.activeElement === list.at(-1)) {
              event.preventDefault();
              list[0]?.focus();
            }
          }
        }}
      >
        <div className="drawer-top">
          <h2 id="source-heading">
            {displayedSource !== 'geometry' ? (
              <>
                <span className="source-desktop">Sources &amp; method</span>
                <span className="source-mobile">Sources</span>
              </>
            ) : (
              'Sources'
            )}
          </h2>
          <button id="source-close" aria-label="Close sources">
            ×
          </button>
        </div>
        {displayedSource === 'geometry' ? (
          <>
            <h3>About this map</h3>
            <dl>
              <dt>Boundaries</dt>
              <dd>Census-derived · us-atlas</dd>
              <dt>Geography</dt>
              <dd>2017 county equivalents</dd>
              <dt>Relief</dt>
              <dd>Selected indicator on a labelled visual scale</dd>
              <dt>Coverage</dt>
              <dd>50 states + DC · 3,142 county equivalents</dd>
            </dl>
            <p>
              Relief is a visual scale of the selected indicator. Open its Sources for the unit,
              period and data gaps.
            </p>
            <a
              className="primary-button"
              href="https://github.com/topojson/us-atlas"
              target="_blank"
              rel="noreferrer"
            >
              Open geometry source ↗
            </a>
          </>
        ) : displayedSource && atlas.resources ? (
          <SourceContent atlas={atlas} side={displayedSource} />
        ) : null}
      </section>
    </>
  );
}
