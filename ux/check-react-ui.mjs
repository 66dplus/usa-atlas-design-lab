import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  isPinnedMilestoneRollback,
  readUiExpectationProfile,
} from './ui-expectation-profile.mjs';
const base = (process.env.ATLAS_TEST_URL || 'http://127.0.0.1:4198').replace(/\/$/, ''),
  before = process.env.ATLAS_BEFORE_URL,
  uiProfile = await readUiExpectationProfile(base, process.env.ATLAS_CONFORMANCE_IMAGE_DIGEST),
  baseline = uiProfile.baseline,
  expectationProfile = uiProfile.profile;
const out = process.env.ATLAS_TEST_OUTPUT || `/tmp/usa-xray-react-ui-${Date.now()}`;
await mkdir(out, { recursive: true });
const supportWallets = JSON.parse(
  await readFile(new URL('./project-content.json', import.meta.url), 'utf8'),
).support.donationMethods.wallets;
const result = {
  suite: 'react-ui-lifecycle-and-support',
  base,
  expectationProfile,
  runtimeIdentity: uiProfile.identity,
  before: before || null,
  checks: [],
  additionalChecks: [],
  failures: [],
  screenshots: [],
};
const reportAcknowledgements = {
  runtimeBase: base,
  test: 'ux/check-react-ui.mjs',
  suite: result.suite,
  acknowledgements: [],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.atlasStatus === 'ready', null, {
    timeout: 60000,
  });
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.map-host')].some(
        (e) =>
          ['focusing', 'restoring'].includes(e.dataset.phase) ||
          e.dataset.terrainStatus === 'building',
      ),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(250);
}
async function shot(page, name) {
  const path = join(out, name + '.png');
  await page.screenshot({ path, animations: 'disabled' });
  result.screenshots.push(path);
}
async function navigate(page, name) {
  await page.locator('.concept-tabs [data-page="' + name + '"]').click();
  await page.waitForFunction((name) => document.body.dataset.page === name, name);
  await ready(page);
}
async function captureBefore(context, key, theme) {
  const page = await context.newPage();
  await page.goto(before + '/united-states/california/unemployment');
  await ready(page);
  await shot(page, 'before-' + key + '-map');
  for (const [name, selector] of [
    ['compare', '.concept-tabs [data-page=compare]'],
    ['stats', '.concept-tabs [data-page=stats]'],
    ['blog', '.concept-tabs [data-page=blog]'],
    ['about', '#info-open'],
    ['support', '#support-open'],
  ]) {
    await page.locator(selector).click();
    await page.waitForTimeout(400);
    await ready(page);
    await shot(page, 'before-' + key + '-' + name);
    if (name === 'about' || name === 'support') {
      await page.locator('#reading-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
      await shot(page, 'before-' + key + '-' + name + '-footer');
    }
  }
  await page.locator('[data-open-milestone]').click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'before-' + key + '-milestone');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.app-dialog-backdrop', { state: 'detached' });
  await page.locator('#reading-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.locator('[data-open-report]').last().click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'before-' + key + '-report');
  await page.close();
}
async function reportStates(page, key) {
  const description = 'Synthetic browser check: the legend overlaps the source button.',
    contact = 'browser-check@example.test';
  await page.locator('#bug-report-description').fill(description);
  await page.locator('#bug-report-contact').fill(contact);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.app-dialog-backdrop', { state: 'detached' });
  await page.locator('[data-open-report]').last().click();
  assert.equal(
    await page.locator('#bug-report-description').inputValue(),
    description,
    'Closing retains the draft',
  );
  await page.evaluate(() => history.back());
  await page.waitForSelector('.app-dialog-backdrop', { state: 'detached' });
  await page.evaluate(() => history.forward());
  await page.getByRole('dialog').waitFor();
  assert.equal(
    await page.locator('#bug-report-description').inputValue(),
    description,
    'History restores the same report draft',
  );
  const api = '**/api/bug-reports';
  async function failure(status, body, expected) {
    await page.route(api, (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      }),
    );
    await page.locator('#bug-report-form [type=submit]').click();
    await page.waitForFunction(
      () => document.querySelector('#bug-report-status')?.dataset.state === 'error',
    );
    assert.match(await page.locator('#bug-report-status').innerText(), expected);
    assert.equal(await page.locator('#bug-report-description').inputValue(), description);
    assert.equal(await page.locator('#bug-report-description').evaluate((e) => e.readOnly), false);
    await shot(page, 'after-' + key + '-report-' + status);
    await page.unroute(api);
  }
  await failure(503, { error: 'Report storage is unavailable. Please retry.' }, /retry/);
  await failure(429, { error: 'Too many reports. Please try again later.' }, /Too many/);
  await failure(200, { saved: true, id: 'not-a-durable-ack' }, /did not confirm/);
  await page.route(api, (route) => route.abort('failed'));
  await page.locator('#bug-report-form [type=submit]').click();
  await page.waitForFunction(
    () => document.querySelector('#bug-report-status')?.dataset.state === 'error',
  );
  assert.match(await page.locator('#bug-report-status').innerText(), /could not reach/);
  await page.unroute(api);
  let release;
  const pending = new Promise((resolve) => (release = resolve));
  await page.route(api, async (route) => {
    await pending;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Synthetic delayed storage failure. Please retry.',
      }),
    });
  });
  await page.locator('#bug-report-form [type=submit]').click();
  await page.waitForFunction(
    () => document.querySelector('#bug-report-status')?.dataset.state === 'sending',
  );
  assert.equal(await page.locator('#bug-report-description').evaluate((e) => e.readOnly), true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.app-dialog-backdrop', { state: 'detached' });
  await page.locator('[data-open-report]').last().click();
  assert.equal(
    await page.locator('#bug-report-form [type=submit]').isDisabled(),
    true,
    'Reopening does not create a duplicate in-flight POST',
  );
  release();
  await page.waitForFunction(
    () => document.querySelector('#bug-report-status')?.dataset.state === 'error',
  );
  await page.unroute(api);
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/bug-reports') && response.request().method() === 'POST',
  );
  await page.locator('#bug-report-form [type=submit]').click();
  const saved = await response;
  assert.equal(saved.status(), 201, 'Actual private endpoint confirms durable test storage');
  const acknowledgement = await saved.json();
  assert.equal(acknowledgement.saved, true);
  assert.match(
    acknowledgement.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    'The saved acknowledgement identifies an exact UUIDv4 report',
  );
  reportAcknowledgements.acknowledgements.push({ id: acknowledgement.id, testCase: key });
  // Preserve exact synthetic IDs for private cleanup even if later UI assertions fail.
  const sidecar = join(out, 'acknowledged-report-ids.json');
  await writeFile(sidecar + '.tmp', JSON.stringify(reportAcknowledgements, null, 2) + '\n');
  await rename(sidecar + '.tmp', sidecar);
  await page.waitForFunction(
    () => document.querySelector('#bug-report-status')?.dataset.state === 'success',
  );
  assert.equal(await page.locator('#bug-report-description').evaluate((e) => e.readOnly), true);
  assert.equal(await page.locator('#bug-report-form [type=submit]').isDisabled(), true);
  await shot(page, 'after-' + key + '-report-success');
}
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 1440, height: 900 },
    { width: 1440, height: 640 },
  ])
    for (const theme of ['light', 'dark']) {
      const key = `${viewport.width}x${viewport.height}-${theme}`,
        context = await browser.newContext({
          viewport,
          reducedMotion: 'reduce',
        }),
        errors = [];
      await context.addInitScript((theme) => {
        localStorage.setItem('usa-atlas-theme', theme);
        Math.random = () => 0.42;
      }, theme);
      try {
        if (before) await captureBefore(context, key, theme);
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error' && !message.location().url.includes('/api/bug-reports'))
            errors.push(message.text());
        });
        await page.goto(base + '/united-states/california/unemployment');
        await ready(page);
        await page.evaluate(() => {
          window.__reactLifecycle = {
            host: document.querySelector('#map-a'),
            canvas: document.querySelector('#map-a canvas'),
            handle: document.querySelector('#explore-panel>.sheet-handle'),
            scroll: document.querySelector('#explore-panel-content'),
            credit: document.querySelector('.osm-attribution'),
          };
        });
        await shot(page, 'after-' + key + '-map');
        if (viewport.width <= 760) {
          const grip = page.locator('#explore-panel>.sheet-handle');
          await grip.focus();
          await page.keyboard.press('Home');
          await page.keyboard.press('Escape');
          await page.waitForFunction(
            () => document.querySelector('#explore-panel')?.dataset.snap === 'half',
          );
          await grip.focus();
          await page.keyboard.press('End');
          const summary = await page.locator('.mobile-indicator-summary').boundingBox();
          assert.ok(summary, 'The compact summary remains reachable');
          await page.mouse.move(summary.x + summary.width / 2, summary.y + summary.height / 2);
          await page.mouse.down();
          await page.mouse.move(summary.x + summary.width / 2, summary.y - 90, { steps: 8 });
          await page.mouse.up();
          assert.equal(
            await page.locator('#metric-library').isVisible(),
            false,
            'Dragging the summary suppresses its chooser click',
          );
          assert.equal(
            await page.locator('#explore-panel').getAttribute('data-user-position'),
            'true',
          );
        }

        await navigate(page, 'compare');
        await shot(page, 'after-' + key + '-compare');
        await navigate(page, 'stats');
        assert.match(
          await page.locator('#reading-page').innerText(),
          /A dash means unavailable, not zero/,
        );
        await shot(page, 'after-' + key + '-stats');
        await navigate(page, 'blog');
        await shot(page, 'after-' + key + '-blog');
        assert.equal(
          await page
            .locator('.reading-content:not([style*=none]) > h1')
            .evaluate((e) => getComputedStyle(e).maxWidth),
          'none',
          'Cached reading content retains the approved Blog heading geometry',
        );
        await page.locator('#info-open').click();
        await page.locator('#about-main').waitFor();
        await shot(page, 'after-' + key + '-about');
        assert.match(await page.locator('#about-main h1').innerText(), /A more visual way/);
        assert.deepEqual(
          await page.locator('#about-main').evaluate((e) => ({
            display: getComputedStyle(e).display,
            direction: getComputedStyle(e).flexDirection,
            gap: getComputedStyle(e).gap,
          })),
          {
            display: 'flex',
            direction: 'column',
            gap: viewport.width <= 760 ? '32px' : '48px',
          },
        );
        await page.locator('#reading-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
        await shot(page, 'after-' + key + '-about-footer');
        await page.locator('#support-open').click();
        await page.locator('#support-main').waitFor();
        await shot(page, 'after-' + key + '-support');
        if (baseline) {
          assert.equal(await page.locator('.support-method--unavailable').count(), 3,
            'Pinned rollback runtime retains its three unconfigured support methods');
          assert.equal(await page.locator('[data-open-crypto]').count(), 0);
        } else {
          assert.equal(await page.locator('.support-method--unavailable').count(), 0);
          assert.equal(await page.locator('[data-open-crypto]').count(), 1);
          assert.equal(await page.getByRole('button', {name: /Cryptocurrency/}).count(), 1);
          const cryptoTrigger = page.locator('[data-open-crypto]');
          await cryptoTrigger.click();
          const cryptoDialog = page.locator('.app-dialog-panel--crypto[role=dialog]');
          await cryptoDialog.waitFor();
          await page.waitForFunction(() => {
            const logos = [...document.querySelectorAll('.crypto-network-logo')];
            return logos.length === 6 && logos.every((image) => image.complete && image.naturalWidth > 0);
          });
          const cryptoLogos = await page.locator('.crypto-network-logo').evaluateAll((images) =>
            images.map((image) => {
              const rect = image.getBoundingClientRect(), style = getComputedStyle(image);
              return {
                src: new URL(image.src).pathname,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                width: rect.width,
                height: rect.height,
                filter: style.filter,
              };
            }),
          );
          assert.equal(cryptoLogos.length, supportWallets.length);
          for (const [index, wallet] of supportWallets.entries()) {
            const file = wallet.id === 'bnb-chain' ? 'bnbchain' : wallet.id;
            assert.equal(cryptoLogos[index].src, `/ux/assets/support/networks/${file}.svg`,
              `${wallet.network} loads its configured logo`);
            assert.ok(cryptoLogos[index].naturalWidth > 0 && cryptoLogos[index].naturalHeight > 0,
              `${wallet.network} image decoded`);
            assert.equal(cryptoLogos[index].width, 30, `${wallet.network} logo width`);
            assert.equal(cryptoLogos[index].height, 30, `${wallet.network} logo height`);
            assert.equal(cryptoLogos[index].filter, theme === 'dark' ? 'invert(1)' : 'none',
              `${wallet.network} theme treatment`);
          }
          await shot(page, `after-${key}-crypto-chooser`);
          await page.keyboard.press('Escape');
          await page.waitForSelector('.app-dialog-backdrop', { state: 'detached' });
          assert.equal(await cryptoTrigger.evaluate((element) => element === document.activeElement), true,
            'Closing the crypto chooser restores trigger focus');
        }
        await page.locator('#reading-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
        await shot(page, 'after-' + key + '-support-footer');
        await page.locator('[data-open-milestone]').click();
        await page.getByRole('dialog').waitFor();
        await shot(page, 'after-' + key + '-milestone');
        const milestoneText = await page.getByRole('dialog').innerText();
        const milestoneTitles = baseline || isPinnedMilestoneRollback(uiProfile.identity)
          ? [
              '10 new indicators',
              'An AI assistant for the map',
              'Clearer sources & methodology',
            ]
          : [
              'iOS and Android apps',
              'An AI assistant for exploring the map',
              'Composite categories for places',
              'More detailed crime levels',
            ];
        for (const title of milestoneTitles) {
          assert.ok(milestoneText.includes(title), `Milestone dialog includes ${title}`);
        }
        assert.equal(await page.locator('#atlas-root').evaluate((e) => e.inert), true);
        await page.keyboard.press('Escape');
        await page.waitForSelector('.app-dialog-backdrop', {
          state: 'detached',
        });
        assert.equal(
          await page.locator('[data-open-milestone]').evaluate((e) => e === document.activeElement),
          true,
          'Closing restores the trigger focus',
        );
        await page.locator('#reading-page').evaluate((e) => (e.scrollTop = e.scrollHeight));
        await page.locator('[data-open-report]').last().click();
        await page.getByRole('dialog').waitFor();
        assert.equal(
          await page
            .locator('#bug-report-description')
            .evaluate((e) => e === document.activeElement),
          true,
        );
        assert.equal(
          await page.locator('#bug-report-form [name=website]').getAttribute('tabindex'),
          '-1',
        );
        await shot(page, 'after-' + key + '-report');
        if (viewport.width === 390) await reportStates(page, key);
        await page.keyboard.press('Escape');
        await page.waitForSelector('.app-dialog-backdrop', {
          state: 'detached',
        });
        await page.locator('#info-open').click();
        await page.locator('#about-main').waitFor();
        await page.locator('[data-open-info=methodology]').first().click();
        if (baseline) {
          await page.locator('#info-methodology').waitFor();
          assert.equal(await page.locator('#info-methodology').isVisible(), true,
            'Pinned rollback runtime retains its legacy methodology destination');
        } else {
          await page.locator('#methodology-title').waitFor();
          await page.waitForFunction(() => document.activeElement?.id === 'methodology-title');
          assert.equal(await page.locator('#methodology-title').isVisible(), true);
          assert.ok(await page.locator('#reading-page').evaluate((element) => element.scrollTop > 0));
          assert.equal(await page.locator('#info-methodology').isVisible(), false, 'legacy methodology view stays closed for the About link');
        }
        await page.locator('#theme-toggle').click();
        await page.waitForFunction((current) => document.body.dataset.theme !== current, theme);
        await page.locator('#theme-toggle').click();
        await navigate(page, 'map');
        const identity = await page.evaluate(() =>
          Object.fromEntries(
            Object.entries(window.__reactLifecycle).map(([key, node]) => [
              key,
              node.isConnected &&
                node ===
                  (key === 'host'
                    ? document.querySelector('#map-a')
                    : key === 'canvas'
                      ? document.querySelector('#map-a canvas')
                      : key === 'handle'
                        ? document.querySelector('#explore-panel>.sheet-handle')
                        : key === 'scroll'
                          ? document.querySelector('#explore-panel-content')
                          : document.querySelector('.osm-attribution')),
            ]),
          ),
        );
        assert.deepEqual(
          identity,
          {
            host: true,
            canvas: true,
            handle: true,
            scroll: true,
            credit: true,
          },
          'Navigation/theme updates preserve map, grip, scroll viewport and credit identity',
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.deepEqual(errors, [], 'No unexpected page/console errors');
        result.checks.push({
          name: key,
          status: 'pass',
          lifecycle: identity,
          reportStates:
            viewport.width === 390
              ? 'real private success; simulated 503/429/invalid-ack/network/pending-close-reopen'
              : 'dialog/focus only',
        });
        await page.close();
      } catch (error) {
        result.failures.push({
          name: key,
          message: error.stack || String(error),
        });
        for (const page of context.pages()) await shot(page, 'failed-' + key).catch(() => {});
      } finally {
        await context.close();
      }
    }
  const embedded = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  try {
    await embedded.addInitScript(() => localStorage.setItem('usa-atlas-theme', 'dark'));
    await embedded.goto(base + '/united-states/california/unemployment?embed=1&theme=dark');
    await ready(embedded);
    const geometry = await embedded.locator('#map-a').boundingBox();
    assert.ok(
      geometry && geometry.width === 390 && geometry.height === 844,
      'Embedded geography fills the available viewport',
    );
    assert.equal(await embedded.locator('.app-header').isVisible(), false);
    await embedded.evaluate(() =>
      window.postMessage({ type: 'atlas-embed-theme', theme: 'light' }, location.origin),
    );
    await embedded.waitForFunction(() => document.body.dataset.theme === 'light');
    assert.equal(
      await embedded.evaluate(() => localStorage.getItem('usa-atlas-theme')),
      'dark',
      'A parent-frame theme message does not overwrite the saved global preference',
    );
    await shot(embedded, 'after-embedded-map-light');
    result.additionalChecks.push({
      name: 'embedded-map-and-theme-isolation',
      status: 'pass',
    });
  } catch (error) {
    result.failures.push({
      name: 'embedded-map-and-theme-isolation',
      message: error.stack || String(error),
    });
  } finally {
    await embedded.close();
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
    `PASS: React UI ${result.checks.length}/8 viewport/theme cases; persistent map/sheet lifecycle, Support/About, modal focus/history and report states; evidence ${out}`,
  );
