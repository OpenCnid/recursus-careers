import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RC7_GATE_C_RLM_BASE_IMAGE_IDS,
  RC7_GATE_C_RLM_COMPONENT_COMMIT,
  RC7_GATE_C_RLM_IMAGE_ID,
  RC7_GATE_C_RLM_INHERITED_ENVIRONMENT,
  RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
  RC7_GATE_C_RLM_LIMITS,
  assertRc7GateCRlmExternalRoot,
  buildRc7GateCRlmCreateArguments,
  buildRc7GateCRlmImageDefinition,
  inspectRc7GateCRlmCompletedArtifact,
  inspectRc7GateCRlmLauncher,
  prepareRc7GateCRlmLauncher,
  publishRc7GateCRlmProgram,
  recoverRc7GateCRlmLauncher,
  runRc7GateCRlmWithController,
  serviceRc7GateCRlmChildProposal,
  validateRc7GateCRlmDockerInspect,
} from "../../lib/recursus/rc7-rlm-gate-c-rlm-launcher.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";
import { canonicalRouteOutputFromMarker } from "./fixtures/rc7-rlm-gate-c-container/gate-c-rlm-worker.mjs";

const H = Object.freeze({
  activation: "a".repeat(64),
  run: "b".repeat(64),
  intent: "c".repeat(64),
  dispatch: "d".repeat(64),
  image: RC7_GATE_C_RLM_IMAGE_ID,
  container: "f".repeat(64),
});

function bytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function digest(value, key) {
  return { ...value, [key]: sha256V1(canonicalJsonV1(value)) };
}

function input(overrides = {}) {
  const semanticRequest = {
    schema_version: "rc7-gate-c-semantic-request-v1",
    model: "gpt-5.6-sol",
    messages: [{ role: "system", content: "Use only the registered synthetic source." }, { role: "user", content: "Map the visible evidence." }],
    reasoning: "xhigh",
  };
  return {
    activation_sha256: H.activation,
    arm: "rc-rlm",
    case_id: "LAB-01",
    dispatch_sha256: H.dispatch,
    image_id: H.image,
    intent_sha256: H.intent,
    run_identity: H.run,
    selected_route: "rc-rlm",
    semantic_request: semanticRequest,
    semantic_request_sha256: sha256V1(bytes(semanticRequest)),
    ...overrides,
  };
}

async function freshRoot(name = "root") {
  const parent = path.join(tmpdir(), `rc7-gate-c-launcher-tests-${randomUUID()}`);
  const root = path.join(parent, name);
  await mkdir(root, { recursive: true });
  return { parent, root };
}

async function prepare(name, overrides = {}) {
  const temporary = await freshRoot(name);
  const prepared = await prepareRc7GateCRlmLauncher(temporary.root, input(overrides));
  return { ...temporary, prepared };
}

async function cleanup(parent) {
  await rm(parent, { recursive: true, force: true });
}

async function seccompInspect() {
  const raw = await readFile(path.join(process.cwd(), "tests", "recursus", "fixtures", "rc7-rlm-containment", "outer-seccomp-default-errno.json"), "utf8");
  return `seccomp=${JSON.stringify(JSON.parse(raw))}`;
}

async function validInspect(context, containerId = H.container) {
  const create = buildRc7GateCRlmCreateArguments(context);
  const environment = Object.entries(RC7_GATE_C_RLM_INHERITED_ENVIRONMENT).map(([name, value]) => `${name}=${value}`);
  for (let index = 0; index < create.args.length; index += 1) if (create.args[index] === "--env") environment.push(create.args[index + 1]);
  return [{
    Id: containerId,
    Image: context.launch.image_id,
    State: { Running: true, Paused: false, Restarting: false, Dead: false, Status: "running" },
    Config: { User: "65532:65532", Labels: create.labels, Env: environment, StopTimeout: 1, ExposedPorts: null },
    HostConfig: {
      NetworkMode: "none", ReadonlyRootfs: true, Privileged: false, IpcMode: "none", PidMode: "", CgroupnsMode: "private",
      CapAdd: [], CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true", await seccompInspect()],
      PidsLimit: RC7_GATE_C_RLM_LIMITS.pids, Memory: RC7_GATE_C_RLM_LIMITS.memory_bytes,
      MemorySwap: RC7_GATE_C_RLM_LIMITS.memory_bytes, NanoCpus: RC7_GATE_C_RLM_LIMITS.cpu_nanos,
      Ulimits: [
        { Name: "fsize", Soft: RC7_GATE_C_RLM_LIMITS.file_size_bytes, Hard: RC7_GATE_C_RLM_LIMITS.file_size_bytes },
        { Name: "nofile", Soft: RC7_GATE_C_RLM_LIMITS.nofile, Hard: RC7_GATE_C_RLM_LIMITS.nofile },
      ],
      Init: true, LogConfig: { Type: "none", Config: {} }, Runtime: "runc", RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
      Binds: null, Devices: [], DeviceRequests: [], Links: null, VolumesFrom: null, PortBindings: {},
      Tmpfs: {
        "/rc7/state": `rw,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.state_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.state_inodes},uid=65532,gid=65532,mode=0700`,
        "/rc7/output": `rw,noexec,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.output_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.output_inodes},uid=65532,gid=65532,mode=0700`,
      },
    },
    Mounts: [
      { Type: "bind", Source: path.join(context.root, "source"), Destination: "/rc7/source", RW: false },
      { Type: "bind", Source: path.join(context.root, "launcher"), Destination: "/rc7/launcher", RW: false },
      { Type: "bind", Source: path.join(context.root, "exchange"), Destination: "/rc7/exchange", RW: true },
    ],
    NetworkSettings: { Ports: {} },
  }];
}

function programInput(context, code = 'print("RC7_FINAL={\\"status\\":\\"ok\\"}")') {
  const baseOutput = {
    schema_version: "rc7-gate-c-signature-output-v1",
    case_id: context.launch.case_id,
    completion: "incomplete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
  };
  return {
    activation_sha256: context.launch.activation_sha256,
    base_output: baseOutput,
    base_output_sha256: sha256V1(canonicalJsonV1(baseOutput)),
    dispatch_sha256: context.launch.dispatch_sha256,
    intent_sha256: context.launch.intent_sha256,
    python_code: code,
    run_identity: context.launch.run_identity,
    semantic_request_sha256: context.launch.semantic_request_sha256,
  };
}

function phaseTwoRecord(context) {
  return digest({
    schema_version: "rc7-gate-c-rlm-phase-two-attestation-v1",
    state: "tsync-active-before-program-and-child-proposals",
    activation_sha256: context.launch.activation_sha256,
    run_identity: context.launch.run_identity,
    intent_sha256: context.launch.intent_sha256,
    dispatch_sha256: context.launch.dispatch_sha256,
    semantic_request_sha256: context.launch.semantic_request_sha256,
    worker_sha256: context.launch.worker_sha256,
    phase_two: {
      all_before_capabilities_zero: true,
      all_before_no_new_privileges: true,
      all_before_seccomp_two: true,
      clone3_action: "ENOSYS-for-safe-clone-thread-fallback",
      filesystem_open_denied_after_filter: true,
      flag: "SECCOMP_FILTER_FLAG_TSYNC",
      new_thread_survived: true,
    },
  }, "phase_two_sha256");
}

function containerResult(context, program, routeOutput = { status: "ok" }) {
  return digest({
    schema_version: "rc7-gate-c-rlm-container-result-v1",
    state: "sealed-provider-free-container-output",
    policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
    activation_sha256: context.launch.activation_sha256,
    run_identity: context.launch.run_identity,
    intent_sha256: context.launch.intent_sha256,
    dispatch_sha256: context.launch.dispatch_sha256,
    semantic_request_sha256: context.launch.semantic_request_sha256,
    image_id: context.launch.image_id,
    worker_sha256: context.launch.worker_sha256,
    program_sha256: program.program_sha256,
    component_commit: RC7_GATE_C_RLM_COMPONENT_COMMIT,
    kernel_generation: 1,
    phase_two: phaseTwoRecord(context).phase_two,
    child_request_count: 0,
    child_request_sha256s: [],
    route_output: routeOutput,
    route_output_sha256: sha256V1(canonicalJsonV1(routeOutput)),
    direct_container_provider_access: "denied-network-none",
  }, "result_sha256");
}

class FakeController {
  constructor({ failAt = null, writeResult = true } = {}) {
    this.failAt = failAt;
    this.writeResult = writeResult;
    this.created = false;
    this.started = false;
    this.removed = false;
    this.ticked = false;
    this.plan = null;
  }

  async list() { return this.created && !this.removed ? [H.container] : []; }
  async create(plan) {
    if (this.failAt === "create") throw new Error("injected create interruption");
    this.created = true;
    this.plan = plan;
    return H.container;
  }
  async start() {
    if (this.failAt === "start") throw new Error("injected start interruption");
    this.started = true;
  }
  async inspect() {
    if (this.failAt === "inspect") throw new Error("injected inspect interruption");
    const context = this.context;
    const value = await validInspect(context);
    value[0].State.Running = this.started && !this.removed;
    return value;
  }
  async tick({ context }) {
    this.context = context;
    if (this.failAt === "tick") throw new Error("injected tick interruption");
    if (!this.writeResult || this.ticked) return;
    this.ticked = true;
    const program = JSON.parse(await readFile(path.join(context.root, "exchange", "commands", "program.json"), "utf8"));
    await writeFile(path.join(context.root, "exchange", "results", "phase-two.json"), bytes(phaseTwoRecord(context)), { flag: "wx" });
    await writeFile(path.join(context.root, "exchange", "results", "container-result.json"), bytes(containerResult(context, program)), { flag: "wx" });
  }
  async remove() { this.removed = true; }
}

test("Gate C image definition pins the exact inherited source and immutable built image digest", async () => {
  const definition = await buildRc7GateCRlmImageDefinition();
  assert.equal(definition.component_commit, RC7_GATE_C_RLM_COMPONENT_COMMIT);
  assert.deepEqual(definition.bases, RC7_GATE_C_RLM_BASE_IMAGE_IDS);
  assert.equal(definition.final_image_id, RC7_GATE_C_RLM_IMAGE_ID);
  assert.equal(definition.final_image_state, "built-once-and-immutable-digest-pinned");
  assert.equal(definition.entrypoint_override_permitted, false);
  assert.match(definition.files.worker.sha256, /^[0-9a-f]{64}$/u);
  assert.match(definition.files.outer_seccomp_inspect_sha256, /^[0-9a-f]{64}$/u);
});

test("the actual container marker preserves the host's exact one-LF route-output bytes", () => {
  const routeOutput = {
    case_id: "LAB-01",
    completion: "incomplete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
    schema_version: "rc7-gate-c-signature-output-v1",
  };
  const canonicalBytes = Buffer.from(canonicalJsonV1(routeOutput), "utf8");
  const markerText = canonicalBytes.toString("utf8").replace(/\n$/u, "");
  const observed = canonicalRouteOutputFromMarker(`ignored diagnostic\nRC7_FINAL=${markerText}\n`);
  assert.deepEqual(observed.route_output, routeOutput);
  assert.deepEqual(observed.route_output_bytes, canonicalBytes);
  assert.equal(sha256V1(observed.route_output_bytes), sha256V1(canonicalBytes));
});

test("preparation freezes disjoint input/exchange roots and produces no authority use", async () => {
  const { parent, root, prepared } = await prepare("prepare");
  try {
    const inspected = await inspectRc7GateCRlmLauncher(root);
    assert.equal(inspected.package.package_sha256, prepared.package.package_sha256);
    assert.deepEqual(inspected.package.rlm_root_identity, prepared.root_identity);
    assert.equal(Object.hasOwn(inspected.launch, "rlm_root_identity"), false);
    assert.deepEqual(await readdir(path.join(root, "source")), ["semantic-request.json"]);
    assert.deepEqual(await readdir(path.join(root, "launcher")), ["launch.json"]);
    assert.deepEqual(inspected.package.counts, { provider_calls: 0, simulated_provider_requests: 0, rlm_executions: 0, credential_accesses: 0, network_requests: 0, docker_executions: 0 });
    const plan = buildRc7GateCRlmCreateArguments(inspected);
    assert.ok(plan.args.includes("--network=none"));
    assert.ok(plan.args.includes("--read-only"));
    assert.equal(plan.args.at(-1), H.image);
    assert.equal(plan.args.includes("--entrypoint"), false);
    assert.equal(plan.args.filter((entry) => entry === "--mount").length, 3);
  } finally { await cleanup(parent); }
});

test("retained physical root identity rejects copied and same-path recreated launchers", async () => {
  const { parent, root } = await prepare("physical-root-identity");
  const copied = path.join(parent, "copied");
  const backup = path.join(parent, "backup");
  try {
    await cp(root, copied, { recursive: true, force: false, errorOnExist: true });
    await assert.rejects(inspectRc7GateCRlmLauncher(copied), { code: "RLM_ROOT_IDENTITY_MISMATCH" });
    await cp(root, backup, { recursive: true, force: false, errorOnExist: true });
    await rm(root, { recursive: true, force: false });
    await cp(backup, root, { recursive: true, force: false, errorOnExist: true });
    await assert.rejects(inspectRc7GateCRlmLauncher(root), { code: "RLM_ROOT_IDENTITY_MISMATCH" });
  } finally { await cleanup(parent); }
});

test("unsafe, generic, nonempty, and evaluator-shaped preparations fail closed", async () => {
  await assert.rejects(prepareRc7GateCRlmLauncher(path.join(process.cwd(), "rc7-denied"), input()), { code: "MISSING_ROOT" });
  for (const overrides of [
    { case_id: "FACT-01" },
    { selected_route: "rc-direct" },
    { arm: "rc-direct" },
    { semantic_request: { oracle: "hidden" }, semantic_request_sha256: sha256V1(bytes({ oracle: "hidden" })) },
  ]) {
    const temporary = await freshRoot("denied");
    try { await assert.rejects(prepareRc7GateCRlmLauncher(temporary.root, input(overrides))); }
    finally { await cleanup(temporary.parent); }
  }
  const nonempty = await freshRoot("nonempty");
  try {
    await writeFile(path.join(nonempty.root, "stale.txt"), "stale");
    await assert.rejects(prepareRc7GateCRlmLauncher(nonempty.root, input()), { code: "NONEMPTY_ROOT" });
  } finally { await cleanup(nonempty.parent); }
});

test("junction aliases and credential-like roots are denied", async (t) => {
  const target = await freshRoot("physical");
  const alias = path.join(target.parent, "alias");
  try {
    try { await symlink(target.root, alias, "junction"); } catch (error) {
      if (["EPERM", "EACCES"].includes(error?.code)) { t.skip("junction creation unavailable on this Windows host"); return; }
      throw error;
    }
    await assert.rejects(assertRc7GateCRlmExternalRoot(alias), { code: "ALIASED_PATH" });
  } finally { await cleanup(target.parent); }
  const credential = await freshRoot("credentials");
  try { await assert.rejects(assertRc7GateCRlmExternalRoot(credential.root), { code: "CREDENTIAL_LIKE_ROOT" }); }
  finally { await cleanup(credential.parent); }
});

test("program publication is exact, bounded, identity-bound, and one-shot", async () => {
  const { parent, root } = await prepare("program");
  try {
    const context = await inspectRc7GateCRlmLauncher(root);
    const program = await publishRc7GateCRlmProgram(root, programInput(context));
    assert.match(program.program_sha256, /^[0-9a-f]{64}$/u);
    await assert.rejects(publishRc7GateCRlmProgram(root, programInput(context)), { code: "EEXIST" });
    await assert.rejects(publishRc7GateCRlmProgram(root, programInput(context, "x".repeat(RC7_GATE_C_RLM_LIMITS.program_bytes + 1))), { code: "PROGRAM_OVERSIZED" });
    await assert.rejects(publishRc7GateCRlmProgram(root, { ...programInput(context), base_output_sha256: "0".repeat(64) }), { code: "PROGRAM_BASE_OUTPUT_MISMATCH" });
    await assert.rejects(publishRc7GateCRlmProgram(root, { ...programInput(context), dispatch_sha256: "0".repeat(64) }), { code: "PROGRAM_IDENTITY_MISMATCH" });
  } finally { await cleanup(parent); }
});

test("Docker inspection accepts only the exact networkless three-mount boundary", async () => {
  const { parent, root } = await prepare("inspect");
  try {
    const context = await inspectRc7GateCRlmLauncher(root);
    const good = await validInspect(context);
    assert.equal(validateRc7GateCRlmDockerInspect(good, context, H.container).Id, H.container);
    for (const mutate of [
      (value) => { value[0].HostConfig.NetworkMode = "default"; },
      (value) => { value[0].Mounts[2].Source = process.cwd(); },
      (value) => { value[0].Mounts[2].RW = false; },
      (value) => { value[0].Config.Labels["rc7.gate-c.dispatch-sha256"] = "0".repeat(64); },
      (value) => { value[0].Config.Labels["rc7.gate-c.worker-sha256"] = "0".repeat(64); },
      (value) => { value[0].Config.Labels["rc7.gate-c.unregistered"] = "denied"; },
      (value) => { value[0].HostConfig.SecurityOpt[1] = "seccomp={}"; },
      (value) => { value[0].HostConfig.PidsLimit += 1; },
      (value) => { value[0].Config.Env.push("TOKEN=forbidden"); },
    ]) {
      const value = structuredClone(good);
      mutate(value);
      assert.throws(() => validateRc7GateCRlmDockerInspect(value, context, H.container));
    }
  } finally { await cleanup(parent); }
});

test("child proposals become reachable only through one durable broker result and are never replayed", async () => {
  const { parent, root } = await prepare("child");
  try {
    const context = await inspectRc7GateCRlmLauncher(root);
    const proposal = digest({
      schema_version: "rc7-gate-c-rlm-child-proposal-v1", state: "proposed-provider-unreachable",
      activation_sha256: context.launch.activation_sha256, run_identity: context.launch.run_identity,
      intent_sha256: context.launch.intent_sha256, dispatch_sha256: context.launch.dispatch_sha256,
      semantic_request_sha256: context.launch.semantic_request_sha256, child_sequence: 1, parent_depth: 0, child_depth: 1,
      child_question: "Which visible records support the registered relationship?", excerpt_locator: { kind: "line_range_sha256", source_id: "lab-a", start_line: 1, end_line: 2, excerpt_sha256: "1".repeat(64) },
      max_children: 4, max_depth: 2,
    }, "request_sha256");
    await writeFile(path.join(root, "exchange", "requests", "0001.json"), bytes(proposal), { flag: "wx" });
    let calls = 0;
    let observedTiming = null;
    const broker = async (request, timing) => {
      calls += 1;
      observedTiming = timing;
      return {
        state: "durable-intent-dispatched-once-trusted-sealed", request_sha256: request.request_sha256,
        durable_intent_sha256: "2".repeat(64), durable_dispatch_sha256: "3".repeat(64), sealed_result_sha256: "4".repeat(64),
        response_text: "sealed synthetic answer", response_text_sha256: sha256V1("sealed synthetic answer"),
      };
    };
    await assert.rejects(serviceRc7GateCRlmChildProposal(root, broker), { code: "PHASE_TWO_NOT_PROVEN" });
    await unlink(path.join(root, "exchange", "requests", "0001.json"));
    assert.equal(calls, 0);
    await writeFile(path.join(root, "exchange", "results", "phase-two.json"), bytes(phaseTwoRecord(context)), { flag: "wx" });
    const transient = path.join(root, "exchange", "requests", "0001.json.tmp-1-0123456789abcdef");
    await writeFile(transient, bytes(proposal), { flag: "wx" });
    assert.equal((await serviceRc7GateCRlmChildProposal(root, broker)).serviced, false);
    assert.equal(calls, 0);
    await unlink(transient);
    await writeFile(path.join(root, "exchange", "requests", "0001.json"), bytes(proposal), { flag: "wx" });
    assert.equal((await serviceRc7GateCRlmChildProposal(root, broker)).serviced, true);
    assert.equal((await serviceRc7GateCRlmChildProposal(root, broker)).serviced, false);
    assert.equal(calls, 1);
    assert.equal(Number.isSafeInteger(observedTiming.deadline_ms), true);
    assert.equal(observedTiming.host_timeout_ms <= 120_000, true);
    assert.equal(observedTiming.deadline_ms - Date.now() <= observedTiming.host_timeout_ms, true);
    const malformed = { ...proposal, child_sequence: 5, request_sha256: proposal.request_sha256 };
    await writeFile(path.join(root, "exchange", "requests", "0005.json"), bytes(malformed), { flag: "wx" });
    await assert.rejects(serviceRc7GateCRlmChildProposal(root, broker));
  } finally { await cleanup(parent); }
});

test("fake-controller execution seals exactly one result after live inspect and cleanup", async () => {
  const { parent, root } = await prepare("run");
  try {
    const context = await inspectRc7GateCRlmLauncher(root);
    const escapedPaddingProgram = `_padding=${JSON.stringify("\\".repeat(7_000))}\nprint("RC7_FINAL={\\"status\\":\\"ok\\"}")`;
    await publishRc7GateCRlmProgram(root, programInput(context, escapedPaddingProgram));
    const programInfo = await stat(path.join(root, "exchange", "commands", "program.json"));
    assert.equal(programInfo.size > RC7_GATE_C_RLM_LIMITS.program_bytes + 2_048, true);
    assert.equal(programInfo.size <= RC7_GATE_C_RLM_LIMITS.exchange_artifact_bytes, true);
    const controller = new FakeController();
    controller.context = context;
    const result = await runRc7GateCRlmWithController(root, { abort_signal: new AbortController().signal, broker_child: async () => assert.fail("no child expected"), controller });
    assert.equal(result.final_artifact.state, "trusted-sealed-cleanup-verified");
    assert.equal(result.final_artifact.cleanup_residue_entries, 0);
    const retained = await inspectRc7GateCRlmCompletedArtifact(root);
    assert.equal(retained.final_artifact.artifact_sha256, result.final_artifact.artifact_sha256);
    assert.equal(controller.started, true);
    assert.equal(controller.removed, true);
    assert.deepEqual(await controller.list(), []);
    assert.deepEqual((await readdir(path.join(root, "retained"))).sort(), ["final-artifact.json", "launch-package.json", "live-inspect.json"]);
  } finally { await cleanup(parent); }
});

test("interruption cleans the exact container and recovery records immutable no-replay state", async () => {
  const { parent, root } = await prepare("interrupt");
  try {
    const context = await inspectRc7GateCRlmLauncher(root);
    await publishRc7GateCRlmProgram(root, programInput(context));
    const controller = new FakeController({ failAt: "tick", writeResult: false });
    controller.context = context;
    await assert.rejects(runRc7GateCRlmWithController(root, { abort_signal: new AbortController().signal, broker_child: async () => assert.fail("no child expected"), controller }), /injected tick interruption/u);
    assert.equal(controller.removed, true);
    const first = await recoverRc7GateCRlmLauncher(root, { controller });
    const second = await recoverRc7GateCRlmLauncher(root, { controller });
    assert.equal(first.changed, true);
    assert.equal(first.terminal.state, "indeterminate-no-replay");
    assert.equal(first.terminal.replay_permitted, false);
    assert.equal(second.changed, false);
    assert.equal(second.terminal.terminal_sha256, first.terminal.terminal_sha256);
  } finally { await cleanup(parent); }
});

test("recovery excludes a concurrent owner and cleans only exact labelled residue", async () => {
  const { parent, root } = await prepare("recovery-lock");
  try {
    const lockPath = path.join(root, ".rc7-gate-c-rlm-launch.lock");
    const handle = await open(lockPath, "wx");
    const controller = new FakeController();
    try { await assert.rejects(recoverRc7GateCRlmLauncher(root, { controller }), { code: "CONCURRENT_RECOVERY" }); }
    finally { await handle.close(); await unlink(lockPath); }
    controller.created = true;
    const recovered = await recoverRc7GateCRlmLauncher(root, { controller });
    assert.equal(recovered.terminal.containers_cleaned, 1);
    assert.equal(recovered.terminal.cleanup_residue_entries, 0);
  } finally { await cleanup(parent); }
});
