import { Segmented } from './components';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import projectContent from '../project-content.json';
import { normalizeSupportData } from '../support-data.js';
import { Methodology } from './methodology';
const creator = projectContent.project.creator;
const linkedin =
  creator.profileLinks.find((link) => link.id === 'linkedin')?.url ||
  'https://www.linkedin.com/in/dmitrii-rybkin-157594425/';
const supportData = normalizeSupportData(projectContent.support);
const goal = supportData.goal.goal;
const milestoneItems = goal?.improvements || [];
const wallets = supportData.donationMethods.wallets;
const target = goal?.targetUsd;
const targetText = Number.isFinite(target)
  ? new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(target)
  : null;
export function AboutPage() {
  return (
    <div id="about-main" className="about-page">
      {'\n    '}
      <header className="about-hero">
        {'\n      '}
        <div className="about-hero-title">
          <p className="page-eyebrow">{'ABOUT USA X-RAY'}</p>
          <h1>
            {'A more visual way'}
            <br />
            {'to understand a place.'}
          </h1>
        </div>
        {'\n      '}
        <p className="about-hero-copy">
          {
            'An independent project making U.S. public statistics easier to explore — one place, one pattern and one question at a time.'
          }
        </p>
        {'\n    '}
      </header>
      {'\n    '}
      <section className="about-creator" aria-label="About the creator">
        {'\n      '}
        <div
          className="creator-portrait"
          role="img"
          aria-label="Portrait of Dmitrii Rybkin"
        >
          <img src="assets/creator-portrait.jpg" alt="" />
        </div>
        {'\n      '}
        <div className="creator-profile">
          {'\n        '}
          <div className="creator-identity">
            <h2>{'Hi, I’m Dmitrii.'}</h2>
            <p>
              {'Dmitrii Rybkin · Full-Stack Engineer'}
              <br />
              {'6 years across design, software development & end-to-end product delivery'}
            </p>
          </div>
          {'\n        '}
          <p className="creator-story-primary">
            {
              'This is an independent project that I build and maintain myself. I work on the data pipelines, application, visualizations, and the small details that make exploring the map feel intuitive.'
            }
          </p>
          {'\n        '}
          <p className="creator-story-secondary">
            {
              'I believe public statistics should be easier to understand — whether you’re a student, researcher, journalist, or simply curious about a place.'
            }
          </p>
          {'\n        '}
          <a className="creator-link" href={linkedin} target="_blank" rel="noopener noreferrer">
            {'Connect on LinkedIn '}
            <span aria-hidden="true">{'↗'}</span>
          </a>
          {'\n      '}
        </div>
        {'\n    '}
      </section>
      {'\n    '}
      <section className="about-story-row about-story-row--why">
        <h2>{'Why I built it'}</h2>
        <div className="about-story-copy about-story-copy--why">
          <p className="about-why-primary">
            {
              'I’ve always loved geography, maps, and statistics. There’s something fascinating about discovering how places differ and finding patterns you might never notice at first glance.'
            }
          </p>
          <p className="about-why-detail">
            {
              'The United States has an enormous amount of public data — jobs, income, housing, education, health, demographics and more. But finding the data and actually exploring it are two different things. Information is often spread across spreadsheets, reports, databases and websites.'
            }
          </p>
          <p className="about-why-conclusion">
            {
              'I wanted a simpler way to see it all: open a map, choose an indicator, click a place, and start comparing. That’s why I built USA X-Ray.'
            }
          </p>
        </div>
      </section>
      {'\n    '}
      <section className="about-story-row">
        <h2>
          {'Where the data'}
          <br />
          {'comes from'}
        </h2>
        <div className="about-story-copy about-copy-single">
          <p>
            {
              'USA X-Ray brings together publicly available data from sources such as the U.S. Census Bureau, the Bureau of Labor Statistics, and other public agencies. The original sources, observation periods and definitions matter, so I try to keep them visible and easy to check.'
            }
          </p>
          <button className="text-action" type="button" data-open-info="methodology">
            {'Data & Methodology '}
            <span aria-hidden="true">{'→'}</span>
          </button>
        </div>
      </section>
      {'\n    '}
      <Methodology />
      {'\n    '}
      <section className="about-story-row about-connect">
        <h2>{'Let’s connect'}</h2>
        <div className="about-story-copy about-copy-single">
          <p>
            {
              'Have an idea, spotted an issue, or want to suggest a new dataset? I’d love to hear from you. I also work on full-stack software, interactive data products and automation, and I’m open to collaborating on a project.'
            }
          </p>
          <div className="about-link-list">
            <a href={linkedin} target="_blank" rel="noopener noreferrer">
              {'Work with me on LinkedIn ↗'}
            </a>
            <button className="text-action" type="button" data-open-report="">
              {'Report a data issue →'}
            </button>
          </div>
        </div>
      </section>
      {'\n    '}
      <section className="about-support-callout">
        <div>
          <h2>
            {'Like the idea behind'}
            <span className="about-desktop-space"> </span>
            <br className="about-mobile-break" />
            <span className="about-callout-product">{'USA X-Ray?'}</span>
          </h2>
          <p>{'There are a few ways to help this independent project grow.'}</p>
        </div>
        <a className="about-support-button" href="/support" data-page="support">
          {'Support USA X-Ray '}
          <span aria-hidden="true">{'→'}</span>
        </a>
      </section>
      {'\n    '}
      <footer className="about-footer">
        <span>{'Built and maintained by Dmitrii'}</span>
        <div>
          <button type="button" data-open-info="methodology">
            {'Data & Methodology'}
          </button>
          <span aria-hidden="true">{'·'}</span>
          <button type="button" data-open-report="">
            {'Report an issue'}
          </button>
          <span aria-hidden="true">{'·'}</span>
          <a href="/support" data-page="support">
            {'Support'}
          </a>
        </div>
      </footer>
      {'\n  '}
    </div>
  );
}
export function DataMethodology({
  sourceRows,
  libraryRows,
  appearanceControl,
  visible = false,
  tab = 'methodology',
}: {
  sourceRows: ReactNode;
  libraryRows: ReactNode;
  appearanceControl?: ReactNode;
  visible?: boolean;
  tab?: string;
}) {
  return (
    <section id="info-legacy" className="legacy-info" hidden={!visible}>
      {'\n    '}
      <button className="legacy-back" type="button" id="about-legacy-back">
        {'← About'}
      </button>
      {'\n    '}
      <h1>{'Data & Methodology'}</h1>
      <p className="page-intro">{'How mapped values are sourced, retained and displayed.'}</p>
      {'\n    '}
      <Segmented className="info-tabs" role="tablist" aria-label="Data information">
        <button type="button" data-info="sources" aria-pressed={tab === 'sources'}>
          {'Sources'}
        </button>
        <button type="button" data-info="methodology" aria-pressed={tab === 'methodology'}>
          {'Methodology'}
        </button>
        <button type="button" data-info="data" aria-pressed={tab === 'data'}>
          {'Data library'}
        </button>
      </Segmented>
      {'\n    '}
      <div id="info-content">
        {'\n      '}
        <section
          id="info-sources"
          className="info-section"
          role="tabpanel"
          hidden={tab !== 'sources'}
        >
          <h2>{'Sources'}</h2>
          <ul id="info-sources-list" className="source-list">
            {sourceRows}
          </ul>
          <p>
            {
              'Open Sources beside a map or indicator for its specific definition, period, attribution and limitations.'
            }
          </p>
          <button className="outline-button" id="info-map-sources" type="button">
            {'Map geometry sources →'}
          </button>
        </section>
        {'\n      '}
        <section
          id="info-methodology"
          className="info-section"
          role="tabpanel"
          hidden={tab !== 'methodology'}
        >
          <h2>{'Original values, exact geography'}</h2>
          <p>
            {
              'Only admitted observations are read. County joins use exact Census 2017 FIPS. The interface never allocates state, ZIP, monitor, tract or block-group observations to counties. Admitted county series retain the source methodology. Each series uses one latest period and release.'
            }
          </p>
          <p>
            {
              'Colour is continuous from the lowest to the highest mapped value. Money and population use a logarithmic scale so that both small and large places stay readable, other values use a linear scale, and the cost-of-living index keeps a diverging 85–100–115 scale. 3D height is linear between the same minimum and maximum. The legend states the same range as the map paints. Relief is a visual scale, not an additional measurement.'
            }
          </p>
          <div className="info-appearance">
            <h3>{'Appearance'}</h3>
            <p>{'Choose a light or dark theme.'}</p>
            {appearanceControl}
          </div>
        </section>
        {'\n      '}
        <section id="info-data" className="info-section" role="tabpanel" hidden={tab !== 'data'}>
          <h2>{'Data library'}</h2>
          <p>
            {
              'Loaded series that stay off the map until their period, unit or coverage is reviewed and promoted. They remain available for review here, with the reason they are not mapped.'
            }
          </p>
          <ul id="info-library-list" className="library-list">
            {libraryRows}
          </ul>
        </section>
        {'\n    '}
      </div>
      {'\n  '}
    </section>
  );
}
export function CryptoDonationDialog() {
  const [selectedId, setSelectedId] = useState(''),
    [copyStatus, setCopyStatus] = useState(''),
    selectedIdRef = useRef(selectedId),
    copyAttempt = useRef(0),
    lastSelectedId = useRef(wallets[0]?.id || ''),
    networkButtons = useRef<Record<string, HTMLButtonElement | null>>({}),
    backButton = useRef<HTMLButtonElement>(null),
    selected = wallets.find((wallet) => wallet.id === selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => () => { copyAttempt.current++; }, []);
  useLayoutEffect(() => {
    if (selected) backButton.current?.focus({ preventScroll: true });
    else networkButtons.current[lastSelectedId.current]?.focus({ preventScroll: true });
  }, [selectedId, selected]);
  const choose = (id: string) => {
    lastSelectedId.current = id;
    selectedIdRef.current = id;
    copyAttempt.current++;
    setSelectedId(id);
    setCopyStatus('');
  };
  const backToNetworks = () => {
    copyAttempt.current++;
    setSelectedId('');
    selectedIdRef.current = '';
    setCopyStatus('');
  };
  async function copyAddress() {
    if (!selected) return;
    const id = selected.id, address = selected.address, attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(address);
      if (selectedIdRef.current === id && copyAttempt.current === attempt)
        setCopyStatus('Address copied.');
    } catch {
      if (selectedIdRef.current === id && copyAttempt.current === attempt)
        setCopyStatus('Copy failed. Select and copy the address above.');
    }
  }
  return (
    <div className="app-dialog-panel app-dialog-panel--crypto" role="dialog" aria-modal="true" aria-labelledby="crypto-dialog-title" tabIndex={-1}>
      <header className="app-dialog-heading">
        <div><p className="page-eyebrow">SUPPORT USA X-RAY</p><h2 id="crypto-dialog-title">{selected ? selected.network : 'Choose a network'}</h2></div>
        <button className="app-dialog-close" type="button" data-close-dialog="" aria-label="Close cryptocurrency details">×</button>
      </header>
      {!selected ? <>
        <p className="crypto-dialog-instruction">Choose a network to see its receiving address.</p>
        <div className="crypto-network-grid" role="group" aria-label="Cryptocurrency networks">
          {wallets.map((wallet) => <button
            key={wallet.id}
            ref={(node) => { networkButtons.current[wallet.id] = node; }}
            id={wallet.id === wallets[0]?.id ? 'crypto-network-first' : undefined}
            className={`crypto-network-button crypto-network-button--${wallet.id}`}
            type="button"
            aria-label={`${wallet.network} (${wallet.asset})`}
            onClick={() => choose(wallet.id)}
          >
            <img
              className={`crypto-network-logo crypto-network-logo--${wallet.id}`}
              src={`/ux/assets/support/networks/${wallet.id === 'bnb-chain' ? 'bnbchain' : wallet.id}.svg`}
              alt=""
              aria-hidden="true"
            />
            <span>{wallet.network}</span>
            <small>{wallet.asset}</small>
          </button>)}
        </div>
      </> : <>
        <p className="crypto-dialog-instruction">Send only the selected coin or supported token on this network.</p>
        <div className="crypto-destination">
        <strong className="crypto-network-name">{selected.network} · {selected.asset}</strong>
        <img className="crypto-qr" src={selected.qrUrl} alt={`QR code for the ${selected.network} receiving address`} />
        <label className="crypto-address-label" htmlFor="crypto-address">Full receiving address</label>
        <code id="crypto-address" className="crypto-address">{selected.address}</code>
        <button className="secondary-button crypto-copy-button" type="button" onClick={() => void copyAddress()}>Copy address</button>
        <p className="crypto-copy-status" role="status" aria-live="polite">{copyStatus}</p>
        <button className="secondary-button crypto-back-button" type="button" ref={backButton} onClick={backToNetworks}>Back to networks</button>
      </div></>}
    </div>
  );
}

export function SupportPage() {
  const summaryTitles: Record<string, string> = {
    'map-assistant': 'An AI assistant for exploring the map',
  };
  const milestoneRows = milestoneItems.map((item) => (
    <li key={item.id}>
      {'• '}
      {summaryTitles[item.id] || item.title}
    </li>
  ));
  return (
    <div id="support-main" className="support-page">
      {'\n    '}
      <header className="support-hero">
        <p className="page-eyebrow">{'AN INDEPENDENT PROJECT · FREE TO EXPLORE'}</p>
        <h1>
          <span>{'Support'}</span> <span className="support-title-product">{'USA X-Ray.'}</span>
        </h1>
        <p>
          {
            'A small independent project, built and maintained by one person. Help me improve the maps and add new ways to explore.'
          }
        </p>
      </header>
      {'\n    '}
      <div className="support-columns">
        {'\n      '}
        <div className="support-primary-column">
          {'\n        '}
          <section className="support-founder" aria-label="About the creator">
            {'\n          '}
            <div
              className="support-portrait"
              role="img"
              aria-label="Portrait of Dmitrii Rybkin"
            >
              <img src="assets/creator-portrait.jpg" alt="" />
            </div>
            {'\n          '}
            <div className="support-founder-bio">
              {'\n            '}
              <div className="support-founder-contact">
                <h2 className="support-founder-identity">{'Hey, I’m Dmitrii.'}</h2>
                <div className="support-founder-meta">
                  <p>
                    {'Full-Stack Engineer · 6 years across design,'}
                    <br className="support-desktop-break" />
                    {' development and end-to-end product delivery'}
                  </p>
                </div>
              </div>
              {'\n            '}
              <div className="support-founder-stories">
                <p>
                  {
                    'I’ve always enjoyed getting lost in maps and discovering unexpected things in data. USA X-Ray grew out of that curiosity: a simpler way to explore the United States.'
                  }
                </p>
                <p>
                  {
                    'I build and maintain the project myself. It has no monetization, and I pay for hosting and development. Your support gives me more room to improve the experience.'
                  }
                </p>
              </div>
              {'\n          '}
            </div>
            {'\n        '}
          </section>
          {'\n        '}
          <section
            className="support-methods"
            id="support-methods"
            aria-labelledby="support-methods-title"
            tabIndex={-1}
          >
            {'\n          '}
            <div className="support-methods-intro">
              <h2 id="support-methods-title">{'Let’s connect'}</h2>
              <p className="support-connect-desktop-copy">
                {
                  'I also work on full-stack software, interactive data products and automation. If you’d like to collaborate or support USA X-Ray, you’ll find the options here.'
                }
              </p>
              <p className="support-connect-mobile-copy">
                {
                  'I work on full-stack software, interactive data products and automation. You can collaborate with me or support USA X-Ray below.'
                }
              </p>
            </div>
            {'\n          '}
            <div className="support-method-list">
              {'\n            '}
              <a
                className="support-method"
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{'Work with me on LinkedIn'}</span>
                <span className="support-method-action">{'↗'}</span>
              </a>
              {'\n            '}
              <button className="support-method" type="button" data-open-crypto="">
                <span>{'Cryptocurrency'}</span>
                <span className="support-method-action" aria-hidden="true">{'→'}</span>
              </button>
              {'\n          '}
            </div>
            {'\n        '}
          </section>
          {'\n      '}
        </div>
        {'\n      '}
        <aside className="milestone-card" aria-labelledby="support-milestone-title">
          {'\n        '}
          <div className="milestone-goal">
            <p className="page-eyebrow">{'NEXT MILESTONE'}</p>
            <strong>{targetText || 'Goal not configured'}</strong>
            <span>{'Funding goal'}</span>
          </div>
          {'\n        '}
          <div className="milestone-details">
            <h2 id="support-milestone-title">{'Help build what’s next.'}</h2>
            <ul>{milestoneRows}</ul>
            <div className="milestone-actions">
              <button className="primary-button" type="button" data-support-methods="">
                {'Support this milestone '}
                <span aria-hidden="true">{'→'}</span>
              </button>
              <button className="secondary-button" type="button" data-open-milestone="">
                {'See the plan'}
              </button>
            </div>
          </div>
          {'\n      '}
        </aside>
        {'\n    '}
      </div>
      {'\n    '}
      <p className="support-thanks">
        {
          'You can also help by sharing the map, reporting an issue or suggesting a dataset. Thank you. — Dmitrii'
        }
      </p>
      {'\n    '}
      <footer className="support-footer">
        <span>{'Built and maintained by Dmitrii'}</span>
        <div>
          <a href="/about" data-page="info">
            {'About'}
          </a>
          <button type="button" data-open-info="methodology">
            {'Data & Methodology'}
          </button>
          <button type="button" data-open-report="">
            {'Report an issue'}
          </button>
        </div>
      </footer>
      {'\n  '}
    </div>
  );
}
export function MilestonePlan() {
  const title = targetText ? `A ${targetText} step forward.` : 'Next funding milestone';
  return (
    <div
      className="app-dialog-panel app-dialog-panel--milestone"
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-dialog-title"
      tabIndex={-1}
    >
      {'\n    '}
      <header className="app-dialog-heading">
        <div>
          <p className="page-eyebrow">
            <span className="milestone-dialog-eyebrow--desktop">{'NEXT FUNDING MILESTONE'}</span>
            <span className="milestone-dialog-eyebrow--mobile">
              {'NEXT MILESTONE · '}
              {targetText || ''}
            </span>
          </p>
          <h2 id="milestone-dialog-title">
            <span className="milestone-dialog-title--desktop">{title}</span>
            <span className="milestone-dialog-title--mobile">{"What's planned"}</span>
          </h2>
        </div>
        <button
          className="app-dialog-close"
          type="button"
          data-close-dialog=""
          aria-label="Close the milestone plan"
        >
          {'×'}
        </button>
      </header>
      {'\n    '}
      <p className="milestone-dialog-intro">
        {'Here’s the planned work for the next phase of USA X-Ray.'}
      </p>
      {'\n    '}
      <ul className="milestone-dialog-list">{milestoneRowsForDialog()}</ul>
      {'\n    '}
      <p className="milestone-dialog-note">
        {'Your contribution supports hosting and development toward this goal.'}
      </p>
      {'\n    '}
      <div className="milestone-dialog-actions">
        <button className="primary-button" type="button" data-dialog-support="">
          {'Support this milestone '}
          <span aria-hidden="true">{'→'}</span>
        </button>
        <button className="secondary-button" type="button" data-close-dialog="">
          {'Back to Support'}
        </button>
      </div>
      {'\n  '}
    </div>
  );
}
function milestoneRowsForDialog() {
  return milestoneItems.map((item) => (
    <li key={item.id}>
      <strong>{item.title}</strong>
      <span className="milestone-dialog-copy milestone-dialog-copy--desktop">
        {item.description}
      </span>
      <span className="milestone-dialog-copy milestone-dialog-copy--mobile">
        {(
          {
            'new-indicators': 'Ten new indicators, with sources, dates and coverage notes.',
            'map-assistant':
              'Ask about places and indicators, and get help exploring comparisons on the map.',
            'clearer-sources':
              'Clearer definitions, sources and missing values, plus an easier way to report issues.',
          } as Record<string, string>
        )[item.id] || item.description}
      </span>
    </li>
  ));
}
export { linkedin };
