import assert from 'node:assert/strict';

/** Test-only pass-through: expose complete paused-request headers before reload. */
export async function enableCompleteRequestHeaders(context) {
  // Routing disables this test context's HTTP cache. No request is rewritten,
  // filtered or suppressed; production analytics and browser code are untouched.
  await context.route('**/*', route => route.continue());
}

/** Retain failures until assertion time without unhandled promise rejections. */
export function observedMetadata(promise, phase, milliseconds = 8000) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Metadata deadline')), milliseconds);
  });
  return Promise.race([promise, deadline]).then(
    value => ({ ok: true, value }),
    () => ({ ok: false, phase }),
  ).finally(() => clearTimeout(timer));
}

export async function requiredMetadata(tasks) {
  const outcomes = await Promise.all(tasks);
  for (const outcome of outcomes)
    assert.ok(outcome.ok, 'Studio network metadata unavailable: ' + outcome.phase);
  return outcomes.map(outcome => outcome.value);
}
