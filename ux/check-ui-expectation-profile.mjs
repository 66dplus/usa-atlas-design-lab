import assert from 'node:assert/strict';
import { isPinnedRollbackBaseline, PINNED_ROLLBACK_BASELINE } from './ui-expectation-profile.mjs';

assert.equal(isPinnedRollbackBaseline(PINNED_ROLLBACK_BASELINE), true,
  'Only the complete reviewed rollback identity selects legacy UI expectations');
for (const field of Object.keys(PINNED_ROLLBACK_BASELINE)) {
  const changed = { ...PINNED_ROLLBACK_BASELINE, [field]: '0'.repeat(PINNED_ROLLBACK_BASELINE[field].length) };
  assert.equal(isPinnedRollbackBaseline(changed), false, `Changing ${field} disables the baseline profile`);
  const missing = { ...PINNED_ROLLBACK_BASELINE };
  delete missing[field];
  assert.equal(isPinnedRollbackBaseline(missing), false, `Missing ${field} disables the baseline profile`);
}
assert.equal(isPinnedRollbackBaseline(null), false);
console.log('PASS: pinned rollback UI profile requires exact raw build, source, release and image identities');
