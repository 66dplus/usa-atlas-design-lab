/** @typedef {'min'|'half'|'expanded'} SheetSnap */
/** @typedef {{initial?: SheetSnap, onSnap?: (snap: SheetSnap) => void}} SheetOptions */
const mobile = matchMedia('(max-width:760px)');
const reduced = matchMedia('(prefers-reduced-motion:reduce)');
const controllers = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const names = /** @type {SheetSnap[]} */ (['expanded', 'half', 'min']);

/** Stable DOM shared by the place sheet and mobile drawers. Data renders replace
 * content only: the captured handle and scroll viewport survive every refresh. */
export function sheetContent(root) {
  let content = root.querySelector(':scope > .sheet-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'sheet-content';
    content.id = `${root.id}-content`;
    content.append(...root.childNodes);
    root.append(content);
  }
  return content;
}

/** @param {HTMLElement} root @param {SheetOptions} options */
export function bottomSheet(root, {initial = 'half', onSnap = () => {}} = {}) {
  if (controllers.has(root)) return controllers.get(root);
  const content = sheetContent(root);
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'sheet-handle';
  handle.setAttribute('aria-controls', content.id);
  handle.innerHTML = '<span aria-hidden="true"></span>';
  root.prepend(handle);
  root.classList.add('mobile-sheet');
  let snap = initial, positions = [0, 0, 0], offset = 0, drag, animation, suppressClick = false;
  let touch, frame, summaryAnimation;
  const summaryOpacity = value => clamp(1 - (positions[2] - value) / 64, 0, 1);
  const style = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  const viewport = () => window.visualViewport?.height || window.innerHeight;

  function paint(value) {
    offset = clamp(value, positions[0], positions[2]);
    root.style.setProperty('--sheet-offset', `${offset}px`);
    root.style.setProperty('--sheet-cut', `${offset}px`);
    root.style.setProperty('--summary-opacity', String(summaryOpacity(offset)));
    root.dataset.dragging = String(Boolean(drag));
  }
  function interrupt() {
    if (!animation) return;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(root).transform);
    const current = matrix.m42;
    animation.cancel(); animation = null; summaryAnimation?.cancel(); summaryAnimation = null;
    root.dataset.settling = 'false'; paint(current);
  }
  function geometry() {
    // Pinch zoom changes visual pixels, not the app's layout viewport.
    // Match viewport.js: do not reframe only the sheet while the map stays fixed.
    if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > .01) return;
    interrupt(); drag = null; touch = null;
    const height = viewport(), footer = style('--nav-height') + style('--safe-bottom');
    const top = Math.max(height * .18, style('--safe-top') + 72);
    const maximum = Math.max(100, height - footer - top);
    positions = [0, clamp(height * .44 - top, 0, maximum - 100), Math.max(0, maximum - 100)];
    root.style.setProperty('--sheet-top', `${top}px`);
    root.style.setProperty('--sheet-height', `${maximum}px`);
    root.style.setProperty('--sheet-footer', `${footer}px`);
    paint(positions[names.indexOf(snap)]);
  }
  /** Commit a visible snap; minimum never dismisses the sheet. */
  function setSnap(next, animate = true) {
    if (!names.includes(next)) throw new Error(`Unknown sheet snap: ${next}`);
    interrupt(); drag = null; touch = null;
    const start = offset;
    snap = next;
    const end = positions[names.indexOf(snap)];
    root.dataset.snap = snap;
    handle.setAttribute('aria-label', snap === 'expanded' ? 'Return to compact sheet' : 'Expand sheet');
    handle.setAttribute('aria-expanded', String(snap === 'expanded'));
    content.inert = mobile.matches && snap === 'min';
    syncSummary();
    if (snap !== 'expanded') content.scrollTop = 0;
    paint(end); onSnap(snap);
    root.dataset.settling = 'false';
    if (!mobile.matches || !animate || reduced.matches || Math.abs(start - end) < .5) return;
    root.dataset.settling = 'true';
    const summary = root.querySelector(':scope > .mobile-indicator-summary');
    summaryAnimation = summary?.animate([{opacity: summaryOpacity(start)}, {opacity: summaryOpacity(end)}], {duration: style('--sheet-duration') || 260, easing: 'cubic-bezier(.16,1,.3,1)'});
    animation = root.animate([
      {transform: `translateY(${start}px)`, clipPath: `inset(0 0 ${start}px 0)`},
      {transform: `translateY(${end}px)`, clipPath: `inset(0 0 ${end}px 0)`}
    ], {duration: style('--sheet-duration') || 260, easing: 'cubic-bezier(.16,1,.3,1)'});
    const current = animation;
    current.finished.then(() => {if (animation === current) {animation = null; root.dataset.settling = 'false'; summaryAnimation = null;}}).catch(() => {});
  }
  function begin(y, time) {
    interrupt();
    drag = {startY: y, startOffset: offset, lastY: y, lastTime: time, velocity: 0, moved: false};
    suppressClick = false;
    // Content remains mounted and participates in hit testing while pulling out of minimum.
    content.inert = false;
    syncSummary(true);
    paint(offset);
  }
  function move(y, time) {
    if (!drag) return;
    const elapsed = time - drag.lastTime;
    if (elapsed > 0 && elapsed < 100) drag.velocity = (y - drag.lastY) / elapsed;
    else if (elapsed >= 100) drag.velocity = 0;
    drag.lastY = y; drag.lastTime = time;
    drag.moved ||= Math.abs(y - drag.startY) > 5;
    paint(drag.startOffset + y - drag.startY);
  }
  function finish(cancelled = false, time = performance.now()) {
    if (!drag) return;
    const gesture = drag, current = offset;
    drag = null;
    suppressClick = gesture.moved;
    if (cancelled || !gesture.moved) {setSnap(snap); return;}
    const velocity = time - gesture.lastTime > 100 ? 0 : gesture.velocity;
    const projected = clamp(current + velocity * 170, positions[0], positions[2]);
    let index = positions.reduce((best, value, i) => Math.abs(value - projected) < Math.abs(positions[best] - projected) ? i : best, 0);
    // A deliberate short flick advances one snap even before crossing its midpoint.
    if (Math.abs(velocity) > .45 && index === names.indexOf(snap)) index = clamp(index + Math.sign(velocity), 0, 2);
    setSnap(names[index]);
  }
  handle.addEventListener('pointerdown', event => {
    if (!mobile.matches || event.button !== 0 || event.isPrimary === false) return;
    begin(event.clientY, event.timeStamp); handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {if (drag) move(event.clientY, event.timeStamp);});
  handle.addEventListener('pointerup', event => finish(false, event.timeStamp));
  handle.addEventListener('pointercancel', () => finish(true));
  handle.addEventListener('lostpointercapture', () => {if (drag) finish(true);});
  handle.addEventListener('click', event => {
    if (suppressClick && event.detail > 0) {suppressClick = false; return;}
    setSnap(snap === 'min' ? 'half' : snap === 'half' ? 'expanded' : 'half');
  });
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = names.indexOf(snap);
    setSnap(event.key === 'Home' ? 'expanded' : event.key === 'End' ? 'min' : names[clamp(index + (event.key === 'ArrowUp' ? -1 : 1), 0, 2)]);
  });
  function canScrollTowardTop(target){
    if(content.scrollTop>0)return true;
    for(let node=target instanceof Element?target:target?.parentElement;node&&node!==content;node=node.parentElement){
      if(node.scrollTop>0&&node.scrollHeight>node.clientHeight+1&&/auto|scroll/.test(getComputedStyle(node).overflowY))return true;
    }
    return false;
  }
  function syncSummary(dragging = false) {
    const summary = root.querySelector(':scope > .mobile-indicator-summary');
    if (!summary) return;
    const visible = mobile.matches && snap === 'min' && !dragging;
    summary.inert = !visible;
    summary.setAttribute('aria-hidden', String(!visible));
  }
  // Native vertical scrolling is preserved at maximum. A non-passive listener
  // takes ownership only after a downward pull reaches the top of that scroll.
  content.addEventListener('touchstart', event => {
    if (!mobile.matches || event.touches.length !== 1) return;
    const t = event.touches[0]; touch = {target:event.target,y: t.clientY, x: t.clientX, startY: t.clientY, startX: t.clientX, owned: false};
  }, {passive: true});
  content.addEventListener('touchmove', event => {
    if (!touch || event.touches.length !== 1) return;
    const t = event.touches[0], delta = t.clientY - touch.y;
    const vertical = Math.abs(t.clientY - touch.startY) > Math.abs(t.clientX - touch.startX);
    if (!touch.owned && event.cancelable && vertical && Math.abs(t.clientY - touch.startY) > 5 && (snap !== 'expanded' || !canScrollTowardTop(touch.target) && delta > 0)) {
      touch.owned = true;
      begin(touch.y, event.timeStamp - 16);
    }
    if (touch.owned) {
      if (!event.cancelable) {finish(true); touch = null; return;}
      event.preventDefault(); move(t.clientY, event.timeStamp);
    }
    touch.y = t.clientY; touch.x = t.clientX;
  }, {passive: false});
  content.addEventListener('touchend', event => {if (touch?.owned) finish(false, event.timeStamp); touch = null;});
  content.addEventListener('touchcancel', () => {if (touch?.owned) finish(true); touch = null;});
  // Keyboard focus must never disappear into the clipped half of a compact sheet.
  content.addEventListener('focusin', event => {
    if (mobile.matches && snap !== 'expanded' && event.target.getBoundingClientRect().bottom > viewport() - style('--nav-height') - style('--safe-bottom')) setSnap('expanded');
  });
  function resize() {cancelAnimationFrame(frame); frame = requestAnimationFrame(geometry);}
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  mobile.addEventListener('change', () => {geometry(); setSnap(snap, false);});
  reduced.addEventListener('change', () => {interrupt(); setSnap(snap, false);});
  const api = {setSnap, content, handle, get snap() {return snap;}, refresh: geometry, syncSummary};
  controllers.set(root, api);
  geometry(); setSnap(snap, false);
  return api;
}

/** Return the actual scrolling owner at the current breakpoint. */
export const sheetScroll = root => mobile.matches ? sheetContent(root) : root;
