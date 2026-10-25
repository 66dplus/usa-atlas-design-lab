import type { Page } from './types';
export function reportPageUrl(pathname: string, search: string, page: Page): string {
  const allowedPath =
    /^\/(?:about|support|stats|blog(?:\/[a-z0-9-]{1,64})?|compare(?:\/[a-z0-9-]{1,64}){1,7}|united-states(?:\/[a-z0-9-]{1,64}){0,4})$/;
  const fallback =
    (
      {
        info: '/about',
        support: '/support',
        stats: '/stats',
        blog: '/blog',
        article: '/blog',
      } as Partial<Record<Page, string>>
    )[page] || '/about';
  const path = allowedPath.test(pathname) ? pathname : fallback;
  const rules: Record<string, RegExp> = {
    embed: /^1$/,
    preview: /^1$/,
    review: /^1$/,
    view: /^(?:2d|3d)$/,
    place: /^(?:US|[0-9]{2,5})$/,
    other: /^(?:US|[0-9]{2,5})$/,
    metric: /^[A-Za-z0-9._:-]{1,100}$/,
    metric2: /^[A-Za-z0-9._:-]{1,100}$/,
    comparison: /^(?:metrics|places)$/,
    rank: /^(?:highest|lowest)$/,
  };
  const source = new URLSearchParams(search),
    clean = new URLSearchParams();
  for (const [key, rule] of Object.entries(rules)) {
    const values = source.getAll(key);
    if (values.length === 1 && rule.test(values[0])) clean.set(key, values[0]);
  }
  const query = clean.toString();
  return path + (query ? '?' + query : '');
}
export interface ReportContext {
  page?: string;
  placeId?: string | null;
  place?: string | null;
  indicatorId?: string | null;
  indicator?: string | null;
  period?: string | null;
}
export interface ReportDraft {
  description: string;
  contact: string;
  website: string;
  pageUrl: string;
  context: ReportContext;
  status: string;
  phase: 'idle' | 'sending' | 'success' | 'error';
  initialized: boolean;
}
export const emptyReport = (): ReportDraft => ({
  description: '',
  contact: '',
  website: '',
  pageUrl: '',
  context: {},
  status: '',
  phase: 'idle',
  initialized: false,
});
export function reportResponse(status: number, result: unknown): boolean {
  return (
    status === 201 &&
    typeof result === 'object' &&
    result !== null &&
    'saved' in result &&
    result.saved === true &&
    'id' in result &&
    typeof result.id === 'string'
  );
}
