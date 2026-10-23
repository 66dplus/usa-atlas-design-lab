// The map follows the visible document viewport, independently of sheet snaps.
export function initViewport() {
  let frame;
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
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && color) meta.content = color;
    });
  };
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  new MutationObserver(sync).observe(document.body, {attributes: true, attributeFilter: ['data-theme']});
  sync();
}
