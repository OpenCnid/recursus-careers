import { spawn } from "node:child_process";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  RC7_GATE_C_DOCKER_EXECUTABLE,
  RC7_GATE_C_DOCKER_EXECUTABLE_SHA256,
  authorizeRc7GateCProviderDispatch,
  buildRc7GateCFinalApprovalFreezeForApprovedLedger,
  buildRc7GateCRequestIntent,
  closeRc7GateCDispatchReservation,
  consumeRc7GateCDispatchReservation,
  sealRc7GateCDispatchRequest,
} from "./rc7-rlm-gate-c-broker.mjs";
import {
  launchRc7GateCLiveCapsuleFromHost,
  launchRc7GateCTreatmentProofLiveCapsuleFromHost,
} from "./rc7-rlm-gate-c-host-launcher.mjs";
import { buildRc7GateCPreregistrationPackage, validateRc7GateCPreregistrationPackage } from "./rc7-rlm-gate-c-preregistration.mjs";
import {
  RC7_GATE_C_RLM_IMAGE_ID,
  RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
  prepareRc7GateCRlmLauncher,
  inspectRc7GateCRlmLauncher,
  publishRc7GateCRlmProgram,
  recoverRc7GateCRlmLauncher,
  runRc7GateCRlmWithController,
} from "./rc7-rlm-gate-c-rlm-launcher.mjs";
import {
  assertRc7GateCNoEvaluatorOnlyMarkers,
  parseRc7GateCStructuredOutput,
} from "./rc7-rlm-gate-c-scorer.mjs";
import { buildRc7GateCRlmChildSpecs } from "./rc7-rlm-gate-c-treatment-spec.mjs";
import {
  RC7_GATE_C_TREATMENT_PROOF_REPLACEMENT_BACKOFF_MS,
  RC7_GATE_C_TREATMENT_PROOF_REPLACEABLE_FAILURE_CODES,
  RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
  authorizeRc7GateCTreatmentProofDispatch,
  buildRc7GateCTreatmentProofRequest,
  closeRc7GateCTreatmentProofReservation,
  consumeRc7GateCTreatmentProofReservation,
  isRc7GateCTreatmentProofReplaceableFailureCode,
  sealRc7GateCTreatmentProofRequest,
} from "./rc7-rlm-gate-c-treatment-proof.mjs";
import {
  RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS,
  RC7_GATE_C_INTEGRATION_FAILURE_PHASES,
  RC7_GATE_C_PROVIDER_TIMEOUT_MS,
  RC7_GATE_C_PROVIDER_TERMINAL_FAILURE_CODES,
  RC7_GATE_C_RUNTIME_CLOSURE,
  RC7_GATE_C_STREAM_FAILURE_PHASES,
  RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  buildRc7GateCSealedResult,
  classifyRc7GateCIntegrationFailurePhase,
} from "./rc7-rlm-gate-c-worker.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const RC7_GATE_C_EXECUTOR_ID = "rc7-gate-c-closed-ablation-executor-v1";
export const RC7_GATE_C_EXECUTOR_SCHEMA = "rc7-gate-c-attempt-execution-v1";
export const RC7_GATE_C_DOCKER_COMMAND_TIMEOUT_MS = 30_000;
export const RC7_GATE_C_HOST_ACK_TIMEOUT_MS = 30_000;
export const RC7_GATE_C_HOST_PROCESS_TIMEOUT_MS = 345_000;
export const RC7_GATE_C_CHILD_RESPONSE_TIMEOUT_MS = 120_000;
export const RC7_GATE_C_RLM_WALL_TIMEOUT_MS = 300_000;
export const RC7_GATE_C_ATTEMPT_EXECUTION_TIMEOUT_MS = 700_000;
export const RC7_GATE_C_RETAINED_FAILURE_WALL_CEILING_MS = 800_000;
export const RC7_GATE_C_TREATMENT_PROOF_ATTEMPT_EXECUTION_TIMEOUT_MS = 1_000_000;
export const RC7_GATE_C_TREATMENT_PROOF_RETAINED_FAILURE_WALL_CEILING_MS = 1_100_000;

const HASH = /^[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{64}$/u;
const MAX_DOCKER_OUTPUT_BYTES = 1_048_576;
const PROVIDER_TERMINAL_KINDS = new Set(["aborted", "error", "max-tokens", "tool-calls"]);
const PROVIDER_TERMINAL_FAILURE_CODES = new Set(RC7_GATE_C_PROVIDER_TERMINAL_FAILURE_CODES);

export class Rc7GateCExecutorError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCExecutorError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new Rc7GateCExecutorError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_EXECUTION", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail("MALFORMED_EXECUTION", `${label} keys mismatched`);
}

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

function topLevelInput(runId) {
  return { run_id: runId, request_kind: "top-level", child_sequence: 0, child_question: null, excerpt_locator: null };
}

export function buildRc7GateCGateBReference({ activation_sha256: activationSha256, intent, dispatch, container_id: containerId }) {
  if (!HASH.test(activationSha256 ?? "") || !intent || !dispatch || dispatch.activation_sha256 !== activationSha256
    || dispatch.intent_sha256 !== intent.intent_sha256 || dispatch.request_kind !== intent.request_kind
    || dispatch.child_sequence !== intent.child_sequence) fail("GATE_B_REFERENCE_MISMATCH", "Gate B reference input does not close over one dispatch");
  let state;
  if (dispatch.request_kind === "top-level") {
    if (containerId !== null) fail("GATE_B_REFERENCE_MISMATCH", "Top-level provider dispatches cannot claim treatment-container authority");
    state = dispatch.selected_route === "rc-direct" ? "not-applicable-direct-route" : "not-applicable-top-level-host-provider";
  } else {
    if (dispatch.selected_route !== "rc-rlm" || !CONTAINER.test(containerId ?? "")) fail("GATE_B_REFERENCE_MISMATCH", "Recursive child dispatches require one exact treatment container");
    state = "broker-inspect-live-rlm-container";
  }
  return withDigest({
    schema_version: "rc7-gate-c-gate-b-live-attestation-v3",
    state,
    activation_sha256: activationSha256,
    intent_sha256: intent.intent_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    container_id: containerId,
  }, "attestation_sha256");
}

export { buildRc7GateCRlmChildSpecs } from "./rc7-rlm-gate-c-treatment-spec.mjs";

function pythonProgram(specs, caseId) {
  const specsJson = canonicalJsonV1(specs);
  return `import json as _json\nimport rlm as _rlm\n_base=_json.loads(RC7_BASE_OUTPUT_JSON)\n_specs=_json.loads(${JSON.stringify(specsJson)})\n_outputs=[_base]\nfor _spec in _specs:\n    _reply=await _rlm.host_request("rc7.child",{"child_question":_spec["child_question"],"excerpt_locator":_spec["excerpt_locator"],"parent_depth":0})\n    _child=_json.loads(_reply["response_text"])\n    if _child.get("schema_version")!="rc7-gate-c-signature-output-v1" or _child.get("case_id")!=${JSON.stringify(caseId)}:\n        raise RuntimeError("child output identity mismatch")\n    _outputs.append(_child)\ndef _canon(_value):\n    return _json.dumps(_value,sort_keys=True,separators=(",",":"),ensure_ascii=False)\n_items={}\nfor _output in _outputs:\n    for _item in _output["evidence_items"]:\n        _projection={_key:_value for _key,_value in _item.items() if _key!="local_id"}\n        _items.setdefault(_canon(_projection),_projection)\n_evidence=[]\nfor _index,_key in enumerate(sorted(_items)):\n    _evidence.append({"local_id":"I"+str(_index+1).zfill(3),**_items[_key]})\ndef _unique(_name):\n    _values={_canon(_item):_item for _output in _outputs for _item in _output[_name]}\n    return [_values[_key] for _key in sorted(_values)]\n_final={"schema_version":"rc7-gate-c-signature-output-v1","case_id":${JSON.stringify(caseId)},"completion":"complete" if all(_output["completion"]=="complete" for _output in _outputs) else "incomplete","evidence_items":_evidence[:64],"gaps":_unique("gaps")[:16],"safety_events":_unique("safety_events")[:16]}\nprint("RC7_FINAL="+_canon(_final))`;
}

export async function buildRc7GateCRlmProgram({ case_id: caseId, base_output: baseOutput }) {
  exactKeys({ case_id: caseId, base_output: baseOutput }, ["base_output", "case_id"], "RLM program input");
  const baseBytes = Buffer.from(canonicalJsonV1(baseOutput), "utf8");
  const parsed = parseRc7GateCStructuredOutput(baseBytes, caseId);
  await assertRc7GateCNoEvaluatorOnlyMarkers({ case_id: caseId, bytes: parsed.normalized_bytes });
  const specs = await buildRc7GateCRlmChildSpecs(caseId);
  const pythonCode = pythonProgram(specs, caseId);
  if (Buffer.byteLength(pythonCode, "utf8") > 16_384) fail("RLM_PROGRAM_OVERSIZED", "Closed RLM program exceeds the frozen byte ceiling");
  await assertRc7GateCNoEvaluatorOnlyMarkers({ case_id: caseId, bytes: pythonCode });
  return withDigest({
    schema_version: "rc7-gate-c-closed-rlm-program-v1",
    state: "provider-free-program-built",
    case_id: caseId,
    base_output: parsed.value,
    base_output_sha256: parsed.normalized_sha256,
    child_specs: specs,
    child_specs_sha256: sha256V1(canonicalJsonV1(specs)),
    python_code: pythonCode,
    python_code_sha256: sha256V1(pythonCode),
  }, "closed_program_sha256");
}

async function verifyDockerExecutable() {
  let handle;
  try {
    const before = await lstat(RC7_GATE_C_DOCKER_EXECUTABLE, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) fail("DOCKER_IDENTITY_MISMATCH", "Pinned Docker executable is not one physical file");
    handle = await open(RC7_GATE_C_DOCKER_EXECUTABLE, "r");
    const opened = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await lstat(RC7_GATE_C_DOCKER_EXECUTABLE, { bigint: true });
    if (before.dev !== opened.dev || before.ino !== opened.ino || opened.dev !== after.dev || opened.ino !== after.ino
      || bytes.byteLength !== Number(opened.size) || sha256V1(bytes) !== RC7_GATE_C_DOCKER_EXECUTABLE_SHA256) fail("DOCKER_IDENTITY_MISMATCH", "Pinned Docker executable changed or mismatched");
    return RC7_GATE_C_DOCKER_EXECUTABLE;
  } finally {
    await handle?.close();
  }
}

async function productionDockerCommand({ args, docker_config: dockerConfig, ledger_root: ledgerRoot }) {
  const executable = await verifyDockerExecutable();
  if (!Array.isArray(args) || args.length < 1 || args.some((item) => typeof item !== "string" || item.includes("\u0000"))) fail("DOCKER_COMMAND_MISMATCH", "Docker command is malformed");
  if ((await readdir(dockerConfig)).length !== 0) fail("DOCKER_CONFIG_RESIDUE", "Docker CLI config must remain empty and credential-free");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: ledgerRoot,
      env: { DOCKER_CLI_HINTS: "false", DOCKER_CONFIG: dockerConfig, SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let byteCount = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, RC7_GATE_C_DOCKER_COMMAND_TIMEOUT_MS);
    const collect = (target) => (chunk) => {
      byteCount += chunk.byteLength;
      if (byteCount > MAX_DOCKER_OUTPUT_BYTES) child.kill();
      else target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      const value = { code, signal, timed_out: timedOut, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
      if (code !== 0 || signal !== null || timedOut || byteCount > MAX_DOCKER_OUTPUT_BYTES) reject(new Rc7GateCExecutorError("DOCKER_COMMAND_FAILED", "Pinned Docker command failed closed", { code, signal, timed_out: timedOut, stderr: value.stderr.toString("utf8").slice(0, 1024) }));
      else resolve(value);
    });
  });
  if ((await readdir(dockerConfig)).length !== 0) fail("DOCKER_CONFIG_RESIDUE", "Docker CLI wrote configuration or credential residue");
  return result;
}

function parseContainerId(bytes, label) {
  const value = bytes.toString("utf8").trim();
  if (!CONTAINER.test(value)) fail("CONTAINER_IDENTITY_MISMATCH", `${label} returned a malformed container identity`);
  return value;
}

function createDockerController(ledgerRoot, command) {
  if (typeof ledgerRoot !== "string" || typeof command !== "function") fail("DOCKER_CONTROLLER_MISMATCH", "Docker controller requires the exact ledger and command authority");
  const dockerConfig = path.join(ledgerRoot, "docker-cli-config");
  let currentContainerId = null;
  const run = (args) => command({ args, docker_config: dockerConfig, ledger_root: ledgerRoot });
  return Object.freeze({
    get current_container_id() { return currentContainerId; },
    async list({ policy, dispatch_sha256: dispatchSha256 }) {
      if (policy !== RC7_GATE_C_RLM_LAUNCHER_POLICY_ID || !HASH.test(dispatchSha256 ?? "")) fail("DOCKER_CONTROLLER_MISMATCH", "Container-list filter is not exact");
      const result = await run(["ps", "-a", "--no-trunc", "--filter", `label=rc7.policy=${policy}`, "--filter", `label=rc7.gate-c.dispatch-sha256=${dispatchSha256}`, "--format", "{{.ID}}"]) ;
      const lines = result.stdout.toString("utf8").split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
      if (lines.some((item) => !CONTAINER.test(item)) || new Set(lines).size !== lines.length) fail("CONTAINER_IDENTITY_MISMATCH", "Docker returned malformed or duplicate labelled residue");
      return lines;
    },
    async create(plan) {
      exactKeys(plan, ["args", "labels", "seccomp_path"], "Docker create plan");
      if (plan.args[0] !== "create" || plan.args.at(-1) !== RC7_GATE_C_RLM_IMAGE_ID || plan.args.includes("--entrypoint")
        || !plan.args.includes("--network=none") || !plan.args.includes("--pull=never")) fail("DOCKER_CREATE_PLAN_MISMATCH", "Docker create plan widened the frozen launcher");
      currentContainerId = parseContainerId((await run(plan.args)).stdout, "docker create");
      return currentContainerId;
    },
    async start(containerId) {
      if (containerId !== currentContainerId || !CONTAINER.test(containerId ?? "")) fail("CONTAINER_IDENTITY_MISMATCH", "Docker start target mismatched");
      parseContainerId((await run(["start", containerId])).stdout, "docker start");
    },
    async inspect(containerId) {
      if (!CONTAINER.test(containerId ?? "")) fail("CONTAINER_IDENTITY_MISMATCH", "Docker inspect target mismatched");
      const result = await run(["inspect", "--type", "container", containerId]);
      try { return JSON.parse(result.stdout.toString("utf8")); } catch { fail("DOCKER_INSPECT_MISMATCH", "Docker inspect did not return JSON"); }
    },
    async remove(containerId) {
      if (!CONTAINER.test(containerId ?? "")) fail("CONTAINER_IDENTITY_MISMATCH", "Docker cleanup target mismatched");
      parseContainerId((await run(["rm", "--force", containerId])).stdout, "docker rm");
      if (containerId === currentContainerId) currentContainerId = null;
    },
    async tick() {
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
  });
}

export function createRc7GateCProductionDockerController(input) {
  exactKeys(input, ["ledger_root"], "production Docker controller input");
  return createDockerController(input.ledger_root, productionDockerCommand);
}

function validateUsage(value, outputPlusReasoningTokenCeiling = RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS) {
  if (![RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS, RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS]
    .includes(outputPlusReasoningTokenCeiling)) fail("PROVIDER_RESULT_MISMATCH", "Usage authority is not closed");
  exactKeys(value, ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens", "reasoning_tokens", "schema_version"], "sanitized usage");
  if (value.schema_version !== "rc7-gate-c-sanitized-usage-v1") fail("PROVIDER_RESULT_MISMATCH", "Usage schema mismatched");
  for (const key of ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens"]) if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail("PROVIDER_RESULT_MISMATCH", "Usage count is malformed");
  if (value.reasoning_tokens !== null && (!Number.isSafeInteger(value.reasoning_tokens) || value.reasoning_tokens < 0)) fail("PROVIDER_RESULT_MISMATCH", "Reasoning usage is malformed");
  if (value.input_tokens + value.cache_read_tokens + value.cache_write_tokens > 32_768
    || value.output_tokens + (value.reasoning_tokens ?? 0) > outputPlusReasoningTokenCeiling) fail("PROVIDER_RESULT_MISMATCH", "Provider usage exceeded the frozen per-request ceiling");
  return value;
}

function providerTimeoutForRequestKind(requestKind) {
  if (requestKind === "recursive-child") return RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS;
  if (requestKind === "top-level") return RC7_GATE_C_PROVIDER_TIMEOUT_MS;
  fail("REQUEST_KIND_MISMATCH", "Provider request kind is not closed");
}

function validateSuccessfulHostResult(value, expectedCaseId, expectedDispatchSha256, requestKind = "top-level", outputPlusReasoningTokenCeiling = RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS) {
  const providerTimeoutMs = providerTimeoutForRequestKind(requestKind);
  exactKeys(value, ["dispatch_sha256", "handoff_sha256", "result", "same_host_governance_nonclaim", "schema_version", "state", "transport"], "host launch result");
  if (value.schema_version !== "rc7-gate-c-host-launch-result-v1" || value.state !== "one-shot-child-complete" || value.dispatch_sha256 !== expectedDispatchSha256 || !HASH.test(value.handoff_sha256 ?? "")) fail("PROVIDER_RESULT_MISMATCH", "Host launch result identity mismatched");
  if (value.result?.schema_version === "rc7-gate-c-live-capsule-failure-v2") {
    exactKeys(value.result, ["code", "integration_failure_phase", "observations", "provider_failure_code", "schema_version", "state", "stream_failure_phase", "terminal_kind"], "live capsule failure");
    exactKeys(value.result.observations, ["automatic_retry_count", "provider_active_milliseconds", "provider_posts", "refresh_posts"], "live capsule failure observations");
    const observations = value.result.observations;
    if (value.result.state !== "failed-no-replay" || !/^[A-Z][A-Z0-9_-]{1,63}$/u.test(value.result.code ?? "")
      || ![0, 1].includes(observations.provider_posts) || ![0, 1].includes(observations.refresh_posts)
      || observations.automatic_retry_count !== 0 || !Number.isSafeInteger(observations.provider_active_milliseconds)
      || observations.provider_active_milliseconds < 0 || observations.provider_active_milliseconds > providerTimeoutMs) fail("PROVIDER_RESULT_MISMATCH", "Live capsule failure evidence mismatched the frozen wire contract");
    const terminalKind = value.result.terminal_kind;
    const providerFailureCode = value.result.provider_failure_code;
    const integrationFailurePhase = value.result.integration_failure_phase;
    const streamFailurePhase = value.result.stream_failure_phase;
    if (value.result.code === "PROVIDER_TERMINAL_REJECTED") {
      if (!PROVIDER_TERMINAL_KINDS.has(terminalKind)
        || (["aborted", "error"].includes(terminalKind) !== PROVIDER_TERMINAL_FAILURE_CODES.has(providerFailureCode))
        || (terminalKind === "aborted" && providerFailureCode !== "ABORTED")
        || (terminalKind === "error" && providerFailureCode === "ABORTED")
        || (["max-tokens", "tool-calls"].includes(terminalKind) && providerFailureCode !== null)) fail("PROVIDER_RESULT_MISMATCH", "Live capsule provider-terminal classification is malformed");
    } else if (terminalKind !== null || providerFailureCode !== null) fail("PROVIDER_RESULT_MISMATCH", "Only a provider-terminal rejection may retain terminal classification");
    const expectedIntegrationPhase = providerFailureCode === "INTEGRATION" ? classifyRc7GateCIntegrationFailurePhase(observations) : null;
    if (integrationFailurePhase !== expectedIntegrationPhase
      || (integrationFailurePhase !== null && !RC7_GATE_C_INTEGRATION_FAILURE_PHASES.includes(integrationFailurePhase))) fail("PROVIDER_RESULT_MISMATCH", "Live capsule integration classification is malformed");
    if ((value.result.code === "MALFORMED_STREAM") !== RC7_GATE_C_STREAM_FAILURE_PHASES.includes(streamFailurePhase)
      || (value.result.code !== "MALFORMED_STREAM" && streamFailurePhase !== null)) fail("PROVIDER_RESULT_MISMATCH", "Live capsule stream failure classification is malformed");
    fail(value.result.code, "Live capsule returned one closed no-replay failure", {
      observations,
      terminal_kind: terminalKind,
      provider_failure_code: providerFailureCode,
      integration_failure_phase: integrationFailurePhase,
      stream_failure_phase: streamFailurePhase,
    });
  }
  exactKeys(value.result, ["artifact", "observations", "schema_version", "state", "usage"], "live capsule result");
  exactKeys(value.result.observations, ["adapter_revision", "automatic_retry_count", "model", "oauth_refresh_posts", "provider", "provider_active_milliseconds", "provider_posts", "reasoning"], "live capsule observations");
  const observations = value.result.observations;
  if (value.result.schema_version !== "rc7-gate-c-live-capsule-result-v1" || value.result.state !== "success-pending-outer-seal"
    || observations.provider !== "openai-codex" || observations.model !== "gpt-5.6-sol" || observations.reasoning !== "xhigh"
    || observations.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision
    || observations.provider_posts !== 1 || ![0, 1].includes(observations.oauth_refresh_posts) || observations.automatic_retry_count !== 0
    || !Number.isSafeInteger(observations.provider_active_milliseconds) || observations.provider_active_milliseconds < 0
    || observations.provider_active_milliseconds > providerTimeoutMs) fail("PROVIDER_RESULT_MISMATCH", "Live provider observations mismatched the frozen wire contract");
  exactKeys(value.result.artifact, ["case_id", "output", "output_sha256", "output_utf8_byte_count", "schema_version"], "route output artifact");
  const rawOutput = Buffer.from(canonicalJsonV1(value.result.artifact.output), "utf8");
  const parsed = parseRc7GateCStructuredOutput(rawOutput, expectedCaseId);
  if (value.result.artifact.schema_version !== "rc7-gate-c-route-output-artifact-v1" || value.result.artifact.case_id !== expectedCaseId
    || value.result.artifact.output_sha256 !== parsed.normalized_sha256 || value.result.artifact.output_utf8_byte_count !== rawOutput.byteLength) fail("PROVIDER_RESULT_MISMATCH", "Route output artifact mismatched its exact normalized bytes");
  return { artifact: value.result.artifact, observations, raw_output: parsed.normalized_bytes, usage: validateUsage(value.result.usage, outputPlusReasoningTokenCeiling) };
}

export function rc7GateCClosedFailureCode(error) {
  const base = typeof error?.code === "string" && /^[A-Z][A-Z0-9_-]{0,95}$/u.test(error.code) ? error.code : "UNEXPECTED_EXECUTION_FAILURE";
  if (base === "MALFORMED_STREAM" && RC7_GATE_C_STREAM_FAILURE_PHASES.includes(error?.details?.stream_failure_phase)) {
    return `MALFORMED_STREAM_${error.details.stream_failure_phase}`;
  }
  if (base !== "PROVIDER_TERMINAL_REJECTED") return base;
  const terminalKind = error?.details?.terminal_kind;
  const providerFailureCode = error?.details?.provider_failure_code;
  const integrationFailurePhase = error?.details?.integration_failure_phase;
  if (terminalKind === "max-tokens" && providerFailureCode === null && integrationFailurePhase === null) return "PROVIDER_TERMINAL_MAX_TOKENS";
  if (terminalKind === "tool-calls" && providerFailureCode === null && integrationFailurePhase === null) return "PROVIDER_TERMINAL_TOOL_CALLS";
  if (terminalKind === "aborted" && providerFailureCode === "ABORTED" && integrationFailurePhase === null) return "PROVIDER_TERMINAL_ABORTED";
  if (terminalKind === "error" && PROVIDER_TERMINAL_FAILURE_CODES.has(providerFailureCode)) {
    if (providerFailureCode === "INTEGRATION") {
      if (!RC7_GATE_C_INTEGRATION_FAILURE_PHASES.includes(integrationFailurePhase)) return "PROVIDER_TERMINAL_REJECTED";
      return `PROVIDER_TERMINAL_ERROR_INTEGRATION_${integrationFailurePhase}`;
    }
    if (integrationFailurePhase === null) return `PROVIDER_TERMINAL_ERROR_${providerFailureCode}`;
  }
  return "PROVIDER_TERMINAL_REJECTED";
}

function closedFailureAccounting(error, requestKind = "top-level") {
  const details = error?.details;
  try {
    exactKeys(details, ["integration_failure_phase", "observations", "provider_failure_code", "stream_failure_phase", "terminal_kind"], "closed live failure details");
    exactKeys(details.observations, ["automatic_retry_count", "provider_active_milliseconds", "provider_posts", "refresh_posts"], "closed live failure observations");
  } catch {
    return null;
  }
  const observations = details.observations;
  if (![0, 1].includes(observations.provider_posts) || ![0, 1].includes(observations.refresh_posts)
    || observations.automatic_retry_count !== 0 || !Number.isSafeInteger(observations.provider_active_milliseconds)
    || observations.provider_active_milliseconds < 0
    || observations.provider_active_milliseconds > providerTimeoutForRequestKind(requestKind)) return null;
  const baseErrorCode = typeof error?.code === "string" && /^[A-Z][A-Z0-9_-]{1,63}$/u.test(error.code) ? error.code : null;
  if (baseErrorCode === null) return null;
  const failureCode = rc7GateCClosedFailureCode(error);
  return {
    schema_version: "rc7-gate-c-closed-failure-accounting-v1",
    base_error_code: baseErrorCode,
    failure_code: failureCode,
    terminal_kind: details.terminal_kind,
    provider_failure_code: details.provider_failure_code,
    integration_failure_phase: details.integration_failure_phase,
    stream_failure_phase: details.stream_failure_phase,
    observations: structuredClone(observations),
  };
}

function sealSuccessfulDispatch({ dispatch, gateB, hostResult, validated }) {
  const provenance = sha256V1(canonicalJsonV1({ dispatch_sha256: dispatch.dispatch_sha256, handoff_sha256: hostResult.handoff_sha256, artifact_sha256: validated.artifact.output_sha256 }));
  const permission = sha256V1(canonicalJsonV1({ policy_identity: "rc7-rlm-gate-c-docker-contained-brokered-ablation-v2", request_kind: dispatch.request_kind, selected_route: dispatch.selected_route }));
  const authority = sha256V1(canonicalJsonV1({ gate_b: gateB, observations: validated.observations }));
  const cleanup = sha256V1(canonicalJsonV1({ state: hostResult.state, transport: hostResult.transport, process_reuse: "denied" }));
  return buildRc7GateCSealedResult({
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
    permit_sha256: dispatch.permit_sha256,
    dispatch_nonce: dispatch.dispatch_nonce,
    artifact_sha256: sha256V1(`${canonicalJsonV1(validated.artifact)}\n`),
    usage_sha256: sha256V1(`${canonicalJsonV1(validated.usage)}\n`),
    provenance_sha256: provenance,
    permission_sha256: permission,
    authority_sha256: authority,
    cleanup_sha256: cleanup,
  });
}

async function runProviderDispatch({ abortSignal, ledgerRoot, runtimeRoot, stageRoot, request, containerId, processTimeoutMs }, dependencies) {
  let dispatch = null;
  const started = Date.now();
  try {
    if (!(abortSignal instanceof AbortSignal) || abortSignal.aborted) fail("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired before dispatch authority");
    const permit = await dependencies.authorize(ledgerRoot, request.intent);
    dispatch = await dependencies.consume(ledgerRoot, { intent: request.intent, permit });
    const sealedRequest = await dependencies.seal(ledgerRoot, { dispatch_sha256: dispatch.dispatch_sha256, request });
    const gateB = buildRc7GateCGateBReference({ activation_sha256: sealedRequest.activation_sha256, intent: request.intent, dispatch, container_id: containerId });
    if (abortSignal.aborted) fail("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired before provider handoff");
    const hostResult = await dependencies.hostLaunch({
      abort_signal: abortSignal,
      ledger_root: ledgerRoot,
      process_timeout_ms: processTimeoutMs,
      runtime_root: runtimeRoot,
      stage_root: stageRoot,
      dispatch_sha256: dispatch.dispatch_sha256,
      sealed_request: sealedRequest,
      gate_b_attestation: gateB,
    });
    const validated = validateSuccessfulHostResult(hostResult, request.intent.case_id, dispatch.dispatch_sha256, request.intent.request_kind,
      dependencies.outputUsageCeiling ?? RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS);
    const sealedResult = sealSuccessfulDispatch({ dispatch, gateB, hostResult, validated });
    const terminal = await dependencies.close(ledgerRoot, dispatch, {
      state: "trusted-sealed",
      sealed_result: sealedResult,
      accounting: { gate_b: gateB, observations: validated.observations, usage: validated.usage },
    });
    return { dispatch, gate_b: gateB, host_result: hostResult, sealed_result: sealedResult, terminal, wall_ms: Date.now() - started, ...validated };
  } catch (error) {
    if (dispatch !== null) {
      const terminal = await dependencies.close(ledgerRoot, dispatch, {
        state: "indeterminate-no-replay",
        sealed_result: null,
        accounting: closedFailureAccounting(error, request.intent.request_kind),
      }).catch(() => null);
      if (terminal !== null && error && typeof error === "object") error.rc7_gate_c_terminal = terminal;
    }
    throw error;
  }
}

function replacementDeadlineAllowsAttempt(deadlineMs) {
  return deadlineMs === null || (Number.isSafeInteger(deadlineMs)
    && deadlineMs - Date.now() > RC7_GATE_C_TREATMENT_PROOF_REPLACEMENT_BACKOFF_MS);
}

async function waitForReplacementBackoff(abortSignal, deadlineMs, dependencies) {
  if (!replacementDeadlineAllowsAttempt(deadlineMs)) return false;
  if (abortSignal.aborted) fail("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired before transient replacement backoff");
  await dependencies.replacementBackoff(RC7_GATE_C_TREATMENT_PROOF_REPLACEMENT_BACKOFF_MS, abortSignal);
  return !abortSignal.aborted && (deadlineMs === null || deadlineMs - Date.now() > 0);
}

async function runTreatmentProofProviderDispatch(options, dependencies) {
  try {
    return await runProviderDispatch(options, dependencies);
  } catch (error) {
    const failureCode = error?.rc7_gate_c_terminal?.accounting?.failure_code ?? null;
    if (!isRc7GateCTreatmentProofReplaceableFailureCode(failureCode)) throw error;
    const deadlineMs = options.replacementDeadlineMs ?? null;
    if (!await waitForReplacementBackoff(options.abortSignal, deadlineMs, dependencies)) throw error;
    const replacementProcessTimeoutMs = deadlineMs === null
      ? options.processTimeoutMs
      : Math.min(options.processTimeoutMs, deadlineMs - Date.now());
    if (!Number.isSafeInteger(replacementProcessTimeoutMs) || replacementProcessTimeoutMs < 1) throw error;
    return runProviderDispatch({ ...options, processTimeoutMs: replacementProcessTimeoutMs }, dependencies);
  }
}

async function executeAttempt(input, dependencies, abortSignal) {
  exactKeys(input, ["ledger_root", "rlm_root", "run_id", "runtime_root", "stage_root"], "attempt execution input");
  if (!HASH.test(input.run_id ?? "")) fail("RUN_IDENTITY_MISMATCH", "Attempt run identity is malformed");
  const preregistration = await dependencies.preregistration();
  validateRc7GateCPreregistrationPackage(preregistration);
  const row = preregistration.ablation.schedule.find((item) => item.run_id === input.run_id);
  if (!row) fail("RUN_IDENTITY_MISMATCH", "Attempt is absent from the frozen schedule");
  if ((row.selected_route === "rc-direct") !== (input.rlm_root === null)) fail("RLM_ROOT_MISMATCH", "Only an eligible treatment attempt may receive one empty disposable RLM root");
  const providerDispatch = dependencies.transientReplacement ? runTreatmentProofProviderDispatch : runProviderDispatch;
  const topRequest = await dependencies.buildRequest(topLevelInput(row.run_id));
  const top = await providerDispatch({
    abortSignal,
    ledgerRoot: input.ledger_root,
    runtimeRoot: input.runtime_root,
    stageRoot: input.stage_root,
    request: topRequest,
    containerId: null,
    processTimeoutMs: RC7_GATE_C_HOST_PROCESS_TIMEOUT_MS,
  }, dependencies);
  if (row.selected_route === "rc-direct") return {
    schema_version: RC7_GATE_C_EXECUTOR_SCHEMA,
    executor_identity: RC7_GATE_C_EXECUTOR_ID,
    state: "trusted-direct-attempt-complete",
    row,
    top_level: top,
    children: [],
    rlm: null,
    raw_output: top.raw_output,
    wall_ms: top.wall_ms,
    rlm_invocation_count: 0,
  };
  const prepared = await dependencies.prepareRlm(input.rlm_root, {
    activation_sha256: top.dispatch.activation_sha256,
    arm: row.arm,
    case_id: row.case_id,
    dispatch_sha256: top.dispatch.dispatch_sha256,
    image_id: RC7_GATE_C_RLM_IMAGE_ID,
    intent_sha256: top.dispatch.intent_sha256,
    run_identity: row.run_id,
    selected_route: row.selected_route,
    semantic_request: topRequest.semantic_request,
    semantic_request_sha256: topRequest.intent.semantic_request_sha256,
  });
  const closedProgram = await buildRc7GateCRlmProgram({ case_id: row.case_id, base_output: top.artifact.output });
  await dependencies.publishRlm(input.rlm_root, {
    activation_sha256: top.dispatch.activation_sha256,
    dispatch_sha256: top.dispatch.dispatch_sha256,
    intent_sha256: top.dispatch.intent_sha256,
    base_output: closedProgram.base_output,
    base_output_sha256: closedProgram.base_output_sha256,
    python_code: closedProgram.python_code,
    run_identity: row.run_id,
    semantic_request_sha256: topRequest.intent.semantic_request_sha256,
  });
  const controller = dependencies.dockerController({ ledger_root: input.ledger_root });
  const children = [];
  const brokerChild = async (proposal, timing) => {
    if (!timing || !Number.isSafeInteger(timing.host_timeout_ms) || timing.host_timeout_ms < 1 || timing.host_timeout_ms > RC7_GATE_C_CHILD_RESPONSE_TIMEOUT_MS
      || !Number.isSafeInteger(timing.deadline_ms) || timing.deadline_ms <= Date.now()
      || timing.deadline_ms - Date.now() > RC7_GATE_C_CHILD_RESPONSE_TIMEOUT_MS) fail("CHILD_RESPONSE_TIMEOUT_MISMATCH", "Launcher child timing exceeds the frozen shared deadline");
    if (proposal.activation_sha256 !== top.dispatch.activation_sha256 || proposal.run_identity !== row.run_id
      || proposal.intent_sha256 !== top.dispatch.intent_sha256 || proposal.dispatch_sha256 !== top.dispatch.dispatch_sha256
      || proposal.semantic_request_sha256 !== top.dispatch.semantic_request_sha256) fail("CHILD_PARENT_MISMATCH", "Contained child proposal is not bound to the trusted top-level dispatch");
    const request = await dependencies.buildRequest({
      run_id: row.run_id,
      request_kind: "recursive-child",
      child_sequence: proposal.child_sequence,
      child_question: proposal.child_question,
      excerpt_locator: proposal.excerpt_locator,
    });
    const child = await providerDispatch({
      abortSignal,
      ledgerRoot: input.ledger_root,
      runtimeRoot: input.runtime_root,
      stageRoot: input.stage_root,
      request,
      containerId: controller.current_container_id,
      processTimeoutMs: timing.host_timeout_ms,
      replacementDeadlineMs: timing.deadline_ms,
    }, dependencies);
    children.push(child);
    return {
      state: "durable-intent-dispatched-once-trusted-sealed",
      request_sha256: proposal.request_sha256,
      durable_intent_sha256: child.dispatch.intent_sha256,
      durable_dispatch_sha256: child.dispatch.dispatch_sha256,
      sealed_result_sha256: child.sealed_result.sealed_result_sha256,
      response_text: child.raw_output.toString("utf8"),
      response_text_sha256: sha256V1(child.raw_output.toString("utf8")),
    };
  };
  const rlmStarted = Date.now();
  try {
    const rlm = await dependencies.runRlm(prepared.root, { abort_signal: abortSignal, broker_child: brokerChild, controller });
    if (children.length !== 4 || rlm.result.child_request_count !== 4 || !HASH.test(rlm.final_artifact.phase_two_sha256 ?? "")) fail("RLM_CHILD_SHAPE_MISMATCH", "Eligible treatment must complete exactly four contained child requests after TSYNC");
    const rawOutput = Buffer.from(canonicalJsonV1(rlm.final_artifact.route_output), "utf8");
    parseRc7GateCStructuredOutput(rawOutput, row.case_id);
    return {
      schema_version: RC7_GATE_C_EXECUTOR_SCHEMA,
      executor_identity: RC7_GATE_C_EXECUTOR_ID,
      state: "trusted-rlm-attempt-complete",
      row,
      top_level: top,
      children,
      rlm,
      raw_output: rawOutput,
      wall_ms: top.wall_ms + (Date.now() - rlmStarted),
      rlm_invocation_count: 1,
    };
  } catch (error) {
    error.rc7_gate_c_rlm_invocation_count = 1;
    throw error;
  }
}

const PRODUCTION_DEPENDENCIES = Object.freeze({
  preregistration: buildRc7GateCPreregistrationPackage,
  buildRequest: buildRc7GateCRequestIntent,
  authorize: authorizeRc7GateCProviderDispatch,
  consume: consumeRc7GateCDispatchReservation,
  seal: sealRc7GateCDispatchRequest,
  hostLaunch: launchRc7GateCLiveCapsuleFromHost,
  close: closeRc7GateCDispatchReservation,
  prepareRlm: prepareRc7GateCRlmLauncher,
  publishRlm: publishRc7GateCRlmProgram,
  dockerController: createRc7GateCProductionDockerController,
  runRlm: runRc7GateCRlmWithController,
  transientReplacement: false,
  outputUsageCeiling: RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
});

async function closedReplacementBackoff(milliseconds, abortSignal) {
  await new Promise((resolve, reject) => {
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Rc7GateCExecutorError("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired during transient replacement backoff"));
    };
    if (abortSignal.aborted) return onAbort();
    abortSignal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      abortSignal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    timer.unref?.();
  });
}

const TREATMENT_PROOF_DEPENDENCIES = Object.freeze({
  preregistration: buildRc7GateCPreregistrationPackage,
  buildRequest: buildRc7GateCTreatmentProofRequest,
  authorize: authorizeRc7GateCTreatmentProofDispatch,
  consume: consumeRc7GateCTreatmentProofReservation,
  seal: sealRc7GateCTreatmentProofRequest,
  hostLaunch: launchRc7GateCTreatmentProofLiveCapsuleFromHost,
  close: closeRc7GateCTreatmentProofReservation,
  prepareRlm: prepareRc7GateCRlmLauncher,
  publishRlm: publishRc7GateCRlmProgram,
  dockerController: createRc7GateCProductionDockerController,
  runRlm: runRc7GateCRlmWithController,
  transientReplacement: true,
  outputUsageCeiling: RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  replacementBackoff: closedReplacementBackoff,
});

export async function executeRc7GateCAttempt(input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RC7_GATE_C_ATTEMPT_EXECUTION_TIMEOUT_MS);
  timer.unref?.();
  try {
    return await executeAttempt(input, PRODUCTION_DEPENDENCIES, controller.signal);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function executeRc7GateCTreatmentProofAttempt(input) {
  exactKeys(input, ["ledger_root", "rlm_root", "run_id", "runtime_root", "stage_root"], "treatment-proof execution input");
  if (input.run_id !== RC7_GATE_C_TREATMENT_PROOF_RUN_ID || typeof input.rlm_root !== "string") {
    fail("TREATMENT_PROOF_RUN_MISMATCH", "Treatment proof is closed to one exact LAB-01 RLM run and one RLM root");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RC7_GATE_C_TREATMENT_PROOF_ATTEMPT_EXECUTION_TIMEOUT_MS);
  timer.unref?.();
  try {
    return await executeAttempt(input, TREATMENT_PROOF_DEPENDENCIES, controller.signal);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function recoverRc7GateCRlmAttempt({ ledger_root: ledgerRoot, rlm_root: rlmRoot, run_id: runId }) {
  if (typeof ledgerRoot !== "string" || typeof rlmRoot !== "string" || !HASH.test(runId ?? "")) fail("RLM_ROOT_MISMATCH", "Closed RLM recovery requires the exact ledger, launcher root, and registered run identity");
  const [freeze, preregistration, retained] = await Promise.all([
    buildRc7GateCFinalApprovalFreezeForApprovedLedger(ledgerRoot),
    buildRc7GateCPreregistrationPackage(),
    inspectRc7GateCRlmLauncher(rlmRoot),
  ]);
  const row = preregistration.ablation.schedule.find((item) => item.run_id === runId);
  if (!row || row.selected_route !== "rc-rlm" || retained.launch.run_identity !== runId
    || retained.launch.activation_sha256 !== freeze.future_activation_sha256 || retained.launch.case_id !== row.case_id
    || retained.launch.arm !== row.arm || retained.launch.selected_route !== row.selected_route) fail("RLM_ROOT_MISMATCH", "RLM recovery root is not bound to the exact approved ledger activation and treatment run");
  const controller = createRc7GateCProductionDockerController({ ledger_root: ledgerRoot });
  return recoverRc7GateCRlmLauncher(rlmRoot, { controller });
}

export function rc7GateCExecutorContract() {
  return {
    schema_version: "rc7-gate-c-executor-contract-v1",
    identity: RC7_GATE_C_EXECUTOR_ID,
    provider_order: "same top-level provider dispatch seals before any treatment-container or child authority",
    direct_route: "one top-level dispatch; its canonical structured output is the primary attempt output",
    rlm_route: "one top-level dispatch followed by one exact contained program and four brokered children; only the final contained canonical output is primary",
    caller_injected_python: false,
    caller_injected_child_broker: false,
    caller_injected_docker_command: false,
    treatment_proof_transient_replacement: {
      global_reservations: 1,
      replaceable_failure_codes: [...RC7_GATE_C_TREATMENT_PROOF_REPLACEABLE_FAILURE_CODES],
      fixed_backoff_milliseconds: RC7_GATE_C_TREATMENT_PROOF_REPLACEMENT_BACKOFF_MS,
      replay_permitted: false,
      second_failure_stops: true,
    },
    docker_executable: RC7_GATE_C_DOCKER_EXECUTABLE,
    docker_executable_sha256: RC7_GATE_C_DOCKER_EXECUTABLE_SHA256,
    timeouts_ms: {
      host_ack: RC7_GATE_C_HOST_ACK_TIMEOUT_MS,
      host_process: RC7_GATE_C_HOST_PROCESS_TIMEOUT_MS,
      provider_active_per_request: 300_000,
      recursive_child_provider_active: 120_000,
      child_response: RC7_GATE_C_CHILD_RESPONSE_TIMEOUT_MS,
      rlm_wall: RC7_GATE_C_RLM_WALL_TIMEOUT_MS,
      docker_command: RC7_GATE_C_DOCKER_COMMAND_TIMEOUT_MS,
      attempt_execution: RC7_GATE_C_ATTEMPT_EXECUTION_TIMEOUT_MS,
      retained_failure_wall: RC7_GATE_C_RETAINED_FAILURE_WALL_CEILING_MS,
    },
    treatment_proof_timeouts_ms: {
      attempt_execution: RC7_GATE_C_TREATMENT_PROOF_ATTEMPT_EXECUTION_TIMEOUT_MS,
      retained_failure_wall: RC7_GATE_C_TREATMENT_PROOF_RETAINED_FAILURE_WALL_CEILING_MS,
    },
  };
}

export const __test = Object.freeze({
  closedFailureAccounting,
  rc7GateCClosedFailureCode,
  runTreatmentProofProviderDispatch,
  validateSuccessfulHostResult,
});
