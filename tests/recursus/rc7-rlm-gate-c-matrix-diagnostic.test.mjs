import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";

import { __test as brokerTest } from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";
import {
  RC7_GATE_C_MATRIX_DIAGNOSTIC_APPROVAL_NAME,
  RC7_GATE_C_MATRIX_DIAGNOSTIC_FREEZE_NAME,
  Rc7GateCMatrixDiagnosticError,
  __test,
  buildRc7GateCMatrixDiagnosticFreeze,
  inspectRc7GateCMatrixDiagnostic,
  prepareRc7GateCMatrixDiagnosticFreeze,
  recordRc7GateCMatrixDiagnosticApproval,
} from "../../lib/recursus/rc7-rlm-gate-c-matrix-diagnostic.mjs";
import { canonicalJsonV1 } from "../../lib/recursus/prompt-context-v1.mjs";

const CREATED = [];
const EXTERNAL_TEST_PARENT = process.platform === "win32"
  ? path.dirname(brokerTest.REPOSITORY_ROOT)
  : await realpath(path.join(path.parse(brokerTest.REPOSITORY_ROOT).root, "tmp"));

after(async () => {
  for (const target of CREATED.reverse()) {
    assert.equal(path.dirname(target), EXTERNAL_TEST_PARENT);
    assert.match(path.basename(target), /^rc7-gate-c-matrix-diagnostic-test-/u);
    await rm(target, { recursive: true, force: true });
  }
});

async function roots() {
  const parent = await mkdtemp(path.join(EXTERNAL_TEST_PARENT, "rc7-gate-c-matrix-diagnostic-test-"));
  CREATED.push(parent);
  const freeze = path.join(parent, "freeze");
  const diagnostic = path.join(parent, "diagnostic");
  await Promise.all([mkdir(freeze), mkdir(diagnostic)]);
  return { parent, freeze, diagnostic };
}

test("the provider-free freeze binds one exact full SAFE-01 matrix request and no live authority", async () => {
  const target = await roots();
  const first = await buildRc7GateCMatrixDiagnosticFreeze(target.diagnostic);
  const second = await buildRc7GateCMatrixDiagnosticFreeze(target.diagnostic);
  assert.deepEqual(first, second);
  assert.equal(first.closure.diagnostic_ordinal, 2);
  assert.equal(first.closure.policy_identity, "rc7-gate-c-exact-matrix-request-diagnostic-v2");
  assert.equal(first.closure.predecessor_diagnostic.result_sha256, "8efc4e0485b375436ae83a5ac90f23b7be853ede640a0275b6046faad44cf1de");
  assert.equal(first.closure.predecessor_diagnostic.replay_permitted, false);
  assert.equal(first.closure.reference_matrix.run_id, __test.REFERENCE_RUN_ID);
  assert.equal(first.closure.reference_matrix.semantic_request_sha256, __test.REFERENCE_SEMANTIC_SHA256);
  assert.equal(first.closure.reference_matrix.semantic_request_byte_count, 5_075);
  assert.equal(first.closure.reference_matrix.matrix_member, false);
  assert.equal(first.closure.reference_matrix.score_bearing, false);
  assert.equal(first.closure.ceilings.generation_https_posts, 1);
  assert.equal(first.closure.ceilings.rlm_executions, 0);
  assert.equal(first.accounting.provider_calls, 0);
  assert.match(first.exact_approval_text, new RegExp(first.closure_sha256, "u"));
  assert.match(first.exact_approval_text, /second exact matrix-request diagnostic.*exact provider-visible semantic request .*\(5075 bytes\).*exactly one direct top-level generation reservation.*zero RLM executions/u);
  assert.match(first.exact_approval_text, /83 generation HTTPS POSTs.*82 OAuth refresh HTTPS POSTs.*611\.98 planning credits.*USD 24\.51/u);

  const prepared = await prepareRc7GateCMatrixDiagnosticFreeze(target.freeze, target.diagnostic);
  assert.equal(prepared.freeze_sha256, first.freeze_sha256);
  assert.deepEqual(await readdir(target.freeze), [RC7_GATE_C_MATRIX_DIAGNOSTIC_FREEZE_NAME]);
  const retained = JSON.parse(await readFile(prepared.package_path, "utf8"));
  assert.equal(canonicalJsonV1(retained), canonicalJsonV1(first));
});

test("approval is exact, root-bound, one-use, and provider-free", async () => {
  const target = await roots();
  const freeze = await buildRc7GateCMatrixDiagnosticFreeze(target.diagnostic);
  await assert.rejects(
    () => recordRc7GateCMatrixDiagnosticApproval(target.diagnostic, {
      closure_sha256: freeze.closure_sha256,
      freeze_sha256: freeze.freeze_sha256,
      exact_approval_text: `${freeze.exact_approval_text} changed`,
    }),
    (error) => error instanceof Rc7GateCMatrixDiagnosticError && error.code === "DIAGNOSTIC_APPROVAL_REQUIRED",
  );
  assert.deepEqual(await readdir(target.diagnostic), []);
  const approval = await recordRc7GateCMatrixDiagnosticApproval(target.diagnostic, {
    closure_sha256: freeze.closure_sha256,
    freeze_sha256: freeze.freeze_sha256,
    exact_approval_text: freeze.exact_approval_text,
  });
  assert.equal(approval.state, "operator-approved-one-request-only");
  assert.deepEqual(await readdir(target.diagnostic), [RC7_GATE_C_MATRIX_DIAGNOSTIC_APPROVAL_NAME]);
  assert.equal((await inspectRc7GateCMatrixDiagnostic(target.diagnostic)).state, "approved-unconsumed");
  await writeFile(path.join(target.diagnostic, "unexpected.txt"), "x", { flag: "wx" });
  await assert.rejects(
    () => inspectRc7GateCMatrixDiagnostic(target.diagnostic),
    (error) => error instanceof Rc7GateCMatrixDiagnosticError && error.code === "UNKNOWN_DIAGNOSTIC_RESIDUE",
  );
});

test("closed failure retention keeps actionable subtype and no provider prose", () => {
  const closed = __test.validateClosedResult({
    schema_version: "rc7-gate-c-live-capsule-failure-v2",
    state: "failed-no-replay",
    code: "PROVIDER_TERMINAL_REJECTED",
    terminal_kind: "max-tokens",
    provider_failure_code: null,
    integration_failure_phase: null,
    observations: { provider_posts: 1, refresh_posts: 0, provider_active_milliseconds: 25, automatic_retry_count: 0 },
  });
  assert.equal(closed.terminal_kind, "max-tokens");
  assert.equal(Object.hasOwn(closed, "message"), false);
  assert.equal(Object.hasOwn(closed, "request_id"), false);
  assert.equal(Object.hasOwn(closed, "reasoning"), false);
});

test("the frozen execution closure binds the real staged capsule bytes without relying on an unstated inspector property", async () => {
  const target = await roots();
  const freeze = await buildRc7GateCMatrixDiagnosticFreeze(target.diagnostic);
  const identity = freeze.closure.execution_closure.files.find((item) => item.path === "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs");
  const bytes = await readFile(path.join(brokerTest.REPOSITORY_ROOT, "lib", "recursus", "rc7-rlm-gate-c-live-capsule.mjs"));
  assert.ok(identity);
  assert.equal(bytes.byteLength, identity.bytes);
  assert.equal(__test.sha256Bytes(bytes), identity.sha256);
  assert.notEqual(__test.sha256Bytes(Buffer.concat([bytes, Buffer.from("stale", "utf8")])), identity.sha256);
});
