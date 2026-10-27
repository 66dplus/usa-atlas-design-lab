import { createHash } from 'node:crypto';

export const PINNED_ROLLBACK_BASELINE = Object.freeze({
  buildSha256: '15d14add13c2d3c01e2e273f6622d034e56615d85008d002d3dac4a60754313d',
  sourceCommit: '31b1feeba5975b75ef1438ce63fb44496c231d2d',
  releaseId: '20261026-data-period-31b1fee-r1',
  imageDigest: 'sha256:72d695e5809aec817bb2874d4fb1b95d01a9310b2db490655e604e92e98a9cc6',
});

export const PINNED_ARCHIVED_A = Object.freeze({
  buildSha256: '213f3c50fdd595420f19b917bb13c0b47c6463049695de0ae08ed9197a252859',
  sourceCommit: 'ed8eefbe22c3befcf2b40d5e16fde0948e696772',
  releaseId: '20261025-versioning-ed8eefb-A',
  imageDigest: 'sha256:a19e40876e8cdc70ad94caad5ba25ca582a56da5388203fc3d0d12259d576df9',
});

function matchesIdentity(identity, pinned) {
  return Object.keys(pinned).every((key) => identity?.[key] === pinned[key]);
}

export function isPinnedRollbackBaseline(identity) {
  return matchesIdentity(identity, PINNED_ROLLBACK_BASELINE);
}

export function isPinnedArchivedA(identity) {
  return matchesIdentity(identity, PINNED_ARCHIVED_A);
}

export function selectUiExpectationProfile(identity) {
  const baseline = isPinnedRollbackBaseline(identity);
  const archivedA = isPinnedArchivedA(identity);
  return {
    baseline,
    archivedA,
    legacyJournal: baseline || archivedA,
    profile: baseline ? 'accepted-rollback-baseline' : archivedA ? 'archived-versioning-A' : 'compiled-react-v1',
  };
}

export async function readUiExpectationProfile(base, imageDigest) {
  const response = await fetch(new URL('/ux/build.json', base));
  if (!response.ok) throw new Error(`Cannot read actual runtime build identity: HTTP ${response.status}`);
  const raw = Buffer.from(await response.arrayBuffer());
  const build = JSON.parse(raw.toString('utf8'));
  const identity = {
    buildSha256: createHash('sha256').update(raw).digest('hex'),
    sourceCommit: build.sourceCommit,
    releaseId: build.release,
    imageDigest,
  };
  return {
    identity,
    ...selectUiExpectationProfile(identity),
  };
}
