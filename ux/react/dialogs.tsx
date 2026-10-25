import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import type { Atlas } from './use-atlas';
import { MilestonePlan } from './support-about';
import { emptyReport, reportPageUrl, reportResponse } from './report-state';
import type { ReportDraft } from './report-state';
export function useDialogs(atlas: Atlas) {
  type Dialog = {
    kind: 'report' | 'milestone';
    token: string;
    trigger: HTMLElement | null;
  };
  const [dialog, setDialog] = useState<Dialog | null>(null),
    active = useRef<Dialog | null>(null);
  const [draft, setDraft] = useState<ReportDraft>(emptyReport),
    draftRef = useRef(draft);
  draftRef.current = draft;
  const memory = useRef(new Map<string, Dialog>()),
    pending = useRef<string | null>(null);
  const update = (value: Partial<ReportDraft>) => {
    draftRef.current = { ...draftRef.current, ...value };
    setDraft(draftRef.current);
  };
  function open(
    kind: Dialog['kind'],
    trigger: HTMLElement | null = document.activeElement as HTMLElement,
    remembered?: Dialog,
  ) {
    if (active.current) return;
    if (kind === 'report') {
      if (draftRef.current.phase === 'success') {
        draftRef.current = emptyReport();
        setDraft(draftRef.current);
      }
      if (!draftRef.current.initialized)
        update({
          pageUrl: reportPageUrl(location.pathname, location.search, atlas.current.current.page),
          context: atlas.reportContext(),
          initialized: true,
        });
    }
    const value = remembered || {
      kind,
      token: 'dialog-' + crypto.randomUUID(),
      trigger,
    };
    memory.current.set(value.token, value);
    active.current = value;
    setDialog(value);
    if (!remembered)
      history.pushState(
        { ...history.state, usaAtlasDialog: { kind, token: value.token } },
        '',
        location.href,
      );
  }
  function close(fromPopState = false) {
    const previous = active.current;
    if (!previous) return;
    active.current = null;
    setDialog(null);
    if (!fromPopState && history.state?.usaAtlasDialog?.token === previous.token) {
      pending.current = previous.token;
      history.back();
    }
  }
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const state = event.state?.usaAtlasDialog;
      if (pending.current && state?.token !== pending.current) {
        event.stopImmediatePropagation();
        pending.current = null;
        return;
      }
      if (active.current && state?.token !== active.current.token) {
        event.stopImmediatePropagation();
        close(true);
        return;
      }
      if (!active.current && state && memory.current.has(state.token)) {
        event.stopImmediatePropagation();
        const remembered = memory.current.get(state.token)!;
        open(remembered.kind, remembered.trigger, remembered);
      }
    };
    window.addEventListener('popstate', pop, { capture: true });
    return () => window.removeEventListener('popstate', pop, { capture: true });
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !event.currentTarget.reportValidity() ||
      ['sending', 'success'].includes(draftRef.current.phase)
    )
      return;
    const chosen = draftRef.current;
    update({ phase: 'sending', status: 'Sending your report…' });
    try {
      const response = await fetch('/api/bug-reports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: chosen.pageUrl,
          description: chosen.description,
          contact: chosen.contact,
          context: chosen.context,
          website: chosen.website,
        }),
      });
      let result: unknown = {};
      try {
        result = await response.json();
      } catch {}
      if (!reportResponse(response.status, result))
        throw new Error(
          typeof result === 'object' &&
          result !== null &&
          'error' in result &&
          typeof result.error === 'string'
            ? result.error
            : 'The server did not confirm that the report was saved.',
        );
      update({
        phase: 'success',
        status: 'Your report was received. Thank you for helping improve USA X-Ray.',
      });
    } catch (error) {
      update({
        phase: 'error',
        status:
          error instanceof TypeError
            ? 'The report could not reach the server. Your details are still here; please retry.'
            : error instanceof Error
              ? error.message
              : 'The report could not be saved. Your details are still here; please retry.',
      });
    }
  }
  return { dialog, active, draft, update, open, close, submit };
}
export type Dialogs = ReturnType<typeof useDialogs>;
function stops(panel: HTMLElement) {
  return [
    ...panel.querySelectorAll<HTMLElement>(
      'a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])',
    ),
  ].filter(
    (node) =>
      node.tabIndex >= 0 &&
      !node.hidden &&
      !node.closest('[inert],[hidden],[aria-hidden="true"]') &&
      node.getClientRects().length &&
      getComputedStyle(node).visibility !== 'hidden' &&
      (!node.closest('details') || node.tagName === 'SUMMARY' || node.closest('details')!.open),
  );
}
export function Dialog({ owner }: { owner: Dialogs }) {
  const root = useRef<HTMLDivElement>(null),
    { dialog, draft, update, close } = owner;
  useLayoutEffect(() => {
    const host = root.current;
    if (!dialog || !host) return;
    const inertBefore = [...document.body.children]
      .filter((node) => node !== host && node instanceof HTMLElement)
      .map((node) => [node as HTMLElement, (node as HTMLElement).inert] as const);
    inertBefore.forEach(([node]) => (node.inert = true));
    const panel = host.querySelector<HTMLElement>('[role=dialog]')!;
    (
      host.querySelector<HTMLElement>(
        dialog.kind === 'report' ? '#bug-report-description' : '.app-dialog-close',
      ) || panel
    ).focus({ preventScroll: true });
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const list = stops(panel),
        first = list[0],
        last = list.at(-1);
      if (!list.length) {
        event.preventDefault();
        panel.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        last!.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
      event.stopImmediatePropagation();
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      inertBefore.forEach(([node, inert]) => {
        if (node.isConnected) node.inert = inert;
      });
      const target = dialog.trigger?.isConnected
        ? dialog.trigger
        : document.querySelector<HTMLElement>('#reading-page');
      if (target?.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true });
    };
  }, [dialog?.token]);
  if (!dialog) return null;
  const frozen = draft.phase === 'sending' || draft.phase === 'success',
    context = draft.context,
    included = [
      context.indicator && `Indicator: ${context.indicator}`,
      context.place && `Place: ${context.place}`,
      context.period && `Period: ${context.period}`,
    ]
      .filter(Boolean)
      .join(' · ');
  return createPortal(
    <div
      ref={root}
      className="app-dialog-backdrop"
      data-dialog={dialog.kind}
      onClick={(event) => {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (target === event.currentTarget || target.closest('[data-close-dialog]')) close();
        if (target.closest('[data-dialog-support]')) {
          close();
          requestAnimationFrame(() => {
            const section = document.querySelector<HTMLElement>('#support-methods');
            section?.focus({ preventScroll: true });
            section?.scrollIntoView({
              behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth',
              block: 'start',
            });
          });
        }
      }}
    >
      {dialog.kind === 'milestone' ? (
        <MilestonePlan />
      ) : (
        <div
          className="app-dialog-panel app-dialog-panel--bug-report"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bug-report-title"
          tabIndex={-1}
        >
          <header className="app-dialog-heading">
            <div>
              <p className="page-eyebrow">REPORT A BUG</p>
              <h2 id="bug-report-title">Tell us what went wrong.</h2>
            </div>
            <button
              className="app-dialog-close"
              type="button"
              data-close-dialog
              aria-label="Close report form"
            >
              ×
            </button>
          </header>
          <p className="bug-report-help">
            Describe what happened. We’ll include the current indicator, place and period when
            they’re available.
          </p>
          <form id="bug-report-form" className="bug-report-form" onSubmit={owner.submit}>
            <label htmlFor="bug-report-description">
              What went wrong? <span aria-hidden="true">*</span>
              <textarea
                id="bug-report-description"
                name="description"
                required
                minLength={8}
                maxLength={4000}
                rows={5}
                placeholder="Describe the issue"
                aria-describedby="bug-report-context bug-report-status"
                readOnly={frozen}
                value={draft.description}
                onChange={(e) =>
                  update({
                    description: e.currentTarget.value,
                    status: '',
                    phase: 'idle',
                  })
                }
              />
            </label>
            <label htmlFor="bug-report-contact">
              Contact (optional)
              <input
                id="bug-report-contact"
                name="contact"
                type="text"
                maxLength={254}
                autoComplete="email"
                placeholder="Email or profile link"
                value={draft.contact}
                readOnly={frozen}
                onChange={(e) =>
                  update({
                    contact: e.currentTarget.value,
                    status: '',
                    phase: 'idle',
                  })
                }
              />
            </label>
            <label htmlFor="bug-report-url">
              Current page URL
              <input
                id="bug-report-url"
                type="url"
                readOnly
                value={new URL(draft.pageUrl, location.origin).href}
              />
            </label>
            <p id="bug-report-context" className="bug-report-context">
              {included
                ? 'Included automatically: ' + included + '.'
                : 'No indicator, place or period is currently selected.'}
            </p>
            <label className="bug-report-honeypot" aria-hidden="true" tabIndex={-1}>
              Website
              <input
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={draft.website}
                onChange={(e) => update({ website: e.currentTarget.value })}
              />
            </label>
            <p
              id="bug-report-status"
              className="bug-report-status"
              role="status"
              aria-live="polite"
              data-state={
                draft.phase === 'success'
                  ? 'success'
                  : draft.phase === 'error'
                    ? 'error'
                    : draft.phase === 'sending'
                      ? 'sending'
                      : 'idle'
              }
            >
              {draft.status}
            </p>
            <button className="primary-button" type="submit" disabled={frozen}>
              {draft.phase === 'success'
                ? 'Report received'
                : draft.phase === 'sending'
                  ? 'Sending…'
                  : 'Send report'}{' '}
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </div>
      )}
    </div>,
    document.body,
  );
}
