import projectContent from './project-content.json' with {type: 'json'};
import {normalizeSupportData} from './support-data.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const creator=projectContent.project.creator;
const linkedin=creator.profileLinks.find(link=>link.id==='linkedin')?.url||'https://www.linkedin.com/in/dmitrii-rybkin-157594425/';
const supportData=normalizeSupportData(projectContent.support);
const goal=supportData.goal.goal;
const milestoneItems=goal?.improvements||[];
const externalLinks=supportData.donationMethods.externalLinks;
const wallets=supportData.donationMethods.wallets;
const findLink=(...ids)=>externalLinks.find(item=>ids.includes(item.id.toLowerCase())||ids.some(id=>item.label.toLowerCase().includes(id)));
const paymentLink=(label,destination)=>destination
  ?`<a class="support-method" href="${escapeHTML(destination.url)}" target="_blank" rel="noopener noreferrer"><span>${label}</span><span class="support-method-action">↗</span></a>`
  :`<div class="support-method support-method--unavailable"><span>${label}</span><span class="support-method-status">Not configured</span></div>`;
const cryptocurrency=wallets.length
  ?`<details class="support-wallets"><summary class="support-method"><span>Cryptocurrency</span><span class="support-method-action">View details</span></summary><div class="support-wallet-list">${wallets.map(wallet=>`<div><strong>${escapeHTML(wallet.asset)} · ${escapeHTML(wallet.network)}</strong><code>${escapeHTML(wallet.address)}</code></div>`).join('')}</div></details>`
  :paymentLink('Cryptocurrency',null);
const target=goal?.targetUsd;
const targetText=Number.isFinite(target)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(target):null;

export function aboutView(){
  return `<div id="about-main" class="about-page">
    <header class="about-hero">
      <div class="about-hero-title"><p class="page-eyebrow">ABOUT USA X-RAY</p><h1>A more visual way<br>to understand a place.</h1></div>
      <p class="about-hero-copy">An independent project making U.S. public statistics easier to explore — one place, one pattern and one question at a time.</p>
    </header>
    <section class="about-creator" aria-label="About the creator">
      <div class="creator-portrait" role="img" aria-label="Portrait placeholder for Dmitrii Rybkin"><strong>DR</strong><span>Portrait to be added</span></div>
      <div class="creator-profile">
        <div class="creator-identity"><h2>Hi, I’m Dmitrii.</h2><p>Dmitrii Rybkin · Full-Stack Engineer<br>6 years across design, software development &amp; end-to-end product delivery</p></div>
        <p class="creator-story-primary">This is an independent project that I build and maintain myself. I work on the data pipelines, application, visualizations, and the small details that make exploring the map feel intuitive.</p>
        <p class="creator-story-secondary">I believe public statistics should be easier to understand — whether you’re a student, researcher, journalist, or simply curious about a place.</p>
        <a class="creator-link" href="${escapeHTML(linkedin)}" target="_blank" rel="noopener noreferrer">Connect on LinkedIn <span aria-hidden="true">↗</span></a>
      </div>
    </section>
    <section class="about-story-row about-story-row--why"><h2>Why I built it</h2><div class="about-story-copy about-story-copy--why"><p class="about-why-primary">I’ve always loved geography, maps, and statistics. There’s something fascinating about discovering how places differ and finding patterns you might never notice at first glance.</p><p class="about-why-detail">The United States has an enormous amount of public data — jobs, income, housing, education, health, demographics and more. But finding the data and actually exploring it are two different things. Information is often spread across spreadsheets, reports, databases and websites.</p><p class="about-why-conclusion">I wanted a simpler way to see it all: open a map, choose an indicator, click a place, and start comparing. That’s why I built USA X-Ray.</p></div></section>
    <section class="about-story-row"><h2>Where the data<br>comes from</h2><div class="about-story-copy about-copy-single"><p>USA X-Ray brings together publicly available data from sources such as the U.S. Census Bureau, the Bureau of Labor Statistics, and other public agencies. The original sources, observation periods and definitions matter, so I try to keep them visible and easy to check.</p><button class="text-action" type="button" data-open-info="methodology">Data &amp; Methodology <span aria-hidden="true">→</span></button></div></section>
    <section class="about-story-row about-connect"><h2>Let’s connect</h2><div class="about-story-copy about-copy-single"><p>Have an idea, spotted an issue, or want to suggest a new dataset? I’d love to hear from you. I also work on full-stack software, interactive data products and automation, and I’m open to collaborating on a project.</p><div class="about-link-list"><a href="${escapeHTML(linkedin)}" target="_blank" rel="noopener noreferrer">Work with me on LinkedIn ↗</a><button class="text-action" type="button" data-open-report>Report a data issue →</button></div></div></section>
    <section class="about-support-callout"><div><h2>Like the idea behind<span class="about-desktop-space"> </span><br class="about-mobile-break"><span class="about-callout-product">USA X-Ray?</span></h2><p>There are a few ways to help this independent project grow.</p></div><a class="about-support-button" href="/support" data-page="support">Support USA X-Ray <span aria-hidden="true">→</span></a></section>
    <footer class="about-footer"><span>Built and maintained by Dmitrii</span><div><button type="button" data-open-info="methodology">Data &amp; Methodology</button><span aria-hidden="true">·</span><button type="button" data-open-report>Report an issue</button><span aria-hidden="true">·</span><a href="/support" data-page="support">Support</a></div></footer>
  </div>`;
}

export function legacyInfoView(sourceRows,libraryRows){
  return `<section id="info-legacy" class="legacy-info" hidden>
    <button class="legacy-back" type="button" id="about-legacy-back">← About</button>
    <h1>Data &amp; Methodology</h1><p class="page-intro">How mapped values are sourced, retained and displayed.</p>
    <div class="info-tabs segmented" role="tablist" aria-label="Data information"><button type="button" data-info="sources" aria-pressed="false">Sources</button><button type="button" data-info="methodology" aria-pressed="true">Methodology</button><button type="button" data-info="data" aria-pressed="false">Data library</button></div>
    <div id="info-content">
      <section id="info-sources" class="info-section" role="tabpanel"><h2>Sources</h2><ul id="info-sources-list" class="source-list">${sourceRows}</ul><p>Open Sources beside a map or indicator for its specific definition, period, attribution and limitations.</p><button class="outline-button" id="info-map-sources" type="button">Map geometry sources →</button></section>
      <section id="info-methodology" class="info-section" role="tabpanel"><h2>Original values, exact geography</h2><p>Only admitted observations are read. County joins use exact Census 2017 FIPS. The interface never allocates state, ZIP, monitor, tract or block-group observations to counties. Admitted county series retain the source methodology. Each series uses one latest period and release.</p><p>Colour is continuous from the lowest to the highest mapped value. Money and population use a logarithmic scale so that both small and large places stay readable, other values use a linear scale, and the cost-of-living index keeps a diverging 85–100–115 scale. 3D height is linear between the same minimum and maximum. The legend states the same range as the map paints. Relief is a visual scale, not an additional measurement.</p><div class="info-appearance"><h3>Appearance</h3><p>Choose a light or dark theme.</p></div></section>
      <section id="info-data" class="info-section" role="tabpanel"><h2>Data library</h2><p>Loaded series that stay off the map until their period, unit or coverage is reviewed and promoted. They remain available for review here, with the reason they are not mapped.</p><ul id="info-library-list" class="library-list">${libraryRows}</ul></section>
    </div>
  </section>`;
}

export function supportView(){
  const summaryTitles={'map-assistant':'An AI assistant for exploring the map'};
  const milestoneRows=milestoneItems.map(item=>`<li>• ${escapeHTML(summaryTitles[item.id]||item.title)}</li>`).join('');
  return `<div id="support-main" class="support-page">
    <header class="support-hero"><p class="page-eyebrow">AN INDEPENDENT PROJECT · FREE TO EXPLORE</p><h1><span>Support</span> <span class="support-title-product">USA X-Ray.</span></h1><p>A small independent project, built and maintained by one person. Help me improve the maps and add new ways to explore.</p></header>
    <div class="support-columns">
      <div class="support-primary-column">
        <section class="support-founder" aria-label="About the creator">
          <div class="support-portrait" role="img" aria-label="Initials placeholder for Dmitrii Rybkin"><strong>DR</strong><span>Portrait to be added</span></div>
          <div class="support-founder-bio">
            <div class="support-founder-contact"><h2 class="support-founder-identity">Hey, I’m Dmitrii.</h2><div class="support-founder-meta"><p>Full-Stack Engineer · 6 years across design,<br class="support-desktop-break"> development and end-to-end product delivery</p><a href="${escapeHTML(linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></div></div>
            <div class="support-founder-stories"><p>I’ve always enjoyed getting lost in maps and discovering unexpected things in data. USA X-Ray grew out of that curiosity: a simpler way to explore the United States.</p><p>I build and maintain the project myself. It has no monetization, and I pay for hosting and development. Your support gives me more room to improve the experience.</p></div>
          </div>
        </section>
        <section class="support-methods" id="support-methods" aria-labelledby="support-methods-title" tabindex="-1">
          <div class="support-methods-intro"><h2 id="support-methods-title">Let’s connect</h2><p class="support-connect-desktop-copy">I also work on full-stack software, interactive data products and automation. If you’d like to collaborate or support USA X-Ray, you’ll find the options here.</p><p class="support-connect-mobile-copy">I work on full-stack software, interactive data products and automation. You can collaborate with me or support USA X-Ray below.</p></div>
          <div class="support-method-list">
            <a class="support-method" href="${escapeHTML(linkedin)}" target="_blank" rel="noopener noreferrer"><span>Work with me on LinkedIn</span><span class="support-method-action">↗</span></a>
            ${paymentLink('Patreon',findLink('patreon'))}
            ${cryptocurrency}
            ${paymentLink('Bank transfer',findLink('bank-transfer','banktransfer','bank'))}
          </div>
        </section>
      </div>
      <aside class="milestone-card" aria-labelledby="support-milestone-title">
        <div class="milestone-goal"><p class="page-eyebrow">NEXT MILESTONE</p><strong>${targetText||'Goal not configured'}</strong><span>Funding goal</span></div>
        <div class="milestone-details"><h2 id="support-milestone-title">Help build what’s next.</h2><ul>${milestoneRows}</ul><div class="milestone-actions"><button class="primary-button" type="button" data-support-methods>Support this milestone <span aria-hidden="true">→</span></button><button class="secondary-button" type="button" data-open-milestone>See the plan</button></div></div>
      </aside>
    </div>
    <p class="support-thanks">You can also help by sharing the map, reporting an issue or suggesting a dataset. Thank you. — Dmitrii</p>
    <footer class="support-footer"><span>Built and maintained by Dmitrii</span><div><a href="/about" data-page="info">About</a><button type="button" data-open-info="methodology">Data &amp; Methodology</button><button type="button" data-open-report>Report an issue</button></div></footer>
  </div>`;
}

export function milestoneDialogView(){
  const title=targetText?`A ${targetText} step forward.`:'Next funding milestone';
  return `<div class="app-dialog-panel app-dialog-panel--milestone" role="dialog" aria-modal="true" aria-labelledby="milestone-dialog-title" tabindex="-1">
    <header class="app-dialog-heading"><div><p class="page-eyebrow"><span class="milestone-dialog-eyebrow--desktop">NEXT FUNDING MILESTONE</span><span class="milestone-dialog-eyebrow--mobile">NEXT MILESTONE · ${escapeHTML(targetText||'')}</span></p><h2 id="milestone-dialog-title"><span class="milestone-dialog-title--desktop">${escapeHTML(title)}</span><span class="milestone-dialog-title--mobile">What's planned</span></h2></div><button class="app-dialog-close" type="button" data-close-dialog aria-label="Close the milestone plan">×</button></header>
    <p class="milestone-dialog-intro">Here’s the planned work for the next phase of USA X-Ray.</p>
    <ul class="milestone-dialog-list">${milestoneRowsForDialog()}</ul>
    <p class="milestone-dialog-note">Your contribution supports hosting and development toward this goal.</p>
    <div class="milestone-dialog-actions"><button class="primary-button" type="button" data-dialog-support>Support this milestone <span aria-hidden="true">→</span></button><button class="secondary-button" type="button" data-close-dialog>Back to Support</button></div>
  </div>`;
}

function milestoneRowsForDialog(){
  return milestoneItems.map(item=>`<li><strong>${escapeHTML(item.title)}</strong><span class="milestone-dialog-copy milestone-dialog-copy--desktop">${escapeHTML(item.description)}</span><span class="milestone-dialog-copy milestone-dialog-copy--mobile">${escapeHTML(({ 'new-indicators':'Ten new indicators, with sources, dates and coverage notes.','map-assistant':'Ask about places and indicators, and get help exploring comparisons on the map.','clearer-sources':'Clearer definitions, sources and missing values, plus an easier way to report issues.'})[item.id]||item.description)}</span></li>`).join('');
}

export {linkedin};
