import { useLayoutEffect } from 'react';
import type { Atlas } from './use-atlas';
import { displayMetricName } from './types';
import { stories, mobileLayout } from './use-atlas';
import { SavedContent } from './saved';
import type { Saved } from './saved';
import { Sheet } from './sheet';
import { Icon, PanelHeader, Search } from './components';
import {
  ComparisonDraftContent,
  CompareContent,
  InspectorContent,
  MetricItems,
  RankList,
} from './data-views';
import { IndicatorFooter, SourceLink } from './explorer';
import { slidePill } from '../motion.js';
export function Drawers({ atlas, saved }: { atlas: Atlas; saved: Saved }) {
  const { state, resources, selected } = atlas,
    side = state.metricTarget,
    context = state.cardMode
      ? 'Fields in your data card'
      : state.concept === 'compare'
        ? `${side === 'a' ? 'Primary' : 'Comparison'} map · ${state.comparison === 'places' ? 'Applies to both maps' : 'Changes this map only'}`
        : 'Colour and height on the map';
  useLayoutEffect(() => {
    const group = document.querySelector('#ranking-panel .rank-tabs');
    if (group) slidePill(group, group.querySelector('[aria-pressed=true]'));
  });
  return (
    <>
      <Sheet
        atlas={atlas}
        id="metric-library"
        className="drawer"
        label="Choose an indicator"
        footer={
          !mobileLayout() ? (
            <footer
              className="sheet-map-footer"
              aria-label="Map source and OpenStreetMap attribution"
            />
          ) : null
        }
      >
        <PanelHeader
          title="Choose an indicator"
          context={context}
          contextId="metric-library-context"
          close="metric-library"
        />
        <Search
          id="metric-search"
          label="Search indicators"
          placeholder="Income, rent, homelessness…"
          value={state.metricQuery}
          onChange={(metricQuery) => atlas.patch({ metricQuery })}
        />
        <div id="category-list" className="category-list" aria-label="Metric categories">
          {resources &&
            ['All', ...new Set(resources.catalog.map((m) => m.shortCategory))].map((category) => (
              <button
                key={category}
                data-category={category}
                aria-pressed={state.category === category}
              >
                {category}
              </button>
            ))}
        </div>
        <p id="catalog-status" className="library-note">
          {resources ? `${resources.selectionCounts.primary + resources.selectionCounts.variants} selections · ${resources.selectionCounts.primary} primary + ${resources.selectionCounts.variants} race variants` : 'Loading the database catalog…'}
        </p>
        <div id="metric-list" className="metric-list">
          {resources && <MetricItems atlas={atlas} />}
        </div>
      </Sheet>
      <Sheet
        atlas={atlas}
        id="place-library"
        className="drawer place-drawer"
        label="Choose a place"
        footer={
          !mobileLayout() ? (
            <footer
              className="sheet-map-footer"
              aria-label="Map source and OpenStreetMap attribution"
            />
          ) : null
        }
      >
        <div className="drawer-top">
          <div>
            <p id="place-library-context" className="panel-context">
              {state.concept === 'compare'
                ? `${state.placeTarget === 'a' ? 'Primary' : 'Comparison'} map · ${state.comparison === 'metrics' ? 'Applies to both maps' : 'Changes this map only'}`
                : 'Search states and counties'}
            </p>
            <h2 id="place-library-title">
              {state.countiesOnly
                ? 'Explore the counties'
                : mobileLayout()
                  ? 'Find a state'
                  : 'Choose a place'}
            </h2>
          </div>
          <button
            data-close="place-library"
            aria-label="Close place search"
            className="icon-button"
          >
            ×
          </button>
        </div>
        <Search
          id="place-search"
          label="Search places"
          placeholder={
            mobileLayout() && !state.countiesOnly ? 'Search states' : 'State or county name…'
          }
          value={state.placeQuery}
          onChange={(placeQuery) => atlas.patch({ placeQuery })}
        />
        {resources && <PlaceItems atlas={atlas} />}
      </Sheet>
      <Sheet atlas={atlas} id="inspector" className="inspector drawer" label="Place statistics">
        {resources && <InspectorContent atlas={atlas} />}
      </Sheet>
      <Sheet
        atlas={atlas}
        id="comparison-setup-panel"
        className="drawer"
        label="Choose second place"
      >
        {resources && <ComparisonDraftContent atlas={atlas} />}
      </Sheet>
      <Sheet
        atlas={atlas}
        id="compare-results"
        className="drawer comparison-drawer"
        label="Comparison data"
      >
        {resources && <CompareContent atlas={atlas} />}
      </Sheet>
      <Sheet
        atlas={atlas}
        id="ranking-panel"
        className="drawer"
        label="Highest and lowest"
        footer={
          resources && !mobileLayout() ? (
            <footer
              className="sheet-map-footer"
              aria-label="Map source and OpenStreetMap attribution"
            >
              <IndicatorFooter atlas={atlas} />
            </footer>
          ) : null
        }
      >
        {resources && (
          <>
            <button className="panel-back" data-close="ranking-panel">
              <Icon name="back" /> Back to {selected()?.name || 'Explorer'}
            </button>
            <h2>{displayMetricName(atlas.metric())}</h2>
            <RankList atlas={atlas} />
            <p className="library-note">
              <SourceLink atlas={atlas} metric={atlas.metric()} place={selected()} />. Missing
              values excluded. Same scale for both lists.
            </p>
            {mobileLayout() && <IndicatorFooter atlas={atlas} />}
          </>
        )}
      </Sheet>
      <Sheet
        atlas={atlas}
        id="search-sheet"
        className="drawer"
        label="Search"
        footer={
          !mobileLayout() ? (
            <footer
              className="sheet-map-footer"
              aria-label="Map source and OpenStreetMap attribution"
            />
          ) : null
        }
      >
        <div className="drawer-top">
          <h2>Search</h2>
          <button data-close="search-sheet" aria-label="Close search">
            ×
          </button>
        </div>
        <p>What would you like to find?</p>
        <button data-pane-metric="a" className="search-choice">
          <Icon name="indicators" />
          Indicators <span>Choose what the map shows</span>
        </button>
        <button data-pane-place="a" className="search-choice">
          <Icon name="map" />
          Locations <span>Find a state or county</span>
        </button>
      </Sheet>
      <Sheet atlas={atlas} id="story-rail" className="story-rail drawer" label="Trends">
        <PanelHeader title="Follow a question." close="story-rail" />
        <p className="library-note">Prepared explorations · examples, not live search trends.</p>
        <div id="story-list">
          {stories.map((story, i) => (
            <button
              key={story.metric + story.place}
              className="story-item"
              data-story={i}
              aria-pressed={
                story.metric === state.metric && story.place === state.selected?.slice(0, 2)
              }
            >
              <strong>{story.title}</strong>
              <small>{story.description}</small>
              <span className="story-action">{story.action} →</span>
            </button>
          ))}
        </div>
        <button id="all-layers" className="outline-button">
          Explore all indicators <span aria-hidden="true">→</span>
        </button>
      </Sheet>
      <Sheet atlas={atlas} id="saved-panel" className="drawer" label="Saved explorations">
        <SavedContent atlas={atlas} saved={saved} />
      </Sheet>
    </>
  );
}
function PlaceItems({ atlas }: { atlas: Atlas }) {
  const { state, resources, place, selectedB } = atlas,
    geo = resources!.geo,
    districtMetric = atlas.metric().geographyType === 'congressional_district',
    query = state.placeQuery.trim().toLowerCase(),
    parent = (state.placeTarget === 'b' ? selectedB()?.id : state.selected)?.slice(0, 2),
    recent = mobileLayout() && !state.countiesOnly && !query && !state.placeBrowseAll;
  if (recent)
    return (
      <>
        <p id="place-list-caption" className="library-note">
          Recent states
        </p>
        <div id="place-list" className="place-list">
          {state.recentStates
            .map((id) => place(id))
            .filter((p) => p !== undefined)
            .map((f) => (
              <button key={f.id} className="place-item" data-place={f.id}>
                <Icon name="map" />
                <span>
                  <strong>{f.name}</strong>
                  <small>{f.id === '11' ? 'Federal district' : 'State'} · United States</small>
                </span>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3 10h14m-5-5 5 5-5 5" />
                </svg>
              </button>
            ))}
          {!state.recentStates.length && <p className="library-note">No recent states yet.</p>}
          <button className="place-item" data-browse-states>
            <Icon name="map" />
            <span>
              <strong>Browse all states</strong>
              <small>United States · 50 states + DC</small>
            </span>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 10h14m-5-5 5 5-5 5" />
            </svg>
          </button>
        </div>
      </>
    );
  let list =
    districtMetric
      ? geo.districts || []
      : state.countiesOnly && parent
      ? geo.counties.filter((f) => f.stateId === parent)
      : query
        ? [...geo.states, ...geo.counties]
        : geo.states;
  list = list
    .filter((f) =>
      `${f.name} ${place(f.stateId)?.name || ''} ${f.id}`.toLowerCase().includes(query),
    )
    .sort((a, b) => a.id.length - b.id.length || a.name.localeCompare(b.name));
  return (
    <>
      <p id="place-list-caption" className="library-note">
        {list.length.toLocaleString()} matches
        {!query && districtMetric ? ' · 119th Congress districts' : !query && !state.countiesOnly ? ' · Type a county name to search all counties' : ''}
        {list.length > 100 ? ' · First 100 shown' : ''}
      </p>
      <div id="place-list" className="place-list">
        {list.slice(0, 100).map((f) => (
          <button key={f.id} className="place-item" data-place={f.id}>
            <span>
              <strong>{f.name}</strong>
              <small>
                {f.districtCode
                  ? `${place(f.stateId)!.name} · Congressional District ${Number(f.districtCode)} · 119th Congress`
                  : f.id.length === 2
                  ? f.id === '11'
                    ? 'Federal district'
                    : 'State'
                  : place(f.stateId)!.name + ' · County equivalent'}{' '}
                · FIPS {f.id}
              </small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
        {!list.length && (
          <p className="library-note">No places found. Try a state name or county FIPS code.</p>
        )}
      </div>
    </>
  );
}
