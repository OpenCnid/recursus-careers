import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS } from '../../lib/recursus/rc5-provider-executor.mjs';
import { RC5_PROVIDER_WORKER_INTERNALS_FOR_TESTS } from '../../lib/recursus/rc5-provider-worker.mjs';

const {
  allocateAuthorityResources,
  authorityCreationReconciled,
  boundedDeadlineTimeout,
  containmentMayRelease,
  CLEANUP_HEADROOM_MS,
  deadlineRemainingMs,
  MAX_TIMEOUT_MS,
  WORKER_EXIT_GRACE_MS,
} = RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS;

test('shared deadline bounds every post-dispatch operation and closes at expiry', () => {
  const startedAt = 1_000;
  const deadline = startedAt + MAX_TIMEOUT_MS;
  assert.equal(deadlineRemainingMs(deadline, startedAt), MAX_TIMEOUT_MS);
  assert.equal(deadlineRemainingMs(deadline, startedAt + 0.9), MAX_TIMEOUT_MS - 1);
  assert.equal(deadlineRemainingMs(deadline, deadline), 0);
  assert.equal(deadlineRemainingMs(deadline, deadline + 1), 0);
  assert.equal(deadlineRemainingMs(Number.POSITIVE_INFINITY, deadline), Number.POSITIVE_INFINITY);

  const workerTimeout = deadlineRemainingMs(deadline, startedAt) - CLEANUP_HEADROOM_MS - WORKER_EXIT_GRACE_MS;
  assert.equal(workerTimeout, 475_000);
  assert.equal(boundedDeadlineTimeout(deadline, 30_000, deadline - 45_000), 30_000);
  assert.equal(boundedDeadlineTimeout(deadline, 30_000, deadline - 1_500), 1_500);
  assert.equal(boundedDeadlineTimeout(deadline, 30_000, deadline), 0);
  assert.equal(boundedDeadlineTimeout(deadline, 30_000, deadline + 1), 0);
  assert.equal(boundedDeadlineTimeout(Number.POSITIVE_INFINITY, 30_000, deadline), 30_000);
  assert.equal(boundedDeadlineTimeout(deadline, 0, startedAt), 0);
});

test('preallocated authority descriptor cannot be reported clean before creation is reconciled absent', () => {
  const resources = allocateAuthorityResources('0123456789abcdef');
  assert.equal(Object.isSealed(resources), true);
  assert.equal(Object.isFrozen(resources.names), true);
  assert.deepEqual(resources.names, {
    network: 'rc5-exec-net-0123456789abcdef',
    proxy: 'rc5-exec-proxy-0123456789abcdef',
    relay: 'rc5-exec-relay-0123456789abcdef',
    socket: 'rc5-exec-socket-0123456789abcdef',
    worker: 'rc5-exec-worker-0123456789abcdef',
  });
  assert.deepEqual(resources.creation, {
    network: 'pending',
    proxy: 'pending',
    relay: 'pending',
    socket: 'pending',
    state: 'descriptor_published',
    worker: 'pending',
  });
  assert.equal(authorityCreationReconciled(resources), false);
  assert.equal(containmentMayRelease({ cleaned: true, inspection_error_count: 0 }, resources), false);

  for (const key of ['network', 'proxy', 'relay', 'socket', 'worker']) resources.creation[key] = 'absent';
  assert.equal(authorityCreationReconciled(resources), false);
  resources.creation.state = 'reconciled_absent';
  resources.relayId = 'sha256:still-present';
  assert.equal(authorityCreationReconciled(resources), false);
  resources.relayId = null;
  assert.equal(authorityCreationReconciled(resources), true);
});

test('signal containment releases only after strict cleanup and reconciled authority absence', () => {
  const resources = allocateAuthorityResources('fedcba9876543210');
  for (const cleanupObservation of [
    undefined,
    { cleaned: false, inspection_error_count: 0 },
    { cleaned: true, inspection_error_count: 0 },
  ]) {
    assert.equal(containmentMayRelease(cleanupObservation, resources), false);
  }

  for (const key of ['network', 'proxy', 'relay', 'socket', 'worker']) resources.creation[key] = 'absent';
  resources.creation.state = 'reconciled_absent';
  assert.equal(containmentMayRelease({ cleaned: false, inspection_error_count: 0 }, resources), false);
  assert.equal(containmentMayRelease({ cleaned: true, inspection_error_count: 0 }, resources), true);
});

test('production signal containment stays persistent through the verified-cleanup release gate', () => {
  const source = readFileSync(new URL('../../lib/recursus/rc5-provider-executor.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.on\('SIGINT', containSigint\);/u);
  assert.match(source, /process\.on\('SIGTERM', containSigterm\);/u);
  assert.doesNotMatch(source, /process\.once\('SIG(?:INT|TERM)'/u);
  const releaseDecision = source.indexOf('cleaned = containmentMayRelease(observation, describedResources);');
  const removeSigint = source.indexOf("process.removeListener('SIGINT', containSigint);", releaseDecision);
  const removeSigterm = source.indexOf("process.removeListener('SIGTERM', containSigterm);", releaseDecision);
  assert.ok(releaseDecision >= 0);
  assert.ok(removeSigint > releaseDecision);
  assert.ok(removeSigterm > releaseDecision);
});

test('worker timeout accepts cleanup headroom and rejects limits above registered authority', () => {
  const { validateWorkerTimeout } = RC5_PROVIDER_WORKER_INTERNALS_FOR_TESTS;
  assert.equal(validateWorkerTimeout(535_000, MAX_TIMEOUT_MS), true);
  assert.equal(validateWorkerTimeout(1_000, MAX_TIMEOUT_MS), true);
  assert.throws(() => validateWorkerTimeout(MAX_TIMEOUT_MS + 1, MAX_TIMEOUT_MS), { code: 'WORKER_INPUT' });
  assert.throws(() => validateWorkerTimeout(535_001, 535_000), { code: 'WORKER_INPUT' });
  assert.throws(() => validateWorkerTimeout(999, MAX_TIMEOUT_MS), { code: 'WORKER_INPUT' });
});
