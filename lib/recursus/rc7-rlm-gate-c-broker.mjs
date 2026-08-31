import { spawn } from "node:child_process";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import {
  RC7_GATE_C_OUTPUT_SCHEMA,
  parseRc7GateCStructuredOutput,
} from "./rc7-rlm-gate-c-output-grammar.mjs";
import {
  RC7_GATE_C_PERMISSION_POLICY_ID,
  buildRc7GateCPreregistrationPackage,
  validateRc7GateCPreregistrationPackage,
} from "./rc7-rlm-gate-c-preregistration.mjs";
import { buildRc7QualificationPackage } from "./rc7-rlm-qualification.mjs";
import { assertRc7GateCNoEvaluatorOnlyMarkers, buildRc7GateCScorerContract } from "./rc7-rlm-gate-c-scorer.mjs";
import {
  RC7_GATE_C_RLM_IMAGE_ID,
  RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
  RC7_GATE_C_RLM_LIMITS,
  buildRc7GateCRlmImageDefinition,
  inspectRc7GateCRlmLauncher,
  validateRc7GateCRlmDockerInspect,
} from "./rc7-rlm-gate-c-rlm-launcher.mjs";
import {
  RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES,
  RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS,
  RC7_GATE_C_PROVIDER_TIMEOUT_MS,
  RC7_GATE_C_RUNTIME_CLOSURE,
  buildRc7GateCSemanticRequest,
  buildRc7GateCWorkerConformancePackage,
  validateRc7GateCSealedWorkerRequest,
  validateRc7GateCSemanticRequest,
} from "./rc7-rlm-gate-c-worker.mjs";

export const RC7_GATE_C_BROKER_SCHEMA = "rc7-rlm-gate-c-broker-conformance-v2";
export const RC7_GATE_C_BROKER_ID = "rc7-gate-c-credential-opaque-sealed-request-broker-v2";
export const RC7_GATE_C_BROKER_PACKAGE_NAME = "gate-c-broker-conformance-package.json";
export const RC7_GATE_C_BROKER_TERMINAL = "BROKER_CONFORMANT_PROVIDER_UNREACHABLE";
export const RC7_GATE_C_ACTIVATION_SCHEMA = "rc7-gate-c-digest-bound-activation-v17";
export const RC7_GATE_C_FINAL_FREEZE_SCHEMA = "rc7-gate-c-final-approval-freeze-v16";
export const RC7_GATE_C_FINAL_FREEZE_PACKAGE_NAME = "gate-c-final-approval-freeze.json";
export const RC7_GATE_C_OPERATOR_APPROVAL_SCHEMA = "rc7-gate-c-durable-operator-approval-v17";
export const RC7_GATE_C_MATRIX_REPAIR_STATE = "successful-nonmatrix-rlm-treatment-proof-bound-v18-v19-partial-matrices-and-unactivated-v20-v21-v22-v23-v24-preparations-superseded-before-v25-matrix-activation";

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const MAX_PACKAGE_BYTES = 524_288;
const HASH = /^[0-9a-f]{64}$/u;
const ELIGIBLE_CASES = new Set(["LAB-01", "PAPER-01", "REPO-01"]);
const GENERIC_CASES = new Set(["FACT-01", "FACT-03", "SAFE-01"]);
const PROTECTED_SEGMENTS = new Set([
  ".aws", ".azure", ".codex", ".gnupg", ".ssh", "credential", "credentials", "data",
  "documents", "interview-prep", "keychain", "oauth", "output", "reports", "secret",
  "secrets", "token", "tokens", "writing-samples",
]);
const LEDGER_META = "ledger-meta.json";
const RESERVATIONS_DIR = "reservations";
const TERMINALS_DIR = "terminals";
const HANDOFFS_DIR = "handoffs";
const ACTIVE_DISPATCH = "active-dispatch.json";
const DISPATCH_LOCK = ".dispatch.lock";
const HOST_LAUNCH_LOCK = ".gate-c-host-launch.lock";
const MAX_HOST_LAUNCH_LOCK_BYTES = 16_384;
const OPERATOR_APPROVAL = "operator-approval.json";
const DOCKER_CONFIG_DIR = "docker-cli-config";
const OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM = "same-host durable approval is governance evidence, not cryptographic proof of human authorship or intent";
const GATE_B_ATTESTATION_SCHEMA = "rc7-gate-c-gate-b-live-attestation-v3";
const GATE_B_PERMISSION_ID = RC7_GATE_C_RLM_LAUNCHER_POLICY_ID;
const GATE_B_PROVIDER_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const GATE_B_REFRESH_ENDPOINT = "https://auth.openai.com/oauth/token";
export const RC7_GATE_C_DOCKER_EXECUTABLE = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
export const RC7_GATE_C_DOCKER_EXECUTABLE_SHA256 = "805149723eb721d3cbb944c441423c01a4f4fcd6968a81e57bc1781441762a85";
const GATE_B_DOCKER_EXECUTABLE = RC7_GATE_C_DOCKER_EXECUTABLE;
const GATE_B_DOCKER_EXECUTABLE_SHA256 = RC7_GATE_C_DOCKER_EXECUTABLE_SHA256;
const GATE_B_RUNTIME_IMAGE = RC7_GATE_C_RLM_IMAGE_ID;
const GATE_B_OUTER_SECCOMP_INSPECT_SHA256 = "c033632260baa80de07da43bd651ab9f36d9ea4c358a52561c4ae124c562cf9f";
const GATE_C_CONTAINER_LABEL_PREFIX = "rc7.gate-c.";
const GATE_C_CONTAINER_RESOURCE_LIMITS = Object.freeze({
  cpu_nanos: 1_000_000_000,
  file_size_bytes: 1_048_576,
  memory_bytes: 805_306_368,
  nofile: 128,
  output_bytes: RC7_GATE_C_RLM_LIMITS.output_bytes,
  output_inodes: RC7_GATE_C_RLM_LIMITS.output_inodes,
  pids: 64,
  state_bytes: RC7_GATE_C_RLM_LIMITS.state_bytes,
  state_inodes: RC7_GATE_C_RLM_LIMITS.state_inodes,
});

export class Rc7GateCBrokerError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCBrokerError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new Rc7GateCBrokerError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_BROKER_VALUE", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail("IDENTITY_SET_MISMATCH", `${label} keys mismatched`);
}

function projection(value, digestField) {
  const copy = structuredClone(value);
  delete copy[digestField];
  return copy;
}

function withDigest(value, digestField) {
  return { ...value, [digestField]: sha256V1(canonicalJsonV1(value)) };
}

function packageBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function normalizedPath(target) {
  return process.platform === "win32" ? path.resolve(target).toLowerCase() : path.resolve(target);
}

function nestedOrSame(candidate, parent) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertDisposableRoot(root, requireEmpty) {
  if (typeof root !== "string" || root.length === 0 || !path.isAbsolute(root)) fail("UNSAFE_OUTPUT_ROOT", "Broker root must be one explicit absolute path");
  const resolved = path.resolve(root);
  const parsedRoot = path.parse(resolved).root;
  if (normalizedPath(resolved) === normalizedPath(parsedRoot) || normalizedPath(resolved) === normalizedPath(tmpdir()) || normalizedPath(resolved) === normalizedPath(homedir())) fail("BROAD_OUTPUT_ROOT", "Broad filesystem, temp, and user roots are denied");
  const segments = resolved.split(/[\\/]+/u).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => PROTECTED_SEGMENTS.has(segment) || /(?:credential|secret|api[-_]?key|oauth|token)/iu.test(segment))) fail("PROTECTED_OUTPUT_ROOT", "Credential-like and user-layer roots are denied");
  if (nestedOrSame(resolved, REPOSITORY_ROOT) || nestedOrSame(REPOSITORY_ROOT, resolved)) fail("REPOSITORY_OUTPUT_ROOT", "Repository-containing or repository-contained roots are denied");
  let info;
  try { info = await lstat(resolved); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_OUTPUT_ROOT", "Caller must create the disposable broker root");
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("ALIASED_OUTPUT_ROOT", "Broker root must be one native directory");
  if (normalizedPath(await realpath(resolved)) !== normalizedPath(resolved)) fail("ALIASED_OUTPUT_ROOT", "Aliased broker roots are denied");
  if (requireEmpty && (await readdir(resolved)).length !== 0) fail("NONEMPTY_OUTPUT_ROOT", "Broker preparation requires an empty root");
  return resolved;
}

async function assertPhysicalDirectory(target, parent, label) {
  let info;
  try { info = await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_LEDGER_PATH", `${label} is missing`);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("ALIASED_LEDGER_PATH", `${label} must be one physical directory`);
  const physical = await realpath(target);
  if (normalizedPath(physical) !== normalizedPath(target)
    || (parent && normalizedPath(path.dirname(physical)) !== normalizedPath(parent))) fail("ALIASED_LEDGER_PATH", `${label} was replaced, aliased, or moved outside its ledger root`);
  return physical;
}

async function assertPhysicalFile(target, parent, label) {
  let info;
  try { info = await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_LEDGER_PATH", `${label} is missing`);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("ALIASED_LEDGER_PATH", `${label} must be one physical file`);
  const physical = await realpath(target);
  if (normalizedPath(physical) !== normalizedPath(target)
    || normalizedPath(path.dirname(physical)) !== normalizedPath(parent)) fail("ALIASED_LEDGER_PATH", `${label} was replaced, aliased, or moved outside its ledger root`);
  return physical;
}

async function readPinnedNativeExecutable() {
  let before;
  try { before = await lstat(GATE_B_DOCKER_EXECUTABLE, { bigint: true }); } catch (error) {
    if (error?.code === "ENOENT") fail("GATE_B_DOCKER_IDENTITY_MISMATCH", "The exact frozen Docker client is missing");
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > 67_108_864n
    || normalizedPath(await realpath(GATE_B_DOCKER_EXECUTABLE)) !== normalizedPath(GATE_B_DOCKER_EXECUTABLE)) fail("GATE_B_DOCKER_IDENTITY_MISMATCH", "The frozen Docker client is aliased, linked, or oversized");
  const handle = await open(GATE_B_DOCKER_EXECUTABLE, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) fail("GATE_B_DOCKER_IDENTITY_MISMATCH", "The frozen Docker client changed before open");
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const final = await lstat(GATE_B_DOCKER_EXECUTABLE, { bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || final.dev !== opened.dev || final.ino !== opened.ino || final.size !== opened.size
      || bytes.byteLength !== Number(opened.size) || sha256V1(bytes) !== GATE_B_DOCKER_EXECUTABLE_SHA256) fail("GATE_B_DOCKER_IDENTITY_MISMATCH", "The frozen Docker client was replaced or its digest mismatched");
  } finally {
    await handle.close();
  }
  return GATE_B_DOCKER_EXECUTABLE;
}

async function optionalPhysicalFile(target, parent, label) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return assertPhysicalFile(target, parent, label);
}

function scheduleRow(preregistration, runId) {
  if (typeof runId !== "string" || !HASH.test(runId)) fail("RUN_IDENTITY_MISMATCH", "Run identity is malformed");
  const matches = preregistration.ablation.schedule.filter((row) => row.run_id === runId);
  if (matches.length !== 1) fail("RUN_IDENTITY_MISMATCH", "Run identity is not registered exactly once");
  return matches[0];
}

function validateRequestShape(row, requestKind, childSequence) {
  if (requestKind === "top-level") {
    if (childSequence !== 0) fail("CHILD_SEQUENCE_MISMATCH", "Top-level requests use child sequence zero");
    return;
  }
  if (requestKind !== "recursive-child") fail("REQUEST_KIND_MISMATCH", "Request kind is not registered");
  if (row.selected_route !== "rc-rlm" || !ELIGIBLE_CASES.has(row.case_id) || GENERIC_CASES.has(row.case_id)) fail("CHILD_AUTHORITY_DENIED", "Only eligible RLM treatment attempts may reserve child requests");
  if (!Number.isSafeInteger(childSequence) || childSequence < 1 || childSequence > 4) fail("CHILD_BUDGET_EXCEEDED", "Child sequence exceeds the per-attempt ceiling");
}

function renderTemplate(template, replacements) {
  let value = template;
  for (const [token, replacement] of Object.entries(replacements)) {
    const matches = value.split(token).length - 1;
    if (matches !== 1) fail("PROMPT_TEMPLATE_MISMATCH", `Prompt token ${token} must occur exactly once`);
    value = value.replace(token, replacement);
  }
  if (/\{\{[A-Z0-9_]+\}\}/u.test(value)) fail("PROMPT_TEMPLATE_MISMATCH", "Prompt template contains an unresolved token");
  return value;
}

async function verifiedFile(identity) {
  const bytes = await readFile(path.join(REPOSITORY_ROOT, identity.path));
  if (bytes.byteLength !== identity.byte_count || sha256V1(bytes) !== identity.sha256) fail("SOURCE_IDENTITY_MISMATCH", `Frozen source ${identity.path} mismatched`);
  return bytes;
}

async function visiblePayload(caseRecord) {
  const pack = caseRecord.route_visible_source_pack;
  if (pack.path) {
    const value = JSON.parse((await verifiedFile(pack)).toString("utf8"));
    return { value, serialized: canonicalJsonV1(value), source_pack_id: pack.id, source_pack_sha256: pack.sha256 };
  }
  const sources = [];
  for (const identity of pack.files) {
    const bytes = await verifiedFile(identity);
    sources.push({
      source_id: identity.source_id,
      path: identity.path,
      capture_date: identity.capture_date,
      trust_class: identity.trust_class,
      locator_scheme: identity.locator_scheme,
      text: bytes.toString("utf8"),
    });
  }
  const value = { schema_version: "rc7-gate-c-generic-visible-source-pack-v1", case_id: caseRecord.case_id, sources };
  return { value, serialized: canonicalJsonV1(value), source_pack_id: pack.id, source_pack_sha256: pack.sha256 };
}

function lineExcerpt(source, locator) {
  const lines = source.text.replace(/\n$/u, "").split("\n");
  if (!Number.isSafeInteger(locator.start_line) || !Number.isSafeInteger(locator.end_line) || locator.start_line < 1 || locator.end_line < locator.start_line || locator.end_line > lines.length) fail("SOURCE_LOCATOR_MISMATCH", "Line locator is out of bounds");
  const text = lines.slice(locator.start_line - 1, locator.end_line).join("\n");
  if (locator.start_line !== locator.end_line || sha256V1(text) !== locator.excerpt_sha256) fail("SOURCE_LOCATOR_MISMATCH", "Only one exact registered line may be selected per child request");
  return { locator, text };
}

function excerptFor(payload, locator) {
  if (!locator || typeof locator !== "object" || Array.isArray(locator)) fail("SOURCE_LOCATOR_MISMATCH", "Child excerpt locator is malformed");
  if (locator.kind === "json_pointer") {
    exactKeys(locator, ["kind", "pointer", "source_id"], "child JSON locator");
    const match = /^\/sources\/([0-9]+)\/records\/([0-9]+)$/u.exec(locator.pointer);
    if (!match) fail("SOURCE_LOCATOR_MISMATCH", "Child JSON locator is malformed");
    const source = payload.value.sources[Number(match[1])];
    const record = source?.records?.[Number(match[2])];
    if (!source || record === undefined || source.source_id !== locator.source_id) fail("SOURCE_LOCATOR_MISMATCH", "Child JSON locator is not registered");
    return { locator, record };
  }
  if (locator.kind === "line_range_sha256") {
    exactKeys(locator, ["end_line", "excerpt_sha256", "kind", "source_id", "start_line"], "child line locator");
    const matches = payload.value.sources.filter((source) => source.source_id === locator.source_id);
    if (matches.length !== 1 || !HASH.test(locator.excerpt_sha256 ?? "")) fail("SOURCE_LOCATOR_MISMATCH", "Child line source is not registered");
    return lineExcerpt(matches[0], locator);
  }
  fail("SOURCE_LOCATOR_MISMATCH", "Child excerpt locator kind is denied");
}

function exampleLocator(payload, registeredLocator = null) {
  if (registeredLocator !== null) return structuredClone(registeredLocator);
  const source = payload.value?.sources?.[0];
  if (!source || typeof source.source_id !== "string") fail("SOURCE_LOCATOR_MISMATCH", "Output example requires one registered source");
  if (Array.isArray(source.records) && source.records.length > 0) {
    return { kind: "json_pointer", pointer: "/sources/0/records/0", source_id: source.source_id };
  }
  if (typeof source.text === "string") {
    const firstLine = source.text.replace(/\n$/u, "").split("\n")[0];
    if (firstLine.length === 0) fail("SOURCE_LOCATOR_MISMATCH", "Output example source line is empty");
    return { end_line: 1, excerpt_sha256: sha256V1(firstLine), kind: "line_range_sha256", source_id: source.source_id, start_line: 1 };
  }
  fail("SOURCE_LOCATOR_MISMATCH", "Output example source has no supported locator form");
}

function canonicalOutputExample(caseId, payload, registeredLocator = null) {
  const value = {
    case_id: caseId,
    completion: "incomplete",
    evidence_items: [{
      calculation: null,
      classification: "source_stated",
      disposition: "asserted",
      item_type: "source_statement",
      local_id: "I001",
      locators: [exampleLocator(payload, registeredLocator)],
      scalar: null,
    }],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
    schema_version: RC7_GATE_C_OUTPUT_SCHEMA,
  };
  const serialized = canonicalJsonV1(value);
  parseRc7GateCStructuredOutput(Buffer.from(serialized, "utf8"), caseId);
  return serialized.replace(/\n$/u, "");
}

function validateChildQuestion(value) {
  if (typeof value !== "string" || value.length < 1 || Buffer.byteLength(value, "utf8") > 2_048 || /(?:https?:\/\/|ftp:\/\/|file:\/\/|leak[_ -]?canary|expected[_ -]?(?:item|relationship)|(?:LAB|PAPER|REPO)-R[0-9]{2})/iu.test(value)) fail("CHILD_QUESTION_DENIED", "Child question is malformed, oversized, external, or evaluator-shaped");
  return value;
}

async function constructSemanticRequest(preregistration, row, input) {
  const qualification = await buildRc7QualificationPackage();
  const caseRecord = qualification.cases.find((item) => item.case_id === row.case_id);
  if (!caseRecord) fail("CASE_IDENTITY_MISMATCH", "Registered case is missing");
  const payload = await visiblePayload(caseRecord);
  if (payload.source_pack_id !== row.route_visible_source_pack_id || payload.source_pack_sha256 !== row.route_visible_source_pack_sha256) fail("SOURCE_IDENTITY_MISMATCH", "Schedule and source pack identity differ");
  const outputContract = preregistration.exact_comparison_identity.output_contract.text;
  let systemText;
  let userText;
  if (input.request_kind === "top-level") {
    if (input.child_question !== null || input.excerpt_locator !== null) fail("REQUEST_KIND_MISMATCH", "Top-level request cannot carry child input");
    systemText = preregistration.exact_comparison_identity.prompts.shared_system.text;
    userText = renderTemplate(preregistration.exact_comparison_identity.prompts.top_level_user_template.text, {
      "{{CASE_ID}}": row.case_id,
      "{{CANONICAL_ROUTE_OUTPUT_CONTRACT}}": outputContract,
      "{{CANONICAL_OUTPUT_EXAMPLE}}": canonicalOutputExample(row.case_id, payload),
      "{{CANONICAL_VISIBLE_SOURCE_PACK}}": payload.serialized,
    });
  } else {
    const question = validateChildQuestion(input.child_question);
    await assertRc7GateCNoEvaluatorOnlyMarkers({ case_id: row.case_id, bytes: question });
    const excerpt = excerptFor(payload, input.excerpt_locator);
    systemText = preregistration.exact_comparison_identity.prompts.recursive_child_system.text;
    userText = renderTemplate(preregistration.exact_comparison_identity.prompts.recursive_child_user_template.text, {
      "{{PARENT_RUN_ID}}": row.run_id,
      "{{CASE_ID}}": row.case_id,
      "{{CHILD_SEQUENCE_1_TO_4}}": String(input.child_sequence),
      "{{PARENT_REGISTERED_QUESTION}}": question,
      "{{CANONICAL_ROUTE_OUTPUT_CONTRACT}}": outputContract,
      "{{CANONICAL_OUTPUT_EXAMPLE}}": canonicalOutputExample(row.case_id, payload, excerpt.locator),
      "{{CANONICAL_REGISTERED_EXCERPT}}": canonicalJsonV1(excerpt),
    });
  }
  const sessionId = sha256V1(`rc7-gate-c-session-v1\u0000${row.run_id}\u0000${input.request_kind}\u0000${input.child_sequence}`).slice(0, 32);
  const semanticValue = buildRc7GateCSemanticRequest({
    system_text: systemText,
    user_text: userText,
    session_id: sessionId,
    timeout_ms: input.request_kind === "recursive-child"
      ? RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS : RC7_GATE_C_PROVIDER_TIMEOUT_MS,
  });
  return { semantic: validateRc7GateCSemanticRequest(semanticValue), payload };
}

export async function buildRc7GateCRequestIntent(input) {
  exactKeys(input, ["child_question", "child_sequence", "excerpt_locator", "request_kind", "run_id"], "request intent input");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  validateRc7GateCPreregistrationPackage(preregistration);
  const row = scheduleRow(preregistration, input.run_id);
  validateRequestShape(row, input.request_kind, input.child_sequence);
  const constructed = await constructSemanticRequest(preregistration, row, input);
  const intent = withDigest({
    schema_version: "rc7-gate-c-request-intent-v2",
    broker_identity: RC7_GATE_C_BROKER_ID,
    permission_policy_identity: RC7_GATE_C_PERMISSION_POLICY_ID,
    preregistration_sha256: preregistration.preregistration_sha256,
    run_id: row.run_id,
    case_id: row.case_id,
    arm: row.arm,
    selected_route: row.selected_route,
    repeat_index: row.repeat_index,
    route_visible_source_pack_id: row.route_visible_source_pack_id,
    route_visible_source_pack_sha256: row.route_visible_source_pack_sha256,
    evaluator_contract_id: row.evaluator_contract_id,
    evaluator_contract_sha256: row.evaluator_contract_sha256,
    request_kind: input.request_kind,
    child_sequence: input.child_sequence,
    semantic_request_sha256: constructed.semantic.sha256,
    semantic_request_byte_count: constructed.semantic.byte_count,
    provider: "openai-codex",
    adapter: "deepseek-openai-codex",
    adapter_revision: RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision,
    model: "gpt-5.6-sol",
    configured_snapshot: "gpt-5.6-sol",
    reasoning: "xhigh",
    max_output_plus_reasoning_tokens: RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
    provider_active_timeout_seconds: (input.request_kind === "recursive-child"
      ? RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS : RC7_GATE_C_PROVIDER_TIMEOUT_MS) / 1000,
    automatic_retries: 0,
    reservation_consumed_before_provider_reachability: true,
    activation_state: "denied-awaiting-exact-digest-bound-activation",
  }, "intent_sha256");
  return { intent, semantic_request: constructed.semantic.value, semantic_request_bytes: constructed.semantic.bytes };
}

export function validateRc7GateCRequestIntent(intent) {
  exactKeys(intent, [
    "schema_version", "broker_identity", "permission_policy_identity", "preregistration_sha256", "run_id", "case_id",
    "arm", "selected_route", "repeat_index", "route_visible_source_pack_id", "route_visible_source_pack_sha256",
    "evaluator_contract_id", "evaluator_contract_sha256", "request_kind", "child_sequence", "semantic_request_sha256",
    "semantic_request_byte_count", "provider", "adapter", "adapter_revision", "model", "configured_snapshot", "reasoning",
    "max_output_plus_reasoning_tokens", "provider_active_timeout_seconds", "automatic_retries",
    "reservation_consumed_before_provider_reachability", "activation_state", "intent_sha256",
  ], "request intent");
  if (intent.schema_version !== "rc7-gate-c-request-intent-v2" || intent.broker_identity !== RC7_GATE_C_BROKER_ID
    || intent.permission_policy_identity !== RC7_GATE_C_PERMISSION_POLICY_ID || !HASH.test(intent.preregistration_sha256 ?? "")
    || !HASH.test(intent.run_id ?? "") || !HASH.test(intent.semantic_request_sha256 ?? "") || intent.provider !== "openai-codex"
    || intent.adapter !== "deepseek-openai-codex" || intent.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision
    || intent.model !== "gpt-5.6-sol" || intent.configured_snapshot !== "gpt-5.6-sol" || intent.reasoning !== "xhigh"
    || intent.max_output_plus_reasoning_tokens !== RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS
    || intent.provider_active_timeout_seconds !== (intent.request_kind === "recursive-child"
      ? RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS : RC7_GATE_C_PROVIDER_TIMEOUT_MS) / 1000
    || intent.automatic_retries !== 0
    || intent.reservation_consumed_before_provider_reachability !== true
    || intent.activation_state !== "denied-awaiting-exact-digest-bound-activation"
    || !Number.isSafeInteger(intent.semantic_request_byte_count) || intent.semantic_request_byte_count < 1
    || intent.semantic_request_byte_count > RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES
    || intent.intent_sha256 !== sha256V1(canonicalJsonV1(projection(intent, "intent_sha256")))) fail("INTENT_IDENTITY_MISMATCH", "Request intent identity or authority mismatched");
  const registeredRunId = sha256V1(canonicalJsonV1({
    benchmark_schema: "1.0",
    benchmark_id: "RC7-GATE-C-PAIRED-ABLATION-01",
    case_id: intent.case_id,
    arm: intent.arm,
    repeat_index: intent.repeat_index,
    selected_route: intent.selected_route,
    route_visible_source_pack_id: intent.route_visible_source_pack_id,
    route_visible_source_pack_sha256: intent.route_visible_source_pack_sha256,
    evaluator_contract_id: intent.evaluator_contract_id,
    evaluator_contract_sha256: intent.evaluator_contract_sha256,
  }));
  if (intent.run_id !== registeredRunId || !HASH.test(intent.route_visible_source_pack_sha256 ?? "")
    || !HASH.test(intent.evaluator_contract_sha256 ?? "") || typeof intent.route_visible_source_pack_id !== "string"
    || typeof intent.evaluator_contract_id !== "string" || !["rc-direct", "rc-rlm"].includes(intent.arm)
    || !Number.isSafeInteger(intent.repeat_index) || intent.repeat_index < 1 || intent.repeat_index > 3
    || (GENERIC_CASES.has(intent.case_id) && intent.selected_route !== "rc-direct")
    || (ELIGIBLE_CASES.has(intent.case_id) && intent.selected_route !== (intent.arm === "rc-rlm" ? "rc-rlm" : "rc-direct"))) fail("RUN_IDENTITY_MISMATCH", "Intent run manifest does not derive its registered run identity");
  validateRequestShape(intent, intent.request_kind, intent.child_sequence);
  return intent;
}

function gateBLiveContainmentContract() {
  return {
    schema_version: "rc7-gate-c-broker-owned-docker-inspection-v1",
    docker_executable: GATE_B_DOCKER_EXECUTABLE,
    docker_executable_sha256: GATE_B_DOCKER_EXECUTABLE_SHA256,
    docker_command: ["inspect", "--type", "container", "<exact-64-hex-container-id>"],
    docker_config: "broker-owned-empty-physical-directory",
    runtime_image_identity: GATE_B_RUNTIME_IMAGE,
    outer_seccomp_inspect_sha256: GATE_B_OUTER_SECCOMP_INSPECT_SHA256,
    direct_route: "exact-not-applicable-direct-route-attestation-and-null-container",
    rlm_route: "broker-inspects-one-running-container-and-derives-boundary-evidence",
    label_names: [
      "rc7.policy", "rc7.lease", "rc7.mode", "rc7.gate-c.activation-sha256", "rc7.gate-c.run-identity",
      "rc7.gate-c.case-id", "rc7.gate-c.intent-sha256", "rc7.gate-c.dispatch-sha256",
      "rc7.gate-c.semantic-request-sha256", "rc7.gate-c.image-definition-sha256",
      "rc7.gate-c.permission-identity", "rc7.gate-c.direct-provider-access",
    ],
    resources: GATE_C_CONTAINER_RESOURCE_LIMITS,
    mount_contract: "one physical external launcher root containing exact read-only /rc7/source and /rc7/launcher binds, one exact read-write /rc7/exchange bind, and bounded /rc7/state and /rc7/output tmpfs mounts",
    process_contract: "running-nonroot-readonly-drop-all-no-new-privileges-runc-one-shot",
    network_contract: "docker-network-none-no-ports-no-direct-container-provider-access",
    phase_two_nonclaim: "Docker inspection proves the frozen outer seccomp profile only; it does not prove in-process phase-two TSYNC activation",
  };
}

async function repositoryFileIdentity(relativePath, id) {
  const bytes = await readFile(path.join(REPOSITORY_ROOT, ...relativePath.split("/")));
  return { id, path: relativePath, byte_count: bytes.byteLength, sha256: sha256V1(bytes) };
}

async function buildGateCExecutionClosure(worker, preregistration) {
  const [hostModule, hostScript, rlmModule, rlmScript, executorModule, executorScript, resultsModule, resultsScript, approvalScript, proofPrerequisiteModule, imageDefinition] = await Promise.all([
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-host-launcher.mjs", "rc7-gate-c-host-launcher-module-v1"),
    repositoryFileIdentity("scripts/recursus/rc7-rlm-gate-c-host-launcher.mjs", "rc7-gate-c-host-launcher-script-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-rlm-launcher.mjs", "rc7-gate-c-rlm-launcher-module-v1"),
    repositoryFileIdentity("scripts/recursus/rc7-rlm-gate-c-rlm-launcher.mjs", "rc7-gate-c-rlm-launcher-script-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-executor.mjs", "rc7-gate-c-closed-executor-module-v1"),
    repositoryFileIdentity("scripts/recursus/rc7-rlm-gate-c-executor.mjs", "rc7-gate-c-closed-executor-script-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-results.mjs", "rc7-gate-c-sealed-results-module-v1"),
    repositoryFileIdentity("scripts/recursus/rc7-rlm-gate-c-results.mjs", "rc7-gate-c-sealed-results-script-v1"),
    repositoryFileIdentity("scripts/recursus/rc7-rlm-gate-c-operator-approval.mjs", "rc7-gate-c-exact-operator-approval-script-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-proof-prerequisite.mjs", "rc7-gate-c-successful-proof-prerequisite-module-v1"),
    buildRc7GateCRlmImageDefinition(),
  ]);
  const value = {
    schema_version: "rc7-gate-c-execution-closure-v1",
    host_launcher: {
      module: hostModule,
      script: hostScript,
      node_runtime: {
        version: "24.19.0",
        byte_count: 92_825_416,
        sha256: "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
        enforcement: "process.execPath must be one physical unaliased file matching all three fields before child spawn",
      },
      transport: { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" },
      bootstrap: "embedded in and digest-bound by the host launcher module; one-shot staged capsule import after broker preflight",
      governance_nonclaim: "same-host stage, pipe, process, and acknowledgment checks are governance evidence, not cryptographic proof against a hostile host administrator",
    },
    provider_worker: {
      module_sha256: worker.module.sha256,
      live_capsule_sha256: worker.live_capsule.sha256,
      stage_manifest_sha256: worker.worker_stage.stage_manifest_sha256,
      runtime_closure_sha256: sha256V1(canonicalJsonV1(worker.runtime_closure)),
      adapter_revision: worker.runtime_closure.adapter.revision,
      exact_wire_rule: "validate the pinned adapter native Codex request body, reject the unsupported max_output_tokens extension, canonicalize, recompress deterministically when required, and reject any other body or content-length; post-response acceptance and hard accounting both use the configured 128000-token catalog maximum",
      credential_rule: "credentials remain opaque to the host broker and are imported only by the committed one-shot capsule after preflight",
    },
    attempt_executor: {
      identity: "rc7-gate-c-closed-ablation-executor-v1",
      module: executorModule,
      script: executorScript,
      production_entrypoint: "the script binds the exact broker, one-shot host capsule, Docker controller, fixed RLM program, four-child treatment broker, executor-owned abort, no-replay recovery, and sealed result publication; callers cannot provide production callbacks or Python",
    },
    results_pipeline: {
      identity: "rc7-gate-c-sealed-36-attempt-results-v11",
      module: resultsModule,
      script: resultsScript,
      retained_contract: "one immutable start and one immutable success-or-zero-score terminal per registered run; RLM score bytes must equal the independently re-read retained launcher artifact; aggregate only after all 36; final package re-proves the root-bound ledger accounting and attempt matrix bijection",
    },
    operator_approval_entrypoint: {
      script: approvalScript,
      exact_text_required: true,
      authority_effect: "records only the exact current digest-bound user approval into one physical root-bound ledger instance; the broker separately validates that same root before any permit",
      governance_nonclaim: OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM,
    },
    successful_treatment_proof_prerequisite: {
      module: proofPrerequisiteModule,
      required_state: "successful-nonmatrix-treatment-proof-revalidated",
      revalidation_rule: "the exact physical proof ledger, result, RLM artifact, five trusted terminals, actual accounting, phase-two TSYNC, pinned image, combined artifact, and zero residue are revalidated before freeze, approval, initialization, inspection, and dispatch",
      authority_effect: "prerequisite-only; the proof cannot become a matrix member, score, replay, replacement, or authority reset",
    },
    rlm_launcher: {
      module: rlmModule,
      script: rlmScript,
      policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
      image_definition_sha256: imageDefinition.image_definition_sha256,
      image_id: imageDefinition.final_image_id,
      image_state: imageDefinition.final_image_state,
      dockerfile: imageDefinition.files.dockerfile,
      container_worker: imageDefinition.files.worker,
      component_commit: imageDefinition.component_commit,
      bases: imageDefinition.bases,
      locks: imageDefinition.locks,
      mounts: ["read-only:/rc7/source", "read-only:/rc7/launcher", "read-write:/rc7/exchange", "tmpfs:/rc7/state", "tmpfs:/rc7/output"],
      network: "none",
      child_request_ceiling: RC7_GATE_C_RLM_LIMITS.child_requests,
      recursive_depth_ceiling: RC7_GATE_C_RLM_LIMITS.depth,
    },
    operational_timeouts_ms: {
      host_ack: 30_000,
      host_process: 345_000,
      provider_active_per_request: 300_000,
      recursive_child_provider_active: 120_000,
      child_response: 120_000,
      rlm_wall: 300_000,
      docker_command: 30_000,
      attempt_execution: 700_000,
      retained_failure_wall: 800_000,
    },
    pricing_snapshot: structuredClone(preregistration.pricing),
  };
  return { ...value, execution_closure_sha256: sha256V1(canonicalJsonV1(value)) };
}

function activationExpectedKeys() {
  return [
    "schema_version", "state", "preregistration_sha256", "broker_package_sha256", "broker_module_sha256",
    "worker_package_sha256", "worker_module_sha256", "live_capsule_sha256", "scorer_contract_sha256",
    "worker_stage_manifest_sha256", "scorer_module_sha256", "scorer_overlay_sha256", "runtime_lock_sha256", "schedule_sha256", "prompt_bundle_sha256",
    "source_bundle_sha256", "evaluator_bundle_sha256", "permission_policy_identity", "budget_identity",
    "approval_text_sha256", "approved_provider_request_ceiling", "approved_top_level_request_ceiling",
    "approved_recursive_child_request_ceiling", "approved_eligible_treatment_attempts", "approved_child_requests_per_eligible_treatment",
    "approved_generation_https_post_ceiling", "approved_oauth_refresh_https_post_ceiling", "approved_total_https_post_ceiling",
    "approved_input_utf8_bytes_per_request", "approved_input_tokens_per_request", "approved_input_token_ceiling",
    "approved_output_plus_reasoning_acceptance_tokens_per_request", "approved_output_plus_reasoning_acceptance_token_ceiling",
    "approved_output_plus_reasoning_tokens_per_request", "approved_output_plus_reasoning_token_ceiling",
    "approved_provider_active_timeout_seconds_per_request", "approved_maximum_sequential_provider_active_seconds",
    "approved_global_concurrency", "approved_automatic_retries", "approved_credit_ceiling", "approved_provider_equivalent_usd_ceiling",
    "additional_credit_purchase_authority", "incremental_cash_purchase_authority_usd", "ledger_root_identity", "results_root_identity", "successful_treatment_proof", "supersession_lineage", "gate_b_live_containment_contract", "execution_closure", "activation_sha256",
  ];
}

function gateCRepairSupersessionLineage() {
  const conservativeAccounting = withDigest({
    generation_https_posts: 1,
    oauth_refresh_https_posts: 1,
    total_https_posts: 2,
    input_tokens: 32_768,
    output_plus_reasoning_tokens: 8_192,
    provider_active_seconds: 120,
    actual_provider_post_count: null,
    actual_credential_access_count: null,
    accounting_basis: "conservative-upper-bound-after-indeterminate-handoff",
  }, "accounting_sha256");
  return withDigest({
    schema_version: "rc7-gate-c-supersession-lineage-v12",
    state: "historical-attempts-successful-proof-v18-v19-partial-matrices-and-unactivated-v20-v21-v22-v23-v24-preparations-preserved-excluded-before-fresh-v25-primary-matrix",
    superseded_activations: [
      {
        ordinal: 1,
        failure: {
          code: "STAGED_WORKER_SELF_OVERLAP_PRE_ACK",
          retained_failure_code: "HOST_ACK_TIMEOUT",
          summary: "the staged worker derived its repository root from the stage, rejected its required parent runtime before acknowledgment, and made provider execution unreachable",
        },
        activation: {
          closure_sha256: "771d3c226e2a9298e16efc21f46ea7f7cc0287f652ae02a0fcddbab5e7a6b9ef",
          final_freeze_sha256: "ec74e3fee394c490edc602528f63392196a3c342ae93a689b9c0f0b27b1c62ee",
          activation_sha256: "8ac19650d78b7be57e77b454e396d26344e1af7080b155457e077fca4d5f4633",
          approval_text_sha256: "473ed6bdbc7f68a6cd6348e9e946047cdf252725cf152b61893fea40040ea507",
          operator_approval_record_sha256: "d0892ed2fda4559718d969d2f5c1d9194c74de6723abfe800fd0bfdf3e3376be",
          ledger_instance_sha256: "8a8c8142267f81d15fcd806e7de76a1eb20d768f7e8112cff706cde1630d4757",
          ledger_root_identity: {
            schema_version: "rc7-gate-c-ledger-root-identity-v2",
            normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-ledger-final-v1",
            device_id: "3329890834",
            file_id: "5910974513371194",
            birthtime_ns: "1787900377282667900",
            ledger_root_sha256: "11d591dd8a469003613f3151d8a0e29e2a9475672ccfd3c17240b50770e75aab",
          },
          results_root_identity: {
            schema_version: "rc7-gate-c-results-root-identity-v1",
            normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-results-final-v1",
            device_id: "3329890834",
            file_id: "7036874420213819",
            birthtime_ns: "1787900377282667900",
            results_root_sha256: "d2131afb2355a040bd64cccbca6698a406bfac00ebe1180780908edae5b44891",
          },
        },
        attempt: {
          run_id: "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff",
          case_id: "SAFE-01",
          arm: "rc-direct",
          selected_route: "rc-direct",
          dispatch_sha256: "89e6cb4f24297088e229bb0bf96f639ba816f730fbb15da5ac6242ed95599328",
          durable_handoff_sha256: "9fba3b7dc2d94bb4a9cf84c59e2a4a402d081b8b3fb2ad3aa980cc42f86a4861",
          terminal_sha256: "bfad66b1068dc56c344e7a5be731db95f569221390e78e12e02697cbfe7ab330",
          attempt_sha256: "b1150c600f88f1c6bc43dc8e8cea005c7e612256e25c87fed918e7a07ef63179",
          disposition: "immutable-indeterminate-no-replay-excluded-from-second-repaired-36-attempt-matrix",
        },
        conservative_accounting: structuredClone(conservativeAccounting),
      },
      {
        ordinal: 2,
        failure: {
          code: "PRODUCTION_RESULT_CANONICAL_FRAME_MISMATCH",
          retained_failure_code: "MALFORMED_HOST_HANDOFF",
          summary: "the capsule accepted the exact handoff and could execute after commit, but the production bootstrap emitted one LF while the frozen host result parser required the protocol's two-LF canonical frame",
        },
        activation: {
          closure_sha256: "3343b44ea259e53bca220b3b94c13f34740aeb298ef457e0789867eaa3c4d144",
          final_freeze_sha256: "11a62b1ad755b13493880da146f4e26a87f90cdd5ebcc66b13448b463e9b43b1",
          activation_sha256: "abd0c80b9a502b61506bc0bee8119b426dfdd7f773234963c6997e5ef825c48f",
          approval_text_sha256: "9f4a251e4dc151e00e542eb2b690388e53df7e0252114226f886e74eac630de3",
          operator_approval_record_sha256: "8c41f9ee12d1d5ada14720b08f0a5db77e90b04b7c01388aec910275397f7af5",
          ledger_instance_sha256: "38eac29972d79419ab55bd45d2c9615a356c9800869231fdd3ea062f4c5d1c6a",
          ledger_root_identity: {
            schema_version: "rc7-gate-c-ledger-root-identity-v2",
            normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-ledger-repaired-v2",
            device_id: "3329890834",
            file_id: "8444249303767191",
            birthtime_ns: "1787903364583352800",
            ledger_root_sha256: "41e3916c7c6f1d7bbf930235824e4f12bec140e0c810fff4217b780785b57380",
          },
          results_root_identity: {
            schema_version: "rc7-gate-c-results-root-identity-v1",
            normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-results-repaired-v2",
            device_id: "3329890834",
            file_id: "7036874420213914",
            birthtime_ns: "1787903364586420700",
            results_root_sha256: "6e1725e3b189cc7c23216b0fa3ff87aaa28692be061219590a9f766b5b620aa3",
          },
        },
        attempt: {
          run_id: "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff",
          case_id: "SAFE-01",
          arm: "rc-direct",
          selected_route: "rc-direct",
          dispatch_sha256: "7a01d19ce5925ab7df3608b7e8cdc26b360c2c6877e2a448177ae447daad7919",
          durable_handoff_sha256: "c720b7b5358f1bd716f57a8cc87945b978702f0cd86bb7b8ff29ea4fe7d82570",
          terminal_sha256: "43efef205bd1de911aab72921531ed68201ffad0ee052708921b338b4462cabb",
          attempt_sha256: "26f0a4e0691b79e114287de917b29e33d17dca2798c8843861f3367441fbdeb5",
          disposition: "immutable-indeterminate-no-replay-excluded-from-second-repaired-36-attempt-matrix",
        },
        conservative_accounting: structuredClone(conservativeAccounting),
      },
      {
        ordinal: 3,
        failure: {
          code: "PRODUCTION_CAPSULE_FAILURE_ENVELOPE_NOT_CLASSIFIED",
          retained_failure_code: "MALFORMED_EXECUTION",
          summary: "the capsule returned a closed no-replay failure envelope after the durable provider handoff, but the executor accepted only the success shape and discarded the capsule failure code before results publication",
        },
        activation: {
          closure_sha256: "1f7976e82265181186ededd28671e072812a28e92954029d98487640c482baf8",
          final_freeze_sha256: "49f546f4c96b974b66ac1374ed35afee59bc26b1b576936fe64b9da16c15098c",
          activation_sha256: "a6306d45519a71d9f3fe8eb28ffda2c9e0883932bb2b5a4a27ab22cf836c3de2",
          approval_text_sha256: "0d049b6d69777de9566635dac386f1f1c4757918c9f3e6c4ac696a376f707fe9",
          operator_approval_record_sha256: "6b8891e61386c5f1006ddaa6dc9ff3b47af68cee7c266cfde7d6134a21b986ce",
          ledger_instance_sha256: "fbce49f9e39903f9f575c3ea0333e9b13a121b15fd1fad46868595dc05b38d61",
          ledger_root_identity: {
            schema_version: "rc7-gate-c-ledger-root-identity-v2",
            normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-ledger-framing-v3",
            device_id: "3329890834",
            file_id: "7036874420213926",
            birthtime_ns: "1787904965802178700",
            ledger_root_sha256: "bfea14254b676bcd1806b9cae7766ef2204225274f356316cfcc40c706f54e95",
          },
          results_root_identity: {
            schema_version: "rc7-gate-c-results-root-identity-v1",
            normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-results-framing-v3",
            device_id: "3329890834",
            file_id: "7036874420213933",
            birthtime_ns: "1787904965806749200",
            results_root_sha256: "6efc394d10de488e79992906f1d9df17c7a68c793a857129d0d3f1299bb59f10",
          },
        },
        attempt: {
          run_id: "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff",
          case_id: "SAFE-01",
          arm: "rc-direct",
          selected_route: "rc-direct",
          dispatch_sha256: "78f0374cf4353e90cfa74e02e84cff12c9d223e991bf3ff875b172f9cd9fd746",
          durable_handoff_sha256: "0629feb433556bf082231864a1c5b02a2012e4c1f0bcbcbdb8de55c2e27e787b",
          terminal_sha256: "d0691de9d73d74d045f4ec5b2d2f95893b227c4ca7be7776b1c2edc13657f4f7",
          attempt_sha256: "3e0081198f3cdaaa6897d855ac0d32ab3602a67c8e0aaa5c63db01623f9e0c7a",
          disposition: "immutable-indeterminate-no-replay-excluded-from-third-repaired-36-attempt-matrix",
        },
        conservative_accounting: structuredClone(conservativeAccounting),
      },
    ],
    prior_smoke_attempts: [
      {
        ordinal: 1,
        policy_identity: "rc7-gate-c-safe01-direct-live-launch-smoke-v1",
        closure_sha256: "01a09676c22a13a410bb9e2f7e850ee31e5cb07d324becd7c49e4f0b6b1fac29",
        activation_sha256: "a1a877fd080620a7049e4f77cdba5ed2889903f05f228edf2372a6e4df7b4a01",
        run_id: "5daee97191ab9f3c38825f4290a7c2de2003fc35cc26b85a1b0f2b403af0fcbf",
        retained_failure_code: "PROVIDER_DISPATCH_COUNT_MISMATCH",
        result_sha256: "93db559bae1055a4f9b815814daf8827c0d78b99727773d8da4d227ba8d6c20f",
        ledger_root_sha256: "4daea1f6cfe8f4b4060f60e23a09b491ed090b67f5354a5bd8ab42377a59c322",
        results_root_sha256: "9a4ec983832b19da2790fd7050265c23ececdaf7a24916ce24eaedfdacea7fb2",
        disposition: "immutable-indeterminate-no-replay-excluded-from-final-primary-matrix",
        conservative_accounting: structuredClone(conservativeAccounting),
      },
      {
        ordinal: 2,
        policy_identity: "rc7-gate-c-safe01-direct-live-launch-smoke-v2",
        closure_sha256: "51fb58695edb90dcba0d14e576f2bf50681cb2d937d2769d6b60e4fa40bf3f64",
        activation_sha256: "c6eb89180de82ac7b66edaff393864596256053738b4d63e20be4c054a0df024",
        run_id: "9227e007106ce349d891ef4fecc1fb075cdb3b653075a554b7d2028d59867f3e",
        retained_failure_code: "UNTRUSTED_TERMINAL",
        result_sha256: "189e3ab3877dfb3f996e10261e630e0ed9bb5698464d8bcd9413d580b314ef33",
        ledger_root_sha256: "824d86396c21bc2dcc6c23285f56297fb3f0e8b29f6852c926d2fe2ecd3a1560",
        results_root_sha256: "d7505a80c5871c9116b774e37ce6685155eabae8838190d641c3f6da236fe548",
        disposition: "immutable-indeterminate-no-replay-excluded-from-final-primary-matrix",
        conservative_accounting: structuredClone(conservativeAccounting),
      },
      {
        ordinal: 3,
        policy_identity: "rc7-gate-c-safe01-direct-live-launch-smoke-v3",
        closure_sha256: "d23e4cf13a19f48b74ae53bfe3063acc3089952c43f02209915e25b12bc6e88f",
        activation_sha256: "22e11e3a00b6c172657568ea7a2acb96520a3b586d94a14124c44d3268a1c32b",
        run_id: "13d977b1848db852a120b3b3b87cfecd223da028bd7cf5f6a904e721f987bd7d",
        retained_failure_code: "SMOKE_SCHEMA_MISMATCH",
        result_sha256: "8d8ab37be5e1ba75b62f26837cbfdd3db75d8d987a21f3b79688695dea6db60a",
        ledger_root_sha256: "138eda8359c9f9c9614943811d73450317c84cccf1e0bbb9348c975d5a8eed31",
        results_root_sha256: "adaa7636eb0a6338327b351223bd2c64d4e2085ddbee22cf9f8e92c3b51cbe5b",
        disposition: "immutable-indeterminate-no-replay-excluded-from-final-primary-matrix",
        conservative_accounting: structuredClone(conservativeAccounting),
      },
      {
        ordinal: 4,
        policy_identity: "rc7-gate-c-safe01-direct-live-launch-smoke-v4",
        closure_sha256: "1edbe4f1d9c505518da2bdd2d69f5f7f57379e8118e42ec5b57d7264d37377a4",
        activation_sha256: "292645e46d8834c89314a92097d30fdedb1feb686dfea28640074d6d3fb2ce13",
        run_id: "2bb3f31c17651986d4971bd2f7e46005f4ba1f501d0e27bad07b21110afb41c6",
        retained_failure_code: "PROVIDER_TERMINAL_REJECTED",
        result_sha256: "736f1a08bb6ed8acdea805a5b49c9b431b7f5ab9142cbea4b3ae505257063ce6",
        ledger_root_sha256: "3b4e89132212bf3956dab84fc70293ca5d13fed58cacc7983c341b09f79499a0",
        results_root_sha256: "4877c1f07f0677d78cfa7de8067ed723f67531c9916711b11b4d8e9c3eecde06",
        disposition: "immutable-indeterminate-no-replay-excluded-from-final-primary-matrix",
        conservative_accounting: structuredClone(conservativeAccounting),
      },
      {
        ordinal: 5,
        policy_identity: "rc7-gate-c-safe01-direct-live-launch-smoke-v5",
        closure_sha256: "f94793d727075cb019b35f83d7381f1ff80643a51330d96a0583b1c6c51f7608",
        activation_sha256: "8849566f24bb9718265969aa8ca2b7e8b3369c37b71febcaf1c7adde3c314077",
        run_id: "c02cfcb43850796b65d56f3d51efc7a492b38814325fdcbd2f4e10a79fa0ee13",
        retained_failure_code: "PROVIDER_DISPATCH_COUNT_MISMATCH",
        result_sha256: "bb31c87275094eb132fd0758c67051d7fba399d3e889bdfecedb97bd10c2f42a",
        ledger_root_sha256: "1dc396e98b9a88938133f953c0d5bf66e0942e0e6a613d1663e25623168f2b59",
        results_root_sha256: "523e0cd3038acf7b2e7201634d0c34509b89e02166e11a59794544b2f9f1925a",
        disposition: "immutable-indeterminate-no-replay-excluded-from-final-primary-matrix",
        conservative_accounting: structuredClone(conservativeAccounting),
      },
    ],
    provider_path_diagnostic: {
      schema_version: "rc7-real-provider-path-diagnostic-lineage-v1",
      state: "passed-credential-transport-proof-excluded-from-matrix-score",
      route: "rc-direct",
      case_id: "SAFE-01",
      profile: "recursus",
      credential_reference: "OPENAI_CODEX_OAUTH",
      credential_source_class: "file",
      credential_value_retained: false,
      provider: "openai-codex",
      configured_model: "gpt-5.6-sol",
      reasoning_effort: "xhigh",
      installed_adapter_revision: "5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9",
      gate_c_adapter_revision: "2fc02090af1632b86ee1175a6720904dfd71081c",
      revision_compatibility: {
        installed_is_ancestor_of_gate_c: true,
        auth_tree_sha1: "efb56a90e28f5025272e0ae538dfd8eaffdbdce6",
        config_blob_sha1: "7b179144bb0fe8e43d4f9fc4c0f25d5e1f018564",
        constants_blob_sha1: "23e5b197d299f84cac11f79cd2b105fa2ac2bdca",
        errors_blob_sha1: "b47b71b65269cf1c5eb2417164493b0730f73aef",
        context_blob_sha1: "3640afd944cfa93f3060515c44ca7adb780d6093",
        stream_blob_sha1: "225f0b5e35e334aba2e6375074bcaf1c2f27eb98",
        descendant_only_production_change: "ordered-system-user-payload-hook-and-exports",
      },
      live_execution: {
        input_utf8_bytes: 73,
        output_plus_reasoning_token_ceiling: 256,
        provider_active_seconds_ceiling: 120,
        generation_https_posts: 1,
        oauth_refresh_https_posts: 0,
        total_https_posts: 1,
        retries: 0,
        rlm_executions: 0,
        docker_invocations: 0,
        terminal_kind: "stop",
        response_matched_closed_oracle: true,
      },
      retained_result: {
        schema_version: "rc7-real-provider-path-diagnostic-v1",
        byte_count: 728,
        sha256: "8e589a2b37e4772c5414e9fe1653b180c594af176d2a8abbbe772c13a984910e",
        response_text_retained: false,
        request_id_retained: false,
        reasoning_retained: false,
      },
      disclosed_accounting: withDigest({
        generation_https_posts: 1,
        oauth_refresh_https_posts: 0,
        total_https_posts: 1,
        input_tokens: 73,
        output_plus_reasoning_tokens: 256,
        provider_active_seconds: 120,
        planning_credits: 7.38,
        api_equivalent_planning_usd: 0.30,
        actual_provider_post_count: 1,
        actual_credential_access_count: null,
        accounting_basis: "sealed-observed-post-admission-and-bounded-execution-with-conservative-planning-cost",
      }, "accounting_sha256"),
      nonclaims: "not a matrix member, score, prompt-parity result, backend-snapshot proof, provider-native-tokenizer proof, or RLM result",
    },
    abandoned_partial_matrix_v18: {
      schema_version: "rc7-gate-c-abandoned-partial-matrix-lineage-v1",
      state: "immutable-seven-attempt-partial-matrix-superseded-after-shared-acceptance-ceiling-failure",
      closure_sha256: "1fa5678764f462bab8f1fc4aa61e237454950ebb1a38d60c5cc506e3faa8e93d",
      final_freeze_sha256: "e2b4a20000bd0efb2b3c33ec429dd607ffe576c3b6a3efbad1bce2429903b47e",
      activation_sha256: "735091b636f0a3668854d0d59bec50b660ca044df746023d81f8315eb4eab5ce",
      operator_approval_record_sha256: "d641bdf4979bc7ed7c5a7616fbcd90430833b4855fe403d3095d7acb2dad6c86",
      ledger_instance_sha256: "163d3495235112bc83890b8a3a9341896b35d2e7d925a237e72ecbbce2f868e7",
      results_meta_sha256: "d5109cb47731bf5023a25eff56d3aa30849c65fbdcd122fa589803745a8e2a56",
      ledger_root_identity: {
        schema_version: "rc7-gate-c-ledger-root-identity-v2",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-ledger-v18-dual-accounting-final",
        device_id: "3329890834",
        file_id: "34339947161386974",
        birthtime_ns: "1788076728337169800",
        ledger_root_sha256: "b416b6fdaedded400f95d90de45bd55c193be74a3a41701b02bc14648102eea0",
      },
      results_root_identity: {
        schema_version: "rc7-gate-c-results-root-identity-v1",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-results-v18-dual-accounting-final",
        device_id: "3329890834",
        file_id: "59672695065346019",
        birthtime_ns: "1788076728341904200",
        results_root_sha256: "989ac2d20d9f3544f83c84f4c2ddb1ff9ad0924f3dbbe648e43de5bb3a1d82b5",
      },
      retained_shape: {
        starts: 7,
        attempts: 7,
        trusted_sealed_attempts: 4,
        sealed_zero_score_failures: 3,
        child_requests: 0,
        rlm_executions: 0,
        docker_container_executions: 0,
        aggregate: null,
      },
      retained_tree_evidence: {
        schema_version: "rc7-gate-c-v18-physical-tree-evidence-v1",
        ledger: {
          entries: 27,
          directories: 4,
          files: 23,
          manifest_bytes: 3_447,
          tree_sha256: "d7bab1448423cd00d8195a2f47fe6769dcf978be57d829656462c27e11227eac",
        },
        results: {
          entries: 17,
          directories: 2,
          files: 15,
          manifest_bytes: 2_275,
          tree_sha256: "97a8c917fbaa44c71496298e62a7e1bbc119414cce75e9f0d1b0a986d58ec282",
        },
      },
      sealed_attempts: [
        { case_id: "SAFE-01", run_id: "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "a2ecb7cfc65af06abce81ac03056925aa2a58cd7699a72e16d7d97d29bd2d337" },
        { case_id: "FACT-01", run_id: "2e58f8649edd4f60396f1ce5667498f1a1255a78acdced8339d3ee3d0d3e02e0", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "f0b0d6e4c09dccc6a046255cbf70621d870aa287d9f121ad3c5ff59d01b1867c" },
        { case_id: "FACT-01", run_id: "daa64ce99f7d36927a5434f4607e910fcd0034439c86477408ee3fdffe985a23", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "3db0fe3466bd9380205b8b4cb17e1b4f88bd44256cc14de7b8adea6d918db630" },
        { case_id: "SAFE-01", run_id: "f13888f84d1f5e2fb70fc27e60e9ebb0ca5231e84e7a2d18009f99b676f43ca2", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "e9c02f3b87b0f36d2e7f22c5269955061c73998bc043f53d700fb26b4ef559c1" },
        { case_id: "PAPER-01", run_id: "7f3a5db9ba8bc39c068fa6689628089a71b5c04fbb5254d0e443f2e292a6ee9f", state: "sealed-zero-score-failure", failure_code: "USAGE_BUDGET_EXCEEDED", attempt_sha256: "2b46f668c3f7f48b514a94ca1e3b2bd3ed0612e256698304b24281841a8296a1" },
        { case_id: "FACT-03", run_id: "75551613884a99ae145a6d0ba71faad843576418135d43c6d3d858c2c31371d8", state: "sealed-zero-score-failure", failure_code: "USAGE_BUDGET_EXCEEDED", attempt_sha256: "41b42e6ae7524f0ba05a8c70d4bf16b185af8d65f061dcb1e99b576759e4e9cd" },
        { case_id: "LAB-01", run_id: "382b4ea0b261e55eb7322857a1c7b8651e071c7c2c6ac3f6fe961bfd2db782fb", state: "sealed-zero-score-failure", failure_code: "RECOVERY_GATE_FAILED", attempt_sha256: "6fd151c4f45eb70a6834a109b0a8e4caf24ccd615008581b664162c89213be86" },
      ],
      conservative_consumed_accounting: withDigest({
        generation_https_posts: 7,
        oauth_refresh_https_posts: 3,
        total_https_posts: 10,
        input_tokens: 107_794,
        accepted_output_plus_reasoning_tokens: 25_073,
        hard_output_plus_reasoning_tokens: 409_073,
        provider_active_milliseconds: 1_357_168,
        planning_credits: 215.32,
        api_equivalent_planning_usd: 8.62,
        accounting_basis: "four-exact-trusted-requests-plus-three-conservative-committed-handoffs",
      }, "accounting_sha256"),
      approved_authority_ceiling: {
        generation_https_posts: 72,
        oauth_refresh_https_posts: 72,
        total_https_posts: 144,
        input_tokens: 2_359_296,
        hard_output_plus_reasoning_tokens: 9_216_000,
        provider_active_seconds: 15_120,
        planning_credits: 4_843.93,
        api_equivalent_planning_usd: 193.76,
        purchase_authority: 0,
      },
      disposition: "immutable-no-replay-no-aggregate-excluded-from-fresh-36-attempt-matrix-roots-cannot-be-reused-or-recreated",
    },
    abandoned_partial_matrix_v19: {
      schema_version: "rc7-gate-c-abandoned-partial-matrix-lineage-v2",
      state: "immutable-eleven-attempt-partial-matrix-superseded-after-host-ack-interruption",
      closure_sha256: "0a4f9250c61d4bd4eff3dcd935a6e3f4e2b32587107ca18947f46c9bf5e74000",
      final_freeze_sha256: "38b13eb6e2185e3944364e0171bd17b26c356789158b2c97f0ec4fd8d4284496",
      activation_sha256: "0924cac12dc57913fc7b12144dc7c693e3c02a80ac1d8b40fd748be6b9ff36fd",
      operator_approval_record_sha256: "122288f7088d0c1012f836acba688aa708ed09ec19ff44cad64c47f3a7abe8e8",
      ledger_instance_sha256: "c72af4897524026b21f719e84fff1a537a3935c61c83e94cb1d89be550a0b563",
      results_meta_sha256: "e159af898b291e0469e1a83c8b90e4c8335cefa346c77cd30d4eb2d861ee16af",
      retained_ledger_accounting_sha256: "4218f1863b6b78f21b21bf4ef7f72e1adccd5812a2e6475a3e88d5100b5020a1",
      ledger_root_identity: {
        schema_version: "rc7-gate-c-ledger-root-identity-v2",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-ledger-v19-atomic-final",
        device_id: "3329890834",
        file_id: "65865144552980516",
        birthtime_ns: "1788082464649336000",
        ledger_root_sha256: "354925ebdcea5a7340ddfcb54cc6158e39777d846223770ab7d212b9d9800efc",
      },
      results_root_identity: {
        schema_version: "rc7-gate-c-results-root-identity-v1",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-results-v19-atomic-final",
        device_id: "3329890834",
        file_id: "59672695065346087",
        birthtime_ns: "1788082464653483500",
        results_root_sha256: "0753fb632d9d1ffd8cbed0f70f6520f1f486dba43160209d774c69800e083ce1",
      },
      retained_shape: {
        starts: 11,
        attempts: 11,
        trusted_sealed_attempts: 9,
        sealed_zero_score_failures: 2,
        broker_reservations: 23,
        broker_terminals: 23,
        recursive_child_requests: 12,
        rlm_executions: 3,
        aggregate: null,
      },
      retained_tree_evidence: {
        schema_version: "rc7-gate-c-v19-physical-tree-evidence-v1",
        ledger: { entries: 75, directories: 4, files: 71, manifest_bytes: 10_745, tree_sha256: "2a3053cc819731605be0ca42bc5a98bdbd638845ec7efa2b7e41e11bee4cacc7" },
        results: { entries: 25, directories: 2, files: 23, manifest_bytes: 3_505, tree_sha256: "1074a5ee1e22cc4a2aa285eccaa9d29c428d1c1adb183cb0d838d2617894dc8d" },
      },
      retained_rlm_roots: [
        {
          ordinal: 5,
          case_id: "PAPER-01",
          root_identity: { schema_version: "rc7-gate-c-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-rlm-v19-atomic-final-05-paper-01", device_id: "3329890834", file_id: "56857945298239553", birthtime_ns: "1788084400668474100", rlm_root_sha256: "4dfd2afac8c6b71169b17a2cbe82d86b62de7bfff431681b5d794388f56aa9aa" },
          retained_tree: { entries: 40, directories: 9, files: 31, manifest_bytes: 3_722, tree_sha256: "c6438f63d498daac32e3e9b2873fd0670b67a613a80fdc17720fc89cee527018" },
        },
        {
          ordinal: 7,
          case_id: "LAB-01",
          root_identity: { schema_version: "rc7-gate-c-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-rlm-v19-atomic-final-07-lab-01", device_id: "3329890834", file_id: "9851624187560022", birthtime_ns: "1788085146644551600", rlm_root_sha256: "b310bb13850733e8a8162b7181cbadfa28680436ab83f85c150e4e875f6d27a0" },
          retained_tree: { entries: 40, directories: 9, files: 31, manifest_bytes: 3_722, tree_sha256: "b13b2a34d47eb6cea83dbcf49dc85c12f8df4f24ad680b282f602cbfdbf73b52" },
        },
        {
          ordinal: 9,
          case_id: "REPO-01",
          root_identity: { schema_version: "rc7-gate-c-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-rlm-v19-atomic-final-09-repo-01", device_id: "3329890834", file_id: "12384898977955989", birthtime_ns: "1788085756194610300", rlm_root_sha256: "447be83e511524463d22436ea39035750a910d1396a594e22f5dc162773e1c40" },
          retained_tree: { entries: 39, directories: 9, files: 30, manifest_bytes: 3_576, tree_sha256: "d7a51f2d9b1f53e081dcb0ca734c2044722829f6949dacb05432aa07e13f2875" },
        },
        {
          ordinal: 11,
          case_id: "REPO-01",
          root_identity: { schema_version: "rc7-gate-c-rlm-root-identity-v1", normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-rlm-v19-atomic-final-11-repo-01", device_id: "3329890834", file_id: "16888498605326549", birthtime_ns: "1788086363009182900", rlm_root_sha256: "79d01b05dbf0fe78eb7209525dc17262546f9f1e07a74b6a14c5a86cbbbcdf60" },
          retained_tree: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        },
      ],
      sealed_attempts: [
        { case_id: "REPO-01", run_id: "0039bb44b8f0100237b286714abf53cb27165545db09b8e6279aa310f142e41f", state: "sealed-zero-score-failure", failure_code: "RECOVERY_GATE_FAILED", attempt_sha256: "b067e620eae3215dd117a0c205337f1fc5b56e014246594ed510794b35725032" },
        { case_id: "FACT-01", run_id: "0df182ac8217a261bb6168880aa0ea953e79ef493d1fff5a9589c1886c18bb77", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "89735db14b64155257c22424eee5aa306fece433e6d5959491b8e4d4d7d1533d" },
        { case_id: "FACT-01", run_id: "2e58f8649edd4f60396f1ce5667498f1a1255a78acdced8339d3ee3d0d3e02e0", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "4f458d66a7aebae06edd52b8261b47d4868c90195a9d3ea866dd5ca2657d840a" },
        { case_id: "LAB-01", run_id: "382b4ea0b261e55eb7322857a1c7b8651e071c7c2c6ac3f6fe961bfd2db782fb", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "8caa1f21a893e67887b0aa2f8da0f46c3580b016efdbc49698f16fe35fbba559" },
        { case_id: "SAFE-01", run_id: "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "ebf7ba5d1baaf1078139e528de01a2deee7a2e2981b34a18c51f43c950381c91" },
        { case_id: "FACT-01", run_id: "42ad9a8cabc9d0791e9ed1f6c74d45ef4fae65af58699a705d849796e3ff6d32", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "01bea989bd98aeef7e875b65db2b211a4891172697738b1b425836e10fb74e92" },
        { case_id: "FACT-03", run_id: "75551613884a99ae145a6d0ba71faad843576418135d43c6d3d858c2c31371d8", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "18d8861415e1d6139aaed1b40cbc7834ae27ba22f8087b78109ad9f8dc7b5536" },
        { case_id: "PAPER-01", run_id: "7f3a5db9ba8bc39c068fa6689628089a71b5c04fbb5254d0e443f2e292a6ee9f", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "745cc7b11be1539a350ac0313488a48607deffce2702cbc41c61e54178b07cb1" },
        { case_id: "REPO-01", run_id: "bfcff4bdb2cbfbaa7fafe398d18341730954b7d18d2172628496dbee8bc5bfc6", state: "sealed-zero-score-failure", failure_code: "CONTAINER_EXITED_UNSEALED", attempt_sha256: "e52a9777c31cf1f441eafb429fdd6a01f2bdbf19e880031bc7b34d7f36a5df53" },
        { case_id: "FACT-01", run_id: "daa64ce99f7d36927a5434f4607e910fcd0034439c86477408ee3fdffe985a23", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "5ba94fde83030ed46fed83f15b67ae79023e46c6de6c6305e51fed4d809847eb" },
        { case_id: "SAFE-01", run_id: "f13888f84d1f5e2fb70fc27e60e9ebb0ca5231e84e7a2d18009f99b676f43ca2", state: "trusted-sealed-primary-attempt", failure_code: null, attempt_sha256: "5e0dbada1b1e8f0bddf9460d202b66073e0119eace8cdaaebf47e46bcf7b3dfe" },
      ],
      conservative_consumed_accounting: withDigest({
        generation_https_posts: 23,
        oauth_refresh_https_posts: 1,
        total_https_posts: 24,
        input_tokens: 75_747,
        accepted_output_plus_reasoning_tokens: 95_463,
        hard_output_plus_reasoning_tokens: 223_463,
        provider_active_milliseconds: 2_061_462,
        planning_credits: 119.31,
        api_equivalent_planning_usd: 4.78,
        accounting_basis: "twenty-two-trusted-requests-plus-one-conservative-indeterminate-committed-handoff",
      }, "accounting_sha256"),
      approved_authority_ceiling: {
        generation_https_posts: 72,
        oauth_refresh_https_posts: 72,
        total_https_posts: 144,
        input_tokens: 2_359_296,
        hard_output_plus_reasoning_tokens: 9_216_000,
        provider_active_seconds: 15_120,
        planning_credits: 4_843.93,
        api_equivalent_planning_usd: 193.76,
        purchase_authority: 0,
      },
      disposition: "immutable-no-replay-no-aggregate-excluded-from-v25-36-attempt-matrix-all-ledger-results-and-rlm-roots-cannot-be-reused-or-recreated",
    },
    superseded_provider_free_preparation_v20: {
      schema_version: "rc7-gate-c-superseded-provider-free-preparation-v1",
      state: "provider-free-unactivated-superseded-after-two-independent-pre-activation-audit-blockers",
      closure_sha256: "f9001f7d7146b15610138798625f3cfb6b6dc8556a50c22e2aaee4b9a5ab8f1b",
      final_freeze_sha256: "884617eab04ae209bb8791314d2710e55c03f9ad6c23b03751da27d6b89f55a9",
      future_activation_sha256: "0dabe01aa06bda4be07f2e17c02ff2ad2d04b2c87903aab08ef9acd83544a29e",
      package_file_sha256: "143a3c7e6d30cdcc26f122a684c465e73aa71fafe90406c8213bd27f6fb62f2a",
      package_bytes: 53_023,
      ledger_root_identity: {
        schema_version: "rc7-gate-c-ledger-root-identity-v2",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-ledger-v20-host-recovery-final",
        device_id: "3329890834",
        file_id: "51791395717447747",
        birthtime_ns: "1788088056277672300",
        ledger_root_sha256: "45ed54277ed3030929cb8f104393accdda26c8adc81d5d8162070bf6498bdcfc",
      },
      results_root_identity: {
        schema_version: "rc7-gate-c-results-root-identity-v1",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-results-v20-host-recovery-final",
        device_id: "3329890834",
        file_id: "12103424001245464",
        birthtime_ns: "1788088056282432400",
        results_root_sha256: "01ea5deeb2fcd47476ec3c675e8a8cb9823ad0f9b92f79eaf3e0dfde7609f77f",
      },
      retained_tree_evidence: {
        ledger: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        results: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      },
      authority_consumed: { provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0, rlm_executions: 0, docker_invocations: 0, wsl_invocations: 0, purchases: 0 },
      blockers: ["host-lock-recovery-run-identity-not-bound", "historical-rlm-root-runtime-exclusion-not-enforced"],
      disposition: "immutable-provider-free-unactivated-preparation-roots-cannot-be-reused-or-recreated",
    },
    superseded_provider_free_preparation_v21: {
      schema_version: "rc7-gate-c-superseded-provider-free-preparation-v1",
      state: "provider-free-unactivated-superseded-after-two-independent-pre-activation-audit-blockers",
      closure_sha256: "5f6358dff6db6dc6328b436cfb3c5d193499a9db6d389fdbd197f2e53e23939f",
      final_freeze_sha256: "7e33c58eb343e2c7da979d23554334b17a4504fb5e8923efc85be8d0cf747b09",
      future_activation_sha256: "8e3d80d309ca62f320b92e4e255759e9af7947c8ed838d62bb38fe600554ebc4",
      package_file_sha256: "ada84554bedcf9ce947eb0918b573cba2b0a76e79fe5281cabd15f570736f7f9",
      package_bytes: 55_463,
      ledger_root_identity: {
        schema_version: "rc7-gate-c-ledger-root-identity-v2",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-ledger-v21-root-bound-final",
        device_id: "3329890834",
        file_id: "15199648745062696",
        birthtime_ns: "1788089253639658200",
        ledger_root_sha256: "9dea00327cdc4c62950622cef92cad191514eff8751bb09d6e2d5442903d1714",
      },
      results_root_identity: {
        schema_version: "rc7-gate-c-results-root-identity-v1",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-results-v21-root-bound-final",
        device_id: "3329890834",
        file_id: "64457769669427499",
        birthtime_ns: "1788089253644711800",
        results_root_sha256: "0bdfdf37d76ae6dcf15dac7a357238133cb240a3cc04d04de35046aa88e2a367",
      },
      retained_tree_evidence: {
        ledger: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        results: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      },
      authority_consumed: { provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0, rlm_executions: 0, docker_invocations: 0, wsl_invocations: 0, purchases: 0 },
      blockers: ["recovery-cross-run-rlm-root-uniqueness-not-enforced", "treatment-start-rlm-root-binding-not-schema-mandatory"],
      disposition: "immutable-provider-free-unactivated-preparation-roots-cannot-be-reused-or-recreated",
    },
    superseded_provider_free_preparation_v22: {
      schema_version: "rc7-gate-c-superseded-provider-free-preparation-v1",
      state: "provider-free-unactivated-superseded-after-one-independent-pre-activation-api-boundary-blocker",
      closure_sha256: "6025565910d0e0249eb89b93b967554058e6fb2ee50dd5b218ec022ed3a70686",
      final_freeze_sha256: "f0d7ed73f9c01b3689c7ac0be3349c8639136cdf5de8618571f7016a8d16b475",
      future_activation_sha256: "1bf8a5914d231fd3c96ea741f7468fa19bffbc4780ee51a359658e36e09f9bed",
      package_file_sha256: "143526932752c2d7a052d7dd40a7957353001753ac67d2dd1831506847a69a0e",
      package_bytes: 57_920,
      ledger_root_identity: {
        schema_version: "rc7-gate-c-ledger-root-identity-v2",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-ledger-v22-closed-root-final",
        device_id: "3329890834",
        file_id: "13792273861509434",
        birthtime_ns: "1788090138948934600",
        ledger_root_sha256: "40c8e1b8e5d7d94824eff24660b1435df7a4fb4e5f265af47f402d438bc4b9ce",
      },
      results_root_identity: {
        schema_version: "rc7-gate-c-results-root-identity-v1",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-results-v22-closed-root-final",
        device_id: "3329890834",
        file_id: "37717646881915195",
        birthtime_ns: "1788090138956585300",
        results_root_sha256: "91e3239917dc4f17cd97b3f13461ff8535ad40ba4c7a7ece4364155d13bdfe7a",
      },
      retained_tree_evidence: {
        ledger: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        results: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      },
      authority_consumed: { provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0, rlm_executions: 0, docker_invocations: 0, wsl_invocations: 0, purchases: 0 },
      blockers: ["public-treatment-recovery-and-publication-did-not-intrinsically-reidentify-physical-rlm-root"],
      disposition: "immutable-provider-free-unactivated-preparation-roots-cannot-be-reused-or-recreated",
    },
    superseded_provider_free_preparation_v23: {
      schema_version: "rc7-gate-c-superseded-provider-free-preparation-v1",
      state: "provider-free-unactivated-superseded-after-two-independent-pre-activation-recovery-boundary-blockers",
      closure_sha256: "0545c0d4a01f5e6d0ca56e1ce115f9a1d9d1d16758d5264991626eead577d950",
      final_freeze_sha256: "2a853c11cfa6647a8d1198e2a7a37e9c8fc7c87f01b6447006af537584255f74",
      future_activation_sha256: "901dcab0ba5e5c736dcfa7421d20ccfd2e2f15491ec16909511136689637c571",
      package_file_sha256: "bcf41355eebfec21fda97f6769983493d7a05e14ab11c8d118cc9dcd3fd5006d",
      package_bytes: 60_352,
      ledger_root_identity: {
        schema_version: "rc7-gate-c-ledger-root-identity-v2",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-ledger-v23-intrinsic-root-final",
        device_id: "3329890834",
        file_id: "19140298419011916",
        birthtime_ns: "1788091197810707800",
        ledger_root_sha256: "3a0c85fe922c204f35311c506b0e87efabe2f83e0d77671c02f506370638d2cb",
      },
      results_root_identity: {
        schema_version: "rc7-gate-c-results-root-identity-v1",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-results-v23-intrinsic-root-final",
        device_id: "3329890834",
        file_id: "39406496742179151",
        birthtime_ns: "1788091197817856200",
        results_root_sha256: "0682e517d7bc9cbd4739a7a2c718a8fb2f385e0f863ce4c5694e7844db51bd24",
      },
      retained_tree_evidence: {
        ledger: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        results: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      },
      authority_consumed: { provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0, rlm_executions: 0, docker_invocations: 0, wsl_invocations: 0, purchases: 0 },
      blockers: ["general-results-recovery-linked-treatment-stages-without-physical-root-reidentification", "exported-test-hooks-were-not-strictly-limited-to-provider-unreachable-test-results"],
      disposition: "immutable-provider-free-unactivated-preparation-roots-cannot-be-reused-or-recreated",
    },
    superseded_provider_free_preparation_v24: {
      schema_version: "rc7-gate-c-superseded-provider-free-preparation-v1",
      state: "provider-free-unactivated-superseded-after-one-independent-pre-activation-stage-recovery-blocker",
      closure_sha256: "52fd871c9bade28b2bd5c43b2a383cd76938d05b8d93bab1e12009a8c9207133",
      final_freeze_sha256: "f5789d74ca7042f0e6cdb2b401c1a43c5beb24dd3605a145e5b64be256b224d8",
      future_activation_sha256: "091fcfd9f9410ae5cdfbdc2c422ab3a5179db474b01658d4310352f3dae67c88",
      package_file_sha256: "d739402ca5ca9631694583dc5566c0b63dadb94091215856cd74b2ac5b09a7ba",
      package_bytes: 62_924,
      ledger_root_identity: {
        schema_version: "rc7-gate-c-ledger-root-identity-v2",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-ledger-v24-stage-closed-final",
        device_id: "3329890834",
        file_id: "13229323908088158",
        birthtime_ns: "1788092105413902700",
        ledger_root_sha256: "de44eb05f181cf523c4fc16336e529c231fac06caa64b20cbbecdfbda10627e2",
      },
      results_root_identity: {
        schema_version: "rc7-gate-c-results-root-identity-v1",
        normalized_physical_root: "f:\\opencnid\\rc7-gate-c-disposable\\gate-c-matrix-results-v24-stage-closed-final",
        device_id: "3329890834",
        file_id: "35184372091519329",
        birthtime_ns: "1788092105416947900",
        results_root_sha256: "f77124e32cfbf18a5954b8f16250053e6fb7b328f959c0eb388cfba66ae5ea8f",
      },
      retained_tree_evidence: {
        ledger: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        results: { entries: 0, directories: 0, files: 0, manifest_bytes: 0, tree_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      },
      authority_consumed: { provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0, rlm_executions: 0, docker_invocations: 0, wsl_invocations: 0, purchases: 0 },
      blockers: ["targeted-treatment-recovery-replaced-a-conflicting-interrupted-start-stage-after-physical-rlm-root-replacement"],
      disposition: "immutable-provider-free-unactivated-preparation-roots-cannot-be-reused-or-recreated",
    },
    replacement: {
      rule: "fresh-disjoint-physical-ledger-and-results-roots-new-approval-and-full-36-attempt-matrix",
      preserved_matrix_activation_count: 5,
      preserved_smoke_attempt_count: 5,
      preserved_successful_diagnostic_count: 1,
      prior_attempts_reused: 0,
      prior_requests_replayed: 0,
      new_primary_attempts: 36,
      new_generation_https_post_ceiling: 72,
      new_oauth_refresh_https_post_ceiling: 72,
    },
    cumulative_authority_ceiling: {
      generation_https_posts: 384,
      oauth_refresh_https_posts: 383,
      total_https_posts: 767,
      input_tokens: 12_550_217,
      hard_output_plus_reasoning_tokens: 39_200_000,
      provider_active_seconds: 69_300,
      planning_credits: 20_862.42,
      api_equivalent_planning_usd: 834.69,
      additional_credit_purchases: 0,
      incremental_cash_purchases: 0,
    },
    evidence_rule: "all three early matrix root pairs, all five smoke root pairs, the direct diagnostic result, the successful treatment proof, the partial v18 and v19 matrix roots, and the unactivated provider-free v20, v21, v22, v23, and v24 preparation roots remain immutable historical evidence; this digest-bound record appends lineage and never resets, recreates, relabels, copies into, scores, or reuses them",
  }, "supersession_record_sha256");
}

function validateGateCRepairSupersessionLineage(value) {
  const expected = gateCRepairSupersessionLineage();
  if (canonicalJsonV1(value) !== canonicalJsonV1(expected)
    || value.supersession_record_sha256 !== sha256V1(canonicalJsonV1(projection(value, "supersession_record_sha256")))) fail("SUPERSESSION_LINEAGE_MISMATCH", "Gate C repair lineage or cumulative authority was reset, relabeled, or widened");
  return value;
}

async function retainedPhysicalTreeEvidence(root) {
  const safeRoot = await assertDisposableRoot(root, false);
  const records = [];
  let directories = 0;
  let files = 0;
  async function walk(directory, relativeParent = "") {
    for (const name of (await readdir(directory)).sort()) {
      const target = path.join(directory, name);
      const relative = relativeParent.length === 0 ? name : `${relativeParent}/${name}`;
      const info = await lstat(target, { bigint: true });
      if (info.isSymbolicLink()) fail("SUPERSEDED_EVIDENCE_MISMATCH", "Historical partial-matrix evidence contains an alias");
      if (info.isDirectory()) {
        await assertPhysicalDirectory(target, directory, "historical partial-matrix directory");
        directories += 1;
        records.push(`d\0${relative}\0${0}\0-\n`);
        await walk(target, relative);
      } else if (info.isFile()) {
        await assertPhysicalFile(target, directory, "historical partial-matrix file");
        const retained = await readFile(target);
        files += 1;
        records.push(`f\0${relative}\0${retained.byteLength}\0${sha256V1(retained)}\n`);
      } else {
        fail("SUPERSEDED_EVIDENCE_MISMATCH", "Historical partial-matrix evidence contains a non-file entry");
      }
    }
  }
  await walk(safeRoot);
  const manifest = records.join("");
  return {
    entries: directories + files,
    directories,
    files,
    manifest_bytes: Buffer.byteLength(manifest, "utf8"),
    tree_sha256: sha256V1(manifest),
  };
}

async function assertRetainedHistoricalRoot(root, expectedIdentity, expectedTree, kind) {
  const retainedIdentity = kind === "ledger" ? await ledgerRootIdentity(root, false)
    : kind === "results" ? await resultsRootIdentity(root, false) : await rlmHistoricalRootIdentity(root, false);
  const retainedTree = await retainedPhysicalTreeEvidence(root);
  if (canonicalJsonV1(retainedIdentity) !== canonicalJsonV1(expectedIdentity)
    || canonicalJsonV1(retainedTree) !== canonicalJsonV1(expectedTree)) {
    fail("SUPERSEDED_EVIDENCE_MISMATCH", "Historical partial-matrix physical root or retained bytes were missing, replaced, recreated, or modified");
  }
  return { identity: retainedIdentity, tree: retainedTree };
}

async function inspectAbandonedPartialMatrixEvidence(lineage) {
  validateGateCRepairSupersessionLineage(lineage);
  const abandonedMatrices = [lineage.abandoned_partial_matrix_v18, lineage.abandoned_partial_matrix_v19];
  const checks = [];
  for (const abandoned of abandonedMatrices) {
    checks.push(
      assertRetainedHistoricalRoot(abandoned.ledger_root_identity.normalized_physical_root, abandoned.ledger_root_identity, abandoned.retained_tree_evidence.ledger, "ledger"),
      assertRetainedHistoricalRoot(abandoned.results_root_identity.normalized_physical_root, abandoned.results_root_identity, abandoned.retained_tree_evidence.results, "results"),
    );
    for (const retained of abandoned.retained_rlm_roots ?? []) {
      checks.push(assertRetainedHistoricalRoot(retained.root_identity.normalized_physical_root, retained.root_identity, retained.retained_tree, "rlm"));
    }
  }
  const preparations = [lineage.superseded_provider_free_preparation_v20, lineage.superseded_provider_free_preparation_v21, lineage.superseded_provider_free_preparation_v22, lineage.superseded_provider_free_preparation_v23, lineage.superseded_provider_free_preparation_v24];
  for (const preparation of preparations) {
    checks.push(
      assertRetainedHistoricalRoot(preparation.ledger_root_identity.normalized_physical_root, preparation.ledger_root_identity, preparation.retained_tree_evidence.ledger, "ledger"),
      assertRetainedHistoricalRoot(preparation.results_root_identity.normalized_physical_root, preparation.results_root_identity, preparation.retained_tree_evidence.results, "results"),
    );
  }
  await Promise.all(checks);
  return {
    v18: lineage.abandoned_partial_matrix_v18.retained_tree_evidence,
    v19: lineage.abandoned_partial_matrix_v19.retained_tree_evidence,
    v19_rlm_roots: lineage.abandoned_partial_matrix_v19.retained_rlm_roots.map((item) => item.retained_tree),
    v20_provider_free_preparation: preparations[0].retained_tree_evidence,
    v21_provider_free_preparation: preparations[1].retained_tree_evidence,
    v22_provider_free_preparation: preparations[2].retained_tree_evidence,
    v23_provider_free_preparation: preparations[3].retained_tree_evidence,
    v24_provider_free_preparation: preparations[4].retained_tree_evidence,
  };
}

function assertFreshRootsAgainstAbandonedPartialMatrix(ledgerRootIdentity, resultsRootIdentity, lineage) {
  const current = [ledgerRootIdentity, resultsRootIdentity];
  const historical = [lineage.abandoned_partial_matrix_v18, lineage.abandoned_partial_matrix_v19].flatMap((abandoned) => [
    abandoned.ledger_root_identity,
    abandoned.results_root_identity,
    ...(abandoned.retained_rlm_roots ?? []).map((item) => item.root_identity),
  ]).concat([
    lineage.superseded_provider_free_preparation_v20.ledger_root_identity,
    lineage.superseded_provider_free_preparation_v20.results_root_identity,
    lineage.superseded_provider_free_preparation_v21.ledger_root_identity,
    lineage.superseded_provider_free_preparation_v21.results_root_identity,
    lineage.superseded_provider_free_preparation_v22.ledger_root_identity,
    lineage.superseded_provider_free_preparation_v22.results_root_identity,
    lineage.superseded_provider_free_preparation_v23.ledger_root_identity,
    lineage.superseded_provider_free_preparation_v23.results_root_identity,
    lineage.superseded_provider_free_preparation_v24.ledger_root_identity,
    lineage.superseded_provider_free_preparation_v24.results_root_identity,
  ]);
  const physicalKey = (value) => `${value.device_id}:${value.file_id}:${value.birthtime_ns}`;
  for (const candidate of current) {
    for (const prior of historical) {
      if (nestedOrSame(candidate.normalized_physical_root, prior.normalized_physical_root)
        || nestedOrSame(prior.normalized_physical_root, candidate.normalized_physical_root)
        || physicalKey(candidate) === physicalKey(prior)) {
        fail("SUPERSEDED_ROOT_REUSE", "Abandoned partial-matrix roots are immutable and cannot be reused or recreated");
      }
    }
  }
}

function validateSuccessfulTreatmentProofPrerequisite(value, allowTestOnly = false) {
  exactKeys(value, [
    "schema_version", "state", "policy_identity", "run_id", "case_id", "roots", "proof",
    "actual_accounting", "treatment_shape", "containment", "authority_effect", "terminal_decision", "prerequisite_sha256",
  ], "successful treatment-proof prerequisite");
  const testOnly = value.state === "test-only-provider-unreachable-synthetic-prerequisite";
  if (value.schema_version !== "rc7-gate-c-successful-treatment-proof-prerequisite-v1"
    || (!testOnly && value.state !== "successful-nonmatrix-treatment-proof-revalidated")
    || (testOnly && !allowTestOnly)
    || value.policy_identity !== "rc7-gate-c-lab01-complete-rlm-treatment-proof-v15"
    || value.run_id !== "382b4ea0b261e55eb7322857a1c7b8651e071c7c2c6ac3f6fe961bfd2db782fb"
    || value.case_id !== "LAB-01"
    || value.prerequisite_sha256 !== sha256V1(canonicalJsonV1(projection(value, "prerequisite_sha256")))) {
    fail("MATRIX_PROOF_REQUIRED", "Gate C matrix activation requires the exact successful non-matrix treatment proof");
  }
  if (!testOnly && (value.proof?.result_sha256 !== "095d89c7f17f56960f14c8ba941883f3bab5a62b39c6fe0f6c4a5417d38203ca"
    || value.actual_accounting?.generation_https_posts !== 5 || value.actual_accounting?.oauth_refresh_https_posts !== 0
    || value.actual_accounting?.input_tokens !== 8_654 || value.actual_accounting?.output_plus_reasoning_tokens !== 10_864
    || value.actual_accounting?.provider_active_milliseconds !== 204_275
    || canonicalJsonV1(value.treatment_shape) !== canonicalJsonV1({ top_level_results: 1, recursive_child_results: 4, contained_rlm_executions: 1, replacement_reservations: 0 })
    || value.containment?.image_id !== RC7_GATE_C_RLM_IMAGE_ID || value.containment?.cleanup_residue_entries !== 0
    || value.terminal_decision !== "SUCCESSFUL_NONMATRIX_TREATMENT_PROOF_REVALIDATED")) {
    fail("MATRIX_PROOF_REQUIRED", "Gate C treatment-proof result, accounting, containment, or cleanup identity mismatched");
  }
  return value;
}

function proofRootPaths(value) {
  return {
    ledger: value?.roots?.ledger?.normalized_physical_root,
    results: value?.roots?.results?.normalized_physical_root,
    rlm: value?.roots?.rlm?.normalized_physical_root,
  };
}

async function inspectSuccessfulTreatmentProof(ledgerRoot, resultsRoot, rlmRoot) {
  if (![ledgerRoot, resultsRoot, rlmRoot].every((value) => typeof value === "string" && path.isAbsolute(value))) {
    fail("MATRIX_PROOF_REQUIRED", "Gate C matrix freeze requires all three exact physical treatment-proof roots");
  }
  try {
    const module = await import("./rc7-rlm-gate-c-proof-prerequisite.mjs");
    return validateSuccessfulTreatmentProofPrerequisite(
      await module.inspectRc7GateCTreatmentProofMatrixPrerequisite(ledgerRoot, resultsRoot, rlmRoot),
      false,
    );
  } catch (error) {
    if (error instanceof Rc7GateCBrokerError) throw error;
    fail("MATRIX_PROOF_REQUIRED", `Successful treatment-proof prerequisite failed closed: ${error?.code ?? "UNCLASSIFIED"}`);
  }
}

function validateActivationAgainstExpected(activation, expected) {
  exactKeys(activation, activationExpectedKeys(), "Gate C activation");
  exactKeys(expected, activationExpectedKeys().filter((key) => key !== "activation_sha256"), "expected Gate C activation");
  validateLedgerRootIdentityValue(activation?.ledger_root_identity);
  validateResultsRootIdentityValue(activation?.results_root_identity);
  validateSuccessfulTreatmentProofPrerequisite(activation?.successful_treatment_proof, activation?.successful_treatment_proof?.state === "test-only-provider-unreachable-synthetic-prerequisite");
  validateGateCRepairSupersessionLineage(activation?.supersession_lineage);
  if (canonicalJsonV1(projection(activation, "activation_sha256")) !== canonicalJsonV1(expected)
    || activation.schema_version !== RC7_GATE_C_ACTIVATION_SCHEMA || activation.state !== "active"
    || activation.approved_provider_request_ceiling !== 72 || activation.approved_input_token_ceiling !== 2_359_296
    || activation.approved_top_level_request_ceiling !== 36 || activation.approved_recursive_child_request_ceiling !== 36
    || activation.approved_eligible_treatment_attempts !== 9 || activation.approved_child_requests_per_eligible_treatment !== 4
    || activation.approved_generation_https_post_ceiling !== 72 || activation.approved_oauth_refresh_https_post_ceiling !== 72
    || activation.approved_total_https_post_ceiling !== 144
    || activation.approved_input_utf8_bytes_per_request !== 32_768 || activation.approved_input_tokens_per_request !== 32_768
    || activation.approved_output_plus_reasoning_acceptance_tokens_per_request !== 128_000
    || activation.approved_output_plus_reasoning_acceptance_token_ceiling !== 9_216_000
    || activation.approved_output_plus_reasoning_tokens_per_request !== 128_000 || activation.approved_output_plus_reasoning_token_ceiling !== 9_216_000
    || activation.approved_provider_active_timeout_seconds_per_request !== 300 || activation.approved_maximum_sequential_provider_active_seconds !== 15_120
    || activation.approved_global_concurrency !== 1 || activation.approved_automatic_retries !== 0 || activation.approved_credit_ceiling !== 4_843.93
    || activation.approved_provider_equivalent_usd_ceiling !== 193.76 || activation.additional_credit_purchase_authority !== 0
    || activation.incremental_cash_purchase_authority_usd !== 0
    || canonicalJsonV1(activation.gate_b_live_containment_contract) !== canonicalJsonV1(gateBLiveContainmentContract())
    || activation.execution_closure?.execution_closure_sha256 !== sha256V1(canonicalJsonV1(projection(activation.execution_closure, "execution_closure_sha256")))
    || activation.activation_sha256 !== sha256V1(canonicalJsonV1(expected))) fail("ACTIVATION_IDENTITY_MISMATCH", "Gate C activation does not match the exact frozen closure and numeric authority");
  return activation;
}

async function buildActivationClosure(ledgerRoot, resultsRoot, proofRoots, testOnlyPrerequisite = null) {
  const preregistration = await buildRc7GateCPreregistrationPackage();
  validateRc7GateCPreregistrationPackage(preregistration);
  const broker = await buildRc7GateCBrokerConformancePackage();
  validateRc7GateCBrokerConformancePackage(broker);
  const worker = preregistration.repository.gate_c_worker;
  const scorer = preregistration.repository.gate_c_scorer;
  const executionClosure = await buildGateCExecutionClosure(worker, preregistration);
  const rootIdentity = await ledgerRootIdentity(ledgerRoot, false);
  const retainedResultsRootIdentity = await resultsRootIdentity(resultsRoot, false);
  const supersessionLineage = gateCRepairSupersessionLineage();
  if (testOnlyPrerequisite === null) await inspectAbandonedPartialMatrixEvidence(supersessionLineage);
  assertFreshRootsAgainstAbandonedPartialMatrix(rootIdentity, retainedResultsRootIdentity, supersessionLineage);
  const successfulTreatmentProof = testOnlyPrerequisite === null
    ? await inspectSuccessfulTreatmentProof(proofRoots?.ledger, proofRoots?.results, proofRoots?.rlm)
    : validateSuccessfulTreatmentProofPrerequisite(testOnlyPrerequisite, true);
  const successfulProofRoots = proofRootPaths(successfulTreatmentProof);
  if (nestedOrSame(rootIdentity.normalized_physical_root, retainedResultsRootIdentity.normalized_physical_root)
    || nestedOrSame(retainedResultsRootIdentity.normalized_physical_root, rootIdentity.normalized_physical_root)) fail("OVERLAPPING_OUTPUT_ROOT", "Approved ledger and results roots must be disjoint");
  const allRoots = [rootIdentity.normalized_physical_root, retainedResultsRootIdentity.normalized_physical_root,
    successfulProofRoots.ledger, successfulProofRoots.results, successfulProofRoots.rlm,
    supersessionLineage.abandoned_partial_matrix_v18.ledger_root_identity.normalized_physical_root,
    supersessionLineage.abandoned_partial_matrix_v18.results_root_identity.normalized_physical_root,
    supersessionLineage.abandoned_partial_matrix_v19.ledger_root_identity.normalized_physical_root,
    supersessionLineage.abandoned_partial_matrix_v19.results_root_identity.normalized_physical_root,
    ...supersessionLineage.abandoned_partial_matrix_v19.retained_rlm_roots.map((item) => item.root_identity.normalized_physical_root)];
  for (let left = 0; left < allRoots.length; left += 1) {
    for (let right = left + 1; right < allRoots.length; right += 1) {
      if (nestedOrSame(allRoots[left], allRoots[right]) || nestedOrSame(allRoots[right], allRoots[left])) {
        fail("OVERLAPPING_OUTPUT_ROOT", "Matrix ledger, results, proof, and immutable historical roots must be pairwise disjoint");
      }
    }
  }
  return {
    schema_version: RC7_GATE_C_ACTIVATION_SCHEMA,
    state: "active",
    preregistration_sha256: preregistration.preregistration_sha256,
    broker_package_sha256: broker.broker_package_sha256,
    broker_module_sha256: broker.module.sha256,
    worker_package_sha256: worker.worker_package_sha256,
    worker_module_sha256: worker.module.sha256,
    live_capsule_sha256: worker.live_capsule.sha256,
    scorer_contract_sha256: sha256V1(canonicalJsonV1(scorer)),
    worker_stage_manifest_sha256: worker.worker_stage.stage_manifest_sha256,
    scorer_module_sha256: scorer.implementation.sha256,
    scorer_overlay_sha256: scorer.evaluator_overlay.sha256,
    runtime_lock_sha256: worker.runtime_closure.package_profile.pnpm_lock.sha256,
    schedule_sha256: sha256V1(canonicalJsonV1(preregistration.ablation.schedule)),
    prompt_bundle_sha256: preregistration.exact_comparison_identity.prompt_bundle_sha256,
    source_bundle_sha256: preregistration.exact_comparison_identity.source_bundle_sha256,
    evaluator_bundle_sha256: preregistration.exact_comparison_identity.evaluator_bundle_sha256,
    permission_policy_identity: preregistration.permissions.identity,
    budget_identity: preregistration.budget.identity,
    approved_provider_request_ceiling: 72,
    approved_top_level_request_ceiling: 36,
    approved_recursive_child_request_ceiling: 36,
    approved_eligible_treatment_attempts: 9,
    approved_child_requests_per_eligible_treatment: 4,
    approved_generation_https_post_ceiling: 72,
    approved_oauth_refresh_https_post_ceiling: 72,
    approved_total_https_post_ceiling: 144,
    approved_input_utf8_bytes_per_request: 32_768,
    approved_input_tokens_per_request: 32_768,
    approved_input_token_ceiling: 2_359_296,
    approved_output_plus_reasoning_acceptance_tokens_per_request: preregistration.budget.per_request.requested_output_plus_reasoning_token_target,
    approved_output_plus_reasoning_acceptance_token_ceiling: preregistration.budget.cumulative.requested_output_plus_reasoning_token_target,
    approved_output_plus_reasoning_tokens_per_request: preregistration.budget.per_request.hard_output_plus_reasoning_token_accounting_ceiling,
    approved_output_plus_reasoning_token_ceiling: preregistration.budget.cumulative.hard_output_plus_reasoning_token_accounting_ceiling,
    approved_provider_active_timeout_seconds_per_request: 300,
    approved_maximum_sequential_provider_active_seconds: 15_120,
    approved_global_concurrency: 1,
    approved_automatic_retries: 0,
    approved_credit_ceiling: preregistration.pricing.published_codex_credit_reference.proposed_approval_ceiling_credits,
    approved_provider_equivalent_usd_ceiling: preregistration.pricing.published_api_equivalent_reference.proposed_provider_equivalent_ceiling_usd,
    additional_credit_purchase_authority: 0,
    incremental_cash_purchase_authority_usd: 0,
    ledger_root_identity: rootIdentity,
    results_root_identity: retainedResultsRootIdentity,
    successful_treatment_proof: successfulTreatmentProof,
    supersession_lineage: supersessionLineage,
    gate_b_live_containment_contract: gateBLiveContainmentContract(),
    execution_closure: executionClosure,
  };
}

function approvalText(closureSha256, closure) {
  const proof = closure.successful_treatment_proof;
  return [
    `Under the operator's standing bounded delegation, record RC-7 Gate C final matrix activation closure ${closureSha256} for physical ledger-root identity ${closure.ledger_root_identity.ledger_root_sha256}, provider openai-codex, adapter revision 2fc02090af1632b86ee1175a6720904dfd71081c, configured model gpt-5.6-sol, xhigh reasoning, prompt bundle ${closure.prompt_bundle_sha256}, source bundle ${closure.source_bundle_sha256}, evaluator bundle ${closure.evaluator_bundle_sha256}, and pricing snapshot rc7-gate-c-openai-public-rate-planning-snapshot-2026-08-28-v1.`,
    `The mandatory successful non-matrix prerequisite is proof freeze ${proof.proof.freeze_sha256}, activation ${proof.proof.activation_sha256}, result ${proof.proof.result_sha256}, prerequisite ${proof.prerequisite_sha256}, and pinned RLM image ${proof.containment.image_id}. It retained one trusted LAB-01 top level, four trusted recursive children, one contained RLM execution, phase-two ${proof.containment.phase_two_sha256}, combined artifact ${proof.containment.combined_artifact_sha256}, and zero cleanup residue. Actual proof accounting was ${proof.actual_accounting.generation_https_posts} generation POSTs, ${proof.actual_accounting.oauth_refresh_https_posts} OAuth refreshes, ${proof.actual_accounting.input_tokens} input tokens, ${proof.actual_accounting.output_plus_reasoning_tokens} output-plus-reasoning tokens, and ${proof.actual_accounting.provider_active_milliseconds} provider-active milliseconds. The proof remains non-matrix, non-score-bearing, immutable, and unavailable for replay or authority reset.`,
    `The superseded v18 partial matrix remains immutable under activation ${closure.supersession_lineage.abandoned_partial_matrix_v18.activation_sha256}: seven settled attempts, no aggregate, four trusted direct-route results, two shared USAGE_BUDGET_EXCEEDED failures, one interrupted no-replay recovery terminal, zero child requests, zero RLM executions, and zero Docker-container executions. Its conservative consumed accounting is retained separately, while its full approved authority ceiling remains cumulatively disclosed; neither root may be reused or recreated.`,
    `The superseded v19 partial matrix remains immutable under activation ${closure.supersession_lineage.abandoned_partial_matrix_v19.activation_sha256}: eleven settled attempts, no aggregate, nine trusted results, two sealed zero-score failures, twenty-three broker requests, twelve recursive children, and three RLM executions. Its interrupted row was recovered once without replay, its exact retained accounting and full approved authority remain separately disclosed, and none of its ledger, results, or four RLM roots may be reused, recreated, or scored.`,
    `The provider-free v20 preparation ${closure.supersession_lineage.superseded_provider_free_preparation_v20.final_freeze_sha256} was never approved or activated and consumed zero authority. Its empty ledger and results roots remain immutable and excluded after independent audits found an unbound recovery run identity and missing runtime exclusion of historical RLM roots.`,
    `The provider-free v21 preparation ${closure.supersession_lineage.superseded_provider_free_preparation_v21.final_freeze_sha256} was never approved or activated and consumed zero authority. Its empty ledger and results roots remain immutable and excluded after independent audits found missing cross-run RLM-root uniqueness during recovery and a treatment-start schema that did not make the RLM-root binding mandatory.`,
    `The provider-free v22 preparation ${closure.supersession_lineage.superseded_provider_free_preparation_v22.final_freeze_sha256} was never approved or activated and consumed zero authority. Its empty ledger and results roots remain immutable and excluded after an independent audit found that exported treatment recovery and publication APIs did not intrinsically reidentify the physical RLM root.`,
    `The provider-free v23 preparation ${closure.supersession_lineage.superseded_provider_free_preparation_v23.final_freeze_sha256} was never approved or activated and consumed zero authority. Its empty ledger and results roots remain immutable and excluded after independent audits found that general recovery could link treatment stages without a physical-root check and that exported test hooks were not strictly limited to provider-unreachable test results.`,
    `The provider-free v24 preparation ${closure.supersession_lineage.superseded_provider_free_preparation_v24.final_freeze_sha256} was never approved or activated and consumed zero authority. Its empty ledger and results roots remain immutable and excluded after an independent audit found that targeted treatment recovery could replace a conflicting interrupted start stage after same-path RLM-root replacement.`,
    `Authorize one fresh 36-attempt matrix: 36 top-level and 36 recursive-child reservations, 72 generation HTTPS POSTs, up to 72 OAuth-refresh HTTPS POSTs, 144 total HTTPS POSTs, nine eligible treatment attempts, four children per eligible treatment, 32,768 UTF-8 semantic-input bytes and conservative input tokens per request, 2,359,296 input tokens total, a 128,000 output-plus-reasoning post-response acceptance ceiling per request and 9,216,000 accepted total, the same 128,000 hard provider-authority ceiling per request and 9,216,000 hard-authority total, 300 provider-active seconds per top-level request, 120 seconds per recursive child, 15,120 sequential provider-active seconds total, concurrency one, zero retries, 4,843.93 planning credits, USD 193.76 API-equivalent planning amount, zero additional-credit purchases, and zero incremental cash purchases.`,
    "Cumulative disclosed history-plus-proof-plus-full-v18-plus-full-v19-authority-plus-fresh-v25-matrix ceilings are 384 generation POSTs, 383 OAuth-refresh POSTs, 767 total POSTs, 12,550,217 input tokens, 39,200,000 hard output-plus-reasoning tokens, 69,300 provider-active seconds, 20,862.42 planning credits, and USD 834.69 API-equivalent, with zero purchase authority.",
    `The exact closed executor, sealed results pipeline, physical-root-bound no-reset ledger, credential-opaque DSH/OpenAI-Codex worker, broker-owned Docker inspection, and pinned image ${RC7_GATE_C_RLM_IMAGE_ID} remain mandatory. Backend snapshot, native tokenizer, subscription pricing applicability, remote cancellation and billing, and hostile-administrator resistance remain unproven. This record grants no publication, deployment, purchase, RC-8, or external-mutation authority.`,
  ].join(" ");
}

function finalFreezeProjection(value) {
  return projection(value, "final_freeze_sha256");
}

async function buildFinalApprovalFreeze(ledgerRoot, resultsRoot, proofRoots, testOnlyPrerequisite = null) {
  const closure = await buildActivationClosure(ledgerRoot, resultsRoot, proofRoots, testOnlyPrerequisite);
  const closureSha256 = sha256V1(canonicalJsonV1(closure));
  const exactApprovalText = approvalText(closureSha256, closure);
  const approvalTextSha256 = sha256V1(exactApprovalText);
  const expectedActivation = { ...closure, approval_text_sha256: approvalTextSha256 };
  const value = {
    schema_version: RC7_GATE_C_FINAL_FREEZE_SCHEMA,
    state: "provider-free-frozen-awaiting-explicit-user-approval",
    closure,
    closure_sha256: closureSha256,
    exact_approval_text: exactApprovalText,
    approval_text_sha256: approvalTextSha256,
    future_activation_sha256: sha256V1(canonicalJsonV1(expectedActivation)),
    operator_approval_record_contract: {
      schema_version: RC7_GATE_C_OPERATOR_APPROVAL_SCHEMA,
      retained_name: OPERATOR_APPROVAL,
      required_state: "operator-approved",
      exact_approval_text_required: true,
      ledger_root_identity_required: true,
      results_root_identity_required: true,
      successful_treatment_proof_required: true,
      governance_nonclaim: OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM,
    },
    authority_effect: "approval authorizes only construction of the exact activation object; provider, credential, RLM, Docker, WSL, benchmark, publication, and external-mutation actions remain absent from this provider-free freeze",
    accounting: {
      rlm_executions: 0,
      provider_calls: 0,
      simulated_provider_requests: 0,
      credential_accesses: 0,
      network_or_live_browsing_actions: 0,
      external_mutations: 0,
      retained_artifacts: 1,
      terminal_decisions: 1,
      required_operator_steps: 1,
    },
    terminal_decision: "AWAITING_EXACT_DIGEST_BOUND_NUMERIC_APPROVAL",
  };
  value.final_freeze_sha256 = sha256V1(canonicalJsonV1(finalFreezeProjection(value)));
  validateRc7GateCFinalApprovalFreeze(value);
  return value;
}

export async function buildRc7GateCFinalApprovalFreeze(ledgerRoot, resultsRoot, proofLedgerRoot, proofResultsRoot, proofRlmRoot) {
  return buildFinalApprovalFreeze(ledgerRoot, resultsRoot, {
    ledger: proofLedgerRoot,
    results: proofResultsRoot,
    rlm: proofRlmRoot,
  });
}

async function buildTestOnlyFinalApprovalFreeze(ledgerRoot, resultsRoot) {
  const module = await import("./rc7-rlm-gate-c-proof-prerequisite.mjs");
  const prerequisite = module.buildRc7GateCTestOnlyProofPrerequisite();
  return buildFinalApprovalFreeze(ledgerRoot, resultsRoot, proofRootPaths(prerequisite), prerequisite);
}

export function validateRc7GateCFinalApprovalFreeze(value) {
  exactKeys(value, [
    "accounting", "approval_text_sha256", "authority_effect", "closure", "closure_sha256", "exact_approval_text",
    "final_freeze_sha256", "future_activation_sha256", "operator_approval_record_contract", "schema_version", "state", "terminal_decision",
  ], "final approval freeze");
  const expectedClosureKeys = activationExpectedKeys().filter((key) => !["activation_sha256", "approval_text_sha256"].includes(key));
  exactKeys(value.closure, expectedClosureKeys, "final approval closure");
  validateLedgerRootIdentityValue(value.closure.ledger_root_identity);
  validateResultsRootIdentityValue(value.closure.results_root_identity);
  const testOnlyProof = value.closure.successful_treatment_proof?.state === "test-only-provider-unreachable-synthetic-prerequisite";
  validateSuccessfulTreatmentProofPrerequisite(value.closure.successful_treatment_proof, testOnlyProof);
  const expectedActivation = { ...value.closure, approval_text_sha256: value.approval_text_sha256 };
  if (value.schema_version !== RC7_GATE_C_FINAL_FREEZE_SCHEMA || value.state !== "provider-free-frozen-awaiting-explicit-user-approval"
    || value.closure_sha256 !== sha256V1(canonicalJsonV1(value.closure)) || value.exact_approval_text !== approvalText(value.closure_sha256, value.closure)
    || value.approval_text_sha256 !== sha256V1(value.exact_approval_text)
    || value.future_activation_sha256 !== sha256V1(canonicalJsonV1(expectedActivation))
    || canonicalJsonV1(value.operator_approval_record_contract) !== canonicalJsonV1({
      schema_version: RC7_GATE_C_OPERATOR_APPROVAL_SCHEMA,
      retained_name: OPERATOR_APPROVAL,
      required_state: "operator-approved",
      exact_approval_text_required: true,
      ledger_root_identity_required: true,
      results_root_identity_required: true,
      successful_treatment_proof_required: true,
      governance_nonclaim: OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM,
    })
    || value.accounting.provider_calls !== 0 || value.accounting.simulated_provider_requests !== 0 || value.accounting.credential_accesses !== 0
    || value.terminal_decision !== "AWAITING_EXACT_DIGEST_BOUND_NUMERIC_APPROVAL"
    || value.final_freeze_sha256 !== sha256V1(canonicalJsonV1(finalFreezeProjection(value)))) fail("FINAL_FREEZE_MISMATCH", "Final approval freeze widened or mismatched");
  validateActivationAgainstExpected({ ...expectedActivation, activation_sha256: value.future_activation_sha256 }, expectedActivation);
  return value;
}

function expectedActivationFromFreeze(value) {
  validateRc7GateCFinalApprovalFreeze(value);
  return { ...structuredClone(value.closure), approval_text_sha256: value.approval_text_sha256 };
}

function approvalRecordProjection(value) {
  return projection(value, "operator_approval_record_sha256");
}

async function ledgerRootIdentity(root, requireEmpty) {
  const safeRoot = await assertDisposableRoot(root, requireEmpty);
  const info = await lstat(safeRoot, { bigint: true });
  return withDigest({
    schema_version: "rc7-gate-c-ledger-root-identity-v2",
    normalized_physical_root: normalizedPath(await realpath(safeRoot)),
    device_id: info.dev.toString(10),
    file_id: info.ino.toString(10),
    birthtime_ns: info.birthtimeNs.toString(10),
  }, "ledger_root_sha256");
}

async function resultsRootIdentity(root, requireEmpty) {
  const safeRoot = await assertDisposableRoot(root, requireEmpty);
  const info = await lstat(safeRoot, { bigint: true });
  return withDigest({
    schema_version: "rc7-gate-c-results-root-identity-v1",
    normalized_physical_root: normalizedPath(await realpath(safeRoot)),
    device_id: info.dev.toString(10),
    file_id: info.ino.toString(10),
    birthtime_ns: info.birthtimeNs.toString(10),
  }, "results_root_sha256");
}

async function rlmHistoricalRootIdentity(root, requireEmpty) {
  const safeRoot = await assertDisposableRoot(root, requireEmpty);
  const info = await lstat(safeRoot, { bigint: true });
  return withDigest({
    schema_version: "rc7-gate-c-rlm-root-identity-v1",
    normalized_physical_root: normalizedPath(await realpath(safeRoot)),
    device_id: info.dev.toString(10),
    file_id: info.ino.toString(10),
    birthtime_ns: info.birthtimeNs.toString(10),
  }, "rlm_root_sha256");
}

function physicalRootKey(value) {
  return `${value.device_id}:${value.file_id}:${value.birthtime_ns}`;
}

function collectPhysicalRootIdentities(value, retained = []) {
  if (!value || typeof value !== "object") return retained;
  if (!Array.isArray(value) && typeof value.normalized_physical_root === "string"
    && /^\d+$/u.test(value.device_id ?? "") && /^\d+$/u.test(value.file_id ?? "")
    && /^\d+$/u.test(value.birthtime_ns ?? "")) retained.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) collectPhysicalRootIdentities(child, retained);
  return retained;
}

function assertFreshRlmRootIdentity(candidate, activation) {
  const historicalAndBound = collectPhysicalRootIdentities({
    ledger_root_identity: activation.ledger_root_identity,
    results_root_identity: activation.results_root_identity,
    successful_treatment_proof: activation.successful_treatment_proof,
    supersession_lineage: activation.supersession_lineage,
  });
  for (const prior of historicalAndBound) {
    if (nestedOrSame(candidate.normalized_physical_root, prior.normalized_physical_root)
      || nestedOrSame(prior.normalized_physical_root, candidate.normalized_physical_root)
      || physicalRootKey(candidate) === physicalRootKey(prior)) {
      fail("SUPERSEDED_ROOT_REUSE", "RLM execution roots must be fresh and disjoint from every current, proof, and historical physical root");
    }
  }
  return candidate;
}

async function identifyRlmRootForAttempt(ledgerRoot, resultsRoot, runId, rlmRoot, requireEmpty, allowTestOnly) {
  if (!HASH.test(runId ?? "")) fail("RUN_IDENTITY_MISMATCH", "RLM-root qualification requires one exact registered run identity");
  const context = await readLedgerContext(ledgerRoot, allowTestOnly, false);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule.find((item) => item.run_id === runId);
  if (!row) fail("RUN_IDENTITY_MISMATCH", "RLM-root qualification run identity is not registered");
  const currentResultsIdentity = await resultsRootIdentity(resultsRoot, false);
  if (canonicalJsonV1(currentResultsIdentity) !== canonicalJsonV1(context.activation.results_root_identity)) {
    fail("RESULTS_ROOT_IDENTITY_MISMATCH", "RLM-root qualification requires the exact activation-bound results root");
  }
  if (row.selected_route === "rc-direct") {
    if (rlmRoot !== null) fail("RLM_ROOT_MISMATCH", "Direct attempts forbid an RLM root");
    return null;
  }
  if (typeof rlmRoot !== "string") fail("RLM_ROOT_MISMATCH", "Eligible treatment attempts require one explicit RLM root");
  return assertFreshRlmRootIdentity(await rlmHistoricalRootIdentity(rlmRoot, requireEmpty), context.activation);
}

export async function identifyRc7GateCFreshRlmRootForAttempt(ledgerRoot, resultsRoot, runId, rlmRoot) {
  return identifyRlmRootForAttempt(ledgerRoot, resultsRoot, runId, rlmRoot, true, false);
}

export async function reidentifyRc7GateCRlmRootForRecovery(ledgerRoot, resultsRoot, runId, rlmRoot) {
  return identifyRlmRootForAttempt(ledgerRoot, resultsRoot, runId, rlmRoot, false, false);
}

function validateLedgerRootIdentityValue(value) {
  exactKeys(value, ["schema_version", "normalized_physical_root", "device_id", "file_id", "birthtime_ns", "ledger_root_sha256"], "ledger root identity");
  if (value.schema_version !== "rc7-gate-c-ledger-root-identity-v2" || typeof value.normalized_physical_root !== "string"
    || !path.isAbsolute(value.normalized_physical_root) || !/^\d+$/u.test(value.device_id ?? "")
    || !/^\d+$/u.test(value.file_id ?? "") || !/^\d+$/u.test(value.birthtime_ns ?? "")
    || value.ledger_root_sha256 !== sha256V1(canonicalJsonV1(projection(value, "ledger_root_sha256")))) fail("LEDGER_IDENTITY_MISMATCH", "Ledger root physical identity is malformed or self-digest mismatched");
  return value;
}

function validateResultsRootIdentityValue(value) {
  exactKeys(value, ["schema_version", "normalized_physical_root", "device_id", "file_id", "birthtime_ns", "results_root_sha256"], "results root identity");
  if (value.schema_version !== "rc7-gate-c-results-root-identity-v1" || typeof value.normalized_physical_root !== "string"
    || !path.isAbsolute(value.normalized_physical_root) || !/^\d+$/u.test(value.device_id ?? "")
    || !/^\d+$/u.test(value.file_id ?? "") || !/^\d+$/u.test(value.birthtime_ns ?? "")
    || value.results_root_sha256 !== sha256V1(canonicalJsonV1(projection(value, "results_root_sha256")))) fail("RESULTS_ROOT_IDENTITY_MISMATCH", "Results root physical identity is malformed or self-digest mismatched");
  return value;
}

function buildOperatorApprovalRecord(freeze, state, root) {
  validateRc7GateCFinalApprovalFreeze(freeze);
  const testOnly = state === "test-only-provider-unreachable";
  if (!testOnly && state !== "operator-approved") fail("NUMERIC_APPROVAL_REQUIRED", "Operator approval state is closed");
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("NUMERIC_APPROVAL_REQUIRED", "Operator approval requires one exact physical ledger root");
  return withDigest({
    schema_version: RC7_GATE_C_OPERATOR_APPROVAL_SCHEMA,
    state,
    final_freeze_sha256: freeze.final_freeze_sha256,
    closure_sha256: freeze.closure_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    approval_text_sha256: freeze.approval_text_sha256,
    exact_approval_text: freeze.exact_approval_text,
    ledger_root_sha256: freeze.closure.ledger_root_identity.ledger_root_sha256,
    results_root_identity: structuredClone(freeze.closure.results_root_identity),
    successful_treatment_proof: structuredClone(freeze.closure.successful_treatment_proof),
    authority_scope: testOnly ? "none-test-only-provider-unreachable" : "exact-gate-c-activation-closure-only",
    governance_nonclaim: OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM,
  }, "operator_approval_record_sha256");
}

async function validateOperatorApprovalRecordAgainstFreeze(record, freeze, root, allowTestOnly = false) {
  exactKeys(record, [
    "schema_version", "state", "final_freeze_sha256", "closure_sha256", "future_activation_sha256",
    "approval_text_sha256", "exact_approval_text", "ledger_root_sha256", "results_root_identity", "successful_treatment_proof", "authority_scope", "governance_nonclaim", "operator_approval_record_sha256",
  ], "operator approval record");
  const testOnly = record.state === "test-only-provider-unreachable";
  const currentRootIdentity = await ledgerRootIdentity(root, false);
  const currentResultsRootIdentity = await resultsRootIdentity(record?.results_root_identity?.normalized_physical_root, false);
  validateSuccessfulTreatmentProofPrerequisite(record?.successful_treatment_proof, testOnly);
  if (record.schema_version !== RC7_GATE_C_OPERATOR_APPROVAL_SCHEMA
    || (!testOnly && record.state !== "operator-approved") || (testOnly && !allowTestOnly)
    || record.final_freeze_sha256 !== freeze.final_freeze_sha256 || record.closure_sha256 !== freeze.closure_sha256
    || record.future_activation_sha256 !== freeze.future_activation_sha256 || record.approval_text_sha256 !== freeze.approval_text_sha256
    || record.exact_approval_text !== freeze.exact_approval_text
    || canonicalJsonV1(freeze.closure.ledger_root_identity) !== canonicalJsonV1(currentRootIdentity)
    || canonicalJsonV1(freeze.closure.results_root_identity) !== canonicalJsonV1(currentResultsRootIdentity)
    || canonicalJsonV1(record.results_root_identity) !== canonicalJsonV1(currentResultsRootIdentity)
    || canonicalJsonV1(record.successful_treatment_proof) !== canonicalJsonV1(freeze.closure.successful_treatment_proof)
    || record.ledger_root_sha256 !== currentRootIdentity.ledger_root_sha256
    || record.authority_scope !== (testOnly ? "none-test-only-provider-unreachable" : "exact-gate-c-activation-closure-only")
    || record.governance_nonclaim !== OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM
    || record.operator_approval_record_sha256 !== sha256V1(canonicalJsonV1(approvalRecordProjection(record)))) fail("NUMERIC_APPROVAL_REQUIRED", "Durable operator approval record does not match the current exact approval text and freeze digests");
  return record;
}

export async function validateRc7GateCOperatorApprovalRecord(record, root) {
  const safeRoot = await assertDisposableRoot(root, false);
  const proofRoots = proofRootPaths(record?.successful_treatment_proof);
  const freeze = await buildRc7GateCFinalApprovalFreeze(
    safeRoot, record?.results_root_identity?.normalized_physical_root,
    proofRoots.ledger, proofRoots.results, proofRoots.rlm,
  );
  return validateOperatorApprovalRecordAgainstFreeze(record, freeze, safeRoot, false);
}

async function freezeForApprovalRecord(safeRoot, approval, allowTestOnly) {
  const proofRoots = proofRootPaths(approval?.successful_treatment_proof);
  if (approval?.state === "test-only-provider-unreachable") {
    if (!allowTestOnly) fail("NUMERIC_APPROVAL_REQUIRED", "Test-only approval grants no production authority");
    return buildFinalApprovalFreeze(
      safeRoot,
      approval?.results_root_identity?.normalized_physical_root,
      proofRoots,
      approval.successful_treatment_proof,
    );
  }
  return buildRc7GateCFinalApprovalFreeze(
    safeRoot, approval?.results_root_identity?.normalized_physical_root,
    proofRoots.ledger, proofRoots.results, proofRoots.rlm,
  );
}

export async function buildRc7GateCFinalApprovalFreezeForApprovedLedger(root) {
  const safeRoot = await assertDisposableRoot(root, false);
  await assertPhysicalFile(path.join(safeRoot, OPERATOR_APPROVAL), safeRoot, "operator approval record");
  const approval = await readCanonicalJson(path.join(safeRoot, OPERATOR_APPROVAL), "operator approval record");
  const freeze = await freezeForApprovalRecord(safeRoot, approval, false);
  await validateOperatorApprovalRecordAgainstFreeze(approval, freeze, safeRoot, false);
  return freeze;
}

export async function recordRc7GateCOperatorApproval(root, input) {
  exactKeys(input, [
    "exact_approval_text", "final_freeze_sha256", "future_activation_sha256", "results_root",
    "proof_ledger_root", "proof_results_root", "proof_rlm_root",
  ], "operator approval input");
  const safeRoot = await assertDisposableRoot(root, true);
  const safeResultsRoot = await assertDisposableRoot(input.results_root, true);
  if (nestedOrSame(safeRoot, safeResultsRoot) || nestedOrSame(safeResultsRoot, safeRoot)) fail("OVERLAPPING_OUTPUT_ROOT", "Approved ledger and results roots must be disjoint");
  const freeze = await buildRc7GateCFinalApprovalFreeze(
    safeRoot, safeResultsRoot, input.proof_ledger_root, input.proof_results_root, input.proof_rlm_root,
  );
  if (input.exact_approval_text !== freeze.exact_approval_text || input.final_freeze_sha256 !== freeze.final_freeze_sha256
    || input.future_activation_sha256 !== freeze.future_activation_sha256) fail("NUMERIC_APPROVAL_REQUIRED", "Operator approval must reproduce the current exact text and both current freeze identities");
  const record = buildOperatorApprovalRecord(freeze, "operator-approved", safeRoot);
  await writeExclusive(path.join(safeRoot, OPERATOR_APPROVAL), record);
  return { root: safeRoot, results_root: safeResultsRoot, results_root_sha256: record.results_root_identity.results_root_sha256, operator_approval_record_sha256: record.operator_approval_record_sha256, final_freeze_sha256: record.final_freeze_sha256, future_activation_sha256: record.future_activation_sha256, authority_scope: record.authority_scope };
}

function activationForApproval(freeze, approval) {
  const expected = expectedActivationFromFreeze(freeze);
  if (approval.future_activation_sha256 !== freeze.future_activation_sha256 || approval.approval_text_sha256 !== expected.approval_text_sha256) fail("ACTIVATION_IDENTITY_MISMATCH", "Approval and current activation closure differ");
  return validateActivationAgainstExpected({ ...expected, activation_sha256: freeze.future_activation_sha256 }, expected);
}

export async function validateRc7GateCActivation(activation) {
  const freeze = await buildRc7GateCFinalApprovalFreeze(
    activation?.ledger_root_identity?.normalized_physical_root,
    activation?.results_root_identity?.normalized_physical_root,
    activation?.successful_treatment_proof?.roots?.ledger?.normalized_physical_root,
    activation?.successful_treatment_proof?.roots?.results?.normalized_physical_root,
    activation?.successful_treatment_proof?.roots?.rlm?.normalized_physical_root,
  );
  return validateActivationAgainstExpected(activation, expectedActivationFromFreeze(freeze));
}

function buildDispatchPermit(intent, activation, state = "reserved-provider-reachable-once") {
  validateRc7GateCRequestIntent(intent);
  if (activation.preregistration_sha256 !== intent.preregistration_sha256) fail("ACTIVATION_IDENTITY_MISMATCH", "Activation and request preregistration differ");
  return withDigest({
    schema_version: "rc7-gate-c-dispatch-permit-v2",
    activation_sha256: activation.activation_sha256,
    preregistration_sha256: activation.preregistration_sha256,
    broker_package_sha256: activation.broker_package_sha256,
    worker_package_sha256: activation.worker_package_sha256,
    scorer_contract_sha256: activation.scorer_contract_sha256,
    intent_sha256: intent.intent_sha256,
    run_id: intent.run_id,
    request_kind: intent.request_kind,
    child_sequence: intent.child_sequence,
    semantic_request_sha256: intent.semantic_request_sha256,
    semantic_request_byte_count: intent.semantic_request_byte_count,
    dispatch_nonce: sha256V1(canonicalJsonV1({ activation_sha256: activation.activation_sha256, intent_sha256: intent.intent_sha256 })),
    state,
  }, "permit_sha256");
}

function reservationKey(intent) {
  return sha256V1(canonicalJsonV1({ run_id: intent.run_id, request_kind: intent.request_kind, child_sequence: intent.child_sequence }));
}

async function readCanonicalJson(target, label) {
  await assertPhysicalFile(target, path.dirname(target), label);
  const bytes = await readFile(target);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("MALFORMED_LEDGER", `${label} is not JSON`); }
  if (!bytes.equals(packageBytes(value))) fail("MALFORMED_LEDGER", `${label} is not canonical JSON`);
  return value;
}

async function writeExclusive(target, value) {
  const handle = await open(target, "wx");
  try {
    await handle.writeFile(packageBytes(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function ledgerMeta(activation, approval) {
  return withDigest({
    schema_version: "rc7-gate-c-dispatch-ledger-v6",
    authority_state: approval.state,
    operator_approval_record_sha256: approval.operator_approval_record_sha256,
    ledger_root_sha256: approval.ledger_root_sha256,
    results_root_sha256: approval.results_root_identity.results_root_sha256,
    ledger_instance_sha256: sha256V1(canonicalJsonV1({ activation_sha256: activation.activation_sha256, operator_approval_record_sha256: approval.operator_approval_record_sha256, ledger_root_sha256: approval.ledger_root_sha256, results_root_sha256: approval.results_root_identity.results_root_sha256 })),
    final_freeze_sha256: approval.final_freeze_sha256,
    closure_sha256: approval.closure_sha256,
    activation_sha256: activation.activation_sha256,
    preregistration_sha256: activation.preregistration_sha256,
    broker_package_sha256: activation.broker_package_sha256,
    worker_package_sha256: activation.worker_package_sha256,
    scorer_contract_sha256: activation.scorer_contract_sha256,
    maximum_reservations: 72,
    generation_https_post_ceiling: 72,
    oauth_refresh_https_post_ceiling: 72,
    total_https_post_ceiling: 144,
    maximum_input_tokens: 2_359_296,
    maximum_output_plus_reasoning_acceptance_tokens: 9_216_000,
    maximum_output_plus_reasoning_tokens: 9_216_000,
    maximum_sequential_provider_active_seconds: 15_120,
    global_concurrency: 1,
    automatic_retries: 0,
  }, "ledger_sha256");
}

function validateLedgerMeta(meta, activation, approval) {
  exactKeys(meta, [
    "schema_version", "authority_state", "operator_approval_record_sha256", "final_freeze_sha256", "closure_sha256",
    "ledger_root_sha256", "results_root_sha256", "ledger_instance_sha256",
    "activation_sha256", "preregistration_sha256", "broker_package_sha256", "worker_package_sha256", "scorer_contract_sha256",
    "maximum_reservations", "generation_https_post_ceiling", "oauth_refresh_https_post_ceiling", "total_https_post_ceiling",
    "maximum_input_tokens", "maximum_output_plus_reasoning_acceptance_tokens", "maximum_output_plus_reasoning_tokens", "maximum_sequential_provider_active_seconds",
    "global_concurrency", "automatic_retries", "ledger_sha256",
  ], "dispatch ledger metadata");
  const expected = ledgerMeta(activation, approval);
  if (canonicalJsonV1(meta) !== canonicalJsonV1(expected)) fail("LEDGER_IDENTITY_MISMATCH", "Dispatch ledger does not match the current freeze and durable operator approval");
  return meta;
}

async function acquireDispatchLock(root) {
  try { return await open(path.join(root, DISPATCH_LOCK), "wx"); } catch (error) {
    if (error?.code === "EEXIST") fail("CONCURRENT_DISPATCH_EXCLUDED", "Another dispatch or recovery owns the exact ledger");
    throw error;
  }
}

async function releaseDispatchLock(root, lock) {
  const owned = await lock.stat();
  const current = await lstat(path.join(root, DISPATCH_LOCK));
  if (owned.dev !== current.dev || owned.ino !== current.ino) fail("LOCK_OWNERSHIP_LOST", "Dispatch lock was replaced while owned");
  await lock.close();
  await rm(path.join(root, DISPATCH_LOCK));
}

async function assertLedgerLayout(root, allowHostLaunchLock = false) {
  const entries = (await readdir(root)).sort();
  const allowed = new Set([OPERATOR_APPROVAL, LEDGER_META, RESERVATIONS_DIR, TERMINALS_DIR, HANDOFFS_DIR, DOCKER_CONFIG_DIR, DISPATCH_LOCK, ACTIVE_DISPATCH]);
  if (allowHostLaunchLock) allowed.add(HOST_LAUNCH_LOCK);
  if (entries.some((entry) => !allowed.has(entry))) fail("UNKNOWN_RESIDUE", "Dispatch ledger contains unknown residue");
  for (const required of [OPERATOR_APPROVAL, LEDGER_META, RESERVATIONS_DIR, TERMINALS_DIR, HANDOFFS_DIR, DOCKER_CONFIG_DIR]) if (!entries.includes(required)) fail("MISSING_LEDGER_PATH", `Dispatch ledger is missing ${required}`);
  await assertPhysicalFile(path.join(root, OPERATOR_APPROVAL), root, "operator approval record");
  await assertPhysicalFile(path.join(root, LEDGER_META), root, "ledger metadata");
  await assertPhysicalDirectory(path.join(root, RESERVATIONS_DIR), root, "reservations directory");
  await assertPhysicalDirectory(path.join(root, TERMINALS_DIR), root, "terminals directory");
  await assertPhysicalDirectory(path.join(root, HANDOFFS_DIR), root, "handoffs directory");
  await assertPhysicalDirectory(path.join(root, DOCKER_CONFIG_DIR), root, "Docker CLI config directory");
  if ((await readdir(path.join(root, DOCKER_CONFIG_DIR))).length !== 0) fail("UNKNOWN_RESIDUE", "Docker CLI config directory must remain empty and credential-free");
  if (entries.includes(ACTIVE_DISPATCH)) await assertPhysicalFile(path.join(root, ACTIVE_DISPATCH), root, "active dispatch");
  if (entries.includes(DISPATCH_LOCK)) await assertPhysicalFile(path.join(root, DISPATCH_LOCK), root, "dispatch lock");
  if (entries.includes(HOST_LAUNCH_LOCK)) await assertPhysicalFile(path.join(root, HOST_LAUNCH_LOCK), root, "host launch lock");
  for (const [directory, label] of [[RESERVATIONS_DIR, "reservation"], [TERMINALS_DIR, "terminal"], [HANDOFFS_DIR, "handoff"]]) {
    const physical = path.join(root, directory);
    for (const entry of await readdir(physical)) {
      if (!/^[0-9a-f]{64}\.json$/u.test(entry)) fail("UNKNOWN_RESIDUE", `${label} directory contains an unknown entry`);
      await assertPhysicalFile(path.join(physical, entry), physical, label);
    }
  }
  return entries;
}

async function readLedgerContext(root, allowTestOnly = false, allowHostLaunchLock = false) {
  const safeRoot = await assertDisposableRoot(root, false);
  await assertLedgerLayout(safeRoot, allowHostLaunchLock);
  const approval = await readCanonicalJson(path.join(safeRoot, OPERATOR_APPROVAL), "operator approval record");
  const freeze = await freezeForApprovalRecord(safeRoot, approval, allowTestOnly);
  await validateOperatorApprovalRecordAgainstFreeze(approval, freeze, safeRoot, allowTestOnly);
  const activation = activationForApproval(freeze, approval);
  const meta = await readCanonicalJson(path.join(safeRoot, LEDGER_META), "ledger metadata");
  validateLedgerMeta(meta, activation, approval);
  return { root: safeRoot, freeze, approval, activation, meta };
}

function processIsLive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function validateHostLaunchLockRecord(value) {
  exactKeys(value, [
    "schema_version", "state", "normalized_ledger_root", "activation_sha256", "run_id", "dispatch_sha256",
    "durable_handoff_sha256", "handoff_sha256", "nonce", "parent_pid", "child_pid", "host_lock_sha256",
  ], "host launch lock");
  const childState = value.state !== "parent-owned-before-child-spawn";
  if (value.schema_version !== "rc7-gate-c-host-launch-lock-v2"
    || !["parent-owned-before-child-spawn", "child-spawned-before-handoff", "handoff-written-awaiting-ack", "ack-validated-before-commit", "commit-sent-awaiting-result"].includes(value.state)
    || typeof value.normalized_ledger_root !== "string" || !path.isAbsolute(value.normalized_ledger_root)
    || ![value.activation_sha256, value.run_id, value.dispatch_sha256, value.durable_handoff_sha256, value.handoff_sha256, value.nonce].every((item) => HASH.test(item ?? ""))
    || !Number.isSafeInteger(value.parent_pid) || value.parent_pid < 1
    || (childState && (!Number.isSafeInteger(value.child_pid) || value.child_pid < 1))
    || (!childState && value.child_pid !== null)
    || value.host_lock_sha256 !== sha256V1(canonicalJsonV1(projection(value, "host_lock_sha256")))) {
    fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lock is malformed or self-digest mismatched");
  }
  return value;
}

async function readPhysicalHostLaunchLock(root) {
  const target = path.join(root, HOST_LAUNCH_LOCK);
  const before = await lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || path.resolve(await realpath(target)) !== path.resolve(target)) {
    fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lock is aliased or multiply linked");
  }
  if (before.size < 3n || before.size > BigInt(MAX_HOST_LAUNCH_LOCK_BYTES)) fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lock exceeds its closed byte envelope");
  const handle = await open(target, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    const retained = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const current = await lstat(target, { bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || after.dev !== opened.dev || after.ino !== opened.ino
      || current.dev !== opened.dev || current.ino !== opened.ino || current.nlink !== 1n || BigInt(retained.byteLength) !== current.size) {
      fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lock changed or was replaced during recovery inspection");
    }
    let value;
    try { value = JSON.parse(retained.toString("utf8")); } catch { fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lock is not JSON"); }
    validateHostLaunchLockRecord(value);
    if (!retained.equals(Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8"))) fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lock is not canonical JSON");
    return { target, value, dev: opened.dev, ino: opened.ino };
  } finally { await handle.close(); }
}

async function recoverHostLaunchLock(root, expectedRunId, allowTestOnly = false) {
  if (!HASH.test(expectedRunId ?? "")) fail("RUN_IDENTITY_MISMATCH", "Host-lock recovery requires one exact registered run identity");
  const safeRoot = await assertDisposableRoot(root, false);
  let dispatchLock;
  try {
    dispatchLock = await acquireDispatchLock(safeRoot);
    const entries = await assertLedgerLayout(safeRoot, true);
    if (!entries.includes(HOST_LAUNCH_LOCK)) return { root: safeRoot, classification: "no-host-launch-lock", changed: false, provider_authority_permitted: false };
    const context = await readLedgerContext(safeRoot, allowTestOnly, true);
    const expectedState = context.approval.state === "test-only-provider-unreachable" ? "consumed-test-only-provider-unreachable" : "consumed-provider-reachable-handoff-started";
    const activePath = await optionalPhysicalFile(path.join(safeRoot, ACTIVE_DISPATCH), safeRoot, "active dispatch");
    if (!activePath) fail("HOST_LOCK_IDENTITY_MISMATCH", "A retained host launch lock requires one active dispatch");
    const active = validateDispatchCheckpoint(await readCanonicalJson(activePath, "active dispatch"), expectedState);
    const handoffPath = await optionalPhysicalFile(path.join(safeRoot, HANDOFFS_DIR, `${active.reservation_key}.json`), path.join(safeRoot, HANDOFFS_DIR), "durable provider handoff");
    if (!handoffPath) fail("HOST_LOCK_IDENTITY_MISMATCH", "A retained host launch lock requires its durable provider handoff");
    const handoff = validateDurableHandoffRecord(await readCanonicalJson(handoffPath, "durable provider handoff"), active);
    const retained = await readPhysicalHostLaunchLock(safeRoot);
    const value = retained.value;
    if (expectedRunId !== value.run_id || expectedRunId !== active.run_id) {
      fail("RUN_IDENTITY_MISMATCH", "Host-lock recovery cannot settle a different run's retained launch state");
    }
    if (value.normalized_ledger_root !== safeRoot.toLowerCase() || value.activation_sha256 !== active.activation_sha256
      || value.run_id !== active.run_id || value.dispatch_sha256 !== active.dispatch_sha256
      || value.durable_handoff_sha256 !== handoff.durable_handoff_sha256 || value.nonce !== handoff.handoff_nonce) {
      fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lock does not bind the exact active dispatch and durable handoff");
    }
    if (processIsLive(value.parent_pid) || (value.child_pid !== null && processIsLive(value.child_pid))) {
      fail("HOST_LAUNCH_CONCURRENT", "A retained host launch lock still has a live or PID-reused owner");
    }
    const current = await lstat(retained.target, { bigint: true });
    if (current.dev !== retained.dev || current.ino !== retained.ino || current.nlink !== 1n) fail("HOST_LOCK_OWNERSHIP_LOST", "Host launch lock was replaced before recovery cleanup");
    await rm(retained.target);
    return {
      root: safeRoot,
      classification: "dead-host-launch-lock-removed-before-no-replay-settlement",
      changed: true,
      lifecycle_state: value.state,
      run_id: value.run_id,
      dispatch_sha256: value.dispatch_sha256,
      request_kind: active.request_kind,
      child_sequence: active.child_sequence,
      provider_authority_permitted: false,
    };
  } finally {
    if (dispatchLock) await releaseDispatchLock(safeRoot, dispatchLock);
  }
}

export async function recoverRc7GateCHostLaunchLock(root, expectedRunId) {
  return recoverHostLaunchLock(root, expectedRunId, false);
}

async function initializeLedger(root, allowTestOnly) {
  const safeRoot = await assertDisposableRoot(root, false);
  let lock;
  try {
    lock = await acquireDispatchLock(safeRoot);
    const entries = (await readdir(safeRoot)).sort();
    const allowed = new Set([OPERATOR_APPROVAL, LEDGER_META, RESERVATIONS_DIR, TERMINALS_DIR, HANDOFFS_DIR, DOCKER_CONFIG_DIR, DISPATCH_LOCK]);
    if (!entries.includes(OPERATOR_APPROVAL) || entries.some((entry) => !allowed.has(entry))) fail("UNKNOWN_RESIDUE", "Ledger initialization requires only the durable operator approval and its own exact state");
    const approval = await readCanonicalJson(path.join(safeRoot, OPERATOR_APPROVAL), "operator approval record");
    const freeze = await freezeForApprovalRecord(safeRoot, approval, allowTestOnly);
    await validateOperatorApprovalRecordAgainstFreeze(approval, freeze, safeRoot, allowTestOnly);
    const activation = activationForApproval(freeze, approval);
    for (const directory of [RESERVATIONS_DIR, TERMINALS_DIR, HANDOFFS_DIR, DOCKER_CONFIG_DIR]) {
      const target = path.join(safeRoot, directory);
      if (!entries.includes(directory)) await mkdir(target);
      await assertPhysicalDirectory(target, safeRoot, `${directory} directory`);
      if ((await readdir(target)).length !== 0) fail("UNKNOWN_RESIDUE", "A newly initialized ledger cannot inherit reservations or terminals");
    }
    const expectedMeta = ledgerMeta(activation, approval);
    if (entries.includes(LEDGER_META)) validateLedgerMeta(await readCanonicalJson(path.join(safeRoot, LEDGER_META), "ledger metadata"), activation, approval);
    else await writeExclusive(path.join(safeRoot, LEDGER_META), expectedMeta);
    return { root: safeRoot, ledger: expectedMeta, authority_state: approval.state, provider_reachable: approval.state === "operator-approved" };
  } finally {
    if (lock) await releaseDispatchLock(safeRoot, lock);
  }
}

export async function initializeRc7GateCDispatchLedger(root) {
  return initializeLedger(root, false);
}

async function authorizeDispatch(root, intent, allowTestOnly) {
  validateRc7GateCRequestIntent(intent);
  const context = await readLedgerContext(root, allowTestOnly);
  const testOnly = context.approval.state === "test-only-provider-unreachable";
  if (testOnly && !allowTestOnly) fail("NUMERIC_APPROVAL_REQUIRED", "A test-only approval grants no provider authority");
  return buildDispatchPermit(intent, context.activation, testOnly ? "reserved-test-only-provider-unreachable" : "reserved-provider-reachable-once");
}

export async function authorizeRc7GateCProviderDispatch(root, intent) {
  return authorizeDispatch(root, intent, false);
}

async function sealDispatchRequest(root, input, allowTestOnly) {
  exactKeys(input, ["dispatch_sha256", "request"], "sealed dispatch request input");
  exactKeys(input.request, ["intent", "semantic_request", "semantic_request_bytes"], "broker request construction");
  const safeRoot = await assertDisposableRoot(root, false);
  let lock;
  try {
    lock = await acquireDispatchLock(safeRoot);
    const context = await readLedgerContext(safeRoot, allowTestOnly);
    const testOnly = context.approval.state === "test-only-provider-unreachable";
    if (testOnly && !allowTestOnly) fail("NUMERIC_APPROVAL_REQUIRED", "A test-only approval grants no sealed provider request authority");
    const expectedState = testOnly ? "consumed-test-only-provider-unreachable" : "consumed-provider-reachable-handoff-started";
    const dispatch = validateDispatchCheckpoint(await readCanonicalJson(path.join(safeRoot, ACTIVE_DISPATCH), "active dispatch"), expectedState);
    if (dispatch.dispatch_sha256 !== input.dispatch_sha256) fail("RECOVERY_IDENTITY_MISMATCH", "Sealed request and active dispatch identities differ");
    const intent = validateRc7GateCRequestIntent(input.request.intent);
    const semantic = validateRc7GateCSemanticRequest(input.request.semantic_request);
    if (!Buffer.isBuffer(input.request.semantic_request_bytes) || !input.request.semantic_request_bytes.equals(semantic.bytes)
      || intent.semantic_request_sha256 !== semantic.sha256 || intent.semantic_request_byte_count !== semantic.byte_count
      || dispatch.intent_sha256 !== intent.intent_sha256 || dispatch.semantic_request_sha256 !== semantic.sha256) fail("SEALED_REQUEST_MISMATCH", "Only the exact broker-constructed semantic request can be sealed");
    const permit = buildDispatchPermit(intent, context.activation, testOnly ? "reserved-test-only-provider-unreachable" : "reserved-provider-reachable-once");
    if (dispatch.permit_sha256 !== permit.permit_sha256 || dispatch.dispatch_nonce !== permit.dispatch_nonce) fail("PERMIT_IDENTITY_MISMATCH", "Active dispatch does not derive from the current exact permit");
    const value = withDigest({
      schema_version: "rc7-gate-c-sealed-worker-request-v1",
      activation_sha256: context.activation.activation_sha256,
      preregistration_sha256: context.activation.preregistration_sha256,
      broker_package_sha256: context.activation.broker_package_sha256,
      worker_package_sha256: context.activation.worker_package_sha256,
      scorer_contract_sha256: context.activation.scorer_contract_sha256,
      intent,
      permit,
      semantic_request: semantic.value,
      semantic_request_sha256: semantic.sha256,
      semantic_request_byte_count: semantic.byte_count,
    }, "sealed_request_sha256");
    validateRc7GateCSealedWorkerRequest(value, {
      activation_sha256: context.activation.activation_sha256,
      broker_package_sha256: context.activation.broker_package_sha256,
      preregistration_sha256: context.activation.preregistration_sha256,
      scorer_contract_sha256: context.activation.scorer_contract_sha256,
      worker_package_sha256: context.activation.worker_package_sha256,
    }, permit.state);
    return value;
  } finally {
    if (lock) await releaseDispatchLock(safeRoot, lock);
  }
}

export async function sealRc7GateCDispatchRequest(root, input) {
  return sealDispatchRequest(root, input, false);
}

function validateDispatchCheckpoint(dispatch, expectedState) {
  exactKeys(dispatch, [
    "schema_version", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id", "case_id",
    "arm", "selected_route", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key",
    "reservation_ordinal", "state", "dispatch_sha256",
  ], "dispatch checkpoint");
  if (dispatch.schema_version !== "rc7-gate-c-dispatch-checkpoint-v2" || dispatch.state !== expectedState
    || !HASH.test(dispatch.activation_sha256 ?? "") || !HASH.test(dispatch.intent_sha256 ?? "") || !HASH.test(dispatch.permit_sha256 ?? "")
    || !HASH.test(dispatch.dispatch_nonce ?? "") || !HASH.test(dispatch.run_id ?? "") || !HASH.test(dispatch.semantic_request_sha256 ?? "")
    || !HASH.test(dispatch.reservation_key ?? "") || !["LAB-01", "PAPER-01", "REPO-01", "FACT-01", "FACT-03", "SAFE-01"].includes(dispatch.case_id)
    || !["rc-direct", "rc-rlm"].includes(dispatch.arm) || !["rc-direct", "rc-rlm"].includes(dispatch.selected_route)
    || !["top-level", "recursive-child"].includes(dispatch.request_kind) || !Number.isSafeInteger(dispatch.child_sequence)
    || !Number.isSafeInteger(dispatch.reservation_ordinal) || dispatch.reservation_ordinal < 1 || dispatch.reservation_ordinal > 72
    || dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(dispatch, "dispatch_sha256")))) fail("RECOVERY_IDENTITY_MISMATCH", "Dispatch checkpoint is malformed or mismatched");
  return dispatch;
}

async function consumeReservation(root, { intent, permit }, allowTestOnly) {
  const safeRoot = await assertDisposableRoot(root, false);
  let lock;
  try {
    lock = await acquireDispatchLock(safeRoot);
    const context = await readLedgerContext(safeRoot, allowTestOnly);
    const testOnly = context.approval.state === "test-only-provider-unreachable";
    const expectedPermit = buildDispatchPermit(intent, context.activation, testOnly ? "reserved-test-only-provider-unreachable" : "reserved-provider-reachable-once");
    if (canonicalJsonV1(permit) !== canonicalJsonV1(expectedPermit)) fail("PERMIT_IDENTITY_MISMATCH", "Dispatch permit was not fully derived from the current durable approval, ledger, and intent");
    const entries = (await readdir(safeRoot)).sort();
    if (entries.includes(ACTIVE_DISPATCH)) fail("CONCURRENT_DISPATCH_EXCLUDED", "An earlier provider-reachable dispatch is not terminal");
    const reservations = await readdir(path.join(safeRoot, RESERVATIONS_DIR));
    if (reservations.length >= 72) fail("GLOBAL_REQUEST_BUDGET_EXCEEDED", "Global provider request ceiling is exhausted");
    const key = reservationKey(intent);
    const reservationPath = path.join(safeRoot, RESERVATIONS_DIR, `${key}.json`);
    try { await lstat(reservationPath); fail("DUPLICATE_RESERVATION", "This run/request/sequence was already consumed"); } catch (error) {
      if (error instanceof Rc7GateCBrokerError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    const dispatch = withDigest({
      schema_version: "rc7-gate-c-dispatch-checkpoint-v2",
      activation_sha256: permit.activation_sha256,
      intent_sha256: intent.intent_sha256,
      permit_sha256: permit.permit_sha256,
      dispatch_nonce: permit.dispatch_nonce,
      run_id: intent.run_id,
      case_id: intent.case_id,
      arm: intent.arm,
      selected_route: intent.selected_route,
      request_kind: intent.request_kind,
      child_sequence: intent.child_sequence,
      semantic_request_sha256: intent.semantic_request_sha256,
      reservation_key: key,
      reservation_ordinal: reservations.length + 1,
      state: testOnly ? "consumed-test-only-provider-unreachable" : "consumed-provider-reachable-handoff-started",
    }, "dispatch_sha256");
    await writeExclusive(reservationPath, dispatch);
    await writeExclusive(path.join(safeRoot, ACTIVE_DISPATCH), dispatch);
    return dispatch;
  } finally {
    if (lock) {
      await releaseDispatchLock(safeRoot, lock);
    }
  }
}

export async function consumeRc7GateCDispatchReservation(root, input) {
  return consumeReservation(root, input, false);
}

function validateSealedResult(sealed, dispatch) {
  exactKeys(sealed, [
    "schema_version", "state", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce",
    "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256",
    "sealed_result_sha256",
  ], "sealed result");
  for (const key of ["activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce", "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256", "sealed_result_sha256"]) if (!HASH.test(sealed[key] ?? "")) fail("RECOVERY_IDENTITY_MISMATCH", `Sealed result ${key} is malformed`);
  if (sealed.schema_version !== "rc7-gate-c-sealed-worker-result-v1" || sealed.state !== "trusted-sealed"
    || sealed.activation_sha256 !== dispatch.activation_sha256 || sealed.intent_sha256 !== dispatch.intent_sha256
    || sealed.permit_sha256 !== dispatch.permit_sha256 || sealed.dispatch_nonce !== dispatch.dispatch_nonce
    || sealed.sealed_result_sha256 !== sha256V1(canonicalJsonV1(projection(sealed, "sealed_result_sha256")))) fail("RECOVERY_IDENTITY_MISMATCH", "Full sealed result does not close over the durable dispatch and artifact identities");
  return sealed;
}

function terminalProjection(value) {
  return projection(value, "terminal_sha256");
}

function routeObservationProjection(value) {
  return projection(value, "observation_sha256");
}

function buildTrustedRouteObservation(dispatch, sealedResult) {
  return withDigest({
    schema_version: "rc7-gate-c-trusted-route-observation-v1",
    route_identity_valid: true,
    run_id: dispatch.run_id,
    case_id: dispatch.case_id,
    arm: dispatch.arm,
    selected_route: dispatch.selected_route,
    request_kind: dispatch.request_kind,
    child_sequence: dispatch.child_sequence,
    semantic_request_sha256: dispatch.semantic_request_sha256,
    raw_artifact_sha256: sealedResult.artifact_sha256,
  }, "observation_sha256");
}

function validateTrustedRouteObservation(observation, dispatch, sealedResult) {
  exactKeys(observation, [
    "schema_version", "route_identity_valid", "run_id", "case_id", "arm", "selected_route", "request_kind",
    "child_sequence", "semantic_request_sha256", "raw_artifact_sha256", "observation_sha256",
  ], "trusted route observation");
  const expected = buildTrustedRouteObservation(dispatch, sealedResult);
  if (canonicalJsonV1(observation) !== canonicalJsonV1(expected)
    || observation.observation_sha256 !== sha256V1(canonicalJsonV1(routeObservationProjection(observation)))) fail("RECOVERY_IDENTITY_MISMATCH", "Trusted route observation is not broker-derived from the durable dispatch and sealed artifact");
  return observation;
}

function buildIndeterminateTerminal(dispatch) {
  return withDigest({
    schema_version: "rc7-gate-c-dispatch-terminal-v3",
    state: "indeterminate-no-replay",
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
    permit_sha256: dispatch.permit_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    reservation_key: dispatch.reservation_key,
    sealed_result: null,
    trusted_observation: null,
    accounting_observation: null,
    reason: "provider-reachable-or-consumed-without-trusted-sealed-result",
  }, "terminal_sha256");
}

function buildTrustedAccountingObservation(dispatch, sealedResult, evidence) {
  exactKeys(evidence, ["gate_b", "observations", "usage"], "trusted accounting evidence");
  validateGateBReference(evidence.gate_b, dispatch);
  exactKeys(evidence.observations, ["adapter_revision", "automatic_retry_count", "model", "oauth_refresh_posts", "provider", "provider_active_milliseconds", "provider_posts", "reasoning"], "trusted provider observations");
  exactKeys(evidence.usage, ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens", "reasoning_tokens", "schema_version"], "trusted provider usage");
  const observations = evidence.observations;
  const usage = evidence.usage;
  if (observations.provider !== "openai-codex" || observations.model !== "gpt-5.6-sol" || observations.reasoning !== "xhigh"
    || observations.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision || observations.provider_posts !== 1
    || ![0, 1].includes(observations.oauth_refresh_posts) || observations.automatic_retry_count !== 0
    || !Number.isSafeInteger(observations.provider_active_milliseconds) || observations.provider_active_milliseconds < 0
    || observations.provider_active_milliseconds > (dispatch.request_kind === "recursive-child" ? 120_000 : 300_000)
    || usage.schema_version !== "rc7-gate-c-sanitized-usage-v1") fail("RECOVERY_IDENTITY_MISMATCH", "Trusted provider accounting observations mismatch the frozen authority");
  for (const key of ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens"]) if (!Number.isSafeInteger(usage[key]) || usage[key] < 0) fail("RECOVERY_IDENTITY_MISMATCH", "Trusted provider usage is malformed");
  if (usage.reasoning_tokens !== null && (!Number.isSafeInteger(usage.reasoning_tokens) || usage.reasoning_tokens < 0)) fail("RECOVERY_IDENTITY_MISMATCH", "Trusted reasoning usage is malformed");
  const inputTokens = usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens;
  const outputTokens = usage.output_tokens + (usage.reasoning_tokens ?? 0);
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > 32_768
    || !Number.isSafeInteger(outputTokens) || outputTokens < 0 || outputTokens > 128_000
    || sealedResult.usage_sha256 !== sha256V1(`${canonicalJsonV1(usage)}\n`)
    || sealedResult.authority_sha256 !== sha256V1(canonicalJsonV1({ gate_b: evidence.gate_b, observations }))) fail("RECOVERY_IDENTITY_MISMATCH", "Trusted provider accounting is not sealed by the retained result");
  return withDigest({
    schema_version: "rc7-gate-c-trusted-accounting-observation-v1",
    gate_b: structuredClone(evidence.gate_b),
    observations: structuredClone(observations),
    usage: structuredClone(usage),
    provider_posts: observations.provider_posts,
    oauth_refresh_posts: observations.oauth_refresh_posts,
    automatic_retry_count: observations.automatic_retry_count,
    provider_active_milliseconds: observations.provider_active_milliseconds,
    input_tokens: inputTokens,
    output_plus_reasoning_tokens: outputTokens,
  }, "accounting_observation_sha256");
}

function validateTrustedAccountingObservation(value, dispatch, sealedResult) {
  exactKeys(value, [
    "schema_version", "gate_b", "observations", "usage", "provider_posts", "oauth_refresh_posts", "automatic_retry_count",
    "provider_active_milliseconds", "input_tokens", "output_plus_reasoning_tokens", "accounting_observation_sha256",
  ], "trusted accounting observation");
  const expected = buildTrustedAccountingObservation(dispatch, sealedResult, { gate_b: value.gate_b, observations: value.observations, usage: value.usage });
  if (canonicalJsonV1(value) !== canonicalJsonV1(expected)) fail("RECOVERY_IDENTITY_MISMATCH", "Trusted accounting observation is not deterministically derived from sealed provider evidence");
  return value;
}

function buildTrustedTerminal(dispatch, sealedResult, accountingEvidence, allowTestOnly) {
  validateSealedResult(sealedResult, dispatch);
  return withDigest({
    schema_version: "rc7-gate-c-dispatch-terminal-v3",
    state: "trusted-sealed",
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
    permit_sha256: dispatch.permit_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    reservation_key: dispatch.reservation_key,
    sealed_result: sealedResult,
    trusted_observation: buildTrustedRouteObservation(dispatch, sealedResult),
    accounting_observation: allowTestOnly ? null : buildTrustedAccountingObservation(dispatch, sealedResult, accountingEvidence),
    reason: null,
  }, "terminal_sha256");
}

function validateTerminalRecord(terminal, dispatch) {
  exactKeys(terminal, [
    "schema_version", "state", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_sha256",
    "reservation_key", "sealed_result", "trusted_observation", "accounting_observation", "reason", "terminal_sha256",
  ], "dispatch terminal");
  if (terminal.schema_version !== "rc7-gate-c-dispatch-terminal-v3" || !["trusted-sealed", "indeterminate-no-replay"].includes(terminal.state)
    || terminal.activation_sha256 !== dispatch.activation_sha256 || terminal.intent_sha256 !== dispatch.intent_sha256
    || terminal.permit_sha256 !== dispatch.permit_sha256 || terminal.dispatch_sha256 !== dispatch.dispatch_sha256
    || terminal.reservation_key !== dispatch.reservation_key || terminal.terminal_sha256 !== sha256V1(canonicalJsonV1(terminalProjection(terminal)))) fail("RECOVERY_IDENTITY_MISMATCH", "Dispatch terminal does not match the durable dispatch");
  if (terminal.state === "trusted-sealed") {
    if (terminal.reason !== null) fail("RECOVERY_IDENTITY_MISMATCH", "Trusted terminal cannot carry an indeterminate reason");
    validateSealedResult(terminal.sealed_result, dispatch);
    validateTrustedRouteObservation(terminal.trusted_observation, dispatch, terminal.sealed_result);
    if (dispatch.state === "consumed-test-only-provider-unreachable") {
      if (terminal.accounting_observation !== null) fail("RECOVERY_IDENTITY_MISMATCH", "Provider-unreachable test terminals cannot claim provider accounting");
    } else validateTrustedAccountingObservation(terminal.accounting_observation, dispatch, terminal.sealed_result);
  } else if (terminal.sealed_result !== null || terminal.trusted_observation !== null || terminal.accounting_observation !== null
    || terminal.reason !== "provider-reachable-or-consumed-without-trusted-sealed-result") fail("RECOVERY_IDENTITY_MISMATCH", "Indeterminate terminal cannot claim a sealed result or trusted accounting");
  return terminal;
}

function validateDurableHandoffRecord(value, dispatch) {
  exactKeys(value, [
    "schema_version", "state", "activation_sha256", "dispatch_sha256", "reservation_key", "handoff_nonce",
    "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256",
  ], "durable provider handoff");
  if (value.schema_version !== "rc7-gate-c-durable-provider-handoff-v1"
    || value.state !== "preflight-consumed-provider-reachability-committed"
    || value.activation_sha256 !== dispatch.activation_sha256 || value.dispatch_sha256 !== dispatch.dispatch_sha256
    || value.reservation_key !== dispatch.reservation_key || !HASH.test(value.handoff_nonce ?? "")
    || !HASH.test(value.sealed_request_sha256 ?? "") || !HASH.test(value.gate_b_attestation_sha256 ?? "")
    || value.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(value, "durable_handoff_sha256")))) fail("RECOVERY_IDENTITY_MISMATCH", "Durable provider handoff does not match its exact reservation");
  return value;
}

async function closeReservation(root, dispatch, outcome, allowTestOnly) {
  const safeRoot = await assertDisposableRoot(root, false);
  let lock;
  try {
    lock = await acquireDispatchLock(safeRoot);
    const context = await readLedgerContext(safeRoot, allowTestOnly);
    const expectedState = context.approval.state === "test-only-provider-unreachable" ? "consumed-test-only-provider-unreachable" : "consumed-provider-reachable-handoff-started";
    validateDispatchCheckpoint(dispatch, expectedState);
    const reservation = await readCanonicalJson(path.join(safeRoot, RESERVATIONS_DIR, `${dispatch.reservation_key}.json`), "dispatch reservation");
    if (canonicalJsonV1(reservation) !== canonicalJsonV1(dispatch)) fail("RECOVERY_IDENTITY_MISMATCH", "Reservation and supplied dispatch differ");
    exactKeys(outcome, ["accounting", "sealed_result", "state"], "dispatch close outcome");
    let terminal;
    if (outcome.state === "trusted-sealed") terminal = buildTrustedTerminal(dispatch, outcome.sealed_result, outcome.accounting, allowTestOnly);
    else if (outcome.state === "indeterminate-no-replay" && outcome.sealed_result === null && outcome.accounting === null) terminal = buildIndeterminateTerminal(dispatch);
    else fail("RECOVERY_IDENTITY_MISMATCH", "Close outcome must be one trusted sealed result or one indeterminate no-replay state");
    const terminalPath = path.join(safeRoot, TERMINALS_DIR, `${dispatch.reservation_key}.json`);
    const retainedTerminalPath = await optionalPhysicalFile(terminalPath, path.join(safeRoot, TERMINALS_DIR), "dispatch terminal");
    if (retainedTerminalPath) {
      const retained = await readCanonicalJson(retainedTerminalPath, "dispatch terminal");
      if (canonicalJsonV1(retained) !== canonicalJsonV1(terminal)) fail("RECOVERY_IDENTITY_MISMATCH", "A different terminal already closed this reservation");
    } else {
      const active = await readCanonicalJson(path.join(safeRoot, ACTIVE_DISPATCH), "active dispatch");
      if (canonicalJsonV1(active) !== canonicalJsonV1(dispatch)) fail("RECOVERY_IDENTITY_MISMATCH", "Active dispatch checkpoint mismatched");
      await writeExclusive(terminalPath, terminal);
    }
    await rm(path.join(safeRoot, ACTIVE_DISPATCH), { force: true });
    return terminal;
  } finally {
    if (lock) {
      await releaseDispatchLock(safeRoot, lock);
    }
  }
}

export async function closeRc7GateCDispatchReservation(root, dispatch, terminal) {
  return closeReservation(root, dispatch, terminal, false);
}

export function classifyRc7GateCRecovery(checkpoints) {
  exactKeys(checkpoints, ["dispatch", "intent", "publication", "sealed_result"], "recovery checkpoints");
  const intent = validateRc7GateCRequestIntent(checkpoints.intent);
  if (checkpoints.dispatch === null) {
    if (checkpoints.sealed_result !== null || checkpoints.publication !== null) fail("RECOVERY_IDENTITY_MISMATCH", "Result or publication exists without dispatch");
    return { classification: "pre-dispatch-resumable", provider_reachable_dispatches: 0, replay_permitted: false, next_action: "await-exact-activation-or-abandon" };
  }
  const dispatch = validateDispatchCheckpoint(checkpoints.dispatch, "consumed-provider-reachable-handoff-started");
  if (dispatch.intent_sha256 !== intent.intent_sha256) fail("RECOVERY_IDENTITY_MISMATCH", "Dispatch checkpoint mismatched");
  if (checkpoints.sealed_result === null) {
    if (checkpoints.publication !== null) fail("RECOVERY_IDENTITY_MISMATCH", "Publication exists without a sealed result");
    return { classification: "indeterminate-unsealed-stop", provider_reachable_dispatches: 1, replay_permitted: false, next_action: "record-terminal-no-replay" };
  }
  const sealed = validateSealedResult(checkpoints.sealed_result, dispatch);
  if (checkpoints.publication === null) return { classification: "sealed-publication-resumable", provider_reachable_dispatches: 1, replay_permitted: false, next_action: "publish-without-redispatch" };
  exactKeys(checkpoints.publication, ["sealed_result_sha256", "state"], "publication checkpoint");
  if (checkpoints.publication.sealed_result_sha256 !== sealed.sealed_result_sha256 || checkpoints.publication.state !== "complete") fail("RECOVERY_IDENTITY_MISMATCH", "Publication checkpoint mismatched");
  return { classification: "complete", provider_reachable_dispatches: 1, replay_permitted: false, next_action: "none" };
}

async function inspectLedger(root, allowTestOnly) {
  const safeRoot = await assertDisposableRoot(root, false);
  let lock;
  try {
    lock = await acquireDispatchLock(safeRoot);
    const context = await readLedgerContext(safeRoot, allowTestOnly);
    const expectedState = context.approval.state === "test-only-provider-unreachable" ? "consumed-test-only-provider-unreachable" : "consumed-provider-reachable-handoff-started";
    const reservations = new Map();
    for (const entry of (await readdir(path.join(safeRoot, RESERVATIONS_DIR))).sort()) {
      const dispatch = validateDispatchCheckpoint(await readCanonicalJson(path.join(safeRoot, RESERVATIONS_DIR, entry), "dispatch reservation"), expectedState);
      if (`${dispatch.reservation_key}.json` !== entry) fail("RECOVERY_IDENTITY_MISMATCH", "Reservation filename and identity differ");
      reservations.set(dispatch.reservation_key, dispatch);
    }
    const terminals = new Map();
    for (const entry of (await readdir(path.join(safeRoot, TERMINALS_DIR))).sort()) {
      const key = entry.slice(0, -5);
      const dispatch = reservations.get(key);
      if (!dispatch) fail("RECOVERY_IDENTITY_MISMATCH", "Terminal exists without a durable reservation");
      const terminal = validateTerminalRecord(await readCanonicalJson(path.join(safeRoot, TERMINALS_DIR, entry), "dispatch terminal"), dispatch);
      terminals.set(key, terminal);
    }
    const handoffs = new Map();
    for (const entry of (await readdir(path.join(safeRoot, HANDOFFS_DIR))).sort()) {
      const key = entry.slice(0, -5);
      const dispatch = reservations.get(key);
      if (!dispatch) fail("RECOVERY_IDENTITY_MISMATCH", "Durable handoff exists without a reservation");
      const handoff = validateDurableHandoffRecord(await readCanonicalJson(path.join(safeRoot, HANDOFFS_DIR, entry), "durable provider handoff"), dispatch);
      handoffs.set(key, handoff);
    }
    const activePath = await optionalPhysicalFile(path.join(safeRoot, ACTIVE_DISPATCH), safeRoot, "active dispatch");
    const active = activePath ? validateDispatchCheckpoint(await readCanonicalJson(activePath, "active dispatch"), expectedState) : null;
    if (active && canonicalJsonV1(reservations.get(active.reservation_key)) !== canonicalJsonV1(active)) fail("RECOVERY_IDENTITY_MISMATCH", "Active dispatch is not its exact reservation");
    const unterminated = [...reservations.keys()].filter((key) => !terminals.has(key));
    if (unterminated.length > 1 || (active && unterminated.length === 1 && unterminated[0] !== active.reservation_key)) fail("RECOVERY_IDENTITY_MISMATCH", "Ledger contains multiple or conflicting unterminated reservations");
    return {
      context,
      reservations,
      terminals,
      handoffs,
      active,
      state: active || unterminated.length ? "recovery-required-no-replay" : "settled",
      counts: { reservations: reservations.size, terminals: terminals.size, active_dispatches: active ? 1 : 0, unterminated: unterminated.length },
    };
  } finally {
    if (lock) await releaseDispatchLock(safeRoot, lock);
  }
}

export async function inspectRc7GateCDispatchLedger(root) {
  const result = await inspectLedger(root, false);
  return { root: result.context.root, state: result.state, counts: result.counts, authority_state: result.context.approval.state, replay_permitted: false };
}

async function extractLedgerAccounting(root, allowTestOnly) {
  const result = await inspectLedger(root, allowTestOnly);
  if (result.state !== "settled") fail("RECOVERY_REQUIRED", "Authority accounting requires a fully settled no-replay ledger");
  const entries = [...result.reservations.values()].sort((left, right) => left.reservation_ordinal - right.reservation_ordinal).map((dispatch) => {
    const terminal = result.terminals.get(dispatch.reservation_key);
    if (!terminal) fail("RECOVERY_IDENTITY_MISMATCH", "Settled authority accounting found an unterminated reservation");
    const handoff = result.handoffs.get(dispatch.reservation_key) ?? null;
    const exact = terminal.state === "trusted-sealed" ? terminal.accounting_observation : null;
    if (exact && (!handoff || exact.gate_b.attestation_sha256 !== handoff.gate_b_attestation_sha256)) fail("RECOVERY_IDENTITY_MISMATCH", "Trusted accounting observation is not bound to the durable provider handoff");
    const committed = handoff !== null;
    return {
      reservation_ordinal: dispatch.reservation_ordinal,
      reservation_key: dispatch.reservation_key,
      run_id: dispatch.run_id,
      case_id: dispatch.case_id,
      arm: dispatch.arm,
      selected_route: dispatch.selected_route,
      request_kind: dispatch.request_kind,
      child_sequence: dispatch.child_sequence,
      semantic_request_sha256: dispatch.semantic_request_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      terminal_state: terminal.state,
      terminal_sha256: terminal.terminal_sha256,
      sealed_result_sha256: terminal.sealed_result?.sealed_result_sha256 ?? null,
      artifact_sha256: terminal.sealed_result?.artifact_sha256 ?? null,
      usage_sha256: terminal.sealed_result?.usage_sha256 ?? null,
      provenance_sha256: terminal.sealed_result?.provenance_sha256 ?? null,
      permission_sha256: terminal.sealed_result?.permission_sha256 ?? null,
      authority_sha256: terminal.sealed_result?.authority_sha256 ?? null,
      cleanup_sha256: terminal.sealed_result?.cleanup_sha256 ?? null,
      trusted_route_observation_sha256: terminal.trusted_observation?.observation_sha256 ?? null,
      durable_handoff_sha256: handoff?.durable_handoff_sha256 ?? null,
      gate_b_attestation_sha256: handoff?.gate_b_attestation_sha256 ?? null,
      provider_reachability_committed: committed,
      accounting_basis: exact ? "exact-sealed-provider-observation" : committed ? "conservative-upper-bound-after-indeterminate-handoff" : "exact-no-provider-handoff",
      provider_posts: exact?.provider_posts ?? (committed ? 1 : 0),
      oauth_refresh_posts: exact?.oauth_refresh_posts ?? (committed ? 1 : 0),
      automatic_retry_count: exact?.automatic_retry_count ?? 0,
      provider_active_milliseconds: exact?.provider_active_milliseconds
        ?? (committed ? (dispatch.request_kind === "recursive-child" ? 120_000 : 300_000) : 0),
      input_tokens: exact?.input_tokens ?? (committed ? 32_768 : 0),
      accepted_output_plus_reasoning_tokens: exact?.output_plus_reasoning_tokens ?? 0,
      hard_output_plus_reasoning_token_accounting: exact?.output_plus_reasoning_tokens ?? (committed ? 128_000 : 0),
    };
  });
  const value = {
    schema_version: "rc7-gate-c-ledger-accounting-v6",
    state: "settled-broker-derived",
    activation_sha256: result.context.activation.activation_sha256,
    preregistration_sha256: result.context.activation.preregistration_sha256,
    ledger_root_identity: structuredClone(result.context.activation.ledger_root_identity),
    results_root_identity: structuredClone(result.context.activation.results_root_identity),
    ledger_instance_sha256: result.context.meta.ledger_instance_sha256,
    operator_approval_record_sha256: result.context.approval.operator_approval_record_sha256,
    entries,
  };
  return withDigest(value, "accounting_sha256");
}

export async function extractRc7GateCLedgerAccounting(root) {
  return extractLedgerAccounting(root, false);
}

async function extractTrustedObservations(root, allowTestOnly, requireComplete) {
  const result = await inspectLedger(root, allowTestOnly);
  if (result.state !== "settled") fail("RECOVERY_REQUIRED", "Aggregation extraction requires a fully settled no-replay ledger");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const rows = new Map(preregistration.ablation.schedule.map((row) => [row.run_id, row]));
  const observations = [];
  for (const terminal of result.terminals.values()) {
    if (terminal.state !== "trusted-sealed" || terminal.trusted_observation.request_kind !== "top-level") continue;
    const observation = terminal.trusted_observation;
    const row = rows.get(observation.run_id);
    if (!row || row.case_id !== observation.case_id || row.arm !== observation.arm || row.selected_route !== observation.selected_route
      || observation.child_sequence !== 0 || observation.raw_artifact_sha256 !== terminal.sealed_result.artifact_sha256
      || observation.route_identity_valid !== true) fail("AGGREGATION_IDENTITY_MISMATCH", "Trusted observation does not derive from the current schedule and sealed artifact");
    observations.push(observation);
  }
  observations.sort((left, right) => rows.get(left.run_id).randomized_order - rows.get(right.run_id).randomized_order);
  if (new Set(observations.map((item) => item.run_id)).size !== observations.length || (requireComplete && observations.length !== 36)) fail("AGGREGATION_IDENTITY_MISMATCH", "Aggregation requires exactly one broker-derived trusted top-level observation for every frozen run ID");
  const value = {
    schema_version: "rc7-gate-c-trusted-aggregation-observations-v1",
    state: requireComplete ? "complete-36-broker-derived" : "test-only-partial-provider-unreachable",
    preregistration_sha256: preregistration.preregistration_sha256,
    observations,
  };
  value.observations_sha256 = sha256V1(canonicalJsonV1(value));
  return value;
}

export async function extractRc7GateCTrustedAggregationObservations(root) {
  return extractTrustedObservations(root, false, true);
}

async function recoverLedger(root, allowTestOnly) {
  const safeRoot = await assertDisposableRoot(root, false);
  let lock;
  try {
    lock = await acquireDispatchLock(safeRoot);
    const context = await readLedgerContext(safeRoot, allowTestOnly);
    const expectedState = context.approval.state === "test-only-provider-unreachable" ? "consumed-test-only-provider-unreachable" : "consumed-provider-reachable-handoff-started";
    const reservations = [];
    for (const entry of (await readdir(path.join(safeRoot, RESERVATIONS_DIR))).sort()) reservations.push(validateDispatchCheckpoint(await readCanonicalJson(path.join(safeRoot, RESERVATIONS_DIR, entry), "dispatch reservation"), expectedState));
    const terminalKeys = new Set((await readdir(path.join(safeRoot, TERMINALS_DIR))).map((entry) => entry.slice(0, -5)));
    const unterminated = reservations.filter((dispatch) => !terminalKeys.has(dispatch.reservation_key));
    if (unterminated.length > 1) fail("RECOVERY_IDENTITY_MISMATCH", "Concurrent recovery cannot choose among multiple unterminated reservations");
    const activePath = await optionalPhysicalFile(path.join(safeRoot, ACTIVE_DISPATCH), safeRoot, "active dispatch");
    if (activePath) {
      const active = validateDispatchCheckpoint(await readCanonicalJson(activePath, "active dispatch"), expectedState);
      if (terminalKeys.has(active.reservation_key)) {
        validateTerminalRecord(await readCanonicalJson(path.join(safeRoot, TERMINALS_DIR, `${active.reservation_key}.json`), "dispatch terminal"), active);
        await rm(path.join(safeRoot, ACTIVE_DISPATCH));
        return { root: safeRoot, classification: "terminal-reconciled-no-replay", changed: true, replay_permitted: false };
      }
      if (unterminated.length !== 1 || canonicalJsonV1(active) !== canonicalJsonV1(unterminated[0])) fail("RECOVERY_IDENTITY_MISMATCH", "Active dispatch and unterminated reservation differ");
    }
    if (unterminated.length === 0) {
      return { root: safeRoot, classification: "settled-idempotent", changed: false, replay_permitted: false };
    }
    const dispatch = unterminated[0];
    const terminal = buildIndeterminateTerminal(dispatch);
    await writeExclusive(path.join(safeRoot, TERMINALS_DIR, `${dispatch.reservation_key}.json`), terminal);
    await rm(path.join(safeRoot, ACTIVE_DISPATCH), { force: true });
    return { root: safeRoot, classification: "indeterminate-recorded-no-replay", changed: true, replay_permitted: false, terminal_sha256: terminal.terminal_sha256 };
  } finally {
    if (lock) await releaseDispatchLock(safeRoot, lock);
  }
}

export async function recoverRc7GateCDispatchLedger(root) {
  return recoverLedger(root, false);
}

function validateGateBReference(attestation, expected) {
  exactKeys(attestation, [
    "schema_version", "state", "activation_sha256", "intent_sha256", "dispatch_sha256", "container_id", "attestation_sha256",
  ], "Gate B live reference");
  if (attestation.schema_version !== GATE_B_ATTESTATION_SCHEMA
    || !["not-applicable-direct-route", "not-applicable-top-level-host-provider", "broker-inspect-live-rlm-container"].includes(attestation.state)
    || attestation.activation_sha256 !== expected.activation_sha256 || attestation.intent_sha256 !== expected.intent_sha256
    || attestation.dispatch_sha256 !== expected.dispatch_sha256
    || attestation.attestation_sha256 !== sha256V1(canonicalJsonV1(projection(attestation, "attestation_sha256")))) fail("GATE_B_ATTESTATION_MISMATCH", "Gate B reference is malformed or not bound to the validated durable dispatch");
  if (expected.request_kind === "top-level" && expected.selected_route === "rc-direct") {
    if (attestation.state !== "not-applicable-direct-route" || attestation.container_id !== null) fail("GATE_B_ATTESTATION_MISMATCH", "A direct route must declare exact non-applicability and no container");
  } else if (expected.request_kind === "top-level" && expected.selected_route === "rc-rlm") {
    if (attestation.state !== "not-applicable-top-level-host-provider" || attestation.container_id !== null) fail("GATE_B_ATTESTATION_MISMATCH", "An RLM top-level provider request occurs before and outside the treatment container");
  } else if (expected.request_kind !== "recursive-child" || attestation.state !== "broker-inspect-live-rlm-container" || !/^[0-9a-f]{64}$/u.test(attestation.container_id ?? "")) fail("GATE_B_ATTESTATION_MISMATCH", "Only an RLM recursive child may identify one exact live container for broker-owned inspection");
  return attestation;
}

async function parentTopLevelClosure(root, dispatch, expectedState) {
  if (dispatch.request_kind !== "recursive-child") return null;
  const parentRequest = await buildRc7GateCRequestIntent({
    run_id: dispatch.run_id,
    request_kind: "top-level",
    child_sequence: 0,
    child_question: null,
    excerpt_locator: null,
  });
  const parentKey = reservationKey(parentRequest.intent);
  const parentDispatch = validateDispatchCheckpoint(
    await readCanonicalJson(path.join(root, RESERVATIONS_DIR, `${parentKey}.json`), "parent top-level reservation"),
    expectedState,
  );
  const parentTerminal = validateTerminalRecord(
    await readCanonicalJson(path.join(root, TERMINALS_DIR, `${parentKey}.json`), "parent top-level terminal"),
    parentDispatch,
  );
  if (parentTerminal.state !== "trusted-sealed" || parentDispatch.run_id !== dispatch.run_id
    || parentDispatch.request_kind !== "top-level" || parentDispatch.child_sequence !== 0
    || parentDispatch.intent_sha256 !== parentRequest.intent.intent_sha256
    || parentDispatch.semantic_request_sha256 !== parentRequest.intent.semantic_request_sha256) fail("PARENT_TOP_LEVEL_NOT_TRUSTED", "Recursive child authority requires the exact trusted sealed parent top-level dispatch");
  return {
    activation_sha256: parentDispatch.activation_sha256,
    run_id: parentDispatch.run_id,
    case_id: parentDispatch.case_id,
    arm: parentDispatch.arm,
    selected_route: "rc-rlm",
    intent_sha256: parentDispatch.intent_sha256,
    dispatch_sha256: parentDispatch.dispatch_sha256,
    semantic_request_sha256: parentDispatch.semantic_request_sha256,
    semantic_request: parentRequest.semantic_request,
  };
}

function launcherRootFromInspection(value) {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== "object") fail("GATE_B_DOCKER_INSPECTION_MISMATCH", "Docker must return one exact container inspection");
  const mounts = value[0].Mounts;
  if (!Array.isArray(mounts) || mounts.length !== 3) fail("GATE_B_MOUNT_IDENTITY_MISMATCH", "Gate C requires exactly three launcher binds");
  const byDestination = new Map(mounts.map((entry) => [entry.Destination, entry]));
  if (byDestination.size !== 3) fail("GATE_B_MOUNT_IDENTITY_MISMATCH", "Gate C launcher mount destinations must be unique");
  const source = byDestination.get("/rc7/source");
  const launcher = byDestination.get("/rc7/launcher");
  const exchange = byDestination.get("/rc7/exchange");
  if (!source || !launcher || !exchange || source.Type !== "bind" || launcher.Type !== "bind" || exchange.Type !== "bind"
    || source.RW !== false || launcher.RW !== false || exchange.RW !== true) fail("GATE_B_MOUNT_IDENTITY_MISMATCH", "Gate C launcher mount types or access modes mismatched");
  const root = path.dirname(source.Source);
  if (normalizedPath(source.Source) !== normalizedPath(path.join(root, "source"))
    || normalizedPath(launcher.Source) !== normalizedPath(path.join(root, "launcher"))
    || normalizedPath(exchange.Source) !== normalizedPath(path.join(root, "exchange"))) fail("GATE_B_MOUNT_IDENTITY_MISMATCH", "Gate C launcher binds do not share one exact root");
  const segments = path.resolve(root).split(/[\\/]+/u).map((segment) => segment.toLowerCase());
  if (nestedOrSame(root, REPOSITORY_ROOT) || nestedOrSame(REPOSITORY_ROOT, root) || nestedOrSame(root, homedir())
    || segments.some((segment) => PROTECTED_SEGMENTS.has(segment) || /(?:credential|secret|api[-_]?key|oauth|token)/iu.test(segment))) fail("GATE_B_MOUNT_IDENTITY_MISMATCH", "Gate C launcher root overlaps a repository, user layer, or credential-like path");
  return root;
}

async function validateGateBDockerInspection(value, expected) {
  const root = launcherRootFromInspection(value);
  let context;
  try {
    context = await inspectRc7GateCRlmLauncher(root);
  } catch (error) {
    fail("GATE_B_MOUNT_IDENTITY_MISMATCH", "Gate C launcher bytes, path identity, or residue mismatched", { cause_code: error?.code ?? error?.name });
  }
  const launch = context.launch;
  const launcherExpected = expected.launcher_parent;
  if (!launcherExpected || launch.image_id !== GATE_B_RUNTIME_IMAGE || launch.activation_sha256 !== launcherExpected.activation_sha256
    || launch.run_identity !== launcherExpected.run_id || launch.case_id !== launcherExpected.case_id || launch.arm !== launcherExpected.arm
    || launch.selected_route !== "rc-rlm" || launch.intent_sha256 !== launcherExpected.intent_sha256
    || launch.dispatch_sha256 !== launcherExpected.dispatch_sha256 || launch.semantic_request_sha256 !== launcherExpected.semantic_request_sha256) fail("GATE_B_CONTAINER_IDENTITY_MISMATCH", "Gate C launcher contract is not bound to the trusted parent top-level dispatch");
  if (!packageBytes(context.semantic_request).equals(packageBytes(launcherExpected.semantic_request))) fail("GATE_B_MOUNT_IDENTITY_MISMATCH", "Mounted route-visible source differs from the trusted parent semantic request");
  try {
    validateRc7GateCRlmDockerInspect(value, context, expected.container_id);
  } catch (error) {
    const mountFailure = /(?:MOUNT|PATH|SEMANTIC|RESIDUE)/u.test(error?.code ?? "");
    fail(mountFailure ? "GATE_B_MOUNT_IDENTITY_MISMATCH" : "GATE_B_CONTAINMENT_WEAKENED", "Gate C live container inspection mismatched the pinned launcher boundary", { cause_code: error?.code ?? error?.name });
  }
  const item = value[0];
  return {
    schema_version: "rc7-gate-c-broker-derived-gate-b-evidence-v1",
    state: "broker-verified-live-rlm-container",
    selected_route: "rc-rlm",
    activation_sha256: expected.activation_sha256,
    intent_sha256: expected.intent_sha256,
    dispatch_sha256: expected.dispatch_sha256,
    container_id: expected.container_id,
    image_id: item.Image,
    docker_executable_sha256: GATE_B_DOCKER_EXECUTABLE_SHA256,
    outer_seccomp_inspect_sha256: GATE_B_OUTER_SECCOMP_INSPECT_SHA256,
    network: "none",
    direct_container_provider_access: "denied-network-none",
    input_mount_sha256: launcherExpected.semantic_request_sha256,
    launcher_parent_intent_sha256: launcherExpected.intent_sha256,
    launcher_parent_dispatch_sha256: launcherExpected.dispatch_sha256,
    launcher_parent_semantic_request_sha256: launcherExpected.semantic_request_sha256,
    phase_two_tsync_proven: false,
  };
}

async function executePinnedDockerInspection(context, containerId) {
  const executable = await readPinnedNativeExecutable();
  const dockerConfig = path.join(context.root, DOCKER_CONFIG_DIR);
  await assertPhysicalDirectory(dockerConfig, context.root, "Docker CLI config directory");
  if ((await readdir(dockerConfig)).length !== 0) fail("UNKNOWN_RESIDUE", "Docker CLI config directory must remain empty and credential-free");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, ["inspect", "--type", "container", containerId], {
      cwd: context.root,
      env: { DOCKER_CLI_HINTS: "false", DOCKER_CONFIG: dockerConfig, SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 10_000);
    const collect = (chunks) => (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > 1_048_576) child.kill();
      else chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 || signal !== null || timedOut || bytes > 1_048_576) reject(new Rc7GateCBrokerError("GATE_B_DOCKER_INSPECTION_FAILED", "Pinned Docker inspection failed closed", { code, signal, timed_out: timedOut, stderr: Buffer.concat(stderr).toString("utf8").slice(0, 1024) }));
      else resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
  await assertPhysicalDirectory(dockerConfig, context.root, "Docker CLI config directory");
  if ((await readdir(dockerConfig)).length !== 0) fail("UNKNOWN_RESIDUE", "Docker inspection wrote credential or configuration residue");
  try { return JSON.parse(result); } catch { fail("GATE_B_DOCKER_INSPECTION_MISMATCH", "Docker inspection output is not bounded JSON"); }
}

/**
 * Production-only containment inspection for the separately approved,
 * non-matrix one-treatment proof. The proof broker supplies identities already
 * derived from its durable parent and child dispatches; this function owns the
 * pinned Docker executable and converts the live inspection into the same
 * closed Gate B evidence used by the matrix broker.
 */
export async function inspectRc7GateCTreatmentProofContainer(input) {
  exactKeys(input, ["container_id", "expected", "ledger_root"], "treatment-proof Docker inspection input");
  const safeRoot = await assertDisposableRoot(input.ledger_root, false);
  if (!HASH.test(input.container_id ?? "")) fail("GATE_B_CONTAINER_IDENTITY_MISMATCH", "Treatment proof requires one exact live container identity");
  exactKeys(input.expected, [
    "activation_sha256", "arm", "case_id", "container_id", "dispatch_sha256", "intent_sha256",
    "launcher_parent", "request_kind", "run_id", "selected_route", "semantic_request", "semantic_request_sha256",
  ], "treatment-proof expected containment identity");
  if (input.expected.container_id !== input.container_id || input.expected.request_kind !== "recursive-child"
    || input.expected.selected_route !== "rc-rlm" || !HASH.test(input.expected.activation_sha256 ?? "")
    || !HASH.test(input.expected.intent_sha256 ?? "") || !HASH.test(input.expected.dispatch_sha256 ?? "")
    || !HASH.test(input.expected.semantic_request_sha256 ?? "")) fail("GATE_B_CONTAINER_IDENTITY_MISMATCH", "Treatment-proof containment identity is malformed");
  const value = await executePinnedDockerInspection({ root: safeRoot }, input.container_id);
  return validateGateBDockerInspection(value, input.expected);
}

function noContainerGateBEvidence(expected) {
  const direct = expected.selected_route === "rc-direct";
  return {
    schema_version: "rc7-gate-c-broker-derived-gate-b-evidence-v1",
    state: direct ? "not-applicable-direct-route" : "not-applicable-top-level-host-provider",
    selected_route: expected.selected_route,
    activation_sha256: expected.activation_sha256,
    intent_sha256: expected.intent_sha256,
    dispatch_sha256: expected.dispatch_sha256,
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
  };
}

async function preflightLiveDispatch(input, allowTestOnly = false, inspectedDockerValue = undefined) {
  exactKeys(input, ["dispatch_sha256", "gate_b_attestation", "handoff_nonce", "ledger_root", "sealed_request"], "live dispatch preflight input");
  if (!HASH.test(input.dispatch_sha256 ?? "")) fail("RECOVERY_IDENTITY_MISMATCH", "Live dispatch digest is malformed");
  if (!HASH.test(input.handoff_nonce ?? "")) fail("HANDOFF_NONCE_MISMATCH", "Live dispatch requires one fresh 256-bit host handoff nonce");
  const safeRoot = await assertDisposableRoot(input.ledger_root, false);
  let lock;
  try {
    lock = await acquireDispatchLock(safeRoot);
    const context = await readLedgerContext(safeRoot, allowTestOnly);
    if (!allowTestOnly && context.approval.state !== "operator-approved") fail("NUMERIC_APPROVAL_REQUIRED", "Live preflight requires the current durable operator-approved freeze");
    const expectedState = allowTestOnly ? "consumed-test-only-provider-unreachable" : "consumed-provider-reachable-handoff-started";
    const dispatch = validateDispatchCheckpoint(await readCanonicalJson(path.join(safeRoot, ACTIVE_DISPATCH), "active dispatch"), expectedState);
    if (dispatch.dispatch_sha256 !== input.dispatch_sha256) fail("RECOVERY_IDENTITY_MISMATCH", "Requested and active dispatch identities differ");
    const retained = validateDispatchCheckpoint(await readCanonicalJson(path.join(safeRoot, RESERVATIONS_DIR, `${dispatch.reservation_key}.json`), "dispatch reservation"), expectedState);
    if (canonicalJsonV1(retained) !== canonicalJsonV1(dispatch)
      || await optionalPhysicalFile(path.join(safeRoot, TERMINALS_DIR, `${dispatch.reservation_key}.json`), path.join(safeRoot, TERMINALS_DIR), "dispatch terminal")) fail("RECOVERY_IDENTITY_MISMATCH", "Live dispatch is not one exact unterminated durable reservation");
    const expectedClosure = {
      activation_sha256: context.activation.activation_sha256,
      broker_package_sha256: context.activation.broker_package_sha256,
      preregistration_sha256: context.activation.preregistration_sha256,
      scorer_contract_sha256: context.activation.scorer_contract_sha256,
      worker_package_sha256: context.activation.worker_package_sha256,
    };
    const sealed = validateRc7GateCSealedWorkerRequest(
      input.sealed_request,
      expectedClosure,
      allowTestOnly ? "reserved-test-only-provider-unreachable" : "reserved-provider-reachable-once",
    );
    const expectedPermit = buildDispatchPermit(sealed.intent, context.activation, allowTestOnly ? "reserved-test-only-provider-unreachable" : "reserved-provider-reachable-once");
    if (canonicalJsonV1(sealed.permit) !== canonicalJsonV1(expectedPermit) || dispatch.intent_sha256 !== sealed.intent.intent_sha256
      || dispatch.permit_sha256 !== sealed.permit.permit_sha256 || dispatch.run_id !== sealed.intent.run_id
      || dispatch.case_id !== sealed.intent.case_id || dispatch.arm !== sealed.intent.arm || dispatch.selected_route !== sealed.intent.selected_route
      || dispatch.request_kind !== sealed.intent.request_kind || dispatch.child_sequence !== sealed.intent.child_sequence
      || dispatch.semantic_request_sha256 !== sealed.semantic.sha256) fail("SEALED_REQUEST_MISMATCH", "Sealed request does not derive from the exact active durable dispatch");
    const expected = {
      activation_sha256: context.activation.activation_sha256,
      intent_sha256: sealed.intent.intent_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      selected_route: dispatch.selected_route,
      request_kind: dispatch.request_kind,
      run_id: dispatch.run_id,
      case_id: dispatch.case_id,
      arm: dispatch.arm,
      semantic_request_sha256: sealed.semantic.sha256,
      semantic_request: sealed.semantic.value,
      ledger_root: safeRoot,
    };
    expected.launcher_parent = await parentTopLevelClosure(safeRoot, dispatch, expectedState);
    const reference = validateGateBReference(input.gate_b_attestation, expected);
    let gateB;
    if (dispatch.request_kind === "top-level") gateB = noContainerGateBEvidence(expected);
    else {
      const dockerValue = inspectedDockerValue === undefined ? await executePinnedDockerInspection(context, reference.container_id) : inspectedDockerValue;
      gateB = await validateGateBDockerInspection(dockerValue, { ...expected, container_id: reference.container_id });
    }
    const durableHandoff = withDigest({
      schema_version: "rc7-gate-c-durable-provider-handoff-v1",
      state: "preflight-consumed-provider-reachability-committed",
      activation_sha256: context.activation.activation_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      reservation_key: dispatch.reservation_key,
      handoff_nonce: input.handoff_nonce,
      sealed_request_sha256: sealed.value.sealed_request_sha256,
      gate_b_attestation_sha256: reference.attestation_sha256,
    }, "durable_handoff_sha256");
    try {
      await writeExclusive(path.join(safeRoot, HANDOFFS_DIR, `${dispatch.reservation_key}.json`), durableHandoff);
    } catch (error) {
      if (error?.code === "EEXIST") fail("DURABLE_HANDOFF_REPLAY", "This exact provider-reachable dispatch already consumed its one durable handoff");
      throw error;
    }
    return {
      sealed: sealed.value,
      dispatch,
      durable_handoff: durableHandoff,
      expected_closure: expectedClosure,
      wire_contract: {
        schema_version: "rc7-gate-c-exact-wire-contract-v1",
        provider_endpoint: GATE_B_PROVIDER_ENDPOINT,
        refresh_endpoint: GATE_B_REFRESH_ENDPOINT,
        provider: sealed.intent.provider,
        adapter: sealed.intent.adapter,
        adapter_revision: sealed.intent.adapter_revision,
        model: sealed.intent.model,
        configured_snapshot: sealed.intent.configured_snapshot,
        reasoning: sealed.intent.reasoning,
        max_output_plus_reasoning_tokens: sealed.intent.max_output_plus_reasoning_tokens,
        provider_active_timeout_seconds: sealed.intent.provider_active_timeout_seconds,
        automatic_retries: sealed.intent.automatic_retries,
        generation_https_posts: 1,
        oauth_refresh_https_posts: 1,
        all_other_network: "denied",
      },
      gate_b: gateB,
    };
  } finally {
    if (lock) await releaseDispatchLock(safeRoot, lock);
  }
}

export async function preflightRc7GateCLiveDispatch(input) {
  return preflightLiveDispatch(input, false);
}

function brokerProjection(value) {
  return projection(value, "broker_package_sha256");
}

export async function buildRc7GateCBrokerConformancePackage() {
  const preregistration = await buildRc7GateCPreregistrationPackage();
  validateRc7GateCPreregistrationPackage(preregistration);
  const [moduleBytes, worker, scorer] = await Promise.all([
    readFile(MODULE_PATH),
    buildRc7GateCWorkerConformancePackage(),
    buildRc7GateCScorerContract(),
  ]);
  const value = {
    schema_version: RC7_GATE_C_BROKER_SCHEMA,
    broker_identity: RC7_GATE_C_BROKER_ID,
    state: "provider-free-conformed-activation-denied",
    preregistration_sha256: preregistration.preregistration_sha256,
    permission_policy_identity: RC7_GATE_C_PERMISSION_POLICY_ID,
    module: { path: "lib/recursus/rc7-rlm-gate-c-broker.mjs", byte_count: moduleBytes.byteLength, sha256: sha256V1(moduleBytes) },
    bound_worker_package_sha256: worker.worker_package_sha256,
    bound_scorer_contract_sha256: sha256V1(canonicalJsonV1(scorer)),
    schedule: {
      run_count: preregistration.ablation.schedule.length,
      run_ids_sha256: sha256V1(canonicalJsonV1(preregistration.ablation.schedule.map((row) => row.run_id))),
      top_level_reservations: 36,
      eligible_treatment_runs: 9,
      child_reservations: 36,
      maximum_provider_reachable_reservations: 72,
      generation_https_post_ceiling: 72,
      oauth_refresh_https_post_ceiling: 72,
      total_https_post_ceiling: 144,
      retries: 0,
      concurrency: 1,
    },
    semantic_request_construction: {
      caller_supplied_digest_or_byte_count: false,
      top_level: "broker reads and verifies exact registered source bytes, canonicalizes the pack, renders the frozen template and output contract, then hashes the complete semantic request",
      recursive_child: "broker accepts only a bounded question and exact registered locator, derives the excerpt itself, renders the frozen child template and output contract, then hashes the complete semantic request",
      maximum_utf8_bytes: RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES,
    },
    durable_dispatch: {
      reservation_identity: "run_id + request_kind + child_sequence",
      immutable_reservation_before_reachability: true,
      maximum_reservations: 72,
      global_active_dispatches: 1,
      duplicate_or_replay: "denied",
      provider_reachable_unsealed: "indeterminate-no-replay",
      physical_path_revalidation: "root, approval, metadata, reservations, terminals, active dispatch, and every retained file are revalidated against alias or junction replacement on every operation",
      trusted_terminal: "full sealed-result digest plus artifact, usage, provenance, permission, authority, cleanup, activation, intent, permit, nonce, dispatch, and reservation identities",
      inspect_recover: "durable, idempotent, lock-exclusive, and never redispatches",
    },
    activation: {
      provider_reachable_now: false,
      exact_worker_state: "provider-free-conformed-provider-unreachable",
      numeric_approval_state: "required-not-yet-bound",
      durable_operator_approval_record_required: true,
      governance_nonclaim: OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM,
      exact_identity_fields: activationExpectedKeys(),
      denied_without_exact_activation: true,
    },
    provider_free_fault_results: {
      caller_asserted_hash_or_count: "not-accepted",
      missing_or_malformed_request: "rejected",
      mismatched_run_route_permission_budget_source_prompt_model_worker_or_scorer_identity: "rejected",
      generic_or_direct_child_request: "rejected",
      fifth_child_request: "rejected",
      external_child_question_or_unregistered_excerpt: "rejected",
      oversized_semantic_input_before_provider_reachability: "rejected",
      absent_or_mismatched_activation: "rejected",
      duplicate_or_seventy_third_reservation: "rejected",
      concurrent_dispatch: "excluded",
      unsealed_provider_reachable_recovery: "indeterminate-no-replay",
      replaced_ledger_directory_or_file: "rejected",
      "caller_supplied_expected_activation_or_public-hash-self-approval": "not-accepted",
      "untrusted_gate_b_self-hash": "structurally-validated-then-denied-before-evaluator-fixture-or-provider-loading",
    },
    accounting: {
      rlm_executions: 0,
      provider_calls: 0,
      simulated_provider_requests: 0,
      credential_accesses: 0,
      network_or_live_browsing_actions: 0,
      external_mutations: 0,
      retained_artifacts: 1,
      terminal_decisions: 1,
      cleanup_residue_entries: 0,
    },
    terminal_decision: RC7_GATE_C_BROKER_TERMINAL,
    non_claims: [
      "no provider adapter worker or live capsule was loaded or executed",
      "no activation or provider reachability exists",
      "provider-free ledger and state-machine conformance is not live provider conformance",
      "credential availability, contents, shape, writability, refresh behavior, and account state are unknown and uninspected",
      OPERATOR_APPROVAL_GOVERNANCE_NONCLAIM,
      "the broker derives live launcher and OS-boundary evidence from exact durable dispatch bytes and pinned Docker inspection, but phase-two TSYNC remains proven only by a later trusted container result",
    ],
  };
  value.broker_package_sha256 = sha256V1(canonicalJsonV1(brokerProjection(value)));
  validateRc7GateCBrokerConformancePackage(value);
  return value;
}

export function validateRc7GateCBrokerConformancePackage(value) {
  exactKeys(value, [
    "schema_version", "broker_identity", "state", "preregistration_sha256", "permission_policy_identity",
    "module", "bound_worker_package_sha256", "bound_scorer_contract_sha256", "schedule", "semantic_request_construction",
    "durable_dispatch", "activation", "provider_free_fault_results", "accounting", "terminal_decision", "non_claims",
    "broker_package_sha256",
  ], "broker conformance package");
  if (value.schema_version !== RC7_GATE_C_BROKER_SCHEMA || value.broker_identity !== RC7_GATE_C_BROKER_ID
    || value.state !== "provider-free-conformed-activation-denied" || value.permission_policy_identity !== RC7_GATE_C_PERMISSION_POLICY_ID
    || value.terminal_decision !== RC7_GATE_C_BROKER_TERMINAL || !HASH.test(value.preregistration_sha256 ?? "")
    || !HASH.test(value.bound_worker_package_sha256 ?? "") || !HASH.test(value.bound_scorer_contract_sha256 ?? "")
    || value.schedule.run_count !== 36 || value.schedule.top_level_reservations !== 36
    || value.schedule.eligible_treatment_runs !== 9 || value.schedule.child_reservations !== 36
    || value.schedule.maximum_provider_reachable_reservations !== 72 || value.schedule.retries !== 0
    || value.schedule.generation_https_post_ceiling !== 72 || value.schedule.oauth_refresh_https_post_ceiling !== 72
    || value.schedule.total_https_post_ceiling !== 144
    || value.schedule.concurrency !== 1 || value.activation.provider_reachable_now !== false
    || value.activation.denied_without_exact_activation !== true || value.accounting.provider_calls !== 0
    || value.accounting.simulated_provider_requests !== 0 || value.accounting.credential_accesses !== 0
    || value.broker_package_sha256 !== sha256V1(canonicalJsonV1(brokerProjection(value)))) fail("BROKER_PACKAGE_MISMATCH", "Gate C broker package identity or authority mismatched");
  return value;
}

export async function prepareRc7GateCFinalApprovalFreeze(root, ledgerRoot, resultsRoot, proofLedgerRoot, proofResultsRoot, proofRlmRoot) {
  const safeRoot = await assertDisposableRoot(root, true);
  const safeLedgerRoot = await assertDisposableRoot(ledgerRoot, true);
  const safeResultsRoot = await assertDisposableRoot(resultsRoot, true);
  if (nestedOrSame(safeRoot, safeLedgerRoot) || nestedOrSame(safeLedgerRoot, safeRoot)
    || nestedOrSame(safeRoot, safeResultsRoot) || nestedOrSame(safeResultsRoot, safeRoot)
    || nestedOrSame(safeLedgerRoot, safeResultsRoot) || nestedOrSame(safeResultsRoot, safeLedgerRoot)) fail("OVERLAPPING_OUTPUT_ROOT", "Final-freeze package, approved ledger, and approved results roots must be pairwise disjoint");
  for (const proofRoot of [proofLedgerRoot, proofResultsRoot, proofRlmRoot]) {
    if (typeof proofRoot !== "string" || !path.isAbsolute(proofRoot)
      || [safeRoot, safeLedgerRoot, safeResultsRoot].some((candidate) => nestedOrSame(candidate, proofRoot) || nestedOrSame(proofRoot, candidate))) {
      fail("OVERLAPPING_OUTPUT_ROOT", "Final-freeze package, matrix roots, and successful proof roots must be explicit and disjoint");
    }
  }
  const lockPath = path.join(safeRoot, ".gate-c-final-freeze.lock");
  const stagePath = path.join(safeRoot, ".gate-c-final-freeze.stage");
  const packagePath = path.join(safeRoot, RC7_GATE_C_FINAL_FREEZE_PACKAGE_NAME);
  let lock;
  try {
    lock = await open(lockPath, "wx");
    const value = await buildRc7GateCFinalApprovalFreeze(
      safeLedgerRoot, safeResultsRoot, proofLedgerRoot, proofResultsRoot, proofRlmRoot,
    );
    const bytes = packageBytes(value);
    if (bytes.byteLength > MAX_PACKAGE_BYTES) fail("OVERSIZED_ARTIFACT", "Final approval freeze exceeds its byte ceiling");
    await writeFile(stagePath, bytes, { flag: "wx" });
    await rename(stagePath, packagePath);
    return { root: safeRoot, package_path: packagePath, byte_count: bytes.byteLength, ledger_root_sha256: value.closure.ledger_root_identity.ledger_root_sha256, results_root_sha256: value.closure.results_root_identity.results_root_sha256, proof_prerequisite_sha256: value.closure.successful_treatment_proof.prerequisite_sha256, final_freeze_sha256: value.final_freeze_sha256, future_activation_sha256: value.future_activation_sha256, terminal_decision: value.terminal_decision, accounting: value.accounting };
  } catch (error) {
    await rm(stagePath, { force: true });
    throw error;
  } finally {
    if (lock) {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}

export async function inspectRc7GateCFinalApprovalFreeze(root, ledgerRoot, resultsRoot, proofLedgerRoot, proofResultsRoot, proofRlmRoot) {
  const safeRoot = await assertDisposableRoot(root, false);
  const safeLedgerRoot = await assertDisposableRoot(ledgerRoot, true);
  const safeResultsRoot = await assertDisposableRoot(resultsRoot, true);
  const entries = (await readdir(safeRoot)).sort();
  if (canonicalJsonV1(entries) !== canonicalJsonV1([RC7_GATE_C_FINAL_FREEZE_PACKAGE_NAME])) fail("UNKNOWN_RESIDUE", "Completed final-freeze root must contain exactly one retained package");
  const bytes = await readFile(path.join(safeRoot, RC7_GATE_C_FINAL_FREEZE_PACKAGE_NAME));
  if (bytes.byteLength > MAX_PACKAGE_BYTES) fail("OVERSIZED_ARTIFACT", "Final approval freeze exceeds its byte ceiling");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("MALFORMED_ARTIFACT", "Final approval freeze is not valid JSON"); }
  validateRc7GateCFinalApprovalFreeze(value);
  if (!bytes.equals(packageBytes(value))) fail("MALFORMED_ARTIFACT", "Final approval freeze is not canonical normalized JSON");
  if (!bytes.equals(packageBytes(await buildRc7GateCFinalApprovalFreeze(
    safeLedgerRoot, safeResultsRoot, proofLedgerRoot, proofResultsRoot, proofRlmRoot,
  )))) fail("STALE_ARTIFACT", "Final approval freeze does not match the current physical matrix roots, successful proof, and closure");
  return { root: safeRoot, entries, ledger_root_sha256: value.closure.ledger_root_identity.ledger_root_sha256, results_root_sha256: value.closure.results_root_identity.results_root_sha256, proof_prerequisite_sha256: value.closure.successful_treatment_proof.prerequisite_sha256, final_freeze_sha256: value.final_freeze_sha256, future_activation_sha256: value.future_activation_sha256, terminal_decision: value.terminal_decision };
}

export async function prepareRc7GateCBrokerConformance(root) {
  const safeRoot = await assertDisposableRoot(root, true);
  const lockPath = path.join(safeRoot, ".gate-c-broker.lock");
  const stagePath = path.join(safeRoot, ".gate-c-broker.stage");
  const packagePath = path.join(safeRoot, RC7_GATE_C_BROKER_PACKAGE_NAME);
  let lock;
  try {
    lock = await open(lockPath, "wx");
    const value = await buildRc7GateCBrokerConformancePackage();
    const bytes = packageBytes(value);
    if (bytes.byteLength > MAX_PACKAGE_BYTES) fail("OVERSIZED_ARTIFACT", "Broker conformance package exceeds its byte ceiling");
    await writeFile(stagePath, bytes, { flag: "wx" });
    await rename(stagePath, packagePath);
    return { root: safeRoot, package_path: packagePath, byte_count: bytes.byteLength, broker_package_sha256: value.broker_package_sha256, terminal_decision: value.terminal_decision, accounting: value.accounting };
  } catch (error) {
    await rm(stagePath, { force: true });
    throw error;
  } finally {
    if (lock) {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}

export async function inspectRc7GateCBrokerConformance(root) {
  const safeRoot = await assertDisposableRoot(root, false);
  const entries = (await readdir(safeRoot)).sort();
  if (canonicalJsonV1(entries) !== canonicalJsonV1([RC7_GATE_C_BROKER_PACKAGE_NAME])) fail("UNKNOWN_RESIDUE", "Completed broker root must contain exactly one retained package");
  const bytes = await readFile(path.join(safeRoot, RC7_GATE_C_BROKER_PACKAGE_NAME));
  if (bytes.byteLength > MAX_PACKAGE_BYTES) fail("OVERSIZED_ARTIFACT", "Broker conformance package exceeds its byte ceiling");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("MALFORMED_ARTIFACT", "Broker conformance package is not valid JSON"); }
  validateRc7GateCBrokerConformancePackage(value);
  if (!bytes.equals(packageBytes(value))) fail("MALFORMED_ARTIFACT", "Broker conformance package is not canonical normalized JSON");
  if (!bytes.equals(packageBytes(await buildRc7GateCBrokerConformancePackage()))) fail("STALE_ARTIFACT", "Broker conformance package does not match the current closure");
  return { root: safeRoot, entries, broker_package_sha256: value.broker_package_sha256, terminal_decision: value.terminal_decision };
}

export function formatRc7GateCBrokerError(error) {
  return { ok: false, code: error instanceof Rc7GateCBrokerError ? error.code : "UNEXPECTED_ERROR", message: error?.message ?? String(error), details: error?.details };
}

export const __test = Object.freeze({
  REPOSITORY_ROOT,
  ACTIVE_DISPATCH,
  DISPATCH_LOCK,
  HOST_LAUNCH_LOCK,
  OPERATOR_APPROVAL,
  DOCKER_CONFIG_DIR,
  RESERVATIONS_DIR,
  TERMINALS_DIR,
  HANDOFFS_DIR,
  brokerProjection,
  packageBytes,
  activationExpectedKeys,
  visiblePayload,
  excerptFor,
  reservationKey,
  approvalRecordProjection,
  validateSuccessfulTreatmentProofPrerequisite,
  buildTestOnlyFinalApprovalFreeze,
  buildTestOnlyOperatorApprovalRecord: async (root, resultsRoot) => buildOperatorApprovalRecord(await buildTestOnlyFinalApprovalFreeze(root, resultsRoot), "test-only-provider-unreachable", root),
  initializeTestLedger: (root) => initializeLedger(root, true),
  authorizeTestDispatch: (root, intent) => authorizeDispatch(root, intent, true),
  consumeTestReservation: (root, input) => consumeReservation(root, input, true),
  sealTestDispatchRequest: (root, input) => sealDispatchRequest(root, input, true),
  closeTestReservation: (root, dispatch, terminal) => closeReservation(root, dispatch, terminal, true),
  inspectTestLedger: async (root) => {
    const result = await inspectLedger(root, true);
    return { root: result.context.root, state: result.state, counts: result.counts, authority_state: result.context.approval.state, replay_permitted: false };
  },
  extractTestTrustedObservations: (root) => extractTrustedObservations(root, true, false),
  extractTestLedgerAccounting: (root) => extractLedgerAccounting(root, true),
  recoverTestLedger: (root) => recoverLedger(root, true),
  recoverTestHostLaunchLock: (root, expectedRunId) => recoverHostLaunchLock(root, expectedRunId, true),
  buildIndeterminateTerminal,
  validateTerminalRecord,
  acquireDispatchLock,
  releaseDispatchLock,
  gateBLiveContainmentContract,
  gateCRepairSupersessionLineage,
  assertFreshRootsAgainstAbandonedPartialMatrix,
  inspectAbandonedPartialMatrixEvidence,
  assertRetainedHistoricalRoot,
  assertFreshRlmRootIdentity,
  identifyTestRlmRootForAttempt: (ledgerRoot, resultsRoot, runId, rlmRoot, requireEmpty = true) => identifyRlmRootForAttempt(ledgerRoot, resultsRoot, runId, rlmRoot, requireEmpty, true),
  ledgerRootIdentity,
  resultsRootIdentity,
  rlmHistoricalRootIdentity,
  retainedPhysicalTreeEvidence,
  validateGateBReference,
  validateGateBDockerInspection,
  preflightTestLiveDispatch: (input, inspectedDockerValue) => preflightLiveDispatch(input, true, inspectedDockerValue),
});
