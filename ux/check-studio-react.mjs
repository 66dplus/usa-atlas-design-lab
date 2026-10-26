import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { assertStudioPost } from './studio-request-contract.mjs';
import { enableCompleteRequestHeaders, observedMetadata, requiredMetadata } from './studio-network-observer.mjs';
const base = (process.env.ATLAS_TEST_URL || 'http://127.0.0.1:4198').replace(/\/$/, ''),
  before = process.env.ATLAS_BEFORE_URL,
  out = process.env.ATLAS_TEST_OUTPUT || `/tmp/usa-xray-react-studio-${Date.now()}`;
await mkdir(out, { recursive: true });
const result = {
  suite: 'react-advertiser-studio',
  base,
  before: before || null,
  checks: [],
  failures: [],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function loaded(page, url) {
  await page.goto(url + '/ux/advertise.html');
  await page.waitForFunction(
    () => document.querySelectorAll('#indicator-options button').length > 0,
  );
  await page.waitForTimeout(500);
}
async function shot(page, name) {
  await page.screenshot({
    path: join(out, name + '.png'),
    animations: 'disabled',
  });
}
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 1440, height: 900 },
    { width: 1440, height: 640 },
  ])
    for (const theme of ['light', 'dark']) {
      const name = `${viewport.width}x${viewport.height}-${theme}`,
        context = await browser.newContext({
          viewport,
          reducedMotion: 'reduce',
          acceptDownloads: true,
        }),
        errors = [],
        posts = [],
        advertisingRequests = [],
        websiteIds = new Set(),
        configs = [];
      await context.addInitScript((theme) => localStorage.setItem('usa-atlas-theme', theme), theme);
      try {
        await enableCompleteRequestHeaders(context);
        if (before) {
          const reference = await context.newPage();
          await loaded(reference, before);
          await shot(reference, 'before-' + name + '-creative');
          await reference.close();
        }
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        page.on('request', (request) => {
          if (request.method() === 'POST') {
            posts.push(observedMetadata(request.allHeaders().then(headers => ({
              url: request.url(), method: request.method(), headers, body: request.postData(),
            })), 'POST full request headers'));
          }
          const url = new URL(request.url());
          if (url.hostname === 'example.test' || /\/api\/(?:ad(?:vertis)?|placements?|publish)/i.test(url.pathname))
            advertisingRequests.push(request.url());
        });
        page.on('response', (response) => {
          const url = new URL(response.url());
          if (url.origin === new URL(base).origin && url.pathname === '/api/analytics/config' && !url.search)
            configs.push(observedMetadata(response.json().then((config) => {
              if (config.enabled === true) websiteIds.add(config.websiteId);
            }), 'public analytics configuration JSON'));
        });
        await loaded(page, base);
        assert.equal(await page.locator('body').getAttribute('data-theme'), theme);
        await shot(page, 'after-' + name + '-creative');
        assert.equal(
          await page.locator('[data-format=ticker]').isDisabled(),
          viewport.width <= 760,
          'Mobile keeps the Desktop-only format constraint',
        );
        await page.locator('#ad-headline').fill('A synthetic browser preview');
        await page.locator('#ad-url').fill('https://example.test/preview');
        await page.waitForFunction(() => document.querySelector('#preview-status')?.dataset.phase === 'unverified', null, {timeout:8000});
        assert.equal(await page.locator('#preview-status').innerText(), 'Fit has not been verified.');
        assert.equal(await page.locator('#ad-headline').inputValue(), 'A synthetic browser preview', 'Settling an unsupported handshake retains edited fields');
        await page.frameLocator('#map-preview').locator('body[data-atlas-status=ready]').waitFor({state:'attached',timeout:60000});
        assert.equal(await page.frameLocator('#map-preview').locator('#loading').isHidden(),true,'The real map preview settles independently');
        if (viewport.width <= 760) {
          await page.locator('#preview-in-place').click();
          assert.equal(await page.locator('#close-preview').evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'The real mobile reference keeps its exit reachable');
          await shot(page, 'after-' + name + '-settled-reference');
          await page.locator('#close-preview').click();
        } else await shot(page, 'after-' + name + '-settled-reference');

        await page.locator(viewport.width <= 760 ? '#mobile-review' : '#review-request').click();
        await page.locator('#request-settings').waitFor();
        await page.locator('[data-channel=email]').click();
        await page.locator('#contact-email').fill('browser-check@example.test');
        await page.locator('[data-days=custom]').click();
        await page.locator('#custom-days').fill('14');
        await page.locator('#contact-name').fill('Synthetic browser check');
        await shot(page, 'after-' + name + '-request');
        assert.equal(await page.locator('#submit-request').isEnabled(), true);
        const download = page.waitForEvent('download');
        await page.locator('#submit-request').click();
        const artifact = await download,
          path = join(out, name + '-request.json');
        await artifact.saveAs(path);
        const payload = JSON.parse(await readFile(path, 'utf8'));
        assert.equal(payload.version, 2);
        assert.equal(payload.kind, 'placement');
        assert.equal(payload.durationDays, 14);
        assert.deepEqual(payload.creative.locations, ['06']);
        assert.deepEqual(payload.creative.indicators, ['unemployment']);
        assert.equal(payload.creative.url, 'https://example.test/preview');
        await page.locator(viewport.width <= 760 ? '#save-mobile' : '#save-draft').click();
        await page.reload();
        await page.waitForFunction(
          () => document.querySelectorAll('#indicator-options button').length > 0,
        );
        assert.equal(
          await page.locator('#ad-headline').inputValue(),
          'A synthetic browser preview',
          'A saved draft survives a full reload',
        );
        assert.equal(
          await page.locator('#contact-email').inputValue(),
          'browser-check@example.test',
        );
        await page.locator('#ad-url').fill('javascript:alert(1)');
        await page.locator(viewport.width <= 760 ? '#mobile-review' : '#review-request').click();
        await page.locator('#check-request').click();
        await page.waitForFunction(
          () => document.querySelector('#ad-url')?.getAttribute('aria-invalid') === 'true',
        );
        await page.waitForFunction(
          () => document.querySelector('#ad-url') === document.activeElement,
        );
        await page.locator('#ad-url').fill('https://example.test/preview');
        if (viewport.width > 760) {
          await page.locator('[data-format=ticker]').click();
          assert.equal(await page.locator('#target-mobile').isChecked(), false);
          assert.equal(await page.locator('[data-device=mobile]').isDisabled(), true);
          await page.locator('[data-format=banner]').click();
          await page.locator('#custom-campaign').click();
          await page.locator('#inquiry-idea').fill('A synthetic custom campaign inquiry');
          assert.equal(await page.locator('#duration-settings').isVisible(), false);
          assert.equal(await page.locator('#inquiry-field').isVisible(), true);
          await page.waitForFunction(()=>document.querySelector('#preview-status')?.textContent==='Placement reference. Your creative draft is retained.');
        }
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.deepEqual(errors, []);
        await page.locator(viewport.width <= 760 ? '#save-mobile' : '#save-draft').click();
        await requiredMetadata(configs);
        for (const post of await requiredMetadata(posts)) assertStudioPost(post, base, websiteIds);
        assert.deepEqual(advertisingRequests, [], 'Draft URLs and advertising endpoints are never requested');
        result.checks.push({
          name,
          status: 'pass',
          approvedTelemetryPosts: posts.length,
          scope:
            'bounded unverified reference, independently settled real map, retained creative/contact/duration/targeting, private browser draft persistence, download-only request, invalid URL and Desktop-only ticker; no advertising requests',
        });
        await page.close();
      } catch (error) {
        result.failures.push({ name, message: error.stack || String(error) });
        for (const page of context.pages()) await shot(page, 'failed-' + name).catch(() => {});
      } finally {
        await context.close();
      }
    }
} finally {
  await browser.close();
  result.status = result.failures.length ? 'fail' : 'pass';
  await writeFile(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
}
if (result.failures.length) {
  console.error(JSON.stringify(result.failures, null, 2));
  process.exitCode = 1;
} else
  console.log(
    `PASS: advertiser studio ${result.checks.length}/8 viewport/theme cases; bounded unverified reference status/drafts/downloads/validation/targeting; no delivery or publication; evidence ${out}`,
  );
