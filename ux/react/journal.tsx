import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { animateReplacement } from '../motion.js';
import { articles } from '../journal.js';
import { ArticleMap } from './article-map';
import type { Atlas } from './use-atlas';

type JournalArticle = {
  published?: boolean;
  title: string;
  seoTitle?: string;
  description: string;
  deck?: string;
  body?: string;
  cover?: string;
  coverSmall?: string;
  coverAlt?: string;
  map?: { metric: string; place: string; second?: string | null; caption: string };
};
const articleData = articles as Record<string, JournalArticle>;
export const publishedArticles = Object.entries(articleData).filter(([, article]) => article.published);
export const features = publishedArticles;
export const articleExists = (slug: string) => !!articleData[slug]?.published;
export const hasPublishedArticles = publishedArticles.length > 0;
export function articleMetadata(slug: string) {
  const article = articleData[slug];
  return article
    ? {
        title: article.seoTitle || article.title,
        description: article.description,
        draft: !article.published,
        cover: article.cover,
      }
    : null;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/[^)\s]+|\/[^)\s]+)\))/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)$/);
      if (link) parts.push(<a key={index} href={link[2]} target={link[2].startsWith('http') ? '_blank' : undefined} rel={link[2].startsWith('http') ? 'noreferrer' : undefined}>{link[1]}</a>);
      else parts.push(token);
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
function tableRows(block: string): string[][] {
  return block.split('\n').filter(Boolean).map((line) =>
    line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()),
  ).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
}
function ArticleBody({ body, householdMap }: { body: string; householdMap?: ReactNode }) {
  return <>
    {body.split(/\n\n+/).map((block, index) => {
      if (block.trim() === '<!-- article-map:household-income -->') return <div key={index}>{householdMap}</div>;
      if (block.startsWith('## ')) return <h2 key={index}>{inline(block.slice(3))}</h2>;
      if (block.startsWith('|')) {
        const [header, ...rows] = tableRows(block);
        return <div className="article-table-scroll" role="region" aria-label={header.join(', ')} tabIndex={0} key={index}>
          <table><thead><tr>{header.map((cell, i) => <th scope="col" key={i}>{inline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>;
      }
      if (/^(?:[-*] |\d+\. )/.test(block)) {
        const items = block.split('\n').map((line) => line.replace(/^(?:[-*] |\d+\. )/, ''));
        const List = /^\d+\. /.test(block.split('\n')[0]) ? 'ol' : 'ul';
        return <List key={index}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</List>;
      }
      return <p key={index}>{inline(block)}</p>;
    })}
  </>;
}
export function ArticlePage({ slug, atlas, active }: { slug: string; atlas: Atlas; active: boolean }) {
  const article = articleData[slug];
  if (!article?.published || !article.map || !article.body) return null;
  const map = (secondary = false) => (
    <ArticleMap
      key={secondary ? 'household-income' : 'primary'}
      atlas={atlas}
      active={active}
      title={secondary ? 'Median household income · Los Alamos County' : article.title}
      place={secondary ? '35028' : article.map!.place}
      second={secondary ? undefined : article.map!.second || undefined}
      metric={secondary ? 'median-household-income' : article.map!.metric}
      caption={secondary
        ? 'Los Alamos County, New Mexico · median household income · ACS 2020–2024 · 2024 dollars per household.'
        : article.map!.caption}
    />
  );
  return <>
    <button className="article-back" data-page="blog">{'← Journal'}</button>
    <article className="journal-article" data-article={slug}>
      <header className="article-hero">
        <p className="article-eyebrow">{'THE JOURNAL'}</p>
        <h1>{article.title}</h1>
        {article.deck && <p className="article-deck">{article.deck}</p>}
        {map()}
      </header>
      <div className="article-body">
        <ArticleBody body={article.body} householdMap={slug === 'los-alamos-doctorates-and-income' ? map(true) : undefined} />
        <nav className="article-example-links" aria-label="More journal stories"><a href="/blog" data-page="blog">{'Browse all stories →'}</a></nav>
      </div>
    </article>
  </>;
}

function Cover({ slug, article, first }: { slug: string; article: JournalArticle; first: boolean }) {
  return <a className="journal-preview-link" href={`/blog/${slug}`} data-page="article" data-article={slug} aria-label={`Read: ${article.title}`}>
    <picture>
      <source srcSet={article.coverSmall} media="(max-width: 640px)" />
      <img className="journal-card-map" src={article.cover} alt={article.coverAlt || article.title}
        width="640" height="320" loading={first ? 'eager' : 'lazy'} decoding="async"
        fetchPriority={first ? 'high' : 'auto'} />
    </picture>
  </a>;
}
export function JournalPage() {
  const grid = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (grid.current) animateReplacement(grid.current, () => {});
  }, []);
  return <>
    <p className="page-eyebrow">{'The USA X-Ray journal'}</p>
    <h1>{'Look closer. See the whole picture.'}</h1>
    <p className="page-intro">{'Thoughtful stories about the numbers and places behind the map.'}</p>
    <h2 className="more-heading">{'All stories'}</h2>
    <section ref={grid} className="journal-cards" aria-label="Published journal stories">
      {publishedArticles.map(([slug, article], index) => <article key={slug}>
        <Cover slug={slug} article={article} first={index === 0} />
        <p className="page-eyebrow">{'DATA & PLACE'}</p>
        <h3><a href={`/blog/${slug}`} data-page="article" data-article={slug}>{article.title}</a></h3>
        <p>{article.deck || article.description}</p>
        <a href={`/blog/${slug}`} data-page="article" data-article={slug}>{'Read story →'}</a>
      </article>)}
    </section>
  </>;
}
