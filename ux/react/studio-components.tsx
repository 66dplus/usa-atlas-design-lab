import type { Studio } from './use-studio';
function targetRows(studio: Studio, type: 'location' | 'indicator') {
  return type === 'location' ? studio.locations : studio.catalog;
}
function targetName(
  studio: Studio,
  type: 'location' | 'indicator',
  item: { name: string; fieldId?: string | null },
) {
  return type === 'location'
    ? item.name
    : studio.labels.get(item.fieldId || '') || item.name.replace(' · people', '');
}
export function TargetOptions({
  studio,
  type,
}: {
  studio: Studio;
  type: 'location' | 'indicator';
}) {
  const list = targetRows(studio, type),
    selected = type === 'location' ? studio.state.locations : studio.state.indicators,
    query = studio
      .field(type + '-search')
      .toLowerCase()
      .trim(),
    matching = list.filter(
      (item) =>
        (type !== 'location' || query || item.id.length === 2) &&
        (targetName(studio, type, item) + ' ' + item.name).toLowerCase().includes(query),
    );
  return (
    <>
      {matching.slice(0, 80).map((item) => (
        <button
          type="button"
          key={item.id}
          data-target-id={item.id}
          title={item.name}
          aria-pressed={selected.includes(item.id)}
          onClick={() => studio.selectTarget(type, item.id)}
        >
          {targetName(studio, type, item)}
        </button>
      ))}
      {!matching.length && (
        <p className="note">
          {list.length
            ? 'No matches. Try another name.'
            : 'Choices are unavailable. Reload to retry.'}
        </p>
      )}
      {matching.length > 80 && <p className="note">Keep typing to narrow the results.</p>}
    </>
  );
}
export function TargetTags({ studio, type }: { studio: Studio; type: 'location' | 'indicator' }) {
  const selected = type === 'location' ? studio.state.locations : studio.state.indicators,
    list = targetRows(studio, type);
  return (
    <>
      {selected.map((id) => {
        const item = list.find((item) => item.id === id),
          text = item ? targetName(studio, type, item) : id,
          chooser = type === 'location' && selected.length === 1 && !studio.mobile;
        return (
          <button
            type="button"
            key={id}
            title={item?.name || id}
            data-target-id={id}
            aria-label={chooser ? 'Choose locations' : 'Remove ' + text}
            onClick={() => studio.selectTarget(type, id, true)}
          >
            <span>{text}</span>
            <span aria-hidden="true">{chooser ? '⌄' : '×'}</span>
          </button>
        );
      })}
    </>
  );
}
export function RequestSummary({ studio }: { studio: Studio }) {
  const { state } = studio,
    ad = studio.creative(),
    inquiry = state.kind === 'inquiry',
    locationCount = ad.locations.length + ' location' + (ad.locations.length === 1 ? '' : 's'),
    indicatorCount = ad.indicators.length + ' indicator' + (ad.indicators.length === 1 ? '' : 's'),
    audience =
      ad.locations.length === 1 && !studio.mobile
        ? studio.locations.find((place) => place.id === ad.locations[0])?.name || ad.locations[0]
        : locationCount,
    duration = state.days === 'custom' ? studio.field('custom-days') : state.days;
  return (
    <>
      <p className="request-meta">
        {inquiry
          ? 'Placement, sponsorship or help with creative'
          : `${state.format === 'banner' ? 'Banner' : 'Scrolling text'} · ${audience} · ${indicatorCount}`}
      </p>
      {!inquiry && (
        <div className="request-creative">
          <strong>{ad.headline}</strong>
          <p>
            {ad.devices
              .map((device) => (device === 'desktop' ? 'Desktop' : 'Mobile'))
              .join(' + ') || 'No devices selected'}{' '}
            · {duration}
            {duration === '1' ? ' day' : ' days'}
          </p>
          <button
            type="button"
            id="back-to-creative"
            onClick={() => {
              studio.patch({ tab: 'creative' });
              document.querySelector('.studio-scroll')?.scrollTo(0, 0);
            }}
          >
            Back to creative
          </button>
        </div>
      )}
    </>
  );
}
