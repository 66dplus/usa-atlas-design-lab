import assert from 'node:assert/strict';
import {
  isPinnedArchivedA,
  isPinnedRollbackBaseline,
  PINNED_ARCHIVED_A,
  PINNED_ROLLBACK_BASELINE,
  selectUiExpectationProfile,
} from './ui-expectation-profile.mjs';

assert.equal(isPinnedRollbackBaseline(PINNED_ROLLBACK_BASELINE), true,
  'Only the complete reviewed rollback identity selects legacy UI expectations');
assert.equal(isPinnedArchivedA(PINNED_ARCHIVED_A), true,
  'Only the complete archived-A identity selects its legacy Journal HTTP expectations');
assert.deepEqual(selectUiExpectationProfile(PINNED_ROLLBACK_BASELINE), {
  baseline: true, archivedA: false, legacyJournal: true, profile: 'accepted-rollback-baseline',
});
assert.deepEqual(selectUiExpectationProfile(PINNED_ARCHIVED_A), {
  baseline: false, archivedA: true, legacyJournal: true, profile: 'archived-versioning-A',
});
for (const [profile, identity, matches] of [
  ['31b1feeba baseline', PINNED_ROLLBACK_BASELINE, isPinnedRollbackBaseline],
  ['archived versioning A', PINNED_ARCHIVED_A, isPinnedArchivedA],
]) {
  for (const field of Object.keys(identity)) {
    const changed = { ...identity, [field]: '0'.repeat(identity[field].length) };
    assert.equal(matches(changed), false, `${profile}: changing ${field} disables the exact profile`);
    assert.equal(selectUiExpectationProfile(changed).legacyJournal, false,
      `${profile}: changing ${field} keeps new Journal HTTP expectations`);
    const missing = { ...identity };
    delete missing[field];
    assert.equal(matches(missing), false, `${profile}: missing ${field} disables the exact profile`);
    assert.equal(selectUiExpectationProfile(missing).legacyJournal, false,
      `${profile}: missing ${field} keeps new Journal HTTP expectations`);
  }
}
assert.equal(isPinnedRollbackBaseline(PINNED_ARCHIVED_A), false);
assert.equal(isPinnedArchivedA(PINNED_ROLLBACK_BASELINE), false);
assert.equal(selectUiExpectationProfile(null).legacyJournal, false);
assert.equal(isPinnedRollbackBaseline(null), false);
assert.equal(isPinnedArchivedA(null), false);
console.log('PASS: pinned legacy profiles require exact raw build, source, release and image identities');
