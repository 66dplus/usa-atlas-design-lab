import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { articles } from './journal.js';
import { readUiExpectationProfile } from './ui-expectation-profile.mjs';
const base = process.env.ATLAS_TEST_URL;
assert.ok(base, 'ATLAS_TEST_URL must identify the actual built runtime');
const uiProfile = await readUiExpectationProfile(base, process.env.ATLAS_CONFORMANCE_IMAGE_DIGEST);
const baseline = uiProfile.baseline;
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
  ['/blog', baseline],
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
if (!baseline) {
  const published = Object.entries(articles).filter(([, article]) => article.published === true);
  assert.equal(published.length, 13, 'Exactly 13 reviewed article routes are published');
  for (const [slug, article] of published) {
    const path = `/blog/${slug}`, response = await get(path);
    assert.equal(response.status, 200, path);
    const body = await response.text(), canonical = `https://usa-xray.online${path}`;
    assert.ok(body.includes(`<link rel="canonical" href="${canonical}">`), path);
    assert.ok(body.includes('name="robots" content="index,follow"'), path);
    const match = body.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    assert.ok(match, `${path} Article JSON-LD`);
    const schema = JSON.parse(match[1]);
    const expectedCover = `https://usa-xray.online${article.cover}`;
    assert.equal(schema['@type'], 'Article', `${path} schema type`);
    assert.equal(schema.mainEntityOfPage, canonical, `${path} canonical`);
    assert.equal(schema.headline, `${article.seoTitle || article.title} | USA X-Ray`);
    assert.deepEqual(schema.image, [expectedCover], `${path} Article JSON-LD cover URL`);
    assert.ok(body.includes(`<meta property="og:image" content="${expectedCover}">`), `${path} Open Graph cover URL`);
    const coverPath = new URL(schema.image[0]).pathname, cover = await get(coverPath);
    assert.equal(cover.status, 200, `${path} cover`);
    assert.match(cover.headers.get('content-type') || '', /^image\/webp/i, `${path} cover content type`);
    checks.push({ kind: 'published-article', path, cover: coverPath });
  }
  const blogResponse = await get('/blog'), blogBody = await blogResponse.text();
  const blogSchema = blogBody.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
  assert.ok(blogSchema, 'Blog index JSON-LD');
  assert.equal(JSON.parse(blogSchema[1])['@type'], 'Blog', 'Blog index schema type');
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
const sitemapRoutes = baseline ? 57 : 71;
assert.equal((xml.match(/<loc>/g) || []).length, sitemapRoutes);
assert.ok(!xml.includes('/stats<'));
if (baseline) {
  assert.ok(!xml.includes('/blog<') && !xml.includes('/blog/'));
} else {
  assert.ok(xml.includes('<loc>https://usa-xray.online/blog</loc>'));
  const articlePaths = [...xml.matchAll(/<loc>https:\/\/usa-xray\.online(\/blog\/[^<]+)<\/loc>/g)]
    .map((match) => match[1]).sort();
  assert.deepEqual(articlePaths, Object.keys(articles)
    .filter((slug) => articles[slug].published === true)
    .map((slug) => `/blog/${slug}`).sort());
}
checks.push({ kind: 'robots-and-sitemap', routes: sitemapRoutes, profile: uiProfile.profile });
await writeFile(
  join(output, 'results.json'),
  JSON.stringify(
    { suite: 'built-http-seo-and-private-boundaries', status: 'pass', base,
      profile: uiProfile.profile, identity: uiProfile.identity, checks },
    null,
    2,
  ) + '\n',
);
console.log(
  `PASS: ${checks.length} actual HTTP SEO/private-boundary cases; server metadata without client execution; ${output}`,
);
