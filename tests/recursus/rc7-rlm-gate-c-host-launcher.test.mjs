import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  RC7_GATE_C_HOST_ACK_SCHEMA,
  Rc7GateCHostLauncherError,
  __test,
  rc7GateCHostLauncherContract,
} from "../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const HASHES = Object.freeze({
  activation: "1".repeat(64), broker: "2".repeat(64), prereg: "3".repeat(64), scorer: "4".repeat(64), worker: "5".repeat(64),
  intent: "6".repeat(64), permit: "7".repeat(64), semantic: "8".repeat(64), stage: "9".repeat(64), capsule: "a".repeat(64), container: "b".repeat(64),
});
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..", "..");

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

function brokerResult(selectedRoute = "rc-direct") {
  const dispatch = withDigest({
    activation_sha256: HASHES.activation,
    intent_sha256: HASHES.intent,
    permit_sha256: HASHES.permit,
    reservation_key: "c".repeat(64),
    selected_route: selectedRoute,
    semantic_request_sha256: HASHES.semantic,
  }, "dispatch_sha256");
  const sealed = withDigest({
    activation_sha256: HASHES.activation,
    intent: { intent_sha256: HASHES.intent },
    permit: { permit_sha256: HASHES.permit },
    semantic_request: { route_visible_only: true },
  }, "sealed_request_sha256");
  const durableHandoff = withDigest({
    schema_version: "rc7-gate-c-durable-provider-handoff-v1",
    state: "preflight-consumed-provider-reachability-committed",
    activation_sha256: HASHES.activation,
    dispatch_sha256: dispatch.dispatch_sha256,
    reservation_key: dispatch.reservation_key,
    handoff_nonce: "f".repeat(64),
    sealed_request_sha256: sealed.sealed_request_sha256,
    gate_b_attestation_sha256: "d".repeat(64),
  }, "durable_handoff_sha256");
  return {
    sealed,
    dispatch,
    durable_handoff: durableHandoff,
    expected_closure: {
      activation_sha256: HASHES.activation,
      broker_package_sha256: HASHES.broker,
      preregistration_sha256: HASHES.prereg,
      scorer_contract_sha256: HASHES.scorer,
      worker_package_sha256: HASHES.worker,
    },
    wire_contract: {
      schema_version: "rc7-gate-c-exact-wire-contract-v1",
      provider_endpoint: "https://chatgpt.com/backend-api/codex/responses",
      refresh_endpoint: "https://auth.openai.com/oauth/token",
      provider: "openai-codex",
      adapter: "deepseek-openai-codex",
      adapter_revision: "2fc02090af1632b86ee1175a6720904dfd71081c",
      model: "gpt-5.6-sol",
      configured_snapshot: "gpt-5.6-sol",
      reasoning: "xhigh",
      max_output_plus_reasoning_tokens: 8192,
      provider_active_timeout_seconds: 300,
      automatic_retries: 0,
      generation_https_posts: 1,
      oauth_refresh_https_posts: 1,
      all_other_network: "denied",
    },
    gate_b: {
      schema_version: "rc7-gate-c-broker-derived-gate-b-evidence-v1",
      state: selectedRoute === "rc-direct" ? "not-applicable-direct-route" : "not-applicable-top-level-host-provider",
      selected_route: selectedRoute,
      activation_sha256: HASHES.activation,
      intent_sha256: HASHES.intent,
      dispatch_sha256: dispatch.dispatch_sha256,
      container_id: null,
      image_id: null,
      docker_executable_sha256: null,
      outer_seccomp_inspect_sha256: null,
      network: "not-applicable-no-container",
      direct_container_provider_access: "not-applicable-no-container",
      input_mount_sha256: null,
      launcher_parent_intent_sha256: null,
      launcher_parent_dispatch_sha256: null,
      launcher_parent_semantic_request_sha256: null,
      phase_two_tsync_proven: false,
    },
  };
}

function ackFor(handoff, stage = HASHES.stage, capsule = HASHES.capsule) {
  return withDigest({
    schema_version: RC7_GATE_C_HOST_ACK_SCHEMA,
    state: "accepted-before-credential-or-provider-authority",
    nonce: handoff.nonce,
    handoff_sha256: handoff.handoff_sha256,
    dispatch_sha256: handoff.broker_result.dispatch.dispatch_sha256,
    stage_manifest_sha256: stage,
    capsule_sha256: capsule,
  }, "ack_sha256");
}

function transport() {
  return { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" };
}

function fixtureInput() {
  return {
    abort_signal: new AbortController().signal,
    ledger_root: "F:\\rc7-disposable\\ledger",
    runtime_root: "F:\\rc7-disposable\\runtime",
    stage_root: "F:\\rc7-disposable\\runtime\\stage",
    dispatch_sha256: brokerResult().dispatch.dispatch_sha256,
    sealed_request: { caller_bytes: "ignored-by-fake-preflight", intent: { request_kind: "top-level" } },
    gate_b_attestation: { caller_reference: "ignored-by-fake-preflight" },
    process_timeout_ms: 345_000,
  };
}

function fakeDependencies(options = {}) {
  const input = fixtureInput();
  const events = [];
  const consumed = new Set();
  const freeze = { closure: { worker_stage_manifest_sha256: HASHES.stage, live_capsule_sha256: HASHES.capsule } };
  const stage = { runtime_root: input.runtime_root, stage_root: input.stage_root, stage_manifest_sha256: HASHES.stage };
  const capsule = { path: path.join(input.stage_root, "lib", "recursus", "rc7-rlm-gate-c-live-capsule.mjs"), sha256: HASHES.capsule };
  return {
    events,
    consumed,
    dependencies: {
      freeze: async (ledgerRoot) => { events.push(`freeze:${ledgerRoot}`); return freeze; },
      inspectStage: async () => { events.push("inspect-stage"); return options.stage ?? stage; },
      verifyCapsule: async () => { events.push("verify-capsule"); return options.capsule ?? capsule; },
      preflight: async () => { events.push("broker-preflight"); return options.broker ?? brokerResult(); },
      nonce: () => options.nonce ?? "f".repeat(64),
      acquireLock: async () => { events.push("lock-acquired"); return { fake: true }; },
      releaseLock: async () => { events.push("lock-released"); },
      consumed,
      controller: options.controller ?? {
        exchange: async ({ handoffBytes, capsuleSha256, stageManifestSha256, onAck }) => {
          events.push("handoff-written-and-closed");
          const handoff = __test.validateHandoffRecord(__test.parseCanonical(handoffBytes, __test.MAX_HANDOFF_BYTES, "handoff"));
          const ack = ackFor(handoff, stageManifestSha256, capsuleSha256);
          const commit = __test.parseCanonical(onAck(__test.canonicalBytes(ack)), 32_768, "commit");
          __test.validateCommit(commit, handoff, ack);
          events.push("ack-validated-before-commit");
          return { result_bytes: __test.canonicalBytes({ state: "fake-provider-unreachable-result" }), transport: transport() };
        },
      },
    },
  };
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error instanceof Rc7GateCHostLauncherError && error.code === code);
}

test("one-use host orchestration validates broker bytes, capsule acknowledgment, commit order, and cleanup", async () => {
  const fake = fakeDependencies();
  const result = await __test.runHostLauncher(fixtureInput(), fake.dependencies);
  assert.equal(result.state, "one-shot-child-complete");
  assert.equal(result.result.state, "fake-provider-unreachable-result");
  assert.deepEqual(fake.events, [
    "freeze:F:\\rc7-disposable\\ledger", "inspect-stage", "verify-capsule", "broker-preflight", "inspect-stage", "verify-capsule",
    "lock-acquired", "handoff-written-and-closed", "ack-validated-before-commit", "lock-released",
  ]);
  assert.equal(fake.consumed.size, 1);
});

test("handoff is canonical, bounded, digest-bound, and excludes approval, evaluator, and credential fields", () => {
  const built = __test.buildHandoffRecord(brokerResult("rc-rlm"), "f".repeat(64));
  assert.equal(__test.validateHandoffRecord(__test.parseCanonical(built.bytes, __test.MAX_HANDOFF_BYTES, "handoff")).handoff_sha256, built.value.handoff_sha256);
  assert.doesNotMatch(built.bytes.toString("utf8"), /(?:approval_text|operator_approval|evaluator_oracle|credential_path|credential_value)/iu);
  const forged = structuredClone(built.value);
  forged.broker_result.dispatch.intent_sha256 = "0".repeat(64);
  assert.throws(() => __test.validateHandoffRecord(forged), (error) => error.code === "HOST_HANDOFF_IDENTITY_MISMATCH");
  assert.throws(() => __test.parseCanonical(Buffer.from("{}"), 10, "handoff"), (error) => error.code === "MALFORMED_HOST_HANDOFF");
});

test("forged, stale, and replayed acknowledgments fail before commit", () => {
  const handoff = __test.buildHandoffRecord(brokerResult(), "f".repeat(64)).value;
  const expected = { handoff, stage_manifest_sha256: HASHES.stage, capsule_sha256: HASHES.capsule };
  const consumed = new Set();
  const valid = ackFor(handoff);
  assert.equal(__test.validateAck(valid, expected, consumed), valid);
  assert.throws(() => __test.validateAck(valid, expected, consumed), (error) => error.code === "HOST_HANDOFF_REPLAY");
  const staleProjection = { ...valid, nonce: "0".repeat(64) };
  delete staleProjection.ack_sha256;
  const stale = withDigest(staleProjection, "ack_sha256");
  assert.throws(() => __test.validateAck(stale, expected, new Set()), (error) => error.code === "HOST_HANDOFF_ACK_MISMATCH");
  const wrongStage = ackFor(handoff, "0".repeat(64));
  assert.throws(() => __test.validateAck(wrongStage, expected, new Set()), (error) => error.code === "HOST_HANDOFF_ACK_MISMATCH");
});

test("anonymous transport has no replaceable or aliased filesystem handoff", () => {
  assert.equal(__test.validateTransportDescriptor(transport()).path_authority, "none-no-filesystem-handoff");
  assert.throws(() => __test.validateTransportDescriptor({ ...transport(), kind: "exclusive-file" }), (error) => error.code === "HOST_HANDOFF_TRANSPORT_MISMATCH");
  assert.throws(() => __test.validateTransportDescriptor({ ...transport(), path: "F:\\replaceable" }), (error) => error.code === "HOST_HANDOFF_IDENTITY_MISMATCH");
});

test("credential home preflight verifies the Recursus profile marker without reading credential bytes", async () => {
  const syntheticHome = await mkdtemp(path.join(tmpdir(), "rc7-provider-free-synthetic-dsh-home-"));
  const profileDirectory = path.join(syntheticHome, "profiles", "recursus");
  const markerPath = path.join(profileDirectory, ".recursus-profile.json");
  const marker = {
    schemaVersion: 1,
    profileName: "recursus",
    assemblyId: "recursus-test",
    distributionSha256: "d".repeat(64),
    lockfileSha256: "e".repeat(64),
    packageCount: 1,
    credentialReferences: ["OPENAI_CODEX_OAUTH"],
  };
  await mkdir(profileDirectory, { recursive: true });
  await writeFile(markerPath, `${JSON.stringify(marker)}\n`, "utf8");
  try {
    const preflight = __test.preflightRc7GateCCredentialHomeEnvironment({ DSH_HOME: syntheticHome });
    assert.deepEqual(preflight, {
      schema_version: "rc7-gate-c-credential-home-environment-preflight-v2",
      state: "recursus-profile-marker-verified-credential-opaque-uninspected",
      environment_variable: "DSH_HOME",
      profile_name: "recursus",
      credential_reference: "OPENAI_CODEX_OAUTH",
    });
    assert.equal(JSON.stringify(preflight).includes(syntheticHome), false);
    assert.throws(() => __test.preflightRc7GateCCredentialHomeEnvironment({}), { code: "HOST_DSH_HOME_REQUIRED" });
    assert.throws(() => __test.preflightRc7GateCCredentialHomeEnvironment({ DSH_HOME: "relative-home" }), { code: "HOST_DSH_HOME_REQUIRED" });
    assert.throws(() => __test.preflightRc7GateCCredentialHomeEnvironment({ DSH_HOME: path.parse(syntheticHome).root }), { code: "HOST_DSH_HOME_UNSAFE" });
    assert.throws(() => __test.preflightRc7GateCCredentialHomeEnvironment({ DSH_HOME: REPOSITORY_ROOT }), { code: "HOST_DSH_HOME_UNSAFE" });
    assert.throws(() => __test.preflightRc7GateCCredentialHomeEnvironment({ DSH_HOME: path.dirname(REPOSITORY_ROOT) }), { code: "HOST_DSH_HOME_UNSAFE" });
    const child = __test.credentialOpaqueChildEnvironment({ DSH_HOME: syntheticHome });
    assert.deepEqual(Object.keys(child).sort(), ["DSH_HOME", "SystemRoot", "WINDIR"]);
    assert.equal(child.DSH_HOME, syntheticHome);

    await writeFile(markerPath, `${JSON.stringify({ ...marker, credentialReferences: ["OTHER_REFERENCE"] })}\n`, "utf8");
    assert.throws(() => __test.preflightRc7GateCCredentialHomeEnvironment({ DSH_HOME: syntheticHome }), { code: "HOST_DSH_PROFILE_MISMATCH" });
    await rm(markerPath);
    assert.throws(() => __test.preflightRc7GateCCredentialHomeEnvironment({ DSH_HOME: syntheticHome }), { code: "HOST_DSH_PROFILE_REQUIRED" });
  } finally {
    await rm(syntheticHome, { recursive: true, force: true });
  }
});

test("wrong runtime, stage manifest, or capsule identity fails before broker preflight", async () => {
  const input = fixtureInput();
  const wrongRuntime = fakeDependencies({ stage: { runtime_root: "F:\\other", stage_root: input.stage_root, stage_manifest_sha256: HASHES.stage } });
  await expectCode(() => __test.runHostLauncher(input, wrongRuntime.dependencies), "HOST_STAGE_IDENTITY_MISMATCH");
  assert.equal(wrongRuntime.events.includes("broker-preflight"), false);
  const wrongCapsule = fakeDependencies({ capsule: { path: path.join(input.stage_root, "lib", "recursus", "rc7-rlm-gate-c-live-capsule.mjs"), sha256: "0".repeat(64) } });
  await expectCode(() => __test.runHostLauncher(input, wrongCapsule.dependencies), "HOST_STAGE_IDENTITY_MISMATCH");
  assert.equal(wrongCapsule.events.includes("broker-preflight"), false);
});

test("treatment-proof stage identities resolve from the nested execution closure", () => {
  const input = fixtureInput();
  const stage = { runtime_root: input.runtime_root, stage_root: input.stage_root, stage_manifest_sha256: HASHES.stage };
  const capsule = {
    path: path.join(input.stage_root, "lib", "recursus", "rc7-rlm-gate-c-live-capsule.mjs"),
    sha256: HASHES.capsule,
  };
  const freeze = {
    schema_version: "rc7-gate-c-treatment-proof-freeze-v1",
    closure: { execution_closure: { worker_stage_manifest_sha256: HASHES.stage, live_capsule_sha256: HASHES.capsule } },
  };
  assert.deepEqual(__test.validateStageIdentity(stage, freeze, input, capsule), {
    stage_manifest_sha256: HASHES.stage,
    capsule_sha256: HASHES.capsule,
    capsule_path: capsule.path,
  });
  assert.throws(
    () => __test.validateStageIdentity(stage, { ...freeze, closure: { execution_closure: {} } }, input, capsule),
    (error) => error.code === "HOST_STAGE_IDENTITY_MISMATCH",
  );
});

test("timeout and interruption release the exact host lock and retain no replay authority", async () => {
  for (const code of ["HOST_ACK_TIMEOUT", "HOST_CHILD_TIMEOUT", "HOST_CHILD_INTERRUPTED"]) {
    const fake = fakeDependencies({ controller: { exchange: async () => { throw new Rc7GateCHostLauncherError(code, "injected provider-free fault"); } } });
    await expectCode(() => __test.runHostLauncher(fixtureInput(), fake.dependencies), code);
    assert.equal(fake.events.at(-1), "lock-released");
    assert.equal(fake.consumed.size, 0);
  }
});

test("concurrent use of one dispatch is excluded before a second broker preflight", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const first = fakeDependencies({ controller: { exchange: async () => { entered(); await gate; throw new Rc7GateCHostLauncherError("HOST_CHILD_INTERRUPTED", "stop"); } } });
  const running = __test.runHostLauncher(fixtureInput(), first.dependencies);
  await enteredPromise;
  const second = fakeDependencies();
  await expectCode(() => __test.runHostLauncher(fixtureInput(), second.dependencies), "HOST_LAUNCH_CONCURRENT");
  assert.equal(second.events.length, 0);
  release();
  await expectCode(() => running, "HOST_CHILD_INTERRUPTED");
});

test("contract and source keep provider, credential, network, Docker, and live capsule actions unreachable in provider-free tests", async () => {
  const contract = rc7GateCHostLauncherContract();
  assert.equal(contract.transport.kind, "anonymous-inherited-pipes");
  assert.match(contract.child_environment, /recursus profile marker binds OPENAI_CODEX_OAUTH/u);
  assert.ok(contract.handoff_excludes.includes("DSH_HOME-path-or-value"));
  assert.match(contract.capsule_integration, /acceptRc7GateCHostHandoff/u);
  if (process.platform === "win32") {
    assert.equal(contract.node_runtime.version, process.versions.node);
    assert.equal((await __test.verifyPinnedHostNodeRuntime()).sha256, contract.node_runtime.sha256);
  } else {
    assert.deepEqual(contract.node_runtime, {
      version: "24.19.0",
      byte_count: 92_825_416,
      sha256: "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
    });
  }
  const source = await readFile(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), "../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs"), "utf8");
  for (const denied of ["globalThis.fetch", "node:http", "node:https", ".credentials.yaml", "docker.exe", "dsh-credentials-local"]) assert.equal(source.includes(denied), false, denied);
  assert.equal(source.includes("OPENAI_CODEX_OAUTH"), true);
  assert.equal(source.includes('import { spawn } from "node:child_process"'), true);
  const bootstrap = __test.childBootstrapSource();
  assert.match(bootstrap, /acceptRc7GateCHostHandoff\(\)/u);
  assert.doesNotMatch(bootstrap, /await read\(3|createReadStream/u);
});

test("production bootstrap emits the host parser's exact canonical result framing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rc7-gate-c-bootstrap-framing-"));
  const capsulePath = path.join(root, "provider-unreachable-capsule.mjs");
  const result = { schema_version: "rc7-gate-c-provider-free-bootstrap-result-v1", state: "provider-unreachable" };
  try {
    await writeFile(capsulePath, [
      'import { createHash } from "node:crypto";',
      'import { readFile } from "node:fs/promises";',
      'import { fileURLToPath } from "node:url";',
      `const stageManifestSha256 = "${HASHES.stage}";`,
      "export async function acceptRc7GateCHostHandoff() {",
      "  const capsuleSha256 = createHash(\"sha256\").update(await readFile(fileURLToPath(import.meta.url))).digest(\"hex\");",
      "  return { stage: { stage_manifest_sha256: stageManifestSha256 }, capsule_sha256: capsuleSha256 };",
      "}",
      `export async function executeRc7GateCLiveCapsuleFromHostHandoff() { return ${JSON.stringify(result)}; }`,
      "",
    ].join("\n"), { encoding: "utf8", flag: "wx" });
    const capsuleSha256 = sha256V1(await readFile(capsulePath));
    const child = spawn(process.execPath, ["--input-type=module", "--eval", __test.childBootstrapSource(), capsulePath, HASHES.stage, capsuleSha256], {
      cwd: root,
      env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const exit = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    assert.deepEqual(exit, { code: 0, signal: null });
    assert.equal(Buffer.concat(stderr).toString("utf8"), "");
    const resultBytes = Buffer.concat(stdout);
    assert.deepEqual(resultBytes, __test.canonicalBytes(result));
    assert.deepEqual(__test.parseCanonical(resultBytes, 32_768, "bootstrap result"), result);
    assert.throws(
      () => __test.parseCanonical(Buffer.from(`${JSON.stringify(result)}\n`, "utf8"), 32_768, "single-LF bootstrap result"),
      (error) => error.code === "MALFORMED_HOST_HANDOFF",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a pre-ack child rejection is closed, sanitized, and does not leave launcher timers alive", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "rc7-gate-c-pre-ack-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const capsulePath = path.join(root, "rejecting-capsule.mjs");
  await writeFile(capsulePath, [
    'export async function acceptRc7GateCHostHandoff() { throw Object.assign(new Error("local detail must not escape"), { code: "HOST_DISPATCH_MISMATCH" }); }',
    "export async function executeRc7GateCLiveCapsuleFromHostHandoff() { throw new Error(\"unreachable\"); }",
    "",
  ].join("\n"), { encoding: "utf8", flag: "wx" });
  const profile = path.join(root, "dsh", "profiles", "recursus");
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, ".recursus-profile.json"), JSON.stringify({
    assemblyId: "provider-free-test",
    credentialReferences: ["OPENAI_CODEX_OAUTH"],
    distributionSha256: "1".repeat(64),
    lockfileSha256: "2".repeat(64),
    packageCount: 1,
    profileName: "recursus",
    schemaVersion: 1,
  }), { encoding: "utf8", flag: "wx" });
  const previousDshHome = process.env.DSH_HOME;
  process.env.DSH_HOME = path.join(root, "dsh");
  try {
    const controller = new AbortController();
    const startedAt = Date.now();
    await assert.rejects(
      __test.productionController.exchange({
        abortSignal: controller.signal,
        handoffBytes: Buffer.from("{}\n", "utf8"),
        capsulePath,
        capsuleSha256: sha256V1(await readFile(capsulePath)),
        stageManifestSha256: HASHES.stage,
        processTimeoutMs: 30_000,
        onAck: (bytes) => __test.parseCanonical(bytes, 32_768, "capsule acknowledgment"),
        onLifecycle: async () => {},
      }),
      (error) => error.code === "HOST_CHILD_PRE_ACK_FAILED"
        && error.details?.child_failure_code === "HOST_DISPATCH_MISMATCH"
        && !JSON.stringify(error).includes("local detail must not escape"),
    );
    assert.ok(Date.now() - startedAt < 25_000);
  } finally {
    if (previousDshHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousDshHome;
  }
});

test("strict unhandled-rejection mode survives a blocked handoff until the observed ACK timeout", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "rc7-gate-c-blocked-ack-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const capsulePath = path.join(root, "blocked-capsule.mjs");
  await writeFile(capsulePath, [
    "export async function acceptRc7GateCHostHandoff() { throw new Error('unreachable'); }",
    "export async function executeRc7GateCLiveCapsuleFromHostHandoff() { throw new Error('unreachable'); }",
    "setInterval(() => {}, 1000);",
    "await new Promise(() => {});",
    "",
  ].join("\n"), { encoding: "utf8", flag: "wx" });
  const dshHome = path.join(root, "dsh");
  const profile = path.join(dshHome, "profiles", "recursus");
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, ".recursus-profile.json"), JSON.stringify({
    assemblyId: "provider-free-test",
    credentialReferences: ["OPENAI_CODEX_OAUTH"],
    distributionSha256: "1".repeat(64),
    lockfileSha256: "2".repeat(64),
    packageCount: 1,
    profileName: "recursus",
    schemaVersion: 1,
  }), { encoding: "utf8", flag: "wx" });
  const moduleUrl = new URL("../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs", import.meta.url).href;
  const runner = [
    `import { __test } from ${JSON.stringify(moduleUrl)};`,
    `const capsulePath = ${JSON.stringify(capsulePath)};`,
    `const capsuleSha256 = ${JSON.stringify(sha256V1(await readFile(capsulePath)))};`,
    "const controller = new AbortController();",
    "try {",
    "  await __test.productionController.exchange({ abortSignal: controller.signal, handoffBytes: Buffer.alloc(2 * 1024 * 1024), capsulePath, capsuleSha256, stageManifestSha256: '7'.repeat(64), processTimeoutMs: 345000, onAck: () => Buffer.from('{}\\n'), onLifecycle: async () => {} });",
    "  process.exitCode = 91;",
    "} catch (error) {",
    "  if (error?.code !== 'HOST_ACK_TIMEOUT') { process.stderr.write(String(error?.code ?? 'missing')); process.exitCode = 92; }",
    "}",
  ].join("\n");
  const child = spawn(process.execPath, ["--unhandled-rejections=strict", "--input-type=module", "--eval", runner], {
    cwd: __test.REPOSITORY_ROOT,
    env: { ...process.env, DSH_HOME: dshHome },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(exit, { code: 0, signal: null }, Buffer.concat(stderr).toString("utf8"));
});
