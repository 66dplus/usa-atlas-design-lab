import { createHash } from 'node:crypto';

export const PINNED_ROLLBACK_BASELINE = Object.freeze({
  buildSha256: '15d14add13c2d3c01e2e273f6622d034e56615d85008d002d3dac4a60754313d',
  sourceCommit: '31b1feeba5975b75ef1438ce63fb44496c231d2d',
  releaseId: '20261026-data-period-31b1fee-r1',
  imageDigest: 'sha256:72d695e5809aec817bb2874d4fb1b95d01a9310b2db490655e604e92e98a9cc6',
});

export function isPinnedRollbackBaseline(identity) {
  return Object.keys(PINNED_ROLLBACK_BASELINE).every(
    (key) => identity?.[key] === PINNED_ROLLBACK_BASELINE[key],
  );
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
    baseline: isPinnedRollbackBaseline(identity),
    identity,
    profile: isPinnedRollbackBaseline(identity) ? 'accepted-rollback-baseline' : 'compiled-react-v1',
  };
}
