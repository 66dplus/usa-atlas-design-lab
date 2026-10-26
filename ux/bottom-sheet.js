/** @typedef {'min'|'half'|'expanded'} SheetSnap */
/** @typedef {{initial?: SheetSnap, maxSnap?: SheetSnap, fitContent?: boolean, freeDrag?: boolean, onSnap?: (snap: SheetSnap, offset: number, freePosition: boolean) => void}} SheetOptions */
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
export function bottomSheet(root, {initial = 'half', maxSnap = 'expanded', fitContent = false, freeDrag = false, onSnap = () => {}} = {}) {
  if (controllers.has(root)) return controllers.get(root);
  const lifetime = new AbortController();
  const listen = (target, type, callback, options = {}) => target?.addEventListener(type, callback, {...options, signal: lifetime.signal});
  const content = sheetContent(root);
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'sheet-handle';
  handle.setAttribute('aria-controls', content.id);
  handle.innerHTML = '<span aria-hidden="true"></span>';
  root.prepend(handle);
  root.classList.add('mobile-sheet');
  const firstSnap = names.indexOf(maxSnap);
  let snap = names.indexOf(initial) < firstSnap ? maxSnap : initial, positions = [0, 0, 0], offset = 0, customOffset = null, drag, animation, suppressClick = false;
  let touch, frame, summaryAnimation, contentAnimation;
  const summaryOpacity = value => clamp(1 - (positions[2] - value) / 64, 0, 1);
  const style = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  const viewport = () => window.visualViewport?.height || window.innerHeight;

  function paint(value) {
    offset = clamp(value, positions[firstSnap], positions[2]);
    root.style.setProperty('--sheet-offset', `${offset}px`);
    root.style.setProperty('--sheet-cut', `${offset}px`);
    root.style.setProperty('--summary-opacity', String(summaryOpacity(offset)));
    root.dataset.dragging = String(Boolean(drag));
  }
  function interrupt() {
    if (!animation && !summaryAnimation && !contentAnimation) return;
    const matrix = animation ? new DOMMatrixReadOnly(getComputedStyle(root).transform) : null;
    const current = matrix?.m42 ?? offset;
    animation?.cancel(); animation = null;
    summaryAnimation?.cancel(); summaryAnimation = null;
    contentAnimation?.cancel(); contentAnimation = null;
    root.dataset.settling = 'false'; paint(current);
  }
  function geometry() {
    // Pinch zoom changes visual pixels, not the app's layout viewport.
    // Match viewport.js: do not reframe only the sheet while the map stays fixed.
    if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > .01) return;
    interrupt(); drag = null; touch = null;
    const height = viewport(), footer = style('--nav-height') + style('--safe-bottom');
    const top = freeDrag && mobile.matches ? Math.max(70, style('--safe-top') + 72) : Math.max(height * .18, style('--safe-top') + 72);
    const maximum = Math.max(100, height - footer - top);
    let half = height * .44 - top;
    if (fitContent) {
      const children = [...content.children].map(node => node.getBoundingClientRect()).filter(box => box.height > 0);
      if (children.length) {
        const first = content.children[0], last = content.children[content.children.length - 1];
        const contentStyle = getComputedStyle(content), rootStyle = getComputedStyle(root);
        const firstStyle = getComputedStyle(first), lastStyle = getComputedStyle(last);
        const contentHeight = Math.max(...children.map(box => box.bottom)) - Math.min(...children.map(box => box.top));
        const fitHeight = handle.getBoundingClientRect().height + contentHeight
          + (parseFloat(contentStyle.paddingTop) || 0) + (parseFloat(contentStyle.paddingBottom) || 0)
          + (parseFloat(firstStyle.marginTop) || 0) + (parseFloat(lastStyle.marginBottom) || 0)
          + (parseFloat(rootStyle.borderTopWidth) || 0);
        half = maximum - fitHeight;
      }
    }
    positions = [0, clamp(half, 0, maximum - 100), Math.max(0, maximum - 100)];
    root.style.setProperty('--sheet-top', `${top}px`);
    root.style.setProperty('--sheet-height', `${maximum}px`);
    root.style.setProperty('--sheet-footer', `${footer}px`);
    if (customOffset !== null) {
      customOffset = clamp(customOffset, positions[firstSnap], positions[2]);
      content.inert = mobile.matches && style('--sheet-top') + customOffset > height * .78;
    }
    const position = customOffset ?? positions[names.indexOf(snap)];
    paint(position); onSnap(snap,position,customOffset!==null);
  }
  /** Commit a visible snap; minimum never dismisses the sheet. */
  function setSnap(next, animate = true) {
    if (!names.includes(next)) throw new Error(`Unknown sheet snap: ${next}`);
    interrupt(); drag = null; touch = null;
    const start = offset;
    snap = next;
    if(names.indexOf(snap) < firstSnap) snap = maxSnap;
    customOffset = null;
    root.dataset.userPosition = 'false';
    const end = positions[names.indexOf(snap)];
    root.dataset.snap = snap;
    handle.setAttribute('aria-label', snap === 'expanded' ? 'Return to compact sheet' : 'Expand sheet');
    handle.setAttribute('aria-expanded', String(snap === 'expanded'));
    content.inert = mobile.matches && snap === 'min';
    syncSummary();
    if (snap !== 'expanded') content.scrollTop = 0;
    paint(end); onSnap(snap,end,false);
    root.dataset.settling = 'false';
    if (!mobile.matches || !animate || reduced.matches || Math.abs(start - end) < .5) return;
    root.dataset.settling = 'true';
    const summary = root.querySelector(':scope > .mobile-indicator-summary');
    summaryAnimation = summary?.animate([{opacity: summaryOpacity(start)}, {opacity: summaryOpacity(end)}], {duration: style('--sheet-duration') || 260, easing: 'cubic-bezier(.16,1,.3,1)'});
    contentAnimation = summary ? content.animate([{opacity: 1 - summaryOpacity(start)}, {opacity: 1 - summaryOpacity(end)}], {duration: style('--sheet-duration') || 260, easing: 'cubic-bezier(.16,1,.3,1)'}) : null;
    animation = root.animate([
      {transform: `translateY(${start}px)`, clipPath: `inset(0 0 ${start}px 0)`},
      {transform: `translateY(${end}px)`, clipPath: `inset(0 0 ${end}px 0)`}
    ], {duration: style('--sheet-duration') || 260, easing: 'cubic-bezier(.16,1,.3,1)'});
    const current = animation;
    Promise.allSettled([current,summaryAnimation,contentAnimation].filter(Boolean).map(item=>item.finished)).then(() => {
      if (animation === current) {animation = null; summaryAnimation = null; contentAnimation = null; root.dataset.settling = 'false';}
    }).catch(() => {});
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
    if (cancelled || !gesture.moved) {if(customOffset!==null){content.inert=mobile.matches&&style('--sheet-top')+customOffset>viewport()*.78;syncSummary();paint(customOffset);return;}setSnap(snap); return;}
    const velocity = time - gesture.lastTime > 100 ? 0 : gesture.velocity;
    const projected = clamp(current + velocity * 170, positions[firstSnap], positions[2]);
    let index = positions.reduce((best, value, i) => i < firstSnap ? best : Math.abs(value - projected) < Math.abs(positions[best] - projected) ? i : best, firstSnap);
    // A deliberate short flick advances one snap even before crossing its midpoint.
    if (Math.abs(velocity) > .45 && index === names.indexOf(snap)) index = clamp(index + Math.sign(velocity), firstSnap, 2);
    if (freeDrag && mobile.matches) {
      index = positions.reduce((best, value, i) => i < firstSnap ? best : Math.abs(value - current) < Math.abs(positions[best] - current) ? i : best, firstSnap);
      snap = names[index];
      const freePosition = Math.abs(positions[index] - current) >= .5;
      customOffset = freePosition ? current : null; root.dataset.userPosition = String(freePosition);
      root.dataset.snap = snap;
      handle.setAttribute('aria-label', snap === 'expanded' ? 'Return to compact sheet' : 'Expand sheet');
      handle.setAttribute('aria-expanded', String(snap === 'expanded'));
      const top = style('--sheet-top') + current;
      content.inert = freePosition ? top > viewport() * .78 : snap === 'min';
      syncSummary(); paint(current); onSnap(snap,current,freePosition); root.dataset.settling = 'false';
      return;
    }
    setSnap(names[index]);
  }
  const dragTargets=[handle];
  for(const target of dragTargets){
    listen(target, 'pointerdown', event => {
      if (!mobile.matches || event.button !== 0 || event.isPrimary === false) return;
      begin(event.clientY, event.timeStamp); target.setPointerCapture(event.pointerId);
    });
    listen(target, 'pointermove', event => {if (drag) move(event.clientY, event.timeStamp);});
    listen(target, 'pointerup', event => finish(false, event.timeStamp));
    listen(target, 'pointercancel', () => finish(true));
    listen(target, 'lostpointercapture', () => {if (drag) finish(true);});
    if(target!==handle)listen(target, 'click',event=>{if(suppressClick&&event.detail>0){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}});
  }
  if(freeDrag){
    listen(root, 'pointerdown',event=>{
      const target=event.target instanceof Element?event.target.closest('.mobile-indicator-summary'):null;
      if(!target||!root.contains(target)||!mobile.matches||event.button!==0||event.isPrimary===false)return;
      interrupt();
      suppressClick=false;
      drag={startY:event.clientY,startOffset:offset,lastY:event.clientY,lastTime:event.timeStamp,velocity:0,moved:false,target,pointerId:event.pointerId,pending:true};
    });
    listen(root, 'pointermove',event=>{
      if(!drag?.target||drag.pointerId!==event.pointerId)return;
      if(drag.pending){
        if(Math.abs(event.clientY-drag.startY)<=5)return;
        const startY=drag.startY,startTime=drag.lastTime,target=drag.target,pointerId=drag.pointerId;
        begin(startY,startTime);drag.target=target;drag.pointerId=pointerId;target.setPointerCapture(pointerId);
      }
      move(event.clientY,event.timeStamp);
    });
    listen(root, 'pointerup',event=>{
      if(!drag?.target||drag.pointerId!==event.pointerId)return;
      if(drag.pending){drag=null;return;}
      finish(false,event.timeStamp);
    });
    listen(root, 'pointercancel',event=>{
      if(!drag?.target||drag.pointerId!==event.pointerId)return;
      if(drag.pending){drag=null;return;}
      finish(true);
    });
    listen(root, 'lostpointercapture',event=>{
      if(!drag?.target||drag.pointerId!==event.pointerId)return;
      if(event.target!==drag.target)return;
      if(drag.pending){drag=null;return;}
      finish(true);
    });
    listen(root, 'click',event=>{const target=event.target instanceof Element?event.target.closest('.mobile-indicator-summary'):null;if(target&&suppressClick&&event.detail>0){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}}, {capture:true});
  }
  listen(handle, 'click', event => {
    if (suppressClick && event.detail > 0) {suppressClick = false; return;}
    const next = snap === 'expanded' ? 'half' : snap === 'half' ? 'expanded' : 'half';
    setSnap(names[Math.max(firstSnap, names.indexOf(next))]);
  });
  listen(handle, 'keydown', event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = names.indexOf(snap);
    setSnap(event.key === 'Home' ? maxSnap : event.key === 'End' ? 'min' : names[clamp(index + (event.key === 'ArrowUp' ? -1 : 1), firstSnap, 2)]);
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
  listen(content, 'touchstart', event => {
    if (!mobile.matches || event.touches.length !== 1) return;
    const t = event.touches[0]; touch = {target:event.target,y: t.clientY, x: t.clientX, startY: t.clientY, startX: t.clientX, owned: false};
  }, {passive: true});
  listen(content, 'touchmove', event => {
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
  listen(content, 'touchend', event => {if (touch?.owned) finish(false, event.timeStamp); touch = null;});
  listen(content, 'touchcancel', () => {if (touch?.owned) finish(true); touch = null;});
  // Keyboard focus must never disappear into the clipped half of a compact sheet.
  listen(content, 'focusin', event => {
    if (mobile.matches && snap !== maxSnap && event.target.getBoundingClientRect().bottom > viewport() - style('--nav-height') - style('--safe-bottom')) setSnap(maxSnap);
  });
  function resize() {cancelAnimationFrame(frame); frame = requestAnimationFrame(geometry);}
  listen(window, 'resize', resize);
  listen(window.visualViewport, 'resize', resize);
  listen(mobile, 'change', () => {geometry(); setSnap(snap, false);});
  listen(reduced, 'change', () => {interrupt(); setSnap(snap, false);});
  const api = {setSnap, content, handle, destroy() {lifetime.abort(); cancelAnimationFrame(frame); interrupt(); controllers.delete(root); handle.remove();}, get snap() {return snap;}, refresh: geometry, syncSummary};
  controllers.set(root, api);
  geometry(); setSnap(snap, false);
  return api;
}

/** Return the actual scrolling owner at the current breakpoint. */
export const sheetScroll = root => mobile.matches || root.id==='explore-panel' || root.classList.contains('has-map-footer') ? sheetContent(root) : root;
