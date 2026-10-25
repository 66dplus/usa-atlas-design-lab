import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const base = process.env.ATLAS_TEST_URL;
assert.ok(base, 'ATLAS_TEST_URL must identify the actual built runtime');
const output = process.env.ATLAS_TEST_OUTPUT || `/tmp/usa-atlas-http-seo-${Date.now()}`;
await mkdir(output, { recursive: true });
const checks = [];
async function get(path) {
  return fetch(base + path, { redirect: 'manual' });
}
for (const [source, destination] of [
  [
    '/ux/?place=06075&metric=unemployment&theme=dark&embed=1',
    '/united-states/california/san-francisco-county/unemployment?embed=1',
  ],
  ['/ux/?page=info&review=1', '/about?review=1'],
  [
    '/UNIted-states/California/Unemployment/?embed=1',
    '/united-states/california/unemployment?embed=1',
  ],
  [
    '/united-states/california-vs-texas/unemployment/',
    '/compare/places/unemployment/california/vs/texas',
  ],
  ['/united-states/unemployment/', '/united-states/unemployment'],
  [
    '/united-states/california/unemployment?theme=dark&review=1&preview=1',
    '/united-states/california/unemployment?review=1&preview=1',
  ],
]) {
  const r = await get(source);
  assert.equal(r.status, 301, source);
  assert.equal(r.headers.get('location'), destination);
  checks.push({ kind: 'redirect', source, destination });
}
for (const [path, noindex] of [
  ['/united-states/california/unemployment', false],
  ['/united-states/california/san-francisco-county/unemployment', false],
  ['/compare/places/unemployment/california/vs/texas', false],
  ['/about', false],
  ['/support', false],
  ['/stats', true],
  ['/blog', true],
  ['/blog/mississippi', true],
  ['/united-states/unemployment?embed=1', true],
]) {
  const r = await get(path);
  assert.equal(r.status, 200, path);
  const body = await r.text(),
    canonical = 'https://usa-xray.online' + path.split('?')[0];
  assert.ok(body.includes(`rel="canonical" href="${canonical}"`), path);
  assert.match(body, /<title>[^<]+USA X-Ray<\/title>/);
  assert.match(body, /<meta name="description" content="[^"]+"/);
  assert.ok(body.includes(`name="robots" content="${noindex ? 'noindex' : 'index'},follow"`), path);
  assert.match(body, /<script\b[^>]*type="application\/ld\+json"[^>]*>/);
  checks.push({ kind: 'server-metadata', path, noindex });
}
for (const path of [
  '/united-states/not-a-real-place/unemployment',
  '/unknown-react-route',
  '/api/bug-reports',
  '/ux/fixtures/after-support-preview.html',
  '/ux/fixtures/after-support-fixture.js',
  '/feedback/view-settings.json',
  '/private-reports/test.json',
]) {
  assert.equal((await get(path)).status, 404, path);
  checks.push({ kind: 'private-or-unknown-404', path });
}
const robots = await get('/robots.txt');
assert.equal(robots.status, 200);
assert.match(await robots.text(), /Sitemap: https:\/\/usa-xray\.online\/sitemap.xml/);
const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.status, 200);
const xml = await sitemap.text();
assert.equal((xml.match(/<loc>/g) || []).length, 57);
assert.ok(!xml.includes('/stats<') && !xml.includes('/blog<'));
checks.push({ kind: 'robots-and-sitemap', routes: 57 });
await writeFile(
  join(output, 'results.json'),
  JSON.stringify(
    { suite: 'built-http-seo-and-private-boundaries', status: 'pass', base, checks },
    null,
    2,
  ) + '\n',
);
console.log(
  `PASS: ${checks.length} actual HTTP SEO/private-boundary cases; server metadata without client execution; ${output}`,
);
