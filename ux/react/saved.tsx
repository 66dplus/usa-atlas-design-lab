import { useState } from 'react';
import type { Atlas } from './use-atlas';
import { displayMetricName } from './types';
import type { Rank } from './types';
import { formatPeriod } from '../model.js';
import { Icon } from './components';
interface SavedExploration {
  id: string;
  url: string;
  title: string;
  metric?: string;
  period?: string;
  savedAt?: string;
}
function readSaved(): SavedExploration[] | null {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem('usa-atlas-explorations') || '[]');
    if (!Array.isArray(rows)) return null;
    return rows.filter(
      (row): row is SavedExploration =>
        row &&
        typeof row.url === 'string' &&
        typeof row.title === 'string' &&
        typeof row.id === 'string',
    );
  } catch {
    return null;
  }
}
export function useSaved(atlas: Atlas) {
  const [items, setItems] = useState(() => readSaved() || []);
  function read() {
    const rows = readSaved();
    if (!rows) atlas.toast('Saved explorations are unavailable in this browser.');
    return rows;
  }
  function open() {
    setItems(read() || []);
    atlas.openDrawer('saved-panel', document.querySelector<HTMLElement>('#saved-open'));
  }
  function save() {
    const rows = read();
    if (!rows || !atlas.resources) return;
    const { state } = atlas,
      url = location.search,
      item: SavedExploration = {
        id: String(Date.now()),
        url,
        title:
          (atlas.selected()?.name || 'United States') +
          (state.concept === 'compare' ? ' + ' + (atlas.selectedB()?.name || 'United States') : ''),
        metric: displayMetricName(atlas.metric()),
        period: formatPeriod(atlas.layer(atlas.metric()).period),
        savedAt: new Date().toISOString(),
      };
    try {
      const next = [item, ...rows.filter((row) => row.url !== url)].slice(0, 50);
      localStorage.setItem('usa-atlas-explorations', JSON.stringify(next));
      setItems(next);
      atlas.action('save_success');
      atlas.toast('Exploration saved.');
    } catch {
      atlas.toast('Could not save in this browser. Use Share to keep the view link.');
    }
  }
  function remove(id: string) {
    try {
      const rows = read();
      if (!rows) return;
      const next = rows.filter((row) => row.id !== id);
      localStorage.setItem('usa-atlas-explorations', JSON.stringify(next));
      setItems(next);
    } catch {
      atlas.toast('Could not update Saved in this browser.');
    }
  }
  async function restore(id: string) {
    const item = read()?.find((row) => row.id === id),
      r = atlas.resources;
    if (!item || !r) return;
    const q = new URLSearchParams(item.url),
      idOr = (value: string | null, fallback: string) =>
        r.metricById.has(value || '')
          ? value!
          : r.catalog.find((row) => row.id === fallback)?.id || r.catalog[0].id;
    if (q.get('concept') === 'compare') atlas.rememberExploration();
    atlas.secondExplicit.current = q.has('other');
    const concept =
      q.get('concept') === 'compare'
        ? 'compare'
        : q.get('concept') === 'stories'
          ? 'stories'
          : 'explorer';
    atlas.patch({
      concept,
      mode: q.get('view') === '2d' ? '2d' : '3d',
      selected: r.geo.byId.has(q.get('place') || '') ? q.get('place') : null,
      second: r.geo.byId.has(q.get('other') || '') ? q.get('other') : null,
      metric: idOr(q.get('metric'), 'unemployment'),
      secondMetric: idOr(
        q.get('metric2'),
        r.catalog.find((row) => row.id !== atlas.state.metric)?.id || '',
      ),
      comparison: q.get('comparison') === 'metrics' ? 'metrics' : 'places',
      rank: ['highest', 'lowest'].includes(q.get('rank') || '') ? (q.get('rank') as Rank) : null,
    });
    atlas.closeDrawers(false);
    try {
      await atlas.navigate(concept === 'compare' ? 'compare' : 'map', undefined, { force: true });
      atlas.action('view_restore');
      if (atlas.current.current.rank) atlas.openRank(atlas.current.current.rank);
    } catch (error) {
      atlas.toast(error instanceof Error ? error.message : String(error));
    }
  }
  return { items, open, save, remove, restore };
}
export type Saved = ReturnType<typeof useSaved>;
export function SavedContent({ atlas, saved }: { atlas: Atlas; saved: Saved }) {
  return (
    <>
      <button className="panel-back" data-close="saved-panel">
        <Icon name="back" /> Back to {atlas.selected()?.name || 'Explorer'}
      </button>
      <div className="collection-title">
        <h2>Saved</h2>
        <span>{saved.items.length}</span>
      </div>
      <button className="outline-button" id="save-current">
        <Icon name="plus" /> Save current exploration
      </button>
      {saved.items.length ? (
        <div className="saved-list">
          {saved.items.map((item) => (
            <article key={item.id}>
              <button data-restore={item.id}>
                <small>{item.period || 'No loaded period'}</small>
                <h3>{item.title}</h3>
                <p>{item.metric || 'Exploration'}</p>
                <span>
                  Open exploration <Icon name="arrow" />
                </span>
              </button>
              <button
                data-remove-saved={item.id}
                aria-label={'Remove ' + item.title}
                className="remove-saved"
              >
                <Icon name="close" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="saved-empty">
          <Icon name="saved" />
          <h3>A place for your discoveries.</h3>
          <p>Save a place, indicator or comparison and return to the same view.</p>
        </div>
      )}
      <p className="saved-note">
        Stored in this browser. Views reopen with the latest available source snapshot; the saved
        period is shown above.
      </p>
    </>
  );
}
