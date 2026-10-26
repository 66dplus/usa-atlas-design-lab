import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = (process.env.ATLAS_TEST_URL || 'http://127.0.0.1:4198').replace(/\/$/, ''),
  output = process.env.ATLAS_TEST_OUTPUT || `/tmp/usa-atlas-post-react-ui-${Date.now()}`,
  packageRoot = process.env.ATLAS_PACKAGE_ROOT,
  fixtureFlag = process.env.ATLAS_TEST_RACE_AVAILABILITY_FIXTURE,
  fixtureOverride = fixtureFlag === '1',
  results = { suite: 'post-react-ui-fixes', base, packageRoot: packageRoot || null, fixtureOverride, checks: [], failures: [], screenshots: [], geometry: [] };
if (fixtureFlag && fixtureFlag !== '1') throw new Error('ATLAS_TEST_RACE_AVAILABILITY_FIXTURE must be 1 when set');
if (fixtureOverride) {
  const runtime = new URL(base);
  if (runtime.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(runtime.hostname))
    throw new Error('Race availability fixture requires a loopback HTTP runtime');
}
const originalPortraitSha256 = '8b4089f06d44e88ce212d3974ca95fa48ba674ffd99add9d38a8f91396e3f92f';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
function pass(name, detail) { results.checks.push({ name, status: 'pass', detail }); }
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.atlasStatus === 'ready', null, { timeout: 60000 });
  await page.waitForTimeout(150);
}
async function open(path, viewport, theme = 'dark', reducedMotion = 'no-preference', fixtureRaceAvailability = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width <= 760 ? 3 : 2, hasTouch: viewport.width <= 760, isMobile: viewport.width <= 760, reducedMotion });
  await context.addInitScript((selectedTheme) => {
    localStorage.setItem('usa-atlas-theme', selectedTheme);
    Math.random = () => 0.42;
  }, theme);
  const page = await context.newPage();
  if (fixtureRaceAvailability) await page.route('**/api/atlas/catalog', async (route) => {
    const response = await route.fetch(), payload = await response.json();
    const ids = new Set(['race-ethnicity--black', 'race-ethnicity--asian', 'race-ethnicity--white-non-hispanic', 'race-ethnicity']);
    assert.equal(payload.metrics.filter((metric) => ids.has(metric.id)).length, 4, 'Fixture catalog contains the four unchanged race metric IDs');
    payload.metrics = payload.metrics.map((metric) => ids.has(metric.id) ? { ...metric, hasObservations: true } : metric);
    await route.fulfill({ response, body: JSON.stringify(payload), contentType: 'application/json' });
  });
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await ready(page);
  return { context, page };
}
async function snap(page, label) {
  const file = join(output, `${label}.png`);
  await page.screenshot({ path: file });
  results.screenshots.push(file);
}
function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
async function visibleRects(page, selectors) {
  return page.evaluate((list) => list.flatMap((selector) => [...document.querySelectorAll(selector)]
    .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
    .map((node) => {
      const r = node.getBoundingClientRect();
      return { selector, text: node.textContent?.trim().slice(0, 35) || '', left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    })), selectors);
}
async function assertNoChromeOverlap(page, label) {
  const rects = await visibleRects(page, [
    '#theme-toggle', '#mobile-search', '#mobile-compare-metric', '.dimension-control button[data-mode="3d"]', '#mobile-view-toggle',
    '#support-open', '#info-open', '.brand', '#sheet-back', '.pane-heading .field-value', '.map-summary strong',
    '.mobile-summary-search', '.mobile-summary-name', '.mobile-summary-value', '.indicator-chooser',
  ]);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
    assert.equal(intersects(rects[i], rects[j]), false, `${label} overlap: ${JSON.stringify([rects[i], rects[j]])}`);
  const toggle = rects.find((r) => r.selector === '#theme-toggle');
  assert.ok(toggle, `${label} theme control must be visible`);
  const target = await page.locator('#theme-toggle').boundingBox();
  assert.ok(target && target.width >= 40 && target.height >= 40, `${label} theme hit target is at least 40px`);
  for (const selector of ['#theme-toggle', '#mobile-search', '#mobile-compare-metric', '#support-open', '#info-open', '#sheet-back', '#mobile-view-toggle']) {
    const node = page.locator(selector).filter({ visible: true }).first();
    if (await node.count()) {
      const box = await node.boundingBox();
      assert.ok(box && box.width >= 40 && box.height >= 40, `${label} ${selector} target is at least 40px: ${JSON.stringify(box)}`);
    }
  }
  pass(`${label} shared chrome hit areas`, { rects, themeTarget: target });
}
async function attribution(page, mode, label) {
  await page.waitForFunction((expected) => {
    const node = document.querySelector('.osm-attribution');
    if (!node || node.dataset.placement !== expected || document.querySelectorAll('.osm-attribution').length !== 1) return false;
    if (expected === 'floating') return node.parentElement === document.body;
    return node.parentElement?.classList.contains('indicator-legend') && node.previousElementSibling?.matches('.indicator-legend-source[data-source="a"]');
  }, mode, { timeout: 5000 });
  const value = await page.locator('.osm-attribution').evaluate((node) => ({
    placement: node.dataset.placement,
    parent: node.parentElement?.className,
    afterSource: node.previousElementSibling?.matches('.indicator-legend-source[data-source="a"]') || false,
    oneNode: document.querySelectorAll('.osm-attribution').length === 1,
    rect: (() => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
  }));
  pass(label, value);
  return value;
}
async function drag(page, delta, label, handle = page.locator('#explore-panel > .sheet-handle')) {
  const box = await handle.boundingBox();
  assert.ok(box, `${label} drag target is visible`);
  const start = await page.locator('#explore-panel').evaluate((root) => Number.parseFloat(root.style.getPropertyValue('--sheet-offset')));
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.max(20, y + (delta * i) / steps), id: 1 }] });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(80);
  const mid = await page.locator('.indicator-chooser').evaluate((row) => {
    const r = row.getBoundingClientRect(), root = row.closest('#explore-panel');
    return {
      x: r.x,
      padding: getComputedStyle(row).padding,
      children: [...row.children].map((child) => {
        const c = child.getBoundingClientRect(), hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
        return { x: c.x - r.x, width: c.width, hit: child === hit || child.contains(hit) };
      }),
      dragging: root.dataset.dragging,
      snap: root.dataset.snap,
      expanded: document.body.classList.contains('place-expanded'),
      userPosition: root.dataset.userPosition,
      offset: Number.parseFloat(root.style.getPropertyValue('--sheet-offset')),
    };
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForFunction(() => document.querySelector('#explore-panel')?.dataset.dragging === 'false');
  await page.waitForTimeout(350);
  const settled = await page.locator('.indicator-chooser').evaluate((row) => {
    const r = row.getBoundingClientRect(), root = row.closest('#explore-panel');
    return {
      x: r.x,
      padding: getComputedStyle(row).padding,
      children: [...row.children].map((child) => {
        const c = child.getBoundingClientRect(), hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
        return { x: c.x - r.x, width: c.width, hit: child === hit || child.contains(hit) };
      }),
      dragging: root.dataset.dragging,
      snap: root.dataset.snap,
      expanded: document.body.classList.contains('place-expanded'),
      userPosition: root.dataset.userPosition,
      offset: Number.parseFloat(root.style.getPropertyValue('--sheet-offset')),
      top: Number.parseFloat(root.style.getPropertyValue('--sheet-top')),
      viewportHeight: innerHeight,
      scrollTop: row.closest('.sheet-content').scrollTop,
    };
  });
  results.geometry.push({ label, start, during: mid, settled });
  return { start, mid, settled };
}

try {
  // Theme bootstrap precedence. URL cases isolate the application bootstrap because
  // seo_render.py intentionally removes `theme` from canonical public redirects.
  for (const item of [
    { name: 'new visitor dark', saved: null, url: '/united-states/unemployment', expected: 'dark' },
    { name: 'saved light', saved: 'light', url: '/united-states/unemployment', expected: 'light' },
    { name: 'saved dark', saved: 'dark', url: '/united-states/unemployment', expected: 'dark' },
    { name: 'bootstrap URL theme overrides saved (route isolated)', saved: 'dark', url: '/united-states/unemployment?theme=light', expected: 'light', directHtml: true },
    { name: 'embed bootstrap URL theme overrides saved (route isolated)', saved: 'dark', url: '/united-states/unemployment?embed=1&theme=light', expected: 'light', directHtml: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    if (item.saved) await context.addInitScript((value) => localStorage.setItem('usa-atlas-theme', value), item.saved);
    const page = await context.newPage();
    if (item.directHtml) await page.route('**/united-states/unemployment*', async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has('theme')) return route.continue();
      const response = await route.fetch({ url: `${base}/united-states/unemployment` });
      await route.fulfill({ response });
    });
    await page.goto(base + item.url, { waitUntil: 'domcontentloaded' });
    const early = await page.evaluate(() => ({ theme: document.body.dataset.theme, scheme: getComputedStyle(document.documentElement).colorScheme, meta: document.querySelector('meta[name="theme-color"]').content }));
    await ready(page);
    const loaded = await page.evaluate(() => ({ theme: document.body.dataset.theme, scheme: getComputedStyle(document.documentElement).colorScheme, meta: document.querySelector('meta[name="theme-color"]').content }));
    assert.equal(early.theme, item.expected, `${item.name} early HTML theme`);
    assert.equal(loaded.theme, item.expected, `${item.name} React theme`);
    assert.equal(loaded.scheme, item.expected, `${item.name} browser color scheme`);
    assert.equal(loaded.meta, item.expected === 'dark' ? '#171A1D' : '#EEF0F3', `${item.name} browser chrome metadata`);
    pass(item.name, { early, loaded, bootstrapIsolationOnly: !!item.directHtml, routerNote: item.directHtml ? 'HTML response was supplied at the canonical route to isolate application bootstrap precedence; seo_render.py removes theme from canonical route redirects.' : null });
    await context.close();
  }

  // Startup phrase entrance, cycle, exit/entry fill cancellation, reduced motion, and cleanup.
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage(); let release; const gate = new Promise((resolve) => { release = resolve; });
    await page.addInitScript(() => {
      window.__startupMotion = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, timing) {
        const animation = animate.call(this, frames, timing);
        if (this.id === 'startup-message') {
          const record = { duration: animation.effect.getTiming().duration, fill: animation.effect.getTiming().fill, samples: [] };
          window.__startupMotion.push(record);
          const start = performance.now();
          const sample = () => {
            if (performance.now() - start > 190) return;
            record.samples.push({ elapsed: Math.round(performance.now() - start), opacity: Number(getComputedStyle(this).opacity) });
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }
        return animation;
      };
    });
    await page.route('**/api/atlas/catalog', async (route) => { await gate; await route.continue().catch(() => {}); });
    await page.goto(base + '/united-states/unemployment', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loading:not([hidden])');
    const message = page.locator('#startup-message'), first = await message.textContent();
    if (reduced) {
      await page.waitForTimeout(400);
      assert.equal(await message.evaluate((node) => getComputedStyle(node).opacity), '1');
      assert.equal(await message.evaluate((node) => node.getAnimations().length), 0);
    } else {
      await page.waitForFunction(() => window.__startupMotion?.some((entry) => entry.duration === 280 && entry.samples.some((sample) => sample.elapsed >= 50 && sample.elapsed <= 150 && sample.opacity > 0 && sample.opacity < 1)));
      const entrance = await page.evaluate(() => window.__startupMotion);
      assert.ok(entrance.some((entry) => entry.duration === 280 && entry.samples.some((sample) => sample.elapsed >= 50 && sample.elapsed <= 150 && sample.opacity > 0 && sample.opacity < 1)), `Startup entrance has a measured mid-animation opacity: ${JSON.stringify(entrance)}`);
      await page.waitForTimeout(330);
      assert.equal(await message.evaluate((node) => getComputedStyle(node).opacity), '1', 'Startup phrase is readable after entrance');
    }
    await page.waitForFunction((before) => document.querySelector('#startup-message')?.textContent !== before, first, { timeout: 5000 });
    await page.waitForTimeout(360);
    const cycled = await message.evaluate((node) => ({ text: node.textContent, opacity: getComputedStyle(node).opacity, animations: node.getAnimations().map((a) => ({ state: a.playState, fill: a.effect.getTiming().fill })) }));
    assert.equal(cycled.opacity, '1', 'The new phrase is visible after the cycle');
    assert.equal(cycled.animations.some((a) => a.fill === 'forwards'), false, 'The exit fill is canceled before entry');
    assert.notEqual(cycled.text, first);
    pass(reduced ? 'startup reduced motion' : 'startup entrance and phrase cycle', { first, reduced, cycled });
    release();
    await page.waitForFunction(() => document.body.dataset.atlasStatus === 'ready', null, { timeout: 60000 });
    await page.waitForTimeout(2900);
    assert.equal(await message.textContent(), cycled.text, 'Startup phrase timer stops when loading completes');
    assert.equal(await message.evaluate((node) => node.getAnimations().length), 0, 'Startup animations are canceled on ready');
    pass(reduced ? 'startup reduced cleanup' : 'startup normal cleanup', { phrase: cycled.text, animations: 0 });
    await context.close();
  }

  // Mobile row geometry and real free-drag/snap/scroll hit targets at both required viewports and themes.
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) for (const theme of ['light', 'dark']) {
    const { context, page } = await open('/united-states/california/unemployment', viewport, theme);
    await assertNoChromeOverlap(page, `map-${viewport.width}-${theme}`);
    const credit = page.locator('.osm-attribution');
    const creditStart = await credit.evaluate((node) => ({ parent: node.parentElement.tagName, placement: node.dataset.placement, position: getComputedStyle(node).position, rect: (() => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() }));
    assert.equal(creditStart.parent, 'BODY'); assert.equal(creditStart.placement, 'floating'); assert.equal(creditStart.position, 'fixed');
    const summary = page.locator('.mobile-indicator-summary'), name = page.locator('.mobile-summary-name'), search = page.locator('.mobile-summary-search');
    assert.equal(await summary.getAttribute('aria-hidden'), 'false');
    const nameBox = await name.boundingBox();
    assert.ok(nameBox && nameBox.height >= 40, `Collapsed indicator name is a 40px-or-larger target: ${JSON.stringify(nameBox)}`);
    assert.equal(await page.locator('.mobile-summary-name[data-mobile-search]').count(), 0, 'Indicator name has no Search action');
    assert.equal(await page.locator('.mobile-summary-name[data-pane-metric="a"]').count(), 1, 'Indicator name has direct metric target');
    assert.equal(await page.locator('.mobile-summary-name button').count(), 0, 'Summary controls are not nested');
    await name.click();
    await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden && !document.querySelector('#metric-library')?.inert);
    assert.equal(await page.locator('#search-sheet').isVisible(), false, 'Indicator name skips generic Search hub');
    pass(`collapsed indicator name direct picker ${viewport.width}/${theme}`, { picker: await page.locator('#metric-library').isVisible(), searchHub: await page.locator('#search-sheet').isVisible() });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await name.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden && !document.querySelector('#metric-library')?.inert);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    pass(`collapsed indicator name keyboard activation ${viewport.width}/${theme}`, { role: await name.getAttribute('type'), controls: await name.getAttribute('aria-controls') });
    await search.click();
    await page.waitForFunction(() => !document.querySelector('#search-sheet')?.hidden && !document.querySelector('#search-sheet')?.inert);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#search-sheet .search-choice').count(), 2);
    await page.locator('#search-sheet .search-choice[data-pane-place="a"]').click({ timeout: 5000 });
    await page.waitForFunction(() => !document.querySelector('#place-library')?.hidden && !document.querySelector('#place-library')?.inert);
    pass(`collapsed magnifier opens Search hub and Locations ${viewport.width}/${theme}`, { locations: await page.locator('#place-library').isVisible(), searchHub: await page.locator('#search-sheet').isVisible() });
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);

    const min = await page.locator('.indicator-chooser').evaluate((row) => ({ x: row.getBoundingClientRect().x, children: [...row.children].map((e) => e.getBoundingClientRect().x - row.getBoundingClientRect().x), padding: getComputedStyle(row).padding }));
    const up = await drag(page, -600, `up-${viewport.width}-${theme}`);
    assert.equal(up.mid.dragging, 'true');
    assert.equal(up.settled.snap, 'expanded'); assert.equal(up.settled.expanded, true, 'A real upward drag reaches the expanded body state');
    assert.equal(up.settled.padding, '0px 12px');
    assert.ok(up.mid.children.every((e) => e.hit), 'Selector child targets receive hits during actual drag');
    assert.ok(up.settled.children.every((e) => e.hit), 'Selector child targets receive hits after settling');
    const x0 = min.children;
    assert.ok(up.settled.children.every((e, i) => Math.abs(e.x - x0[i]) < 1), `Row child offsets remain fixed min→expanded: ${JSON.stringify({ min, expanded: up.settled })}`);
    const expandedRow = page.locator('.indicator-chooser');
    await expandedRow.click();
    await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden && !document.querySelector('#metric-library')?.inert);
    pass(`expanded selector opens Indicators directly ${viewport.width}/${theme}`, { expanded: up.settled });
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);

    const handle = page.locator('#explore-panel > .sheet-handle');
    await handle.focus(); await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('#explore-panel')?.dataset.snap === 'expanded');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('#explore-panel')?.dataset.snap === 'half');
    const half = await page.locator('.indicator-chooser').evaluate((row) => {
      const r = row.getBoundingClientRect(), root = row.closest('#explore-panel');
      return { snap: root.dataset.snap, userPosition: root.dataset.userPosition,
        expanded: document.body.classList.contains('place-expanded'), padding: getComputedStyle(row).padding,
        children: [...row.children].map((e) => e.getBoundingClientRect().x - r.x) };
    });
    assert.equal(half.userPosition, 'false', 'Handle keyboard reaches the discrete half snap');
    assert.equal(half.expanded, false, 'Discrete half has compact body classification');
    assert.ok(half.children.every((x, i) => Math.abs(x - x0[i]) < 1));
    const row = page.locator('.indicator-chooser'), content = page.locator('#explore-panel-content');
    const beforeScroll = await row.evaluate((e) => [...e.children].map((n) => n.getBoundingClientRect().x - e.getBoundingClientRect().x));
    await content.evaluate((e) => { e.scrollTop = 80; }); await page.waitForTimeout(100);
    const afterScroll = await row.evaluate((e) => [...e.children].map((n) => n.getBoundingClientRect().x - e.getBoundingClientRect().x));
    assert.ok(afterScroll.every((x, i) => Math.abs(x - beforeScroll[i]) < 1));
    const downMin = await drag(page, 600, `min-${viewport.width}-${theme}`);
    assert.equal(downMin.settled.snap, 'min'); assert.equal(downMin.settled.expanded, false);
    const summaryDrags = [];
    for (const [gesture, target] of [['center', summary], ['name', name], ['magnifier', search]]) {
      await handle.focus(); await page.keyboard.press('End');
      await page.waitForFunction(() => document.querySelector('#explore-panel')?.dataset.snap === 'min' && document.querySelector('#explore-panel')?.dataset.userPosition === 'false');
      const moved = await drag(page, -90, `summary-${gesture}-${viewport.width}-${theme}`, target);
      assert.equal(moved.mid.dragging, 'true', `${gesture} summary touch actively drags the sheet`);
      assert.ok(moved.start - moved.mid.offset > 20, `${gesture} summary touch moves the sheet with the finger`);
      assert.ok(moved.start - moved.settled.offset > 20, `${gesture} summary touch preserves a changed offset`);
      assert.equal(moved.settled.userPosition, 'true', `A ${gesture} summary touch drag remains free under the shared controller`);
      assert.equal(moved.settled.expanded, moved.settled.top + moved.settled.offset < moved.settled.viewportHeight * .62,
        `${gesture} body classification follows actual free position`);
      summaryDrags.push({ gesture, ...moved.settled });
      await handle.focus(); await page.keyboard.press('End');
      await page.waitForFunction(() => document.querySelector('#explore-panel')?.dataset.snap === 'min' && document.querySelector('#explore-panel')?.dataset.userPosition === 'false');
      if (gesture === 'name') {
        await name.tap();
        await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden);
        await page.keyboard.press('Escape');
      } else if (gesture === 'magnifier') {
        await search.tap();
        await page.waitForFunction(() => !document.querySelector('#search-sheet')?.hidden);
        await page.keyboard.press('Escape');
      }
    }
    assert.equal(await page.locator('#metric-library').isVisible(), false, 'Summary touch drags do not activate child buttons');
    assert.equal(await page.locator('#search-sheet').isVisible(), false, 'Summary touch drags do not activate child buttons');
    const creditScroll = await credit.evaluate((node) => node.getBoundingClientRect().y);
    assert.equal(creditScroll, creditStart.rect.y, 'Body credit stays fixed through sheet movement and scroll');
    await snap(page, `post-react-map-${viewport.width}-${theme}`);
    pass(`selector stable across expanded/half/min/drag/scroll and summary child free drags ${viewport.width}/${theme}`, { min, expanded: up.settled, half, minAfter: downMin.settled, summaryFreeDrags: summaryDrags, scrollOffsets: afterScroll, creditStart, creditYAfter: creditScroll });
    await context.close();
  }

  // Compare's shared top-control row and its direct metric/place target; theme control must clear all content hit boxes.
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) for (const theme of ['light', 'dark']) {
    const { context, page } = await open('/compare/places/unemployment/california/vs/texas', viewport, theme);
    await assertNoChromeOverlap(page, `compare-places-${viewport.width}-${theme}`);
    const metricButton = page.locator('#mobile-compare-metric');
    assert.equal(await metricButton.isVisible(), true);
    await metricButton.click();
    await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden && !document.querySelector('#metric-library')?.inert);
    assert.equal(await page.locator('#search-sheet').isVisible(), false);
    pass(`Compare place mode control targets Indicators ${viewport.width}/${theme}`, await metricButton.boundingBox());
    await context.close();
  }
  const { context: metricCompareContext, page: metricCompare } = await open('/compare/indicators/unemployment-vs-adjusted-gross-income-agi', { width: 390, height: 844 }, 'light');
  await assertNoChromeOverlap(metricCompare, 'compare-metrics-390-light');
  await metricCompare.locator('#mobile-compare-metric').click();
  await metricCompare.waitForFunction(() => !document.querySelector('#place-library')?.hidden && !document.querySelector('#place-library')?.inert);
  assert.equal(await metricCompare.locator('#search-sheet').isVisible(), false);
  pass('Compare indicator mode control targets Locations', { label: await metricCompare.locator('#mobile-compare-metric').innerText() });
  await metricCompareContext.close();

  // Touch taps exercise the independent collapsed actions and the Search→Locations path.
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
    const { context, page } = await open('/united-states/california/unemployment', viewport, 'dark');
    await page.locator('.mobile-summary-name').tap();
    await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden);
    assert.equal(await page.locator('#search-sheet').isVisible(), false);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    await page.locator('.mobile-summary-search').tap();
    await page.waitForFunction(() => !document.querySelector('#search-sheet')?.hidden);
    await page.waitForTimeout(300);
    await page.locator('#search-sheet .search-choice[data-pane-place="a"]').tap();
    await page.waitForFunction(() => !document.querySelector('#place-library')?.hidden);
    assert.equal(await page.locator('#search-sheet').isVisible(), false);
    pass(`touch tap name and magnifier→Locations ${viewport.width}`, { metricPicker: true, locations: true });
    await context.close();
  }

  // Desktop source frame placement and breakpoint moves preserve the same single anchor node.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage(); let releaseCatalog; const catalogGate = new Promise((resolve) => { releaseCatalog = resolve; });
    await page.route('**/api/atlas/catalog', async (route) => { await catalogGate; await route.continue().catch(() => {}); });
    await page.goto(base + '/united-states/california/unemployment', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loading:not([hidden])');
    releaseCatalog(); await ready(page);
    await assertNoChromeOverlap(page, 'desktop-map');
    await page.locator('.osm-attribution').evaluate((e) => { window.__creditRef = e; });
    const current = await attribution(page, 'source', 'desktop map attribution after source');
    assert.equal(current.afterSource, true);
    await page.locator('[data-open-rank="highest"]').click();
    await attribution(page, 'source', 'desktop Highest attribution stays in legend frame');
    assert.equal(await page.locator('.osm-attribution').evaluate((e) => e.parentElement.classList.contains('indicator-legend')), true);
    assert.equal(await page.locator('.osm-attribution').evaluate((e) => e === window.__creditRef || (window.__creditRef = e)), true);
    for (const rank of ['lowest', 'highest']) {
      await page.locator(`#ranking-panel [data-rank="${rank}"]`).click(); await page.waitForTimeout(250);
      const placement = await attribution(page, 'source', `desktop ${rank} attribution in legend frame`);
      assert.equal(placement.afterSource, true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => matchMedia('(max-width:760px)').matches && document.querySelector('.osm-attribution')?.parentElement === document.body);
    const mobileIdentity = await page.locator('.osm-attribution').evaluate((e) => e === window.__creditRef);
    assert.equal(mobileIdentity, true, 'Same credit node moves desktop→mobile');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => !matchMedia('(max-width:760px)').matches && document.querySelector('.osm-attribution')?.dataset.placement === 'source');
    assert.equal(await page.locator('.osm-attribution').evaluate((e) => e === window.__creditRef), true);
    await attribution(page, 'source', 'desktop credit after mobile→desktop resize');
    await snap(page, 'post-react-desktop-credit-highest-lowest');
    pass('same attribution node follows map/rank source and both breakpoint directions', { nodeStable: true });
    await context.close();
  }

  // Desktop reading headers keep only their floating components and reuse the map brand geometry.
  for (const height of [900, 640]) for (const theme of ['light', 'dark']) {
    const { context, page } = await open('/united-states/california/unemployment', { width: 1440, height }, theme);
    const baseBrand = await page.locator('.brand').evaluate((e) => {
      const s = getComputedStyle(e), r = e.getBoundingClientRect(), logo = e.querySelector('svg'), l = logo.getBoundingClientRect();
      return { rect: [r.x, r.y, r.width, r.height], fontSize: s.fontSize, fontWeight: s.fontWeight, boldWeight: getComputedStyle(e.querySelector('b')).fontWeight, lineHeight: s.lineHeight, padding: s.padding, borderWidth: s.borderWidth, radius: s.borderRadius, globe: [getComputedStyle(logo).display, l.width, l.height] };
    });
    const pages = [
      ['map', async () => {}],
      ['compare', async () => { await page.locator('.concept-tabs [data-page="compare"]').click(); }],
      ['stats', async () => { await page.locator('.concept-tabs [data-page="stats"]').click(); }],
      ['blog', async () => { await page.locator('.concept-tabs [data-page="blog"]').click(); }],
      ['support', async () => { await page.locator('#support-open').click(); }],
      ['info', async () => { await page.locator('#info-open').click(); }],
    ];
    for (let i = 0; i < pages.length; i++) {
      const [pageId, navigate] = pages[i];
      if (i) await navigate();
      await page.waitForFunction((expected) => document.body.dataset.page === expected, pageId);
      await ready(page);
      const header = await page.evaluate(() => {
        const brand = document.querySelector('.brand'), s = getComputedStyle(brand), r = brand.getBoundingClientRect(), logo = brand.querySelector('svg'), l = logo.getBoundingClientRect(), pseudo = getComputedStyle(document.querySelector('.app-header'), '::before');
        return { rect: [r.x, r.y, r.width, r.height], fontSize: s.fontSize, fontWeight: s.fontWeight, boldWeight: getComputedStyle(brand.querySelector('b')).fontWeight, lineHeight: s.lineHeight, padding: s.padding, borderWidth: s.borderWidth, radius: s.borderRadius, globe: [getComputedStyle(logo).display, l.width, l.height], stripDisplay: pseudo.display, stripContent: pseudo.content, stripBackground: pseudo.backgroundColor };
      });
      assert.deepEqual({ rect: header.rect, fontSize: header.fontSize, fontWeight: header.fontWeight, boldWeight: header.boldWeight, lineHeight: header.lineHeight, padding: header.padding, borderWidth: header.borderWidth, radius: header.radius, globe: header.globe }, baseBrand, `${pageId} brand exactly matches map baseline ${height}/${theme}`);
      assert.ok(header.stripDisplay === 'none' || ['none', 'normal'].includes(header.stripContent) || header.stripBackground === 'rgba(0, 0, 0, 0)', `${pageId} has no generated painted full-width desktop header backdrop: ${JSON.stringify(header)}`);
      const top = await visibleRects(page, ['.brand', '#theme-toggle', '.concept-tabs', '.workspace-bar', '#support-open', '#info-open']);
      for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) assert.equal(intersects(top[a], top[b]), false, `${pageId}/${height}/${theme} header controls overlap: ${JSON.stringify([top[a], top[b]])}`);
      const active = pageId === 'info' ? '#info-open' : pageId === 'support' ? '#support-open' : null;
      if (active) assert.equal(await page.locator(active).evaluate((e) => getComputedStyle(e).backgroundColor), 'rgb(255, 122, 50)');
      await snap(page, `desktop-header-${pageId}-${height}-${theme}`);
      results.geometry.push({ label: `desktop-header-${pageId}-${height}-${theme}`, header, top });
      if (pageId === 'info') await page.locator('.concept-tabs [data-page="map"]').click();
    }
    await page.setViewportSize({ width: 1440, height: height === 900 ? 640 : 900 });
    await page.waitForTimeout(120);
    await context.close();
  }

  // Race/ethnicity presentation names are short while metric identity and methods remain complete.
  {
    // Only the explicitly marked local/CI fixture changes availability: its PG
    // database has no observations for these four otherwise unchanged series.
    // Stage/public run the same four UI assertions against the real catalog.
    const { context, page } = await open('/united-states/california/unemployment', { width: 390, height: 844 }, 'dark', 'no-preference', fixtureOverride);
    await page.locator('.mobile-summary-name').click();
    await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden);
    const expected = [
      ['race-ethnicity--black', 'Black', 'People who are Black or African American alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.'],
      ['race-ethnicity--asian', 'Asian', 'People who are Asian alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.'],
      ['race-ethnicity--white-non-hispanic', 'White', 'People who are White alone and not Hispanic or Latino divided by all residents, multiplied by 100. This is the share of the total population in that category.'],
      ['race-ethnicity', 'Hispanic', 'Hispanic or Latino residents divided by all residents, multiplied by 100. This is the share of the total population that is Hispanic or Latino; Hispanic origin can be of any race.'],
    ];
    for (const [id, label, definition] of expected) {
      const item = page.locator(`#metric-library [data-metric="${id}"]`);
      await item.waitFor({ state: 'visible' });
      assert.equal((await item.locator('strong').innerText()).trim(), label, `${id} visible picker label`);
      assert.equal(await item.getAttribute('data-metric'), id, `${label} stable metric identity`);
    }
    for (const [id, label, method] of expected) {
      await page.locator(`#metric-library [data-metric="${id}"]`).click();
      await page.waitForTimeout(120);
      assert.equal((await page.locator('.mobile-summary-name').innerText()).trim(), label, `${label} selected title`);
      await drag(page, -600, `expand-for-${id}-method`);
      await page.locator('#explore-panel .indicator-legend-source').click();
      await page.waitForFunction(() => !document.querySelector('#source-popup')?.hidden);
      assert.equal((await page.locator('#source-popup .source-mobile > p').innerText()).trim(), method, `${label} full method remains available`);
      pass(`race/ethnicity ${id} label, ID and full method${fixtureOverride ? ' (catalog availability fixture)' : ' (real catalog)'}`, { metricId: id, visibleLabel: label, fullMethod: method, fixtureOverride });
      await page.locator('#source-close').click();
      await page.waitForTimeout(150);
      await drag(page, 600, `collapse-after-${id}-method`);
      if (id !== expected.at(-1)[0]) {
        await page.locator('.mobile-summary-name').click();
        await page.waitForFunction(() => !document.querySelector('#metric-library')?.hidden);
      }
    }
    await page.locator('.mobile-summary-name').click();
    await page.locator('#metric-library input[type="search"]').fill('Black');
    await page.waitForTimeout(150);
    assert.equal((await page.locator('#metric-library [data-metric="race-ethnicity--black"] strong').innerText()).trim(), 'Black', 'Search results use the concise label and stable ID');
    await page.keyboard.press('Escape');
    await context.close();
    pass(`race/ethnicity labels and stable IDs in picker, selected title and search${fixtureOverride ? ' (catalog availability fixture)' : ' (real catalog)'}`, { expected, fixtureOverride, catalogAvailability: fixtureOverride ? 'hasObservations=true for exactly four original catalog entries; IDs/names/definitions unchanged' : 'unmodified runtime response' });
  }

  // White mobile Compare labels over geography need shadows; desktop black card text stays crisp.
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const { context, page } = await open('/compare/indicators/unemployment-vs-adjusted-gross-income-agi', viewport, 'light');
    const styles = await page.evaluate(() => {
      const read = (selector) => [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length).map((e) => ({ text: e.textContent.trim().slice(0, 35), shadow: getComputedStyle(e).textShadow, filter: getComputedStyle(e).filter }));
      return {
        place: read('.pane-heading .field-value'), chevron: read('.pane-heading .field-value svg'),
        value: read('.map-summary strong'), percent: read('.desktop-compare-value strong'), desktopName: read('.desktop-compare-name'), desktopChevron: read('.desktop-compare-name svg'),
      };
    });
    if (viewport.width <= 760) {
      for (const key of ['place', 'value']) assert.ok(styles[key].length && styles[key].every((x) => x.shadow !== 'none'), `Light mobile Compare ${key} text shadow: ${JSON.stringify(styles[key])}`);
      assert.ok(styles.chevron.length && styles.chevron.every((x) => x.filter !== 'none'), `Light mobile Compare chevrons have subtle shadows: ${JSON.stringify(styles.chevron)}`);
    } else assert.ok(styles.desktopName.length && styles.percent.length && styles.desktopName.every((x) => x.shadow === 'none') && styles.percent.every((x) => x.shadow === 'none'), 'Black text in white desktop Compare cards stays crisp without map-label shadows');
    pass(`light Compare label/value/chevron shadows ${viewport.width}`, styles);
    await context.close();
  }

  // About/Support active states, visibility/ARIA, theme persistence and image/crop at mobile + desktop.
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) for (const theme of ['light', 'dark']) {
    const { context, page } = await open('/united-states/california/unemployment', viewport, theme);
    const controls = page.locator('#theme-toggle');
    await assertNoChromeOverlap(page, `map-chrome-${viewport.width}-${theme}`);
    await page.locator('#info-open').click(); await page.waitForFunction(() => document.body.dataset.page === 'info'); await ready(page);
    await assertNoChromeOverlap(page, `about-chrome-${viewport.width}-${theme}`);
    let nav = await page.locator('#info-open').evaluate((e) => ({ current: e.getAttribute('aria-current'), bg: getComputedStyle(e).backgroundColor }));
    assert.equal(nav.current, 'page'); assert.equal(nav.bg, 'rgb(255, 122, 50)');
    assert.equal(await controls.isVisible(), true);
    const aboutImage = page.locator('.creator-portrait img');
    const aboutCrop = await aboutImage.evaluate((e) => ({ src: new URL(e.src).pathname, complete: e.complete, width: e.naturalWidth, height: e.naturalHeight, fit: getComputedStyle(e).objectFit, position: getComputedStyle(e).objectPosition, frame: (() => { const r = e.parentElement.getBoundingClientRect(); return { width: r.width, height: r.height }; })() }));
    assert.equal(aboutCrop.complete, true); assert.equal(aboutCrop.width, 986); assert.equal(aboutCrop.height, 793); assert.equal(aboutCrop.fit, 'cover'); assert.equal(aboutCrop.position, '50% 8%');
    await snap(page, `post-react-about-retina-${viewport.width}-${theme}`);
    const response = await page.request.get(base + '/ux/assets/creator-portrait.jpg'); assert.equal(response.status(), 200);
    const imageBytes = await response.body(), imageHash = createHash('sha256').update(imageBytes).digest('hex');
    assert.equal(imageBytes.length, 97722); assert.equal(imageHash, originalPortraitSha256, 'HTTP portrait is the exact original JPEG');
    if (packageRoot) {
      const manifest = JSON.parse(await readFile(join(packageRoot, 'preview-assets.json'), 'utf8')),
        build = JSON.parse(await readFile(join(packageRoot, 'ux/build.json'), 'utf8')),
        asset = 'ux/assets/creator-portrait.jpg';
      assert.equal(manifest['/' + asset], asset);
      assert.equal(build.assetSha256[asset], imageHash);
      assert.equal(build.shippedSha256[asset], imageHash);
    }
    await page.locator('#theme-toggle').click(); const otherTheme = theme === 'dark' ? 'light' : 'dark';
    await page.waitForFunction((expected) => document.body.dataset.theme === expected && getComputedStyle(document.documentElement).colorScheme === expected, otherTheme);
    assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'), String(otherTheme === 'dark'));
    assert.equal(await page.evaluate(() => localStorage.getItem('usa-atlas-theme')), otherTheme);
    await page.locator('#support-open').click(); await page.waitForFunction(() => document.body.dataset.page === 'support'); await ready(page);
    await assertNoChromeOverlap(page, `support-chrome-${viewport.width}-${otherTheme}`);
    const supportNav = await page.locator('#support-open').evaluate((e) => ({ current: e.getAttribute('aria-current'), bg: getComputedStyle(e).backgroundColor }));
    assert.equal(supportNav.current, 'page'); assert.equal(supportNav.bg, 'rgb(255, 122, 50)');
    assert.equal(await page.locator('#info-open').getAttribute('aria-current'), null);
    const supportImage = page.locator('.support-portrait img');
    const supportCrop = await supportImage.evaluate((e) => ({ src: new URL(e.src).pathname, complete: e.complete, width: e.naturalWidth, height: e.naturalHeight, fit: getComputedStyle(e).objectFit, position: getComputedStyle(e).objectPosition, frame: (() => { const r = e.parentElement.getBoundingClientRect(); return { width: r.width, height: r.height }; })() }));
    assert.equal(supportCrop.complete, true); assert.equal(supportCrop.width, 986); assert.equal(supportCrop.height, 793); assert.equal(supportCrop.fit, 'cover'); assert.equal(supportCrop.position, '50% 8%');
    await snap(page, `post-react-support-retina-${viewport.width}-${theme}`);
    await page.locator('.concept-tabs [data-page="map"]').click(); await page.waitForFunction(() => document.body.dataset.page === 'map');
    assert.equal(await page.locator('#support-open').getAttribute('aria-current'), null);
    assert.equal(await page.locator('#info-open').getAttribute('aria-current'), null);
    pass(`About/Support active chrome and portrait ${viewport.width}/${theme}`, { aboutCrop, supportCrop, imageHash, imageBytes: imageBytes.length, screenshotDpr: viewport.width <= 760 ? 3 : 2, aboutActive: nav, supportActive: supportNav, persistedTheme: otherTheme });
    await context.close();
  }

  // Embedded initial defaults, explicit URL choice at app bootstrap, and parent-theme isolation.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => localStorage.setItem('usa-atlas-theme', 'light'));
    const page = await context.newPage();
    await page.route('**/united-states/unemployment*', async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has('theme')) return route.continue();
      const response = await route.fetch({ url: `${base}/united-states/unemployment` }); await route.fulfill({ response });
    });
    await page.goto(base + '/united-states/unemployment', { waitUntil: 'domcontentloaded' });
    await page.setContent('<iframe title="Theme proof" src="/united-states/unemployment?embed=1&theme=dark"></iframe>');
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.document.body?.dataset.atlasStatus === 'ready', null, { timeout: 60000 });
    const child = page.frameLocator('iframe');
    assert.equal(await child.locator('body').getAttribute('data-theme'), 'dark', 'Isolated embed bootstrap URL choice wins over saved light');
    await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ type: 'atlas-embed-theme', theme: 'light' }, location.origin));
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.document.body?.dataset.theme === 'light');
    await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ type: 'atlas-embed-theme', theme: 'dark' }, location.origin));
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.document.body?.dataset.theme === 'dark');
    assert.equal(await child.locator('body').evaluate(() => localStorage.getItem('usa-atlas-theme')), 'light');
    pass('isolated embedded URL bootstrap and actual parent theme isolation', { childUrl: await child.locator('body').evaluate(() => location.href), deliveredParentTheme: 'dark', storedPreferencePreserved: 'light', bootstrapIsolationOnly: true });
    await context.close();
  }

  // Verify the asset is part of the runtime mapping/hash before returning a successful package result.
  if (packageRoot) {
    const manifest = JSON.parse(await readFile(join(packageRoot, 'preview-assets.json'), 'utf8')),
      build = JSON.parse(await readFile(join(packageRoot, 'ux/build.json'), 'utf8')),
      asset = 'ux/assets/creator-portrait.jpg', bytes = await readFile(join(packageRoot, asset)), hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(manifest['/' + asset], asset); assert.equal(build.assetSha256[asset], hash); assert.equal(build.shippedSha256[asset], hash); assert.equal(hash, originalPortraitSha256);
    pass('packaged portrait public mapping and asset hashes', { path: asset, sha256: hash });
  }
} catch (error) {
  results.failures.push({ message: error.stack || String(error) });
  throw error;
} finally {
  await browser.close();
  results.status = results.failures.length ? 'fail' : 'pass';
  await writeFile(join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ suite: results.suite, status: results.status, checks: results.checks.length, failures: results.failures.length, geometry: results.geometry.length, screenshots: results.screenshots.length, evidence: output }));
}
