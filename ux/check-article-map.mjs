import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { articles } from './journal.js';

const source = await readFile(new URL('./react/article-map.tsx', import.meta.url), 'utf8');
const builder = await readFile(new URL('../scripts/build_temporary_preview.py', import.meta.url), 'utf8');
const published = Object.entries(articles).filter(([, article]) => article.published);
assert.equal(published.length, 13, 'all 13 approved editorial articles remain published');
assert.ok(source.includes("const ARTICLE_UNEMPLOYMENT_SELECTION = { period: { type: 'annual' as const, year: 2025 as const } }"));
assert.match(source, /store\.get\(mapMetric, selection\)/);
assert.match(source, /store\.load\(mapMetric, selection\)/);
assert.match(source, /data-domain=\{fixed \? 'fixed' : 'observed'\}/);
assert.match(source, /endpoints are not observed minimum and maximum/);
assert.match(source, /fixed \? high : `Max \$\{high\}`/, 'observed-domain legends preserve their Max label');
for (const [slug, article] of published) {
  assert.ok(article.map?.metric && article.map?.place && article.map?.caption, `${slug}: article map placement`);
  for (const cover of [article.cover, article.coverSmall]) {
    assert.ok(cover?.startsWith('/ux/assets/articles/'), `${slug}: local cover path`);
    await access(new URL(`..${cover}`, import.meta.url));
    assert.ok(builder.includes('editorial-20261026') && builder.includes(slug), `${slug}: preview allowlist includes its editorial cover`);
  }
}
console.log(`PASS: ${published.length} published article maps, exact annual unemployment selection, fixed-domain labeling, and all cover assets are packaged.`);
