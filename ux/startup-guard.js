/* This small script also runs when the atlas module or one of its imports fails. */
(() => {
  const host = document.querySelector('#loading');
  const title = document.querySelector('#startup-title');
  const message = document.querySelector('#startup-message');
  const retry = document.querySelector('#startup-retry');
  const controls = document.querySelectorAll('.concept-tabs [data-page="map"], .concept-tabs [data-page="compare"], [data-mode], #mobile-view-toggle, #mobile-search');
  const busy = value => controls.forEach(control => { control.disabled = value; });
  busy(true);
  const fail = detail => {
    if (document.body.dataset.atlasStatus === 'ready') return;
    clearTimeout(timeout);
    document.body.dataset.atlasStatus = 'error';
    host.dataset.state = 'error';
    host.setAttribute('aria-busy', 'false');
    title.textContent = 'The U.S. map couldn’t load';
    message.textContent = detail || 'Check your connection, then try again. About and Support are available.';
    retry.hidden = false;
  };
  retry.addEventListener('click', () => location.reload());
  const timeout = setTimeout(() => fail('The map is taking longer than expected. Retry the connection, or read about the project.'), 45000);
  window.addEventListener('atlas:startup-error', event => fail(event.detail?.message));
  window.addEventListener('atlas:startup-ready', () => {
    clearTimeout(timeout);
    document.body.dataset.atlasStatus = 'ready';
    host.hidden = true;
    busy(false);
  });
  window.addEventListener('error', event => {
    if (document.body.dataset.atlasStatus !== 'loading') return;
    if (event.target?.tagName === 'SCRIPT' || event instanceof ErrorEvent) fail();
  }, true);
})();
