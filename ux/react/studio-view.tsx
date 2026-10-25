import type { CSSProperties } from 'react';
import { supportsDevice } from '../advertising/creative.js';
import type { Studio } from './use-studio';
import { TargetTags, TargetOptions, RequestSummary } from './studio-components';
export function StudioView({ studio }: { studio: Studio }) {
  const { state } = studio;
  return (
    <>
      <header className="studio-header">
        <a href="./?page=stats" aria-label="Back to Stats">
          <svg className="studio-globe" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <ellipse cx="10" cy="10" rx="3.3" ry="7.5" />
            <path d="M2.5 10h15" />
          </svg>
          <svg className="studio-back" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M17 10H3l5-5m-5 5 5 5" />
          </svg>
        </a>
        <strong>
          {'USA X-Ray '}
          <span>{'Advertiser studio'}</span>
          <small>{'Untitled draft'}</small>
        </strong>
        <div>
          <button id="custom-campaign">{'Discuss a custom campaign'}</button>
          <button id="save-draft">{'Save draft'}</button>
          <button id="review-request" className="primary">
            {studio.text('review-request')}
          </button>
        </div>
      </header>
      <main className="studio">
        <form id="ad-form" noValidate={true} onSubmit={studio.submit}>
          <div className="studio-title">
            <h1 id="studio-heading">{studio.text('studio-heading')}</h1>
            <p className="studio-subtitle" hidden={state.kind === 'inquiry'}>
              {studio.subtitle}
            </p>
            <div
              className="studio-tabs"
              hidden={state.kind === 'inquiry'}
              style={{ '--tab': state.tab === 'request' ? 1 : 0 } as CSSProperties}
            >
              <span className="studio-pill" aria-hidden="true"></span>
              <button type="button" data-tab="creative" aria-pressed={state.tab === 'creative'}>
                {'Creative'}
              </button>
              <button type="button" data-tab="request" aria-pressed={state.tab === 'request'}>
                {'Request'}
              </button>
            </div>
            <p id="studio-explanation">{studio.text('studio-explanation')}</p>
          </div>
          <div className="studio-scroll">
            <section id="creative-settings" hidden={state.tab !== 'creative'}>
              <p id="target-summary" className="target-summary">
                {studio.text('target-summary')}
              </p>
              <h2>
                {'Locations '}
                <small id="location-count">{studio.text('location-count')}</small>
              </h2>
              <div id="location-tags" className="target-tags" data-count={state.locations.length}>
                <TargetTags studio={studio} type="location" />
              </div>
              <details>
                <summary>{'Add locations'}</summary>
                <>
                  <input
                    id="location-search"
                    type="search"
                    aria-label="Find states and counties"
                    placeholder="Search states or counties"
                    value={studio.field('location-search')}
                    onChange={(event) =>
                      studio.setField('location-search', event.currentTarget.value)
                    }
                    aria-invalid={state.fieldError?.id === 'location-search' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'location-search' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'location-search' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
                <div id="location-options" className="target-options">
                  <TargetOptions studio={studio} type="location" />
                </div>
              </details>
              <h2>
                {'Indicators '}
                <small id="indicator-count">{studio.text('indicator-count')}</small>
              </h2>
              <div id="indicator-tags" className="target-tags" data-count={state.indicators.length}>
                <TargetTags studio={studio} type="indicator" />
              </div>
              <details>
                <summary>{'Add indicators'}</summary>
                <>
                  <input
                    id="indicator-search"
                    type="search"
                    aria-label="Find indicators"
                    placeholder="Search indicators"
                    value={studio.field('indicator-search')}
                    onChange={(event) =>
                      studio.setField('indicator-search', event.currentTarget.value)
                    }
                    aria-invalid={state.fieldError?.id === 'indicator-search' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'indicator-search' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'indicator-search' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
                <div id="indicator-options" className="target-options">
                  <TargetOptions studio={studio} type="indicator" />
                </div>
              </details>
              <h2 className="creative-heading">{'Ad creative'}</h2>
              <div className="format-tabs">
                <button type="button" data-format="banner" aria-pressed={state.format === 'banner'}>
                  {'Banner'}
                </button>
                <button
                  type="button"
                  data-format="ticker"
                  aria-pressed={state.format === 'ticker'}
                  disabled={studio.mobile}
                >
                  {'Scrolling text'}
                </button>
              </div>
              <p
                id="mobile-format-note"
                className="note"
                hidden={state.format === 'banner' && !studio.mobile}
              >
                {'Scrolling text is available on Desktop only.'}
              </p>
              <label className="upload" hidden={state.format !== 'banner'}>
                <img id="upload-thumb" alt="Current creative image" src={state.image} />
                <span>
                  <b id="image-filename">{studio.text('image-filename')}</b>
                  <span className="replace-image-label">{'Replace image'}</span>
                  <small>{'JPG, PNG, WebP · up to 5 MB'}</small>
                  <input
                    id="ad-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void studio.upload(event.currentTarget.files?.[0])}
                  />
                </span>
              </label>
              <p className="note" id="image-credit" hidden={state.format !== 'banner'}>
                {state.image.startsWith('data:image/') ? (
                  'Your uploaded image. It remains in this browser and your exported draft.'
                ) : (
                  <>
                    {'Example image: '}
                    <a
                      href="https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_and_San_Francisco_skyline_from_Hawk_Hill_at_Blue_Hour_dllu_(cropped).jpg"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Daniel L. Lu · CC BY-SA 4.0
                    </a>
                  </>
                )}
              </p>
              <div id="crop-controls" hidden={state.format !== 'banner'}>
                <label>
                  {'Image area '}
                  <output id="area-output">{studio.text('area-output')}</output>
                  <>
                    <input
                      id="image-area"
                      type="range"
                      min="20"
                      max="70"
                      value={studio.field('image-area')}
                      onChange={(event) => studio.setField('image-area', event.currentTarget.value)}
                      aria-invalid={state.fieldError?.id === 'image-area' ? true : undefined}
                      aria-describedby={
                        state.fieldError?.id === 'image-area' ? 'studio-field-error' : undefined
                      }
                    />
                    {state.fieldError?.id === 'image-area' ? (
                      <p id="studio-field-error" className="field-error">
                        {state.fieldError.message}
                      </p>
                    ) : null}
                  </>
                </label>
                <label>
                  {'Crop / zoom '}
                  <output id="zoom-output">{studio.text('zoom-output')}</output>
                  <>
                    <input
                      id="image-zoom"
                      type="range"
                      min="100"
                      max="200"
                      value={studio.field('image-zoom')}
                      onChange={(event) => studio.setField('image-zoom', event.currentTarget.value)}
                      aria-invalid={state.fieldError?.id === 'image-zoom' ? true : undefined}
                      aria-describedby={
                        state.fieldError?.id === 'image-zoom' ? 'studio-field-error' : undefined
                      }
                    />
                    {state.fieldError?.id === 'image-zoom' ? (
                      <p id="studio-field-error" className="field-error">
                        {state.fieldError.message}
                      </p>
                    ) : null}
                  </>
                </label>
                <label>
                  {'Horizontal position '}
                  <output id="position-output">{studio.text('position-output')}</output>
                  <>
                    <input
                      id="image-position"
                      type="range"
                      min="0"
                      max="100"
                      value={studio.field('image-position')}
                      onChange={(event) =>
                        studio.setField('image-position', event.currentTarget.value)
                      }
                      aria-invalid={state.fieldError?.id === 'image-position' ? true : undefined}
                      aria-describedby={
                        state.fieldError?.id === 'image-position' ? 'studio-field-error' : undefined
                      }
                    />
                    {state.fieldError?.id === 'image-position' ? (
                      <p id="studio-field-error" className="field-error">
                        {state.fieldError.message}
                      </p>
                    ) : null}
                  </>
                </label>
              </div>
              <label>
                {'Headline '}
                <output id="headline-count">{studio.text('headline-count')}</output>
                <>
                  <textarea
                    id="ad-headline"
                    rows={2}
                    value={studio.field('ad-headline')}
                    onChange={(event) => studio.setField('ad-headline', event.currentTarget.value)}
                    aria-invalid={state.fieldError?.id === 'ad-headline' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'ad-headline' ? 'studio-field-error' : undefined
                    }
                  ></textarea>
                  {state.fieldError?.id === 'ad-headline' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <label id="subtitle-field" hidden={state.format !== 'banner'}>
                {'Supporting text '}
                <output id="subtitle-count">{studio.text('subtitle-count')}</output>
                <>
                  <input
                    id="ad-subtitle"
                    value={studio.field('ad-subtitle')}
                    onChange={(event) => studio.setField('ad-subtitle', event.currentTarget.value)}
                    aria-invalid={state.fieldError?.id === 'ad-subtitle' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'ad-subtitle' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'ad-subtitle' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <label>
                {'Button text '}
                <output id="cta-count">{studio.text('cta-count')}</output>
                <>
                  <input
                    id="ad-cta"
                    value={studio.field('ad-cta')}
                    onChange={(event) => studio.setField('ad-cta', event.currentTarget.value)}
                    aria-invalid={state.fieldError?.id === 'ad-cta' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'ad-cta' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'ad-cta' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <label>
                {'Destination URL'}
                <>
                  <input
                    id="ad-url"
                    type="url"
                    maxLength={2000}
                    placeholder="https://your-website.com"
                    value={studio.field('ad-url')}
                    onChange={(event) => studio.setField('ad-url', event.currentTarget.value)}
                    aria-invalid={state.fieldError?.id === 'ad-url' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'ad-url' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'ad-url' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <label id="ticker-speed-field" hidden={state.format === 'banner'}>
                {'Scroll speed'}
                <>
                  <select
                    id="ticker-speed"
                    value={studio.field('ticker-speed')}
                    onChange={(event) => studio.setField('ticker-speed', event.currentTarget.value)}
                    aria-invalid={state.fieldError?.id === 'ticker-speed' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'ticker-speed' ? 'studio-field-error' : undefined
                    }
                  >
                    <option value="slow">{'Slow'}</option>
                    <option value="normal">{'Normal'}</option>
                    <option value="fast">{'Fast'}</option>
                  </select>
                  {state.fieldError?.id === 'ticker-speed' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <h2>{'Show on'}</h2>
              <div className="devices">
                <label>
                  <input
                    id="target-desktop"
                    type="checkbox"
                    checked={state.desktop}
                    onChange={(event) =>
                      studio.setField('target-desktop', event.currentTarget.checked)
                    }
                  />
                  {'Desktop'}
                </label>
                <label>
                  <input
                    id="target-mobile"
                    type="checkbox"
                    checked={state.mobile}
                    onChange={(event) =>
                      studio.setField('target-mobile', event.currentTarget.checked)
                    }
                    disabled={!supportsDevice(state.format, 'mobile')}
                  />
                  {'Mobile'}
                </label>
              </div>
              <button type="button" id="preview-in-place" className="outline">
                {'Preview in place'}
              </button>
              <p className="note">
                {'Preview the actual placement before requesting review. Spaces count.'}
              </p>
            </section>
            <section id="request-settings" hidden={state.tab !== 'request'}>
              <div id="request-summary" data-kind={state.kind}>
                <RequestSummary studio={studio} />
              </div>
              <div id="duration-settings" hidden={state.kind === 'inquiry'}>
                <h2>{'Placement duration'}</h2>
                <div className="duration-options">
                  <button type="button" data-days="1" aria-pressed={state.days === '1'}>
                    {'1 day'}
                  </button>
                  <button type="button" data-days="7" aria-pressed={state.days === '7'}>
                    {'7 days'}
                  </button>
                  <button type="button" data-days="30" aria-pressed={state.days === '30'}>
                    {'30 days'}
                  </button>
                  <button type="button" data-days="custom" aria-pressed={state.days === 'custom'}>
                    {'Custom'}
                  </button>
                </div>
                <label id="custom-days-field" hidden={state.days !== 'custom'}>
                  {'Number of days'}
                  <>
                    <input
                      id="custom-days"
                      type="number"
                      min="1"
                      step="1"
                      value={studio.field('custom-days')}
                      onChange={(event) =>
                        studio.setField('custom-days', event.currentTarget.value)
                      }
                      aria-invalid={state.fieldError?.id === 'custom-days' ? true : undefined}
                      aria-describedby={
                        state.fieldError?.id === 'custom-days' ? 'studio-field-error' : undefined
                      }
                    />
                    {state.fieldError?.id === 'custom-days' ? (
                      <p id="studio-field-error" className="field-error">
                        {state.fieldError.message}
                      </p>
                    ) : null}
                  </>
                </label>
                <p className="note">{"We'll confirm the start date with you."}</p>
              </div>
              <label id="inquiry-field" hidden={state.kind !== 'inquiry'}>
                {'Your idea · required'}
                <>
                  <textarea
                    id="inquiry-idea"
                    maxLength={2000}
                    rows={4}
                    placeholder="Tell us about your placement, sponsorship or creative idea."
                    value={studio.field('inquiry-idea')}
                    onChange={(event) => studio.setField('inquiry-idea', event.currentTarget.value)}
                    aria-invalid={state.fieldError?.id === 'inquiry-idea' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'inquiry-idea' ? 'studio-field-error' : undefined
                    }
                  ></textarea>
                  {state.fieldError?.id === 'inquiry-idea' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <h2>{'How should we reach you?'}</h2>
              <div className="contact-tabs">
                <button
                  type="button"
                  data-channel="whatsapp"
                  aria-pressed={state.channel === 'whatsapp'}
                >
                  {'WhatsApp'}
                </button>
                <button type="button" data-channel="email" aria-pressed={state.channel === 'email'}>
                  {'Email'}
                </button>
              </div>
              <label id="whatsapp-field" hidden={state.channel !== 'whatsapp'}>
                {'WhatsApp number'}
                <>
                  <input
                    id="contact-whatsapp"
                    type="tel"
                    autoComplete="tel"
                    placeholder="Country code + phone number"
                    maxLength={30}
                    value={studio.field('contact-whatsapp')}
                    onChange={(event) =>
                      studio.setField('contact-whatsapp', event.currentTarget.value)
                    }
                    aria-invalid={state.fieldError?.id === 'contact-whatsapp' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'contact-whatsapp' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'contact-whatsapp' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <label id="email-field" hidden={state.channel !== 'email'}>
                {'Email'}
                <>
                  <input
                    id="contact-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    maxLength={254}
                    value={studio.field('contact-email')}
                    onChange={(event) =>
                      studio.setField('contact-email', event.currentTarget.value)
                    }
                    aria-invalid={state.fieldError?.id === 'contact-email' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'contact-email' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'contact-email' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <label>
                {'Your name · optional'}
                <>
                  <input
                    id="contact-name"
                    autoComplete="name"
                    maxLength={100}
                    placeholder="What should we call you?"
                    value={studio.field('contact-name')}
                    onChange={(event) => studio.setField('contact-name', event.currentTarget.value)}
                    aria-invalid={state.fieldError?.id === 'contact-name' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'contact-name' ? 'studio-field-error' : undefined
                    }
                  />
                  {state.fieldError?.id === 'contact-name' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <label id="message-field" hidden={state.kind === 'inquiry'}>
                {'Message · optional '}
                <output id="message-count">{studio.text('message-count')}</output>
                <>
                  <textarea
                    id="contact-message"
                    maxLength={2000}
                    rows={4}
                    placeholder="Dates, questions or anything we should know."
                    value={studio.field('contact-message')}
                    onChange={(event) =>
                      studio.setField('contact-message', event.currentTarget.value)
                    }
                    aria-invalid={state.fieldError?.id === 'contact-message' ? true : undefined}
                    aria-describedby={
                      state.fieldError?.id === 'contact-message' ? 'studio-field-error' : undefined
                    }
                  ></textarea>
                  {state.fieldError?.id === 'contact-message' ? (
                    <p id="studio-field-error" className="field-error">
                      {state.fieldError.message}
                    </p>
                  ) : null}
                </>
              </label>
              <p id="delivery-note" className="note">
                {
                  'Request delivery is not configured. Download your request for review; nothing is sent or published.'
                }
              </p>
              <button id="check-request" type="button" className="outline">
                {'Check request'}
              </button>
            </section>
            <p id="studio-status" role="status" aria-live="polite">
              {studio.text('studio-status')}
            </p>
          </div>
          <div className="studio-footer">
            <button type="button" id="save-mobile">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 3h10v14l-5-3-5 3z" />
              </svg>
              {'Save'}
            </button>
            <button
              type="button"
              id="mobile-review"
              className="primary"
              hidden={state.tab === 'request'}
            >
              {'Review & send'}
            </button>
            <button
              id="submit-request"
              type="submit"
              className="primary"
              hidden={state.tab !== 'request'}
              disabled={studio.invalid}
            >
              {'Download request'}
            </button>
          </div>
        </form>
        <section className="preview-panel" data-device={state.device}>
          <div className="preview-controls">
            <strong>{'Visitor preview'}</strong>
            <span id="preview-size">{studio.text('preview-size')}</span>
            <div className="device-tabs">
              <button type="button" data-device="desktop" aria-pressed={state.device === 'desktop'}>
                {studio.mobile
                  ? state.device === 'desktop'
                    ? 'Mobile preview'
                    : 'Desktop preview'
                  : 'Desktop'}
              </button>
              <button
                type="button"
                data-device="mobile"
                aria-pressed={state.device === 'mobile'}
                disabled={!supportsDevice(state.format, 'mobile')}
              >
                {'Mobile'}
              </button>
            </div>
            <button id="preview-highlight" type="button" aria-pressed={state.highlight}>
              {'Highlight placement'}
            </button>
            <button id="preview-theme" type="button">
              {studio.text('preview-theme')}
            </button>
            <button id="close-preview" type="button" hidden={true}>
              {'← Creative'}
            </button>
          </div>
          <div className="preview-frame">
            <iframe
              id="map-preview"
              title="Exact visitor placement preview"
              src="./?preview=1&expanded=1&place=06&metric=unemployment&view=3d"
              ref={studio.frame}
            ></iframe>
          </div>
          <p
            id="preview-status"
            data-phase={state.previewPhase}
            role="status"
            data-state={state.previewError ? 'error' : 'normal'}
          >
            {studio.text('preview-status')}
          </p>
        </section>
      </main>
      <dialog
        id="leave-draft-dialog"
        aria-labelledby="leave-draft-title"
        ref={studio.leaveDialog}
        onCancel={() => studio.patch({ leaveDialog: false })}
      >
        <h2 id="leave-draft-title">{'Keep your draft?'}</h2>
        <p>{'You have unsaved changes in this browser.'}</p>
        <div>
          <button id="stay-in-studio" type="button">
            {'Keep editing'}
          </button>
          <button id="save-and-leave" type="button" className="primary">
            {'Save & leave'}
          </button>
        </div>
      </dialog>
    </>
  );
}
