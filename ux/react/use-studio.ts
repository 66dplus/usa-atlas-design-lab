import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent, KeyboardEvent } from 'react';
import { exampleImage, supportsDevice } from '../advertising/creative.js';
import { validateRequest, characterCount, copyLimits } from '../advertising/request.js';
import { readAtlasJSON, collectedMapIndicators } from '../model.js';
import type { Metric, Theme } from './types';
import { useMobile } from './sheet';
type Field =
  | 'ad-headline'
  | 'ad-subtitle'
  | 'ad-cta'
  | 'ad-url'
  | 'image-area'
  | 'image-zoom'
  | 'image-position'
  | 'ticker-speed'
  | 'custom-days'
  | 'inquiry-idea'
  | 'contact-whatsapp'
  | 'contact-email'
  | 'contact-name'
  | 'contact-message'
  | 'location-search'
  | 'indicator-search';
interface StudioState {
  fields: Record<Field, string>;
  desktop: boolean;
  mobile: boolean;
  locations: string[];
  indicators: string[];
  format: 'banner' | 'ticker';
  channel: 'whatsapp' | 'email';
  days: string;
  kind: 'placement' | 'inquiry';
  tab: 'creative' | 'request';
  image: string;
  imageName: string;
  device: 'desktop' | 'mobile';
  theme: Theme;
  dirty: boolean;
  highlight: boolean;
  showPreview: boolean;
  leaveDialog: boolean;
  status: string;
  previewStatus: string;
  previewError: boolean;
  fieldError: { id: string; message: string } | null;
}
const defaults: StudioState = {
  fields: {
    'ad-headline': 'Your next chapter, somewhere new.',
    'ad-subtitle': 'Explore places that fit your life.',
    'ad-cta': 'Discover more',
    'ad-url': '',
    'image-area': '50',
    'image-zoom': '100',
    'image-position': '50',
    'ticker-speed': 'normal',
    'custom-days': '14',
    'inquiry-idea': '',
    'contact-whatsapp': '',
    'contact-email': '',
    'contact-name': '',
    'contact-message': '',
    'location-search': '',
    'indicator-search': '',
  },
  desktop: true,
  mobile: true,
  locations: ['06'],
  indicators: ['unemployment'],
  format: 'banner',
  channel: 'whatsapp',
  days: '7',
  kind: 'placement',
  tab: 'creative',
  image: exampleImage,
  imageName: 'san-francisco.jpg',
  device: 'desktop',
  theme: 'light',
  dirty: false,
  highlight: false,
  showPreview: false,
  leaveDialog: false,
  status: '',
  previewStatus: 'Loading live source observations…',
  previewError: false,
  fieldError: null,
};
const labels = new Map([
  ['01.01:B01003_001E', 'Population'],
  ['02.01:B19013_001E', 'Median household income'],
  ['02.03:B25064_001E', 'Median rent'],
  ['02.04:B25077_001E', 'Median home value'],
  ['02.08:B17001_002E', 'People below poverty level'],
  ['03.06:unemployment', 'Unemployed'],
]);
function initialStudio(): StudioState {
  let state = {
    ...defaults,
    fields: { ...defaults.fields },
    device: matchMedia('(max-width:760px)').matches ? ('mobile' as const) : ('desktop' as const),
  };
  try {
    state.theme = localStorage.getItem('usa-atlas-theme') === 'dark' ? 'dark' : 'light';
    const raw = localStorage.getItem('usa-atlas-ad-draft-v2');
    if (raw) {
      const draft = JSON.parse(raw);
      if (
        !['banner', 'ticker'].includes(draft.creative.format) ||
        !['placement', 'inquiry'].includes(draft.kind) ||
        !['whatsapp', 'email'].includes(draft.channel)
      )
        throw new Error('Invalid draft');
      const fields = { ...state.fields };
      for (const [id, value] of Object.entries(draft.form || {}))
        if (id in fields && typeof value === 'string') fields[id as Field] = value;
      state = {
        ...state,
        fields,
        desktop:
          typeof draft.form['target-desktop'] === 'boolean' ? draft.form['target-desktop'] : true,
        mobile:
          typeof draft.form['target-mobile'] === 'boolean' ? draft.form['target-mobile'] : true,
        format: draft.creative.format,
        image: typeof draft.creative.image === 'string' ? draft.creative.image : exampleImage,
        locations: [
          ...new Set<string>(
            draft.creative.locations.filter((id: unknown) => typeof id === 'string'),
          ),
        ],
        indicators: [
          ...new Set<string>(
            draft.creative.indicators.filter((id: unknown) => typeof id === 'string'),
          ),
        ],
        days: String(draft.days),
        kind: draft.kind,
        channel: draft.channel,
        imageName: draft.imageName || 'Saved creative image',
        status: 'Saved draft restored.',
        tab: draft.kind === 'inquiry' ? 'request' : 'creative',
      };
    }
  } catch {
    state = {
      ...defaults,
      fields: { ...defaults.fields },
      status: 'Saved draft could not be restored. The form is available for a new draft.',
    };
  }
  return state;
}
function download(payload: unknown) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
    ),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'usa-atlas-ad-request.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useStudio() {
  const [state, setState] = useState<StudioState>(initialStudio),
    current = useRef(state);
  current.current = state;
  const [catalog, setCatalog] = useState<Metric[]>([]),
    [locations, setLocations] = useState<{ id: string; name: string }[]>([]),
    mobile = useMobile();
  const frame = useRef<HTMLIFrameElement>(null),
    leaveDialog = useRef<HTMLDialogElement>(null),
    imageVersion = useRef(0),
    previewReady = useRef(false),
    previewRevision = useRef(0),
    signature = useRef(''),
    fits = useRef(new Map<string, boolean>());
  const patch = (value: Partial<StudioState>) => {
    current.current = { ...current.current, ...value };
    setState(current.current);
  };
  const field = (id: string) => current.current.fields[id as Field] || '';
  function setField(id: string, value: string | boolean) {
    if (id === 'target-desktop' || id === 'target-mobile') {
      patch({
        [id === 'target-desktop' ? 'desktop' : 'mobile']: Boolean(value),
        dirty: true,
      });
      return;
    }
    if (!(id in current.current.fields)) return;
    patch({
      fields: { ...current.current.fields, [id]: String(value) },
      dirty: true,
      ...(current.current.fieldError?.id === id ? { fieldError: null, status: '' } : {}),
    });
  }
  function creative() {
    const s = current.current;
    return {
      format: s.format,
      headline: field('ad-headline'),
      subtitle: field('ad-subtitle'),
      cta: field('ad-cta'),
      url: field('ad-url').trim(),
      image: s.image,
      imageArea: +field('image-area'),
      imageZoom: +field('image-zoom'),
      imagePosition: +field('image-position'),
      speed: field('ticker-speed'),
      paused: false,
      theme: s.theme,
      locations: s.locations,
      indicators: s.indicators,
      devices: [...(s.desktop ? ['desktop'] : []), ...(s.mobile ? ['mobile'] : [])],
    };
  }
  function request() {
    const s = current.current;
    return {
      version: 2,
      kind: s.kind,
      creative: s.kind === 'placement' ? creative() : null,
      idea: s.kind === 'inquiry' ? field('inquiry-idea').trim() : '',
      durationDays:
        s.kind === 'inquiry'
          ? null
          : s.days === 'custom'
            ? Number(field('custom-days'))
            : Number(s.days),
      contact: {
        channel: s.channel,
        whatsapp: s.channel === 'whatsapp' ? field('contact-whatsapp').trim() : '',
        email: s.channel === 'email' ? field('contact-email').trim() : '',
        name: field('contact-name').trim(),
        message: field('contact-message').trim(),
      },
    };
  }
  function activateTab(tab: StudioState['tab']) {
    patch({ tab });
    document.querySelector('.studio-scroll')?.scrollTo(0, 0);
  }
  function saveDraft() {
    const s = current.current,
      form = {
        ...Object.fromEntries(Object.entries(s.fields).filter(([id]) => !id.endsWith('-search'))),
        'target-desktop': s.desktop,
        'target-mobile': s.mobile,
      },
      draft = {
        request: request(),
        creative: creative(),
        imageName: s.imageName,
        days: s.days,
        kind: s.kind,
        channel: s.channel,
        form,
      };
    try {
      localStorage.setItem('usa-atlas-ad-draft-v2', JSON.stringify(draft));
      patch({
        dirty: false,
        status: 'Draft saved in this browser. Nothing was sent.',
      });
      return true;
    } catch {
      download(draft);
      patch({
        status:
          'Browser storage is unavailable or full. A draft download was started; keep this page open until you have the file.',
      });
      return false;
    }
  }
  function checkRequest() {
    const payload = request(),
      errors = validateRequest(payload) as { id: string; message: string }[];
    if (errors.length) {
      const first = errors[0];
      patch({ fieldError: first, status: first.message });
      activateTab(
        first.id.startsWith('ad-') || first.id.includes('-search') || first.id.startsWith('target-')
          ? 'creative'
          : 'request',
      );
      requestAnimationFrame(() => {
        const input = document.getElementById(first.id);
        input?.closest('details')?.setAttribute('open', '');
        input?.focus();
      });
      return false;
    }
    patch({
      fieldError: null,
      status:
        current.current.kind === 'placement' &&
        !payload.creative!.devices.every((device) => fits.current.get(device) === true)
          ? 'Draft fields are valid. Placement fit still needs review; delivery is pending.'
          : 'Request is ready to download for review. Delivery is pending; nothing has been sent or published.',
    });
    return true;
  }
  function selectTarget(type: 'location' | 'indicator', id: string, remove = false) {
    const key = type === 'location' ? 'locations' : 'indicators',
      rows = current.current[key];
    if (remove && type === 'location' && rows.length === 1 && !mobile) {
      const input = document.getElementById('location-search');
      input?.closest('details')?.setAttribute('open', '');
      input?.focus();
      return;
    }
    patch({
      [key]: rows.includes(id) ? rows.filter((value) => value !== id) : [...rows, id],
      dirty: true,
    });
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    const version = ++imageVersion.current;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      patch({ status: 'Choose a JPG, PNG or WebP image up to 5 MB.' });
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error('Image could not be read.'));
          reader.onerror = () => reject(new Error('Image could not be read.'));
          reader.readAsDataURL(file);
        }),
        photo = new Image();
      photo.src = data;
      await photo.decode();
      if (version !== imageVersion.current) return;
      patch({ image: data, imageName: file.name, dirty: true });
    } catch (error) {
      patch({ status: error instanceof Error ? error.message : String(error) });
    }
  }
  function onClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement,
      link = target.closest('.studio-header>a');
    if (link && state.dirty) {
      event.preventDefault();
      patch({ leaveDialog: true });
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button) return;
    const d = button.dataset;
    if (d.tab) {
      patch({ kind: 'placement' });
      activateTab(d.tab as StudioState['tab']);
    }
    if (d.format)
      patch({
        format: d.format as StudioState['format'],
        dirty: true,
        ...(d.format === 'ticker' ? { mobile: false } : {}),
      });
    if (d.channel) patch({ channel: d.channel as StudioState['channel'], dirty: true });
    if (d.days) patch({ days: d.days, dirty: true });
    if (d.device)
      patch({
        device:
          mobile && d.device === 'desktop'
            ? state.device === 'desktop'
              ? 'mobile'
              : 'desktop'
            : (d.device as StudioState['device']),
      });
    if (['save-draft', 'save-mobile'].includes(button.id)) saveDraft();
    if (['review-request', 'mobile-review'].includes(button.id)) {
      const tab =
        button.id === 'review-request' && state.tab === 'request' ? 'creative' : 'request';
      if (tab === 'creative') patch({ kind: 'placement' });
      activateTab(tab);
    }
    if (button.id === 'custom-campaign') {
      patch({ kind: 'inquiry' });
      activateTab('request');
      requestAnimationFrame(() => document.getElementById('inquiry-idea')?.focus());
    }
    if (button.id === 'check-request') checkRequest();
    if (button.id === 'preview-theme') patch({ theme: state.theme === 'dark' ? 'light' : 'dark' });
    if (button.id === 'preview-highlight') patch({ highlight: !state.highlight });
    if (button.id === 'preview-in-place') {
      patch({ showPreview: true });
      requestAnimationFrame(() => document.getElementById('close-preview')?.focus());
    }
    if (button.id === 'close-preview') {
      patch({ showPreview: false });
      requestAnimationFrame(() => document.getElementById('preview-in-place')?.focus());
    }
    if (button.id === 'stay-in-studio') patch({ leaveDialog: false });
    if (button.id === 'save-and-leave' && saveDraft())
      location.href = (document.querySelector('.studio-header>a') as HTMLAnchorElement).href;
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && state.showPreview) patch({ showPreview: false });
    const group = (event.target as HTMLElement).closest(
      '.studio-tabs,.format-tabs,.contact-tabs,.duration-options,.device-tabs',
    );
    if (group && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const buttons = [...group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],
        i = buttons.indexOf(event.target as HTMLButtonElement),
        n =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (i + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[n]?.focus();
      buttons[n]?.click();
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (checkRequest()) download(request());
  }
  const ad = creative(),
    adSignature = JSON.stringify(ad),
    inquiry = state.kind === 'inquiry',
    requestTab = state.tab === 'request',
    locationCount =
      state.locations.length + ' location' + (state.locations.length === 1 ? '' : 's'),
    indicatorCount =
      state.indicators.length + ' indicator' + (state.indicators.length === 1 ? '' : 's');
  function text(id: string) {
    const counts = copyLimits(state.format) as Record<string, number>;
    if (id.endsWith('-count') && id.slice(0, -6) in counts) {
      const key = id.slice(0, -6);
      return characterCount(ad[key as 'headline' | 'subtitle' | 'cta']) + ' / ' + counts[key];
    }
    const values: Record<string, string> = {
      'studio-heading': inquiry
        ? 'Custom campaign'
        : requestTab
          ? 'Send your request'
          : 'Create your ad',
      'studio-explanation': inquiry
        ? 'Tell us your idea. A finished ad is optional.'
        : requestTab
          ? 'Send your ad for review or discuss a custom idea.'
          : 'Ready to place your ad or have a custom idea? Open Request.',
      'studio-status': state.status,
      'preview-status': state.previewStatus,
      'target-summary': `${locationCount} · ${indicatorCount} · ${state.format === 'banner' ? 'Banner' : 'Scrolling text'}`,
      'location-count': state.locations.length + ' selected',
      'indicator-count': state.indicators.length + ' selected',
      'area-output': ad.imageArea + '%',
      'zoom-output': ad.imageZoom + '%',
      'position-output': ad.imagePosition + '%',
      'message-count': characterCount(field('contact-message')) + ' / 2000',
      'image-filename': state.imageName,
      'preview-size':
        state.device === 'mobile' ? '390 × 844 · actual size' : '1440 × 900 · actual size',
      'review-request': requestTab ? 'Back to creative' : 'Review & send',
      'preview-theme': state.theme === 'dark' ? 'Light theme' : 'Dark theme',
    };
    return values[id] || '';
  }
  const subtitle = requestTab
    ? "We'll review your ad and contact you to agree on the placement."
    : state.locations.length > 1 || state.indicators.length > 2
      ? locationCount + ' · ' + indicatorCount
      : 'Choose your audience. See your ad in place.';
  useEffect(() => {
    document.body.dataset.theme = state.theme;
    document.body.dataset.requestKind = state.kind;
    document.body.classList.toggle('show-preview', state.showPreview);
  }, [state.theme, state.kind, state.showPreview]);
  useLayoutEffect(() => {
    const resize = () => {
      const iframe = frame.current,
        parent = iframe?.closest('.preview-frame');
      if (!iframe || !parent) return;
      const width = state.device === 'mobile' ? 390 : 1440,
        height = state.device === 'mobile' ? 844 : 900,
        scale = Math.min(1, parent.clientWidth / width, parent.clientHeight / height);
      iframe.style.transform = `translateX(-50%) scale(${scale})`;
      iframe.style.setProperty('--preview-transform', iframe.style.transform);
    };
    const observer = new ResizeObserver(resize);
    if (frame.current?.parentElement) observer.observe(frame.current.parentElement);
    resize();
    return () => observer.disconnect();
  }, [state.device, mobile, state.showPreview]);
  useLayoutEffect(() => {
    const dialog = leaveDialog.current;
    if (!dialog) return;
    if (state.leaveDialog && !dialog.open) {
      dialog.showModal();
      document.getElementById('stay-in-studio')?.focus();
    } else if (!state.leaveDialog && dialog.open) dialog.close();
  }, [state.leaveDialog]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'atlas-preview-ready') {
        previewReady.current = true;
        frame.current.contentWindow?.postMessage(
          {
            type: 'atlas-ad-preview',
            revision: previewRevision.current,
            creative: creative(),
            theme: current.current.theme,
            highlight: current.current.highlight,
          },
          location.origin,
        );
      }
      if (
        event.data?.type === 'atlas-preview-status' &&
        event.data.revision === previewRevision.current
      ) {
        if (event.data.targeted) fits.current.set(event.data.device, event.data.fits);
        patch({
          previewError: !event.data.targeted || event.data.fits === false,
          previewStatus:
            current.current.kind === 'inquiry'
              ? 'Placement reference. Your creative draft is retained.'
              : !event.data.targeted
                ? 'Creative hidden: this preview location, indicator or device is outside your selection.'
                : event.data.fits === false
                  ? 'Creative does not fit. Shorten the copy or give it more image/text space.'
                  : event.data.fits === true
                    ? 'Your creative fits this visitor placement.'
                    : 'Your creative in the visitor placement. Fit has not been verified.',
        });
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (current.current.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('message', message);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('message', message);
      window.removeEventListener('beforeunload', unload);
      imageVersion.current++;
    };
  }, []);
  useEffect(() => {
    if (signature.current !== adSignature) {
      fits.current.clear();
      signature.current = adSignature;
      previewRevision.current++;
    }
    if (previewReady.current)
      frame.current?.contentWindow?.postMessage(
        {
          type: 'atlas-ad-preview',
          revision: previewRevision.current,
          creative: ad,
          theme: state.theme,
          highlight: state.highlight,
        },
        location.origin,
      );
    if (!supportsDevice(state.format, state.device)) patch({ device: 'desktop' });
  }, [adSignature, state.highlight, state.kind]);
  useEffect(() => {
    let alive = true;
    void Promise.all(
      ['/api/atlas/catalog', '../node_modules/us-atlas/counties-10m.json'].map((url) =>
        readAtlasJSON(url),
      ),
    )
      .then(([data, topology]) => {
        if (!alive) return;
        const admitted = collectedMapIndicators(data.metrics) as Metric[],
          states = topology.objects.states.geometries.filter(
            (f: { id: string }) => Number(f.id) < 60,
          ) as { id: string; properties: { name: string } }[],
          names = new Map(states.map((f) => [f.id, f.properties.name]));
        setCatalog(admitted);
        setLocations([
          ...states.map((f) => ({ id: f.id, name: f.properties.name })),
          ...topology.objects.counties.geometries
            .filter((f: { id: string }) => names.has(f.id.slice(0, 2)))
            .map((f: { id: string; properties: { name: string } }) => ({
              id: f.id,
              name: f.properties.name + ' · ' + names.get(f.id.slice(0, 2)) + ' · County',
            })),
        ]);
        const ids = new Set(admitted.map((item) => item.id));
        if (current.current.indicators.some((id) => !ids.has(id)))
          patch({
            indicators: current.current.indicators.filter((id) => ids.has(id)),
            dirty: true,
            status:
              'Unavailable indicator selections were removed. Choose from the collected fields.',
          });
      })
      .catch((error) => {
        if (alive)
          patch({
            status: error.message + ' Reload to retry. Your draft is retained.',
          });
      });
    return () => {
      alive = false;
    };
  }, []);
  return {
    state,
    patch,
    mobile,
    field,
    setField,
    catalog,
    locations,
    creative,
    request,
    submit,
    selectTarget,
    upload,
    onClick,
    onKeyDown,
    text,
    subtitle,
    frame,
    leaveDialog,
    labels,
    invalid: validateRequest(request()).length > 0,
  };
}
export type Studio = ReturnType<typeof useStudio>;
