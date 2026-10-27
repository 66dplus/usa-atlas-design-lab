import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import projectContent from './project-content.json' with { type: 'json' };
import { articles } from './journal.js';

const base = (process.env.ATLAS_TEST_URL || '').replace(/\/$/, '');
assert.match(base, /^http:\/\/127\.0\.0\.1:(?!4507\b)\d+$/, 'Use an isolated loopback runtime port, never localhost:4507');
const output = process.env.ATLAS_TEST_OUTPUT || '/tmp/usa-maps-release-20261027/journal-evidence';
await mkdir(output, { recursive: true });
const result = { base, publicApi: 'https://usa-xray.online', methods: [], apiReads: [], proxyErrors: [], checks: [], failures: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__copiedAddress = value; } } });
    });
    const page = await context.newPage();
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url());
      result.methods.push({ method: request.method(), url: request.url() });
      if (request.method() !== 'GET') return route.abort('blockedbyclient');
      if (url.origin === new URL(base).origin && url.pathname.startsWith('/api/atlas/')) {
        const publicUrl = 'https://usa-xray.online' + url.pathname + url.search;
        try {
          const response = await route.fetch({ url: publicUrl, method: 'GET', timeout: 45000 });
          result.apiReads.push({ path: url.pathname + url.search, publicUrl, status: response.status() });
          return route.fulfill({ response });
        } catch (error) {
          result.proxyErrors.push({ path: url.pathname + url.search, message: String(error) });
          return route.abort('failed').catch(() => {});
        }
      }
      return route.continue();
    });
    await page.goto(base + '/ux/');
    await page.waitForFunction(() => document.body.dataset.atlasStatus === 'ready', null, { timeout: 90000 });
    await page.locator('#support-open').click();
    await page.waitForFunction(() => document.body.dataset.page === 'support');
    await page.screenshot({ path: `${output}/support-${viewport.width}.png`, animations: 'disabled' });
    await page.locator('[data-open-crypto]').click();
    await page.getByRole('dialog').waitFor();
    const wallets = projectContent.support.donationMethods.wallets;
    for (const wallet of wallets) {
      const button = page.locator(`.crypto-network-button--${wallet.id}`);
      await button.click();
      await page.waitForFunction((address) => document.querySelector('#crypto-address')?.textContent === address, wallet.address);
      assert.equal(await page.locator('#crypto-address').textContent(), wallet.address, `${wallet.network}: exact address`);
      assert.equal(await page.locator('.crypto-qr').getAttribute('src'), wallet.qrUrl, `${wallet.network}: matching QR asset`);
      await page.waitForFunction(() => { const image = document.querySelector('.crypto-qr'); return image?.complete && image.naturalWidth > 0; });
      assert.ok(await page.locator('.crypto-qr').evaluate((image) => image.complete && image.naturalWidth > 0), `${wallet.network}: QR image loads`);
      assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('crypto-back-button')), `${wallet.network}: focus moves to back control`);
      await page.locator('.crypto-copy-button').click();
      await page.waitForFunction(() => document.querySelector('.crypto-copy-status')?.textContent === 'Address copied.');
      assert.equal(await page.evaluate(() => window.__copiedAddress), wallet.address, `${wallet.network}: copy writes exact address only`);
      await page.locator('.crypto-back-button').click();
      await page.waitForFunction((id) => document.activeElement?.classList.contains(`crypto-network-button--${id}`), wallet.id);
      assert.equal(await page.locator('.crypto-network-button').count(), 6);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.app-dialog-backdrop', { state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-open-crypto'));
    await page.locator('.support-page [data-open-info=methodology]').click();
    await page.waitForFunction(() => document.activeElement?.id === 'methodology-title');
    assert.ok(await page.locator('#reading-page').evaluate((node) => node.scrollTop > 0), 'Support methodology link scrolls to the About block');
    await page.locator('#support-open').click();
    await page.waitForFunction(() => document.body.dataset.page === 'support');
    await page.locator('#info-open').click();
    await page.waitForFunction(() => document.body.dataset.page === 'info');
    await page.screenshot({ path: `${output}/about-${viewport.width}.png`, animations: 'disabled' });
    await page.locator('#about-main [data-open-info=methodology]').first().click();
    await page.waitForFunction(() => document.activeElement?.id === 'methodology-title');
    assert.ok(await page.locator('#reading-page').evaluate((node) => node.scrollTop > 0), 'Methodology navigation scrolls to the focused section');
    assert.ok(await page.locator('#methodology-title').isVisible());
    await page.screenshot({ path: `${output}/about-methodology-${viewport.width}.png`, animations: 'disabled' });
    assert.equal(await page.locator('#reading-page').evaluate((node) => node.scrollWidth > node.clientWidth), false, 'no horizontal overflow at viewport');
    result.checks.push({ name: `crypto-about-methodology-${viewport.width}`, status: 'pass' });
    if (viewport.width === 1440) {
      const legacy = await context.newPage();
      await legacy.goto(base + '/about#info-methodology');
      await legacy.waitForFunction(() => document.body.dataset.page === 'info');
      await legacy.waitForFunction(() => !document.querySelector('#info-legacy')?.hidden);
      await legacy.locator('[data-info=sources]').click();
      assert.equal(await legacy.locator('[data-info=sources]').getAttribute('aria-pressed'), 'true');
      await legacy.locator('[data-info=data]').click();
      assert.equal(await legacy.locator('[data-info=data]').getAttribute('aria-pressed'), 'true');
      await legacy.locator('#about-legacy-back').click();
      assert.ok(await legacy.locator('#about-main').isVisible(), 'legacy back action returns to About');
      result.checks.push({ name: 'legacy-methodology-hash-sources-data-and-back', status: 'pass' });
      await legacy.close();
    }
    if (viewport.width === 390) {
      await page.locator('.concept-tabs [data-page="blog"]').click();
      await page.waitForFunction(() => document.body.dataset.page === 'blog');
      await page.locator('a[data-article="imperial-county-unemployment"]').first().click();
      await page.waitForFunction(() => document.body.dataset.page === 'article');
      await page.waitForFunction(() => document.querySelector('[data-domain="fixed"]'), null, { timeout: 60000 });
      const range = await page.locator('[data-domain="fixed"]').first();
      assert.match(await range.innerText(), /Scale 0\.00%/);
      assert.match(await range.innerText(), /25\.00%/);
      assert.match(await range.getAttribute('aria-label'), /endpoints are not observed minimum and maximum/);
      assert.ok(result.apiReads.some((entry) => entry.path.startsWith('/api/atlas/period-observations?') && entry.path.includes('period_type=annual')),
        'article unemployment uses the exact annual period read boundary');
      assert.equal(await page.locator('body').evaluate((node) => node.scrollWidth > innerWidth), false, 'article has no mobile horizontal overflow');
      await page.screenshot({ path: `${output}/journal-imperial-mobile.png`, animations: 'disabled' });
      result.checks.push({ name: 'imperial-live-map-fixed-period-and-legend', status: 'pass' });
      const expectedValues = {
        'imperial-county-unemployment': ['18.90%'],
        'pitkin-income-comparison': ['$105K', '$92K'],
        'los-alamos-doctorates-and-income': ['18.45%', '$147K'],
        'nassau-bronx-household-income': ['$146K', '$49K'],
        'california-tax-return-income': ['$2.05T'],
        'garfield-work-from-home': ['43.67%'],
        'oglala-lakota-international-income': ['$12K'],
        'child-mortality-mississippi': ['84.6'],
        'rent-price-vs-burden': ['55.31%', '60.09%'],
        'state-poverty-high-income': ['14.01%'],
        'population-largest-counties': ['9.81M'],
        'youngest-oldest-counties': ['21.4 years', '68.5 years'],
        'most-least-populous-states': ['39.29M', '582.4K'],
      };
      for (const [slug, article] of Object.entries(articles).filter(([, item]) => item.published)) {
        if (slug !== 'imperial-county-unemployment') {
          await page.locator('.concept-tabs [data-page="blog"]').click();
          await page.waitForFunction(() => document.body.dataset.page === 'blog');
          await page.locator(`.journal-preview-link[data-article="${slug}"]`).click();
          await page.waitForFunction((selected) => document.querySelector(`article[data-article="${selected}"]`), slug);
        }
        await page.waitForFunction((selected) => {
          const figures = [...document.querySelectorAll(`article[data-article=\"${selected}\"] .article-map-legend strong`)];
          const expectedCount = selected === 'los-alamos-doctorates-and-income' ? 2 : 1;
          return figures.length >= expectedCount && figures.every((node) => node.textContent && node.textContent !== 'No observation');
        }, slug, { timeout: 60000 });
        const visibleValues = await page.locator(`article[data-article=\"${slug}\"] .article-map-legend strong`).allInnerTexts();
        const legendRanges = await page.locator(`article[data-article=\"${slug}\"] .article-map-legend-range`).evaluateAll((nodes) => nodes.map((node) => ({
          domain: node.dataset.domain,
          aria: node.getAttribute('aria-label') || '',
          labels: [...node.querySelectorAll('span')].map((item) => item.textContent || ''),
        })));
        assert.equal(legendRanges.length, visibleValues.length, `${slug}: each live map has a range legend`);
        for (const range of legendRanges) {
          if (range.domain === 'fixed') {
            assert.match(range.aria, /endpoints are not observed minimum and maximum/);
            assert.match(range.labels[0], /^Scale /);
          } else {
            assert.equal(range.domain, 'observed');
            assert.match(range.aria, /observed minimum and maximum/);
            assert.match(range.labels[0], /^Min /);
            assert.match(range.labels[1], /^Max /);
          }
        }
        for (const expected of expectedValues[slug] || [])
          assert.ok(visibleValues.includes(expected), `${slug}: live selected value ${expected}; got ${visibleValues.join(', ')}`);
        assert.equal(await page.locator('body').evaluate((node) => node.scrollWidth > innerWidth), false, `${slug}: no mobile horizontal overflow`);
        result.checks.push({ name: `article-map-${slug}`, status: 'pass', values: visibleValues });
      }
      assert.ok(result.apiReads.some((entry) => entry.path.startsWith('/api/atlas/reader/v2/observations?dataset_id=irs_agi_total_2023')), 'California AGI article uses the current reader-v2 observation endpoint');
      assert.ok(result.apiReads.some((entry) => entry.path.startsWith('/api/atlas/reader/v2/observations?dataset_id=child_deaths_under18_2024')), 'child-mortality article uses the current reader-v2 observation endpoint');
    }
    await page.waitForTimeout(300);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
    await context.close();
  }
  const blocked = result.methods.filter((entry) => entry.method !== 'GET');
  result.blockedNonGetCount = blocked.length;
  assert.ok(result.methods.every((entry) => entry.method === 'GET' || entry.method === 'POST'), 'no unexpected request method was issued');
  assert.ok(result.apiReads.length > 0 && result.apiReads.every((entry) => entry.status === 200), 'all current public API reads succeeded');
  assert.deepEqual(result.proxyErrors, [], 'public API proxy completed every requested read');
} catch (error) {
  result.failures.push(error.stack || String(error));
  throw error;
} finally {
  await browser.close();
  await writeFile(`${output}/journal-ui-results.json`, JSON.stringify(result, null, 2) + '\n');
}
console.log(`PASS: read-only desktop/mobile Support, six-network focus/copy/QR flow, About methodology navigation, and current annual unemployment article map. Evidence: ${output}`);
