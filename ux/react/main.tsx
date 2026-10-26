import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useAtlas, mobileLayout, stories } from './use-atlas';
import type { Atlas } from './use-atlas';
import { displayMetricName } from './types';
import type { Page, Side, Rank } from './types';
import { features } from './journal';
import { Icon } from './components';
import { Maps } from './maps';
import { ExplorerPanel, QuickStats, SourceLink } from './explorer';
import { useSaved } from './saved';
import { Drawers } from './drawers';
import { Dialog, useDialogs } from './dialogs';
import { ReadingPages, SourceDialog } from './reading';
import { useMobile } from './sheet';
import { showSurface, slidePill } from '../motion.js';
import { initViewport } from '../viewport.js';

declare const __LOCAL_REVIEW__: boolean;
function App() {
  const atlas = useAtlas(),
    dialogs = useDialogs(atlas),
    saved = useSaved(atlas),
    { state, resources, patch } = atlas,
    mobile = useMobile(),
    root = useRef<HTMLDivElement>(null),
    handledClickEvents = useRef(new WeakSet<Event>());
  useEffect(() => {
    const destroyViewport = initViewport();
    document.body.classList.toggle(
      'embedded-map',
      new URLSearchParams(location.search).get('embed') === '1',
    );
    const theme = (event: MessageEvent) => {
      if (
        new URLSearchParams(location.search).get('embed') === '1' &&
        event.origin === location.origin &&
        event.source === parent &&
        event.data?.type === 'atlas-embed-theme' &&
        ['light', 'dark'].includes(event.data.theme)
      )
        patch({ theme: event.data.theme });
    };
    window.addEventListener('message', theme);
    return () => {
      destroyViewport();
      window.removeEventListener('message', theme);
    };
  }, []);
  useEffect(() => {
    atlas.setPlaceSheet(
      mobile
        ? 'min'
        : document.body.classList.contains('place-expanded')
          ? 'expanded'
          : state.selected
            ? 'half'
            : 'min',
    );
  }, [mobile]);
  useEffect(() => {
    const review = ['1', 'true', 'yes', 'on'].includes(
      new URLSearchParams(location.search).get('review') || '',
    );
    if (!__LOCAL_REVIEW__ || !review) return;
    let alive = true;
    document.body.dataset.review = '1';
    void import('../feedback.js').then(({ initFeedback }) => {
      if (!alive) return;
      initFeedback({
        onStart: () => Object.values(atlas.maps.current).forEach((map) => map?.settle()),
        getContext: (point?: unknown) => ({
          url: location.origin + '/ux/' + location.search,
          settings: { ...atlas.getSettings() },
          view: {
            page: atlas.current.current.page,
            theme: atlas.current.current.theme,
            concept: atlas.current.current.concept,
            mode: atlas.current.current.mode,
            selected: atlas.current.current.selected,
            second: atlas.current.current.second,
            metric: atlas.current.current.metric,
            secondMetric: atlas.current.current.secondMetric,
            comparison: atlas.current.current.comparison,
            pinned: [...atlas.current.current.pinned],
            pageRoute: location.pathname,
          },
          maps: Object.values(atlas.maps.current)
            .filter((map) => map !== null)
            .map((map) => map.feedbackSnapshot(point)),
        }),
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (handledClickEvents.current.has(event.nativeEvent)) return;
    handledClickEvents.current.add(event.nativeEvent);
    const target = event.target as HTMLElement,
      link = target.closest<HTMLAnchorElement>('a[data-page],a#info-open,a#support-open');
    if (
      link &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (link.getAttribute('aria-disabled') === 'true') return;
      if (link.id === 'info-open') {
        patch({ infoSurface: 'about' });
        if (state.page === 'info') atlas.back();
        else void atlas.navigate('info');
        return;
      }
      if (link.id === 'support-open') {
        if (state.page === 'support') atlas.back();
        else void atlas.navigate('support');
        return;
      }
      void atlas.navigate(link.dataset.page as Page, link.dataset.article);
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button) return;
    const d = button.dataset;
    if (d.feature) {
      patch({
        featureIndex:
          (state.featureIndex + (d.feature === 'next' ? 1 : -1) + features.length) %
          features.length,
      });
      return;
    }
    if (d.page) {
      void atlas.navigate(d.page as Page, d.article);
      return;
    }
    if (d.openInfo) {
      const show = () => {
        patch({ infoSurface: 'legacy', infoTab: d.openInfo as 'methodology' });
        requestAnimationFrame(() => document.querySelector('#reading-page')?.scrollTo(0, 0));
      };
      if (state.page === 'info') show();
      else void atlas.navigate('info').then(show);
      return;
    }
    if (button.hasAttribute('data-open-report')) {
      dialogs.open('report', button);
      return;
    }
    if (button.hasAttribute('data-open-milestone')) {
      dialogs.open('milestone', button);
      return;
    }
    if (button.hasAttribute('data-support-methods')) {
      const section = document.querySelector<HTMLElement>('#support-methods');
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      return;
    }
    if (d.info) {
      patch({
        infoSurface: 'legacy',
        infoTab: d.info as 'sources' | 'methodology' | 'data',
      });
      const page = document.querySelector('#reading-page');
      if (page) page.scrollTop = 0;
      return;
    }
    if (button.id === 'about-legacy-back') {
      patch({ infoSurface: 'about' });
      document.querySelector('#reading-page')?.scrollTo(0, 0);
      return;
    }
    if (button.id === 'source-close') {
      atlas.closeSource();
      return;
    }
    if (button.id === 'map-sources' || button.id === 'info-map-sources') {
      atlas.showSource('geometry');
      return;
    }
    if (button.id === 'sheet-back') {
      if (
        document.body.classList.contains('place-expanded') &&
        ['map', 'compare'].includes(state.page)
      )
        atlas.setPlaceSheet('half');
      else atlas.back();
      return;
    }
    if (!resources) return;
    if (button.hasAttribute('data-comparison-cancel')) {
      atlas.closeDrawers();
      return;
    }
    if (button.hasAttribute('data-comparison-change')) {
      if (state.comparisonDraft)
        patch({
          comparisonDraft: { ...state.comparisonDraft, choosing: true },
        });
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('#comparison-place-search')?.focus(),
      );
      return;
    }
    if (d.comparisonPlace) {
      if (state.comparisonDraft)
        patch({
          comparisonDraft: {
            ...state.comparisonDraft,
            second: d.comparisonPlace,
            explicit: true,
            choosing: false,
          },
        });
      return;
    }
    if (button.hasAttribute('data-comparison-confirm') && state.comparisonDraft) {
      patch({
        second: state.comparisonDraft.second,
        comparison: 'places',
        comparisonDraft: null,
      });
      atlas.secondExplicit.current = atlas.secondExplicit.current || state.comparisonDraft.explicit;
      atlas.closeDrawers(false);
      void atlas.navigate('compare');
      return;
    }
    if (d.openRank) {
      atlas.openRank(d.openRank as Rank);
      return;
    }
    if (d.rank) {
      patch({
        rank: d.rank as Rank,
        ...(state.rankFocus ? { selected: state.rankFocus.origin, rankFocus: null } : {}),
      });
      return;
    }
    if (d.rankPlace) {
      patch({ rank: null, rankFocus: null });
      void atlas.choosePlace(d.rankPlace);
      return;
    }
    if (d.rankCompare) {
      atlas.rememberExploration();
      patch({
        second: d.rankCompare,
        comparison: 'places',
        rank: null,
        rankFocus: null,
        ...(!state.selected || state.selected === d.rankCompare
          ? {
              selected:
                atlas.rankData().rows.find((row) => row.id !== d.rankCompare)?.id ||
                (d.rankCompare === '06' ? '48' : '06'),
            }
          : {}),
      });
      atlas.secondExplicit.current = true;
      void atlas.navigate('compare', undefined, { force: true });
      return;
    }
    if (d.openPlace) {
      patch({ rank: null });
      void atlas.choosePlace(d.openPlace);
      return;
    }
    if (d.photo) {
      patch({ photoExpanded: !state.photoExpanded });
      return;
    }
    if (d.restore) {
      void saved.restore(d.restore);
      return;
    }
    if (d.removeSaved) {
      saved.remove(d.removeSaved);
      return;
    }
    if (d.openPrompt !== undefined) {
      void atlas.openPrompt(+d.openPrompt);
      return;
    }
    if (button.id === 'mobile-view-toggle') {
      patch({ mode: state.mode === '2d' ? '3d' : '2d' });
      return;
    }
    if (d.dismissPlace) {
      atlas.setPlaceSheet('min');
      return;
    }
    if (d.mode) {
      patch({ mode: d.mode as '2d' | '3d' });
      return;
    }
    if (button.hasAttribute('data-browse-states')) {
      patch({ placeBrowseAll: true });
      atlas.sheets.current.get('place-library')?.setSnap('expanded');
      requestAnimationFrame(() => {
        atlas.scrollHost('place-library')?.scrollTo(0, 0);
        document.querySelector<HTMLElement>('#place-search')?.focus({ preventScroll: true });
      });
      return;
    }
    if (d.expandSheet) {
      const sheet = atlas.sheets.current.get(d.expandSheet);
      sheet?.setSnap(sheet.snap === 'expanded' ? 'half' : 'expanded');
      return;
    }
    if (d.close) {
      atlas.closeDrawers();
      return;
    }
    if (d.camera) {
      const map = atlas.maps.current[d.side === 'b' ? 'b' : 'a'];
      if (d.camera === 'in') map?.zoom(0.8);
      else if (d.camera === 'out') map?.zoom(1.25);
      else if (d.camera === 'reset') map?.reset();
      else map?.rotate(d.camera === 'left' ? -1 : 1);
      return;
    }
    if (d.breadcrumb) {
      void atlas.choosePlace(d.breadcrumb === 'US' ? null : d.breadcrumb);
      return;
    }
    if (d.jump) {
      void atlas.choosePlace(d.jump);
      return;
    }
    if (d.category) {
      patch({ category: d.category });
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    if (d.switchMetric) {
      atlas.selectMetric(d.switchMetric, 'switch');
      return;
    }
    if (d.metric) {
      atlas.selectMetric(d.metric);
      return;
    }
    if (d.retry) {
      const metric = resources.metricById.get(d.retry);
      if (metric) void resources.store.retry(metric);
      return;
    }
    if (d.place) {
      void atlas.choosePlace(d.place, state.placeTarget);
      return;
    }
    if (d.inspectMetric) {
      atlas.selectMetric(d.inspectMetric, 'inspect');
      return;
    }
    if (d.story) {
      const story = stories[+d.story];
      patch({ metric: story.metric, rank: null });
      void atlas.choosePlace(story.place).then(() => atlas.navigate('map'));
      return;
    }
    if (d.compare) {
      if (state.comparison !== d.compare)
        history.pushState(null, '', location.pathname + location.search);
      atlas.closeDrawers(false);
      patch({
        comparison: d.compare as 'metrics' | 'places',
        ...(!state.selected ? { selected: '06' } : {}),
        ...(d.compare === 'metrics' && state.secondMetric === state.metric
          ? {
              secondMetric: state.metric === 'unemployment' ? 'obesity-rate' : 'unemployment',
            }
          : {}),
      });
      atlas.action('comparison_mode_select');
      return;
    }
    if (button.hasAttribute('data-mobile-search') || button.id === 'mobile-search') {
      atlas.openDrawer('search-sheet', button);
      return;
    }
    if (d.panePlace) {
      atlas.showPlaceLibrary(d.panePlace as Side);
      return;
    }
    if (d.paneMetric) {
      atlas.showMetricLibrary(d.paneMetric as Side);
      return;
    }
    if (d.source) {
      atlas.showSource(d.source as Side);
      return;
    }
    if (d.statistics) {
      patch({ inspectorSide: d.statistics as Side });
      atlas.openDrawer(
        'inspector',
        button,
        d.statistics as Side,
        state.concept === 'compare' && d.statistics === 'a' ? 'a' : 'b',
      );
      return;
    }
    switch (button.id) {
      case 'desktop-search':
      case 'metric-button':
      case 'all-layers':
        atlas.showMetricLibrary();
        break;
      case 'find-place':
        atlas.showPlaceLibrary();
        break;
      case 'inspect-next':
        atlas.showPlaceLibrary(
          state.inspectorSide,
          Boolean(state.inspectorSide === 'b' ? atlas.selectedB() : atlas.selected()),
        );
        break;
      case 'context-compare':
      case 'compare-place':
      case 'inspector-compare-place':
        if (mobile) {
          atlas.openComparisonDraft();
          break;
        }
        atlas.rememberExploration();
        if (!state.selected) patch({ selected: '06' });
        patch({ comparison: 'places' });
        void atlas.navigate('compare');
        break;
      case 'edit-card':
        atlas.showMetricLibrary(state.inspectorSide, true);
        break;
      case 'stories-open':
        atlas.openDrawer('story-rail', button);
        break;
      case 'saved-open':
        saved.open();
        break;
      case 'save-view':
      case 'save-current':
        saved.save();
        break;
      case 'mobile-panel':
        atlas.closeDrawers(false);
        atlas.setPlaceSheet(
          document.body.classList.contains('place-expanded') ? 'half' : 'expanded',
        );
        break;
    }
  }
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || dialogs.active.current) return;
      const state = atlas.current.current;
      if (state.source) {
        atlas.closeSource();
        event.stopImmediatePropagation();
      } else if (state.overlay) {
        atlas.closeDrawers();
        event.stopImmediatePropagation();
      } else if (!['map', 'compare'].includes(state.page)) {
        atlas.back();
        event.stopImmediatePropagation();
      } else if (mobileLayout() && !state.placeCollapsed) {
        atlas.setPlaceSheet(state.placeExpanded ? 'half' : 'min');
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, []);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const group = (event.target as HTMLElement).closest('.concept-tabs,.segmented');
    if (group && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const buttons = [
          ...group.querySelectorAll<HTMLElement>(
            group.matches('.concept-tabs') ? 'a[data-page]' : 'button:not(:disabled)',
          ),
        ],
        index = buttons.indexOf(event.target as HTMLElement);
      if (!buttons.length || index < 0) return;
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    }
  }
  return (
    <div ref={root} style={{ display: 'contents' }} onClick={onClick} onKeyDown={onKeyDown}>
      <Header atlas={atlas} />
      <ExplorerPanel atlas={atlas} />
      <QuickStats atlas={atlas} />
      <button
        id="mobile-panel"
        className="mobile-panel"
        aria-expanded={state.placeExpanded}
        aria-label="Expand place"
      >
        <Icon name="expand" />
      </button>
      <button
        id="context-compare"
        className="context-compare"
        hidden={
          mobile ||
          !state.selected ||
          state.concept === 'compare' ||
          !['map', 'compare'].includes(state.page) ||
          Boolean(state.overlay) ||
          Boolean(state.comparisonDraft)
        }
      >
        Compare {atlas.selected()?.name || 'this place'} <Icon name="map" />
      </button>
      <button
        id="sheet-back"
        className="chrome-circle"
        aria-label={
          state.page === 'article'
            ? 'Return to Blog'
            : ['map', 'compare'].includes(state.page)
              ? 'Return to map'
              : 'Return to previous page'
        }
        hidden={!mobile || !state.placeExpanded || !['map', 'compare'].includes(state.page)}
      >
        ←
      </button>
      <Maps atlas={atlas} />
      <Drawers atlas={atlas} saved={saved} />
      <Attribution atlas={atlas} />
      <p id="mobile-comparison-source" className="mobile-comparison-source">
        {resources && (
          <>
            <SourceLink atlas={atlas} metric={atlas.metric()} place={atlas.selected()} /> ·{' '}
            {atlas.layer(atlas.metric()).period || 'No observation'}{' '}
            <button data-source="a" aria-label="Open comparison indicator source">
              {' '}
              · Source <Icon name="info" />
            </button>
          </>
        )}
      </p>
      <ReadingPages atlas={atlas} />
      <SourceDialog atlas={atlas} />
      <Toast message={state.toast} />
      <Startup atlas={atlas} />
      <Dialog owner={dialogs} />
    </div>
  );
}
function Header({ atlas }: { atlas: Atlas }) {
  const { state } = atlas,
    nav =
      state.page === 'info' || state.page === 'support'
        ? null
        : state.page === 'article'
          ? 'blog'
          : state.page,
    ready = state.startup === 'ready';
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (ref.current) slidePill(ref.current, ref.current.querySelector('[aria-current=page]'));
    const dimension = document.querySelector('.dimension-control');
    if (dimension) slidePill(dimension, dimension.querySelector('[aria-pressed=true]'));
  }, [nav, state.mode]);
  const target = state.mode === '2d' ? '3d' : '2d',
    sharedPlace = state.comparison === 'metrics';
  return (
    <header className="app-header">
      <div className="navigation-cluster">
        <a className="brand" href="/united-states/unemployment" aria-label="USA X-Ray home">
          <Icon name="explorer" />
          <span>
            USA <b>X-Ray</b>
          </span>
        </a>
        <nav ref={ref} className="concept-tabs" aria-label="Explore modes">
          <span className="nav-pill" aria-hidden="true" hidden={nav === null} />
          {(
            [
              {
                page: 'map',
                href: '/united-states/unemployment',
                label: 'Map',
                concept: 'explorer',
              },
              {
                page: 'compare',
                href: '/compare/places/unemployment/california/vs/texas',
                label: 'Compare',
                concept: 'compare',
              },
              { page: 'stats', href: '/stats', label: 'Stats' },
              { page: 'blog', href: '/blog', label: 'Blog' },
            ] as const
          ).map((item) => (
            <a
              key={item.page}
              href={item.href}
              data-page={item.page}
              data-concept={'concept' in item ? item.concept : undefined}
              aria-current={nav === item.page ? 'page' : undefined}
              aria-disabled={!ready && ['map', 'compare'].includes(item.page) ? true : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <button
        id="mobile-search"
        className="chrome-circle"
        aria-label="Search places and indicators"
        disabled={!ready}
      >
        <Icon name="search" />
      </button>
      <button
        id="mobile-compare-metric"
        className="mobile-compare-metric"
        data-pane-place={sharedPlace ? 'a' : undefined}
        data-pane-metric={sharedPlace ? undefined : 'a'}
        aria-label={
          sharedPlace
            ? 'Choose the comparison place for both maps'
            : 'Choose the comparison indicator for both maps'
        }
      >
        {atlas.resources && (
          <>
            <span className="mobile-compare-label">
              {sharedPlace
                ? atlas.selected()?.name || 'United States'
                : displayMetricName(atlas.metric()).replace(/ rate$/, '')}
            </span>
            <Icon name="down" />
          </>
        )}
      </button>
      <a
        id="support-open"
        className="support-trigger"
        href="/support"
        aria-label="Support USA X-Ray"
        aria-current={state.page === 'support' ? 'page' : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
        <span>Support</span>
      </a>
      <a id="info-open" className="chrome-circle" href="/about" aria-label="About USA X-Ray" aria-current={state.page === 'info' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </svg>
      </a>
      <div className="workspace-bar">
        <div
          className="dimension-control sliding-control"
          aria-label="Map view"
          data-ready={ready ? 'true' : undefined}
        >
          <span className="segment-pill" aria-hidden="true" />
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              data-mode={mode}
              aria-pressed={state.mode === mode}
              disabled={!ready}
            >
              {mode === '2d' ? (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m2 5 5-2 6 2 5-2v12l-5 2-6-2-5 2V5ZM7 3v12M13 5v12" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m10 2 7 4v8l-7 4-7-4V6l7-4ZM3 6l7 4 7-4M10 10v8" />
                </svg>
              )}
              <span>{mode.toUpperCase()}</span>
            </button>
          ))}
          <button
            id="mobile-view-toggle"
            data-pill="skip"
            className="mobile-view-toggle"
            aria-label={'Switch to ' + target.toUpperCase()}
            disabled={!ready}
          >
            {target === '2d' ? (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m2 5 5-2 6 2 5-2v12l-5 2-6-2-5 2V5ZM7 3v12M13 5v12" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m10 2 7 4v8l-7 4-7-4V6l7-4ZM3 6l7 4 7-4M10 10v8" />
              </svg>
            )}
            <span>{target.toUpperCase()}</span>
          </button>
        </div>
      </div>
      <button
        id="theme-toggle"
        className="chrome-circle theme-control"
        aria-label={'Switch to ' + (state.theme === 'dark' ? 'light' : 'dark') + ' theme'}
        aria-pressed={state.theme === 'dark'}
        onClick={() => atlas.setTheme(state.theme === 'dark' ? 'light' : 'dark', true)}
      >
        {state.theme === 'dark' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
          </svg>
        )}
      </button>
    </header>
  );
}
function Attribution({ atlas }: { atlas: Atlas }) {
  const ref = useRef<HTMLAnchorElement>(null),
    mobile = useMobile();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      let target: HTMLElement = document.body;
      const s = atlas.state,
        reading = !['map', 'compare'].includes(s.page),
        embedded = new URLSearchParams(location.search).get('embed') === '1';
      if (!mobile && !embedded && !reading) {
        if (s.concept === 'compare')
          target = document.querySelector<HTMLElement>('#compare-desktop-osm-slot') || document.body;
        else {
          const source = s.overlay
            ? document.querySelector<HTMLButtonElement>(
                `#${CSS.escape(s.overlay.id)} .indicator-legend-source[data-source="a"]`,
              )
            : document.querySelector<HTMLButtonElement>(
                '#explore-panel .indicator-legend-source[data-source="a"]',
              );
          if (source?.getClientRects().length) {
            source.after(node);
            target = source.parentElement || document.body;
          }
        }
      }
      node.dataset.placement = target === document.body ? 'floating' : 'source';
      if (node.parentElement !== target) target.append(node);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [mobile, atlas.state.page, atlas.state.concept, atlas.state.overlay?.id, atlas.state.metric, atlas.state.secondMetric, atlas.resources]);
  return (
    <a
      ref={ref}
      className="osm-attribution"
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noreferrer"
    >
      © OpenStreetMap contributors
    </a>
  );
}
function Toast({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null),
    last = useRef(message);
  if (message) last.current = message;
  useLayoutEffect(() => {
    if (ref.current)
      void showSurface(ref.current, Boolean(message), {
        distance: 8,
        duration: 180,
      });
  }, [message]);
  return (
    <div ref={ref} id="toast" role="status" hidden={true}>
      {message || last.current}
    </div>
  );
}

function Startup({ atlas }: { atlas: Atlas }) {
  const { state } = atlas,
    [phrase, setPhrase] = useState(0),
    phraseAnimation = useRef<Animation | null>(null),
    phrases = [
      'Gathering statistics across the states',
      'Taking a closer look at California',
      'Exploring San Francisco County',
      'Putting Utah unemployment on the map',
      'Connecting states, counties and stories',
      'Looking at the numbers behind New York',
    ];
  useEffect(() => {
    if (state.startup !== 'loading') return;
    let alive = true,
      rotating = false;
    const message = document.querySelector<HTMLElement>('#startup-message'),
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (message && !reduced.matches)
      phraseAnimation.current = message.animate(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
    const rotate = async () => {
      if (!alive || rotating || document.hidden) return;
      rotating = true;
      if (message && !reduced.matches) {
        phraseAnimation.current?.cancel();
        phraseAnimation.current = message.animate(
          [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-6px)' }],
          { duration: 160, fill: 'forwards' },
        );
        await phraseAnimation.current.finished.catch(() => {});
      }
      if (alive) {
        setPhrase((p) => (p + 1) % phrases.length);
        if (message && !reduced.matches)
          requestAnimationFrame(() => {
            if (alive && state.startup === 'loading') {
              phraseAnimation.current?.cancel();
              phraseAnimation.current = message.animate(
                [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
                { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' },
              );
            }
          });
      }
      rotating = false;
    };
    const rotation = setInterval(() => void rotate(), 2800),
      timeout = setTimeout(() => atlas.patch({ startup: 'error' }), 45000);
    return () => {
      alive = false;
      clearInterval(rotation);
      clearTimeout(timeout);
      phraseAnimation.current?.cancel();
      phraseAnimation.current = null;
    };
  }, [state.startup]);
  useEffect(() => {
    document.body.dataset.atlasStatus = state.startup;
  }, [state.startup]);
  return createPortal(
    <section
      id="loading"
      role="status"
      aria-live="polite"
      aria-busy={state.startup === 'loading'}
      data-state={state.startup === 'error' ? 'error' : undefined}
      hidden={state.startup === 'ready'}
    >
      <div className="startup-card">
        <div className="startup-copy">
          <h1 id="startup-title">
            {state.startup === 'error' ? (
              'The U.S. map couldn’t load'
            ) : (
              <>
                Loading
                <span className="startup-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </>
            )}
          </h1>
          <p id="startup-message" aria-hidden={state.startup === 'loading' ? true : undefined}>
            {state.startup === 'error'
              ? 'Map boundaries or indicator data could not be reached. Check your connection and try again. About and Support are available.'
              : phrases[phrase]}
          </p>
          <span className="startup-accessible" hidden={state.startup === 'error'}>
            Loading the U.S. map and published statistics.
          </span>
        </div>
        <button
          id="startup-retry"
          hidden={state.startup !== 'error'}
          onClick={() => location.reload()}
        >
          Try again
        </button>
      </div>
    </section>,
    document.body,
  );
}
const bootstrap = document.querySelector('#loading');
bootstrap?.remove();
createRoot(document.getElementById('atlas-root')!).render(<App />);
