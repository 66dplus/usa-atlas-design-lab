// The map follows the visible document viewport, independently of sheet snaps.
export function initViewport() {
  let frame;
  const lifetime = new AbortController();
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      // Ignore pinch zoom: zooming should not reframe the underlying map.
      if (!viewport || viewport.scale === 1) {
        document.documentElement.style.setProperty('--app-height', `${viewport?.height || innerHeight}px`);
      }
      const color = getComputedStyle(document.body).getPropertyValue('--bg').trim();
      document.documentElement.style.backgroundColor = color;
      document.documentElement.style.colorScheme = document.body.dataset.theme || 'dark';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && color) meta.content = color;
    });
  };
  window.addEventListener('resize', sync, {signal:lifetime.signal});
  window.visualViewport?.addEventListener('resize', sync, {signal:lifetime.signal});
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {attributes: true, attributeFilter: ['data-theme']});
  sync();
  return () => {lifetime.abort();observer.disconnect();cancelAnimationFrame(frame);};
}
