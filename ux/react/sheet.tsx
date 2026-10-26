import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { bottomSheet, sheetContent } from '../bottom-sheet.js';
import { showSurface } from '../motion.js';
import type { Atlas } from './use-atlas';
import { mobileLayout } from './use-atlas';
import type { DrawerId, Snap } from './types';

export function useMobile() {
  const [mobile, setMobile] = useState(mobileLayout);
  useEffect(() => {
    const query = matchMedia('(max-width:760px)'),
      change = () => setMobile(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return mobile;
}
/** Only this bridge and bottom-sheet.js touch the controller's persistent host.
 * React reconciles its content portal; the controller keeps its grip/viewport. */
export function Sheet({
  atlas,
  id,
  className,
  label,
  children,
  summary,
  footer,
}: {
  atlas: Atlas;
  id: DrawerId | 'explore-panel';
  className?: string;
  label: string;
  children: ReactNode;
  summary?: ReactNode;
  footer?: ReactNode;
}) {
  const mobile = useMobile();
  const [host] = useState(() => {
    const node = document.createElement(id === 'explore-panel' ? 'aside' : 'section');
    node.id = id;
    node.className = className || '';
    node.setAttribute('aria-label', label);
    return node;
  });
  const [content] = useState(() => sheetContent(host) as HTMLElement);
  const isPlace = id === 'explore-panel',
    overlay = atlas.state.overlay,
    open = isPlace || overlay?.id === id;
  useLayoutEffect(() => {
    document.body.append(host);
    const controller = bottomSheet(host, {
      initial: isPlace
        ? mobileLayout()
          ? 'min'
          : atlas.current.current.selected
            ? 'half'
            : 'min'
        : 'half',
      freeDrag: isPlace,
      maxSnap: id === 'search-sheet' ? 'half' : 'expanded',
      fitContent: id === 'search-sheet',
      onSnap: (snap: Snap, offset: number, freePosition: boolean) => {
        if (isPlace) {
          const mobile = mobileLayout(),
            top = (parseFloat(host.style.getPropertyValue('--sheet-top')) || 0) + offset,
            expanded = freePosition ? mobile && top < innerHeight * 0.62 : snap === 'expanded',
            collapsed = freePosition
              ? mobile && top > innerHeight * 0.78
              : snap === 'min' && mobile;
          document.body.classList.toggle('place-expanded', expanded);
          document.body.classList.toggle('panel-collapsed', collapsed);
          host
            .querySelector('.sheet-handle')
            ?.setAttribute(
              'aria-label',
              expanded ? 'Return to compact place sheet' : 'Expand place sheet',
            );
          if (
            atlas.current.current.placeExpanded !== expanded ||
            atlas.current.current.placeCollapsed !== collapsed
          )
            atlas.patch({ placeExpanded: expanded, placeCollapsed: collapsed });
        } else host.classList.toggle('expanded', snap === 'expanded');
      },
    });
    atlas.sheets.current.set(id, controller);
    return () => {
      atlas.sheets.current.delete(id);
      controller.destroy();
      host.remove();
    };
  }, [host, content]);
  useLayoutEffect(() => {
    const parent = isPlace
      ? document.body
      : document.querySelector(
          overlay?.id === id
            ? id === 'compare-results'
              ? '.map-workspace'
              : '#pane-' + overlay.side
            : '#pane-a',
        );
    if (parent && host.parentElement !== parent) parent.append(host);
    host.dataset.edge = overlay?.id === id ? (overlay.edge === 'b' ? 'right' : 'left') : 'left';
    host.classList.toggle(
      'has-map-footer',
      !mobile &&
        !isPlace &&
        ['ranking-panel', 'metric-library', 'place-library', 'search-sheet'].includes(id),
    );
    host.classList.toggle(
      'recent-states',
      id === 'place-library' &&
        mobile &&
        !atlas.state.countiesOnly &&
        !atlas.state.placeQuery &&
        !atlas.state.placeBrowseAll,
    );
    host.classList.toggle(
      'compact-data-card',
      id === 'inspector' && atlas.state.concept === 'explorer' && !mobile,
    );
    host.inert = isPlace
      ? Boolean(overlay && !['inspector', 'compare-results'].includes(overlay.id))
      : !open;
    if (isPlace) {
      host.hidden = false;
      return;
    }
    if (
      mobile ||
      ['ranking-panel', 'metric-library', 'place-library', 'search-sheet'].includes(id)
    ) {
      host.hidden = !open;
      host.inert = !open;
    } else void showSurface(host, open, { axis: 'y' });
    if (open) {
      const controller = atlas.sheets.current.get(id);
      controller?.refresh();
      controller?.setSnap(
        mobile && ['metric-library', 'comparison-setup-panel'].includes(id) ? 'expanded' : 'half',
        false,
      );
      requestAnimationFrame(() => {
        const target = host.querySelector<HTMLInputElement>('input:not([type="hidden"])') ||
          host.querySelector<HTMLButtonElement>('button:not(.sheet-handle)');
        if (target?.getClientRects().length) target.focus({ preventScroll: true });
      });
    }
  }, [
    open,
    mobile,
    overlay?.id,
    overlay?.side,
    atlas.state.countiesOnly,
    atlas.state.placeBrowseAll,
    atlas.state.concept,
  ]);
  useLayoutEffect(() => {
    if (isPlace) atlas.sheets.current.get(id)?.syncSummary();
  }, [summary]);
  return (
    <>
      {createPortal(children, content)}
      {summary && createPortal(summary, host)}
      {footer && createPortal(footer, mobile ? content : host)}
    </>
  );
}
