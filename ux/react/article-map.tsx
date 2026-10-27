import { useEffect, useId, useRef, useState } from 'react';
import { ExplorerMap } from '../map.js';
import { displayLayer, prepareLayer } from '../model.js';
import type { Atlas, Resources } from './use-atlas';
import type { Geography, Layer, MapAdapter, Side } from './types';
import { paletteFor, ramp } from './explorer';

type MapCallbacks = {
  onSelect: (id: string | null) => void;
  onRenderError: (message: string | null) => void;
  onError: (message: string) => void;
};
type MapConstructor = new (
  host: HTMLElement,
  geo: Geography,
  callbacks: MapCallbacks,
) => MapAdapter;
const Renderer = ExplorerMap as unknown as MapConstructor;
const ignoreSelection = () => {};

function articleDisplayLayer(source: Layer, geo: Geography, stateScope: boolean): Layer {
  if (!stateScope) return displayLayer(source) as Layer;
  return displayLayer(prepareLayer({
    ...source,
    observations: [...source.observations.values()].filter(
      (observation) => observation.id === 'US' || /^\d{2}$/.test(observation.id),
    ),
    excludedGeographies: source.excludedGeographies || [],
    suppressedGeographies: [...(source.suppressed || [])],
  }, geo) as Layer) as Layer;
}

type ArticleMapProps = {
  atlas: Atlas;
  active: boolean;
  title: string;
  place: string;
  second?: string;
  metric: string;
  caption: string;
};

export function ArticleMap({ atlas, active, title, place, second, metric: metricId, caption }: ArticleMapProps) {
  const resources = atlas.resources as Resources | null;
  const id = useId();
  const firstHost = useRef<HTMLDivElement>(null);
  const secondHost = useRef<HTMLDivElement>(null);
  const maps = useRef<Partial<Record<Side, MapAdapter>>>({});
  const [initialized, setInitialized] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [detailError, setDetailError] = useState('');
  const [renderErrors, setRenderErrors] = useState<Partial<Record<Side, string>>>({});
  const mapMetric = resources?.metricById.get(metricId);
  const nativeLayer = mapMetric ? atlas.layer(mapMetric) : null;
  const stateScope = place.length === 2 && (!second || second.length === 2);
  const sourceLayer = mapMetric && resources ? resources.store.get(mapMetric) : null;
  const layer = nativeLayer && sourceLayer?.status === 'ready' && mapMetric && resources
    ? articleDisplayLayer(sourceLayer, resources.geo, stateScope)
    : nativeLayer;
  const places = [place, ...(second ? [second] : [])];

  const compactValue = (value: number, unit = '') => {
    if (unit.startsWith('USD')) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 2 : 0,
      }).format(value);
    }
    if (unit === 'people') {
      const millions = Math.abs(value) >= 1_000_000;
      return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        minimumFractionDigits: millions ? 2 : 0,
        maximumFractionDigits: 2,
      }).format(value);
    }
    if (metricId === 'deaths-under-18')
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
    if (unit === '%')
      return `${new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)}%`;
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}${unit ? ' ' + unit : ''}`;
  };

  useEffect(() => {
    if (!active || !resources || !mapMetric || !firstHost.current || (second && !secondHost.current)) return;
    let alive = true;
    setInitialized(false);
    setDetailError('');
    const locations = [...new Set([place, ...(second ? [second] : [])])];
    void Promise.all([
      ...locations.map((location) => resources.geo.loadDetail(location)),
      resources.store.load(mapMetric),
    ]).then(() => {
      if (!alive || !firstHost.current) return;
      const create = (host: HTMLElement, selectedId: string, side: Side) => {
        const map = new Renderer(host, resources.geo, {
          onSelect: ignoreSelection,
          onRenderError: (message) => alive &&
            setRenderErrors((previous) => ({ ...previous, [side]: message || undefined })),
          onError: (message) => alive &&
            setRenderErrors((previous) => ({ ...previous, [side]: message })),
        });
        const data = articleDisplayLayer(resources.store.get(mapMetric), resources.geo, stateScope);
        map.update({
          animateEntry: false,
          layoutKey: 'article-map',
          mode: atlas.state.mode,
          selectedId,
          metricKey: mapMetric.id,
          geographyType: mapMetric.geographyType === 'congressional_district' ? 'congressional_district' : 'state',
          values: data.values,
          heightValues: data.heightValues || new Map(),
          countySupported: stateScope ? false : mapMetric.countySupported,
          palette: paletteFor(data),
          dark: atlas.state.theme === 'dark',
          cleanBackdrop: false,
          background: atlas.state.theme === 'dark' ? '#171A1D' : '#EEF0F3',
          settings: resources.settings.record.settings,
          ranks: [],
          rankMarkers: [],
        });
        maps.current[side] = map;
      };
      create(firstHost.current, place, 'a');
      if (second && secondHost.current) create(secondHost.current, second, 'b');
      setInitialized(true);
    }).catch((error: unknown) => {
      if (alive) setDetailError(error instanceof Error ? error.message : 'Map data could not be loaded.');
    });
    return () => {
      alive = false;
      for (const map of Object.values(maps.current)) map?.dispose();
      maps.current = {};
    };
  }, [active, resources, mapMetric, metricId, place, second, loadAttempt]);

  useEffect(() => {
    if (!active || !resources || !mapMetric || !initialized) return;
    const data = articleDisplayLayer(resources.store.get(mapMetric), resources.geo, stateScope);
    const update = (side: Side, selectedId: string) => maps.current[side]?.update({
      animateEntry: false,
      layoutKey: 'article-map',
      mode: atlas.state.mode,
      selectedId,
      metricKey: mapMetric.id,
      geographyType: mapMetric.geographyType === 'congressional_district' ? 'congressional_district' : 'state',
      values: data.values,
      heightValues: data.heightValues || new Map(),
      countySupported: stateScope ? false : mapMetric.countySupported,
      palette: paletteFor(data),
      dark: atlas.state.theme === 'dark',
      cleanBackdrop: false,
      background: atlas.state.theme === 'dark' ? '#171A1D' : '#EEF0F3',
      settings: resources.settings.record.settings,
      ranks: [],
      rankMarkers: [],
    });
    update('a', place);
    if (second) update('b', second);
  }, [active, atlas.revision, atlas.state.mode, atlas.state.theme, initialized, mapMetric, place, resources, second, stateScope]);

  const startupError = active && atlas.state.startup === 'error';
  const loading = active && !startupError && (!resources || !mapMetric || !layer || ['idle', 'loading'].includes(layer.status));
  const missing = !loading && layer?.status === 'ready' &&
    (layer.observations.get(place)?.value == null || (second != null && layer.observations.get(second)?.value == null));
  const dataError = layer?.status === 'error' ? layer.error || 'Observation could not be loaded.' : '';

  return (
    <figure className="article-map article-live-map">
      <div className={'article-map-hosts' + (second ? ' is-comparison' : '')}>
        {places.map((selectedId, index) => {
          const side = (index === 0 ? 'a' : 'b') as Side;
          const value = layer?.status === 'ready' ? layer.observations.get(selectedId)?.value ?? null : null;
          const metricValue = value == null ? 'No observation' : compactValue(value, layer?.unit);
          const shortNames: Record<string, string> = {
            'deaths-under-18': 'Child deaths per 100K',
            'work-from-home-share': 'Working from home',
            'rent-as-of-income-rent-burden': 'Rent burden',
          };
          const legendName = shortNames[metricId] || mapMetric?.name || title;
          return (
            <div
              ref={side === 'a' ? firstHost : secondHost}
              id={`${id}-${side}`}
              className="article-map-host"
              role="region"
              aria-label={`${title} · map pane ${index + 1}`}
              tabIndex={0}
              key={selectedId}
            >
              {layer?.status === 'ready' && (
                <section className="article-map-legend" aria-label={`${mapMetric?.name || title} map legend and selected value`}>
                  <div className="article-map-legend-heading">
                    <span>{legendName}</span>
                    <strong>{metricValue}</strong>
                  </div>
                  {layer.domain && (
                    <div className="article-map-legend-ramp" aria-hidden="true" style={{ backgroundImage: ramp(layer) }} />
                  )}
                  {layer.domain && <div className="article-map-legend-range" role="group" aria-label={stateScope || (mapMetric && !mapMetric.countySupported) ? 'Nationwide state minimum and maximum' : 'Nationwide county minimum and maximum'}>
                    <span>{`Min ${compactValue(layer.domain[0], layer.unit)}`}</span>
                    <span>{`Max ${compactValue(layer.domain[1], layer.unit)}`}</span>
                  </div>}
                </section>
              )}
            </div>
          );
        })}
      </div>
      <figcaption>{`Live atlas snapshot: ${layer?.period || 'current admitted period'}. ${caption}`}</figcaption>
      {(loading || startupError || detailError || missing || dataError || Object.values(renderErrors).some(Boolean)) && (
        <div className="article-map-state" aria-live="polite">
          {loading && <span>{'Loading the latest admitted observation…'}</span>}
          {startupError && <><span>{'The live map could not load because atlas startup failed.'}</span><button type="button" onClick={() => document.querySelector<HTMLButtonElement>('#startup-retry')?.click()}>{'Retry atlas startup'}</button></>}
          {(detailError || dataError) && <span>{detailError || dataError}</span>}
          {missing && <span>{place.length === 2 ? 'No observation is available for this state in the current admitted period.' : 'No observation is available for this county in the current admitted period.'}</span>}
          {Object.entries(renderErrors).map(([side, message]) => message && (
            <p key={side} role="alert">{message} <button type="button" onClick={() => maps.current[side as Side]?.retryFlat()}>{'Try again'}</button></p>
          ))}
          {dataError && mapMetric && <button type="button" onClick={() => void resources?.store.retry(mapMetric)}>{'Retry data'}</button>}
          {detailError && <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{'Retry map loading'}</button>}
        </div>
      )}
    </figure>
  );
}
