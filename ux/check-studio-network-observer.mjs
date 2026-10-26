import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright';
import { assertStudioPost } from './studio-request-contract.mjs';
import { enableCompleteRequestHeaders, observedMetadata, requiredMetadata } from './studio-network-observer.mjs';

// Real HTTP fixture. Values remain in memory; diagnostics contain phases/counts only.
const website = '11111111-1111-4111-8111-111111111111';
const received = [], timers = new Set(), checks = [];
let phase = 'server-start', browser, failed = false;
const server = http.createServer((request, response) => {
  if (request.url.startsWith('/api/analytics/config')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    if (request.url.endsWith('?cancel')) response.write('{');
    else response.end(request.url.endsWith('?invalid') ? '{' : JSON.stringify({ enabled: true, websiteId: website }));
    return;
  }
  if (request.method !== 'POST') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Synthetic network fixture</title>');
    return;
  }
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    received.push({ headers: request.headers, body: Buffer.concat(chunks).toString() });
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!response.destroyed) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{}');
      }
    }, 600);
    timers.add(timer);
  });
});

async function bounded(promise, milliseconds = 5000) {
  return (await requiredMetadata([observedMetadata(promise, phase, milliseconds)]))[0];
}
function approvedPayload() {
  return { type: 'event', payload: { website, screen: '390x844', language: 'en',
    title: 'USA X-Ray', hostname: '127.0.0.1', url: '/ux/', referrer: '' } };
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  phase = 'chrome-launch';
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const kind of ['anonymous', 'reload-keepalive', 'abort', 'cookie', 'authorization', 'private-payload', 'unknown-post']) {
    phase = kind;
    const context = await browser.newContext(), posts = [];
    try {
      if (kind === 'cookie')
        await context.addCookies([{ name: 'synthetic-fixture', value: 'fixture-only', url: base }]);
      await enableCompleteRequestHeaders(context);
      const page = await context.newPage();
      page.on('request', request => {
        if (request.method() === 'POST')
          posts.push(observedMetadata(request.allHeaders().then(headers => ({
            url: request.url(), method: request.method(), headers, body: request.postData(),
          })), 'POST full request headers'));
      });
      await page.goto(base);
      const payload = approvedPayload(), count = received.length;
      if (kind === 'private-payload') payload.payload.contact = 'synthetic-fixture-only';
      await page.evaluate(({ payload, kind }) => {
        const controller = new AbortController();
        window.fixtureAbort = () => controller.abort();
        window.fixtureDone = fetch(kind === 'unknown-post' ? '/synthetic-unexpected' : '/analytics/api/send', {
          method: 'POST', headers: { 'content-type': 'application/json',
            ...(kind === 'authorization' ? { authorization: 'Bearer synthetic-fixture-only' } : {}) },
          body: JSON.stringify(payload), keepalive: kind === 'reload-keepalive', signal: controller.signal,
        }).catch(() => null);
      }, { payload, kind });
      await bounded((async () => {
        const deadline = performance.now() + 4000;
        while (received.length === count) {
          assert.ok(performance.now() < deadline, 'Synthetic HTTP request was not received');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      })());
      assert.equal(posts.length, 1);
      if (kind === 'reload-keepalive') await page.reload();
      else if (kind === 'abort') await page.evaluate(() => window.fixtureAbort());
      else await bounded(page.evaluate(() => window.fixtureDone));
      const [post] = await requiredMetadata(posts), actual = received[count];
      assert.equal(post.body, actual.body);
      for (const key of ['cookie', 'authorization', 'content-type'])
        assert.equal(post.headers[key], actual.headers[key]);
      if (kind === 'cookie') assert.ok(post.headers.cookie);
      if (kind === 'authorization') assert.ok(post.headers.authorization);
      if (['cookie', 'authorization', 'private-payload', 'unknown-post'].includes(kind))
        assert.throws(() => assertStudioPost(post, base, new Set([website])));
      else assertStudioPost(post, base, new Set([website]));
      checks.push(kind);
    } finally {
      await bounded(context.close());
    }
  }

  for (const mode of ['valid', 'invalid', 'cancel']) {
    phase = 'configuration-' + mode;
    const context = await browser.newContext();
    try {
      await enableCompleteRequestHeaders(context);
      const page = await context.newPage();
      await page.goto(base);
      const metadata = [], seen = page.waitForEvent('response', response => response.url().includes('/api/analytics/config'));
      page.on('response', response => {
        if (response.url().includes('/api/analytics/config'))
          metadata.push(observedMetadata(response.json(), 'public analytics configuration JSON', 1000));
      });
      await page.evaluate(mode => {
        const controller = new AbortController();
        window.fixtureAbort = () => controller.abort();
        void fetch('/api/analytics/config' + (mode === 'valid' ? '' : '?' + mode), { signal: controller.signal }).catch(() => {});
      }, mode);
      await bounded(seen);
      if (mode === 'cancel') await page.evaluate(() => window.fixtureAbort());
      if (mode === 'valid') assert.deepEqual(await requiredMetadata(metadata), [{ enabled: true, websiteId: website }]);
      else await assert.rejects(requiredMetadata(metadata), /Studio network metadata unavailable: public analytics configuration JSON/);
      checks.push(phase);
    } finally {
      await bounded(context.close());
    }
  }
  phase = 'unavailable-full-headers';
  const started = performance.now();
  await assert.rejects(requiredMetadata([observedMetadata(new Promise(() => {}), 'POST full request headers', 25)]),
    /Studio network metadata unavailable: POST full request headers/);
  assert.ok(performance.now() - started < 1000, 'Unavailable metadata must fail promptly');
  checks.push(phase);
} catch (error) {
  failed = true;
  // Do not print assertion values or browser errors containing request metadata.
  console.error(JSON.stringify({ suite: 'studio-network-observer', phase, errorType: error?.name, passed: checks.length }));
  process.exitCode = 1;
} finally {
  try {
    phase = 'chrome-close';
    if (browser) await bounded(browser.close());
  } finally {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
if (!failed) console.log(`PASS: studio metadata ${checks.length}/11 real HTTP/lifecycle/privacy/deadline checks; full headers agree with server; no values logged`);
