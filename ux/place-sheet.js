const MODES = ['compact', 'partial', 'expanded'];
const DEFAULTS = { stepDistance: 144, dragThreshold: 7, velocityThreshold: 0.55, clickWindow: 700 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const modeIndex = mode => MODES.indexOf(mode);

function contains(parent, node) {
  if (!parent || !node) return false;
  return parent === node || Boolean(parent.contains?.(node));
}

function isActionTarget(target, handle = null) {
  for (let node = target; node; node = node.parentElement) {
    if (node === handle) return false;
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName) || node.dataset?.sheetMode) return true;
  }
  return false;
}

function findScrollable(target, content) {
  for (let node = target; node && contains(content, node); node = node.parentElement) {
    if (node.dataset?.sheetScroll !== undefined || node.scrollHeight > node.clientHeight + 1) return node;
    if (node === content) break;
  }
  return null;
}

function canScroll(scrollable, deltaY) {
  if (!scrollable || !deltaY) return false;
  if (deltaY < 0) return scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1;
  return scrollable.scrollTop > 1;
}

function snapMode(startMode, deltaY, velocityY, { stepDistance, velocityThreshold }) {
  const start = modeIndex(startMode);
  const projected = start - deltaY / stepDistance;
  let next = Math.round(projected);
  if (Math.abs(velocityY) >= velocityThreshold) next = start + (velocityY < 0 ? 1 : -1);
  return MODES[clamp(next, 0, MODES.length - 1)];
}

/**
 * Add gesture and explicit-action handling to a stable sheet surface.
 * Content may be rerendered freely; listeners and the selected snap mode stay on `root`.
 */
export function createPlaceSheetController({
  root,
  handle,
  content,
  mapTarget,
  actionTarget = root,
  initialMode = 'partial',
  stepDistance = DEFAULTS.stepDistance,
  dragThreshold = DEFAULTS.dragThreshold,
  velocityThreshold = DEFAULTS.velocityThreshold,
  clickWindow = DEFAULTS.clickWindow,
  now = () => performance.now(),
  onDrag = () => {},
  onModeChange = () => {},
  onMapInteraction = () => {}
}) {
  if (!root || !handle) throw new TypeError('root and handle are required');
  if (modeIndex(initialMode) < 0) throw new RangeError(`Unknown place sheet mode: ${initialMode}`);

  let mode = initialMode;
  let gesture = null;
  let suppressClickUntil = 0;
  let suppressClickTarget = null;

  const setMode = (next, source = 'api') => {
    if (modeIndex(next) < 0) throw new RangeError(`Unknown place sheet mode: ${next}`);
    if (next === mode) return mode;
    const previous = mode;
    mode = next;
    onModeChange(next, { previous, source });
    return mode;
  };

  const releaseCapture = pointerId => {
    if (root.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
  };

  const cancelGesture = (pointerId, canceled = true) => {
    if (!gesture || (pointerId != null && gesture.pointerId !== pointerId)) return;
    const active = gesture;
    gesture = null;
    releaseCapture(active.pointerId);
    if (active.phase === 'dragging') onDrag({ offsetY: 0, mode, canceled });
  };

  const onPointerDown = event => {
    if (event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    if (gesture) cancelGesture(gesture.pointerId, true);
    suppressClickUntil = 0;
    suppressClickTarget = null;

    const inHandle = contains(handle, event.target);
    const inContent = content && contains(content, event.target);
    if ((!inHandle && !inContent) || isActionTarget(event.target, inHandle ? handle : null)) return;

    gesture = {
      pointerId: event.pointerId ?? 1,
      phase: inHandle ? 'armed' : 'scroll-pending',
      startTarget: event.target,
      startMode: mode,
      startY: event.clientY,
      anchorY: event.clientY,
      lastY: event.clientY,
      lastAt: now(),
      velocityY: 0,
      scrollable: inHandle ? null : findScrollable(event.target, content)
    };
  };

  const onPointerMove = event => {
    if (!gesture || (event.pointerId ?? 1) !== gesture.pointerId) return;
    const at = now();
    const deltaFromLast = event.clientY - gesture.lastY;
    const elapsed = Math.max(1, at - gesture.lastAt);
    gesture.velocityY = deltaFromLast / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastAt = at;

    if (gesture.phase === 'scroll-pending') {
      if (canScroll(gesture.scrollable, deltaFromLast)) return;
      if (Math.abs(deltaFromLast) < dragThreshold) return;
      gesture.phase = 'dragging';
      gesture.startMode = mode;
      gesture.anchorY = event.clientY - deltaFromLast;
      root.setPointerCapture?.(gesture.pointerId);
    } else if (gesture.phase === 'armed') {
      if (Math.abs(event.clientY - gesture.startY) < dragThreshold) return;
      gesture.phase = 'dragging';
      root.setPointerCapture?.(gesture.pointerId);
    }

    if (gesture.phase === 'dragging') {
      event.preventDefault?.();
      onDrag({ offsetY: event.clientY - gesture.anchorY, mode: gesture.startMode, canceled: false });
    }
  };

  const onPointerUp = event => {
    if (!gesture || (event.pointerId ?? 1) !== gesture.pointerId) return;
    const active = gesture;
    gesture = null;
    releaseCapture(active.pointerId);
    if (active.phase !== 'dragging') return;

    const deltaY = event.clientY - active.anchorY;
    suppressClickUntil = now() + clickWindow;
    suppressClickTarget = active.startTarget;
    onDrag({ offsetY: 0, mode: active.startMode, canceled: false });
    setMode(snapMode(active.startMode, deltaY, active.velocityY, { stepDistance, velocityThreshold }), 'gesture');
  };

  const onPointerCancel = event => cancelGesture(event.pointerId ?? 1, true);
  const onLostPointerCapture = event => cancelGesture(event.pointerId ?? 1, true);

  const onClick = event => {
    if (!suppressClickUntil) return;
    if (now() > suppressClickUntil) { suppressClickUntil = 0; suppressClickTarget = null; return; }
    if (event.detail === 0) return;
    const isGestureClick = event.target === suppressClickTarget ||
      (event.target === handle && contains(handle, suppressClickTarget)) ||
      (event.target === root && contains(handle, suppressClickTarget));
    if (!isGestureClick) return;
    suppressClickUntil = 0;
    suppressClickTarget = null;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };

  const onAction = event => {
    for (let node = event.target; node && contains(actionTarget, node); node = node.parentElement) {
      const next = node.dataset?.sheetMode;
      if (next && modeIndex(next) >= 0) {
        setMode(next, 'action');
        return;
      }
      if (node === actionTarget) break;
    }
  };

  const onMap = event => onMapInteraction(event, {
    mode,
    collapse: () => setMode('compact', 'map-interaction'),
    setMode
  });

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerCancel);
  root.addEventListener('lostpointercapture', onLostPointerCapture);
  root.addEventListener('click', onClick, true);
  actionTarget?.addEventListener('click', onAction);
  mapTarget?.addEventListener('pointerdown', onMap, true);
  mapTarget?.addEventListener('wheel', onMap, { passive: true });

  return {
    getMode: () => mode,
    setMode,
    compact: () => setMode('compact', 'action'),
    partial: () => setMode('partial', 'action'),
    expanded: () => setMode('expanded', 'action'),
    destroy() {
      cancelGesture(gesture?.pointerId, true);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerCancel);
      root.removeEventListener('lostpointercapture', onLostPointerCapture);
      root.removeEventListener('click', onClick, true);
      actionTarget?.removeEventListener('click', onAction);
      mapTarget?.removeEventListener('pointerdown', onMap, true);
      mapTarget?.removeEventListener('wheel', onMap);
    }
  };
}
