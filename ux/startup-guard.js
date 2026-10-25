/* This small script also runs when the atlas module or one of its imports fails. */
(() => {
  const host = document.querySelector('#loading');
  const title = document.querySelector('#startup-title');
  const message = document.querySelector('#startup-message');
  const retry = document.querySelector('#startup-retry');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const phrases = [
    'Gathering statistics across the states',
    'Taking a closer look at California',
    'Exploring San Francisco County',
    'Putting Utah unemployment on the map',
    'Connecting states, counties and stories',
    'Looking at the numbers behind New York'
  ];
  let phrase = 0, phraseAnimation;
  const rotation = setInterval(async () => {
    if (document.hidden || document.body.dataset.atlasStatus !== 'loading') return;
    if (!reduced.matches) {
      phraseAnimation = message.animate([{opacity:1, transform:'translateY(0)'}, {opacity:0, transform:'translateY(-6px)'}], {duration:160, fill:'forwards'});
      await phraseAnimation.finished.catch(() => {});
    }
    if (document.body.dataset.atlasStatus !== 'loading') return;
    message.textContent = phrases[++phrase % phrases.length];
    phraseAnimation?.cancel();
    if (!reduced.matches) phraseAnimation = message.animate([{opacity:0, transform:'translateY(6px)'}, {opacity:1, transform:'translateY(0)'}], {duration:280, easing:'cubic-bezier(.16,1,.3,1)'});
  }, 2800);
  const stopRotation = () => { clearInterval(rotation); phraseAnimation?.cancel(); };
  const controls = document.querySelectorAll('.concept-tabs [data-page="map"], .concept-tabs [data-page="compare"], [data-mode], #mobile-view-toggle, #mobile-search');
  const busy = value => controls.forEach(control => { control.disabled = value; });
  busy(true);
  const fail = detail => {
    if (document.body.dataset.atlasStatus === 'ready') return;
    clearTimeout(timeout);
    stopRotation();
    document.body.dataset.atlasStatus = 'error';
    host.dataset.state = 'error';
    host.setAttribute('aria-busy', 'false');
    title.textContent = 'The U.S. map couldn’t load';
    message.removeAttribute('aria-hidden');
    host.querySelector('.startup-accessible').hidden = true;
    message.textContent = detail || 'Check your connection, then try again. About and Support are available.';
    retry.hidden = false;
  };
  retry.addEventListener('click', () => location.reload());
  const timeout = setTimeout(() => fail('The map is taking longer than expected. Retry the connection, or read about the project.'), 45000);
  window.addEventListener('atlas:startup-error', event => fail(event.detail?.message));
  window.addEventListener('atlas:startup-ready', () => {
    clearTimeout(timeout);
    stopRotation();
    document.body.dataset.atlasStatus = 'ready';
    host.hidden = true;
    busy(false);
  });
  window.addEventListener('error', event => {
    if (document.body.dataset.atlasStatus !== 'loading') return;
    if (event.target?.tagName === 'SCRIPT' || event instanceof ErrorEvent) fail();
  }, true);
})();
