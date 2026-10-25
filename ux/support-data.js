const IMPROVEMENT_STATUSES = new Set(['planned', 'funded', 'shipped']);
const CENTS_EPSILON = 1e-8;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validUsd(value, {allowZero = false} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (allowZero ? value < 0 : value <= 0) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) < CENTS_EPSILON;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function normalizeImprovements(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const rows = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const {id, title, status, description} = item;
    if (!nonEmptyString(id) || !nonEmptyString(title) || !IMPROVEMENT_STATUSES.has(status)) return null;
    const normalizedId = id.trim();
    if (seen.has(normalizedId)) return null;
    if (description !== undefined && !nonEmptyString(description)) return null;
    seen.add(normalizedId);
    rows.push({id: normalizedId, title: title.trim(), status, ...(description ? {description: description.trim()} : {})});
  }
  return rows;
}

/** Validate optional manually maintained USD funding data without inventing zeroes. */
export function normalizeSupportGoal(rawGoal) {
  if (rawGoal == null) return {status: 'unconfigured', goal: null};
  if (!rawGoal || typeof rawGoal !== 'object' || Array.isArray(rawGoal)) return {status: 'unavailable', goal: null, reason: 'invalid-goal'};
  const {title, targetUsd, raisedUsd, updatedAt} = rawGoal;
  const improvements = normalizeImprovements(rawGoal.improvements);
  if (rawGoal.status === 'planning') {
    if (!validUsd(targetUsd) || (title != null && !nonEmptyString(title)) || raisedUsd != null || updatedAt != null || !improvements) {
      return {status: 'unavailable', goal: null, reason: 'invalid-planned-goal'};
    }
    return {status: 'planning', goal: {
      title: title?.trim() || null, targetUsd, raisedUsd: null, updatedAt: null,
      progress: null, progressPercent: null, state: 'planning', improvements
    }};
  }
  if (!nonEmptyString(title) || !validUsd(targetUsd) || !validUsd(raisedUsd, {allowZero: true}) || !validDate(updatedAt) || !improvements) {
    return {status: 'unavailable', goal: null, reason: 'invalid-goal'};
  }

  const progress = Math.min(1, Math.max(0, raisedUsd / targetUsd));
  const state = raisedUsd === 0 ? 'zero' : raisedUsd > targetUsd ? 'over-goal' : raisedUsd === targetUsd ? 'funded' : 'partial';
  return {
    status: 'available',
    goal: {
      title: title.trim(),
      targetUsd,
      raisedUsd,
      updatedAt,
      progress,
      progressPercent: Math.round(progress * 100),
      state,
      ...(raisedUsd > targetUsd ? {overageUsd: raisedUsd - targetUsd} : {}),
      improvements
    }
  };
}

function httpsUrl(value) {
  if (!nonEmptyString(value)) return false;
  try { return new URL(value).protocol === 'https:'; }
  catch { return false; }
}

function safeQrUrl(value) {
  if (httpsUrl(value)) return true;
  if (!nonEmptyString(value) || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return false;
  try {
    const path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (path.split('/').some(segment => segment === '.' || segment === '..')) return false;
    const url = new URL(value, 'https://usa-xray.invalid');
    return url.origin === 'https://usa-xray.invalid' && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** Expose only owner-confirmed, complete external payment destinations. */
export function normalizeDonationMethods(rawMethods) {
  if (rawMethods == null) return {status: 'unconfigured', externalLinks: [], wallets: []};
  if (typeof rawMethods !== 'object' || Array.isArray(rawMethods)) return {status: 'unavailable', externalLinks: [], wallets: []};

  if ((rawMethods.externalLinks !== undefined && !Array.isArray(rawMethods.externalLinks)) ||
      (rawMethods.wallets !== undefined && !Array.isArray(rawMethods.wallets))) {
    return {status: 'unavailable', externalLinks: [], wallets: [], reason: 'invalid-payment-destinations'};
  }

  const externalLinks = [];
  const wallets = [];
  for (const link of rawMethods.externalLinks || []) {
    if (!link || typeof link !== 'object' || Array.isArray(link)) return {status: 'unavailable', externalLinks: [], wallets: [], reason: 'invalid-payment-destinations'};
    if (link.confirmed !== true) continue;
    if (!nonEmptyString(link.id) || !nonEmptyString(link.label) || !httpsUrl(link.url)) return {status: 'unavailable', externalLinks: [], wallets: [], reason: 'invalid-payment-destinations'};
    externalLinks.push({id: link.id.trim(), label: link.label.trim(), url: link.url});
  }
  for (const wallet of rawMethods.wallets || []) {
    if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)) return {status: 'unavailable', externalLinks: [], wallets: [], reason: 'invalid-payment-destinations'};
    if (wallet.confirmed !== true) continue;
    if (!nonEmptyString(wallet.id) || !nonEmptyString(wallet.asset) || !nonEmptyString(wallet.network) ||
        !nonEmptyString(wallet.address) || !safeQrUrl(wallet.qrUrl)) {
      return {status: 'unavailable', externalLinks: [], wallets: [], reason: 'invalid-payment-destinations'};
    }
    wallets.push({id: wallet.id.trim(), asset: wallet.asset.trim(), network: wallet.network.trim(), address: wallet.address.trim(), qrUrl: wallet.qrUrl});
  }

  return {
    status: externalLinks.length || wallets.length ? 'available' : 'unconfigured',
    externalLinks,
    wallets
  };
}

/** Normalize the small public support configuration; no API or payment processing is involved. */
export function normalizeSupportData(rawSupport) {
  if (rawSupport == null) return {
    status: 'unconfigured',
    goal: normalizeSupportGoal(null),
    donationMethods: normalizeDonationMethods(null)
  };
  if (typeof rawSupport !== 'object' || Array.isArray(rawSupport)) return {
    status: 'unavailable',
    goal: {status: 'unavailable', goal: null, reason: 'invalid-support-config'},
    donationMethods: {status: 'unavailable', externalLinks: [], wallets: []}
  };
  const goal = normalizeSupportGoal(rawSupport.goal);
  const donationMethods = normalizeDonationMethods(rawSupport.donationMethods);
  const status = goal.status === 'unavailable' || donationMethods.status === 'unavailable'
    ? 'unavailable'
    : goal.status === 'available' || donationMethods.status === 'available' ? 'available' : goal.status === 'planning' ? 'planning' : 'unconfigured';
  return {status, goal, donationMethods};
}
