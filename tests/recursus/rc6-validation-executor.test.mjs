import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as validationExecutor from '../../lib/recursus/rc6-validation-executor.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXPECTED_IMAGE_ID = 'sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1';
const EXPECTED_PARENT_ID = 'sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df';
const EXPECTED_ADAPTER_CONTEXT_SHA256 = '9222f8062771d7b4e7c17bf2e91869fe92207bc198736a08aa2ff52ee1a6cb92';
const EXPECTED_SYNTHETIC_CREDENTIAL_SHA256 = 'afbcaf09efdcdcb365c45db7e1da1e65bcb2b14c5acd28a262913eebe2cb3a2b';

const EXPECTED_EXPORTS = Object.freeze([
  'RC5_PROVIDER_FREE_SIMULATOR_SOURCE',
  'RC5_PROVIDER_WORKER_SOURCE',
  'RC5_PROXY_SOURCE',
  'RC6_VALIDATION_ADAPTER_SOURCE',
  'RC6_VALIDATION_EXECUTOR_ID',
  'RC6_VALIDATION_EXECUTOR_IMAGE',
  'RC6_VALIDATION_EXECUTOR_IMAGE_ID',
  'RC6_VALIDATION_EXECUTOR_PARENT_IMAGE_ID',
  'deriveCredentialLockHome',
  'executeRC6ValidationProviderFreeCase',
]);

const EXPECTED_GIT_BLOBS = Object.freeze({
  'lib/recursus/rc5-provider-executor.mjs': 'b2f493e93f6273181ea1eeebc955febb7ec347ab',
  'lib/recursus/rc5-provider-worker.mjs': 'bf1aef5f7c9609d27e1a4d5433e898166658194a',
  'lib/recursus/rc5-slice.mjs': 'a534043eaaac319a93bdaa5a362d3349dac6b8a8',
  'scripts/recursus/Dockerfile.rc5-bounded-executor': '3b97b598cdb5b502f02c30f825472e1132b66d59',
  'scripts/recursus/Dockerfile.rc5-ordered-adapter': '4c35deb4fda8411e9e07159b4b53fd1a1bc92894',
  'scripts/recursus/rc5-provider-free-payload-probe.cjs': '692d7a2309ccd05cad1457859096b84d1306ea18',
});

const EXPECTED_RETAINED_SOURCE_SHA256 = Object.freeze({
  'lib/recursus/rc5-provider-worker.mjs': '065fe2f438bbb9845a1cfec6060045b3d5e726a4a627470d198f22c9156d4296',
  'lib/recursus/recursus-route-content-gate-v17.mjs': 'b84ef7d9e5038ffbd9d3d8de2c8922d60d2f6e9ad1a9b423f8c20cf940e98ca9',
  'lib/recursus/recursus-route-credential-permission-v17.mjs': 'cc746b71374b571ff694b47cf50a87dce8bddb657536c49f62dbce83f591cea8',
  'lib/recursus/recursus-route-html-entities-v17.mjs': '52d1442b546be20f20d5e7d42182a8809c2b18ab90bb4fbe3919410fd17bb8e6',
  'lib/recursus/recursus-route-proxy-v17.mjs': '8a9c575a09460d71d2e3d851635fc423e611fc51bf6611232020ab33b2d4a9ba',
  'lib/recursus/recursus-route-relay-v17.mjs': '95bfa50861d5f397d21df641149cec63b5e74785105fd9e29986d17e557279fe',
  'lib/recursus/recursus-route-socket-init-v17.mjs': '9e50ce6e4137654cefbc10b22a3052371a15f7c984291dc0e415ba50dd4aed08',
  'scripts/recursus/rc5-provider-free-payload-probe.cjs': '98337ae5d08ca2f68a4ac94e80a1492930e92c3a33b685b0c5d20d1eaccde6af',
});

function repositoryBytes(relativePath) {
  return readFileSync(path.join(REPOSITORY_ROOT, ...relativePath.split('/')));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobId(bytes) {
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

test('validation executor exposes only the closed provider-free public surface', () => {
  assert.deepEqual(Object.keys(validationExecutor).sort(), [...EXPECTED_EXPORTS].sort());
  assert.equal(typeof validationExecutor.deriveCredentialLockHome, 'function');
  assert.equal(typeof validationExecutor.executeRC6ValidationProviderFreeCase, 'function');

  const forbiddenExport = Object.keys(validationExecutor).find((name) =>
    /(?:INTERNAL|live|preflight|prepare|probe)/u.test(name));
  assert.equal(forbiddenExport, undefined);
});

test('validation executor exports the registered image and retained source identities', () => {
  assert.equal(validationExecutor.RC6_VALIDATION_EXECUTOR_ID, 'RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1');
  assert.equal(validationExecutor.RC6_VALIDATION_EXECUTOR_IMAGE, 'recursus-rc6-validation-executor:2fc0209');
  assert.equal(validationExecutor.RC6_VALIDATION_EXECUTOR_IMAGE_ID, EXPECTED_IMAGE_ID);
  assert.equal(validationExecutor.RC6_VALIDATION_EXECUTOR_PARENT_IMAGE_ID, EXPECTED_PARENT_ID);

  assert.deepEqual(validationExecutor.RC5_PROVIDER_WORKER_SOURCE, {
    byte_count: 75_569,
    path: '/opt/rc5/rc5-provider-worker.mjs',
    sha256: '065fe2f438bbb9845a1cfec6060045b3d5e726a4a627470d198f22c9156d4296',
  });
  assert.deepEqual(validationExecutor.RC5_PROXY_SOURCE, {
    byte_count: 9_399,
    path: '/opt/rc5/rc5-route-proxy.mjs',
    sha256: 'd954e9a2c4149dff01c5bb65b3bfece4bfbd3724db9b68ab21deb7f2da3d470d',
  });
  assert.deepEqual(validationExecutor.RC5_PROVIDER_FREE_SIMULATOR_SOURCE, {
    byte_count: 28_540,
    path: '/opt/rc5/rc5-provider-free-payload-probe.cjs',
    sha256: '98337ae5d08ca2f68a4ac94e80a1492930e92c3a33b685b0c5d20d1eaccde6af',
  });
  assert.deepEqual(validationExecutor.RC6_VALIDATION_ADAPTER_SOURCE, {
    byte_count: 71_526,
    path: '/opt/recursus-profile/node_modules/deepseek-openai-codex/lib/index.js',
    sha256: '569ab649694658c20b67c904bc9b1e1317ce2d038b0853385c546283f866e6d0',
  });

  for (const source of [
    validationExecutor.RC5_PROVIDER_WORKER_SOURCE,
    validationExecutor.RC5_PROXY_SOURCE,
    validationExecutor.RC5_PROVIDER_FREE_SIMULATOR_SOURCE,
    validationExecutor.RC6_VALIDATION_ADAPTER_SOURCE,
  ]) assert.equal(Object.isFrozen(source), true);
});

test('validation executor Dockerfile is closed, digest-pinned, and install-free', () => {
  const dockerfile = repositoryBytes('scripts/recursus/Dockerfile.rc6-validation-executor').toString('utf8');

  assert.match(dockerfile, /^ARG SOURCE_DATE_EPOCH=1787792392$/mu);
  assert.match(dockerfile, new RegExp(`^FROM node:24\\.19\\.0-bookworm-slim@${EXPECTED_PARENT_ID}$`, 'mu'));
  assert.match(dockerfile, /^COPY --from=adapter-context node_modules\/ \/opt\/recursus-profile\/node_modules\/$/mu);
  assert.match(dockerfile, /^COPY --chown=65532:65532 lib\/recursus\/rc6-synthetic-credentials-local\.mjs \/opt\/recursus-profile\/node_modules\/@deepseek-ai\/dsh-credentials-local\/lib\/index\.js$/mu);
  assert.match(dockerfile, /^LABEL org\.opencontainers\.image\.revision="rc6-oferta-validation-executor-v1" \\$/mu);
  assert.match(dockerfile, new RegExp(`org\\.opencontainers\\.image\\.base\\.digest="${EXPECTED_PARENT_ID}"`, 'u'));
  assert.match(dockerfile, /io\.opencnid\.recursus\.rc6-validation-executor="RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1"/u);
  assert.match(dockerfile, /io\.opencnid\.recursus\.rc6-adapter-revision="2fc02090af1632b86ee1175a6720904dfd71081c"/u);
  assert.match(dockerfile, /io\.opencnid\.recursus\.rc6-adapter-context\.sha256="\$\{ADAPTER_CONTEXT_SHA256\}"/u);
  assert.match(dockerfile, new RegExp(`io\\.opencnid\\.recursus\\.rc6-synthetic-credentials-local\\.sha256="${EXPECTED_SYNTHETIC_CREDENTIAL_SHA256}"`, 'u'));
  assert.match(dockerfile, /io\.opencnid\.recursus\.rc5-provider-worker\.sha256="065fe2f438bbb9845a1cfec6060045b3d5e726a4a627470d198f22c9156d4296"/u);
  assert.match(dockerfile, /io\.opencnid\.recursus\.rc5-proxy\.sha256="d954e9a2c4149dff01c5bb65b3bfece4bfbd3724db9b68ab21deb7f2da3d470d"/u);
  assert.match(dockerfile, /io\.opencnid\.recursus\.rc5-provider-free-simulator\.sha256="98337ae5d08ca2f68a4ac94e80a1492930e92c3a33b685b0c5d20d1eaccde6af"/u);
  assert.match(dockerfile, /io\.opencnid\.recursus\.rc5-container-run-authority\.sha256="e284b3117d56e4961f16c58f218d5bc004563b963060070dbc3818df29eb0063"/u);

  assert.doesNotMatch(dockerfile, /\b(?:apt(?:-get)?|apk|dnf|yum|npm|npx|pnpm|yarn|pip3?)\b/iu);
  assert.doesNotMatch(dockerfile, /\binstall\b/iu);
  assert.doesNotMatch(dockerfile, /\b(?:curl|wget)\b|git\s+clone|https?:\/\//iu);
  assert.doesNotMatch(dockerfile, /(?:OPENAI_CODEX_OAUTH|\.credentials\.yaml|\/credentials)/u);

  const moduleSource = repositoryBytes('lib/recursus/rc6-validation-executor.mjs').toString('utf8');
  assert.match(moduleSource, new RegExp(`const ADAPTER_CONTEXT_SHA256 = '${EXPECTED_ADAPTER_CONTEXT_SHA256}';`, 'u'));

  const credentialSource = repositoryBytes('lib/recursus/rc6-synthetic-credentials-local.mjs');
  assert.equal(credentialSource.length, 2_569);
  assert.equal(sha256(credentialSource), EXPECTED_SYNTHETIC_CREDENTIAL_SHA256);
  assert.match(credentialSource.toString('utf8'), /RC6_SYNTHETIC_CREDENTIAL_DOCUMENT/u);
  assert.match(credentialSource.toString('utf8'), /RC6_SYNTHETIC_CREDENTIAL_WRITE_DENIED/u);
});

test('validation executor accepts no live authority or provider credential path option', async () => {
  const required = { dockerExecutable: 'C:\\missing\\docker.exe', probeRoot: 'C:\\missing\\probe', request: {} };
  for (const forbidden of [
    'credentialHome',
    'credentialLockHome',
    'credentialPath',
    'credentials',
    'live',
    'provider',
    'providerAuthority',
  ]) {
    await assert.rejects(
      validationExecutor.executeRC6ValidationProviderFreeCase({ ...required, [forbidden]: 'forbidden' }),
      { code: 'RC5_EXECUTOR_PROBE_OPTIONS' },
      forbidden,
    );
  }
  for (const transportMode of ['live', 'provider_free_unknown', '', null]) {
    await assert.rejects(
      validationExecutor.executeRC6ValidationProviderFreeCase({ ...required, transportMode }),
      { code: 'RC5_EXECUTOR_MODE' },
      String(transportMode),
    );
  }
  await assert.rejects(
    validationExecutor.executeRC6ValidationProviderFreeCase({}),
    { code: 'RC5_EXECUTOR_PROBE_OPTIONS' },
  );

  const publicSource = validationExecutor.executeRC6ValidationProviderFreeCase.toString();
  assert.doesNotMatch(publicSource, /options\.(?:credentialHome|credentialLockHome|credentialPath|provider|providerAuthority)/u);
  assert.match(publicSource, /authorityMode: 'provider_free'/u);
  assert.match(publicSource, /validateExactProviderFreeResult/u);
});

test('validation executor rejects protected probe roots before Docker or any generated write', {
  skip: process.platform !== 'win32' && 'The public validation executor is registered only for Windows Docker Desktop.',
}, async () => {
  const request = {};
  const dockerExecutable = process.platform === 'win32' ? 'C:\\missing\\docker.exe' : '/missing/docker';
  await assert.rejects(
    validationExecutor.executeRC6ValidationProviderFreeCase({ dockerExecutable, probeRoot: REPOSITORY_ROOT, request }),
    { code: 'RC5_OUTPUT_ROOT_OVERLAP' },
  );
  await assert.rejects(
    validationExecutor.executeRC6ValidationProviderFreeCase({ dockerExecutable, probeRoot: homedir(), request }),
    { code: 'RC5_OUTPUT_ROOT_BROAD' },
  );

  const protectedRoot = mkdtempSync(path.join(tmpdir(), 'rc6-credential-probe-'));
  try {
    await assert.rejects(
      validationExecutor.executeRC6ValidationProviderFreeCase({ dockerExecutable, probeRoot: protectedRoot, request }),
      { code: 'RC6_VALIDATION_ROOT_PROTECTED' },
    );
    assert.deepEqual(readdirSync(protectedRoot), []);
  } finally {
    rmSync(protectedRoot, { force: true, recursive: true });
  }
});

test('retained RC5 and copied V17 source bytes remain at their registered identities', () => {
  for (const [relativePath, expectedBlob] of Object.entries(EXPECTED_GIT_BLOBS)) {
    assert.equal(gitBlobId(repositoryBytes(relativePath)), expectedBlob, relativePath);
  }
  for (const [relativePath, expectedSha256] of Object.entries(EXPECTED_RETAINED_SOURCE_SHA256)) {
    assert.equal(sha256(repositoryBytes(relativePath)), expectedSha256, relativePath);
  }
});
