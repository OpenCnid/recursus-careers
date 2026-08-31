import { createHash, randomBytes } from "node:crypto";
import {
  constants as fsConstants,
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import { parseRc7GateCStructuredOutput } from "./rc7-rlm-gate-c-output-grammar.mjs";

export const RC7_GATE_C_RLM_LAUNCHER_POLICY_ID = "rc7-rlm-gate-c-contained-launcher-v1";
export const RC7_GATE_C_RLM_LAUNCHER_SCHEMA = "rc7-gate-c-rlm-launch-package-v2";
export const RC7_GATE_C_RLM_EXCHANGE_SCHEMA = "rc7-gate-c-rlm-file-exchange-v1";
export const RC7_GATE_C_RLM_COMPONENT_COMMIT = "4772c12b0630706f14d16e70be0ad67bff116690";
export const RC7_GATE_C_RLM_IMAGE_ID = "sha256:203f3b5e1c08e5a45e1b01b795d8020fb66e42fa8ba9baea3f81d1a420c68d66";
export const RC7_GATE_C_RLM_BASE_IMAGE_IDS = Object.freeze({
  node: "node@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df",
  python: "python@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b",
});
export const RC7_GATE_C_RLM_LOCK_IDENTITIES = Object.freeze({
  pnpm_lock_sha256: "d1ae2cc697db86d42dadda4653f82ae64131f7010b440e130d5b4fb6d30cc08d",
  uv_lock_sha256: "588a9165560eba4a70bfad798b4f67418c09498dc77b64e8c5ec7b4e150c7413",
  managed_requirements_sha256: "0d72c8c450c62fdb405db96cfa5dbffb3a60eedacb24dc37c028267696d258af",
  pnpm_version: "9.14.4",
});
export const RC7_GATE_C_RLM_LIMITS = Object.freeze({
  child_requests: 4,
  depth: 2,
  cpu_nanos: 1_000_000_000,
  file_size_bytes: 1_048_576,
  memory_bytes: 805_306_368,
  nofile: 128,
  state_bytes: 16_777_216,
  state_inodes: 256,
  output_bytes: 4_194_304,
  output_inodes: 64,
  pids: 64,
  program_bytes: 16_384,
  semantic_request_bytes: 32_768,
  exchange_artifact_bytes: 131_072,
  wall_timeout_ms: 300_000,
});

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, "..", "..");
const FIXTURE_ROOT = path.join(REPOSITORY_ROOT, "tests", "recursus", "fixtures", "rc7-rlm-gate-c-container");
const OUTER_SECCOMP_PATH = path.join(REPOSITORY_ROOT, "tests", "recursus", "fixtures", "rc7-rlm-containment", "outer-seccomp-default-errno.json");
const SOURCE_DIR = "source";
const LAUNCHER_DIR = "launcher";
const EXCHANGE_DIR = "exchange";
const RETAINED_DIR = "retained";
const LOCK_FILE = ".rc7-gate-c-rlm-launch.lock";
const PACKAGE_FILE = "launch-package.json";
const TERMINAL_FILE = "terminal.json";
const FINAL_FILE = "final-artifact.json";
const LIVE_INSPECT_FILE = "live-inspect.json";
const PHASE_TWO_FILE = "phase-two.json";
const HASH = /^[0-9a-f]{64}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const CONTAINER = /^[0-9a-f]{64}$/u;
const REQUEST_FILE = /^\d{4}\.json$/u;
const REQUEST_TEMP_FILE = /^(\d{4})\.json\.tmp-[1-9][0-9]*-[0-9a-f]{16}$/u;
const CREDENTIAL_LIKE = /(?:^|[-_. ])(?:credential|credentials|secret|secrets|api[-_ ]?key|oauth|token|tokens)(?:$|[-_. ])/iu;
const LEAK_PATTERN = /(?:eligibility|expected_relationship|leak_canary|preferred_route|evaluator_contract|oracle)/iu;
const ELIGIBLE_CASES = new Set(["LAB-01", "PAPER-01", "REPO-01"]);
export const RC7_GATE_C_RLM_INHERITED_ENVIRONMENT = Object.freeze({
  GPG_KEY: "A035C8C19219BA821ECEA86B64E628F8D684696D",
  PATH: "/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  PYTHON_SHA256: "91bcdebfdde239a003ae93738a7fce0f9230fee5c4bc2b86f6e6e8c6f98aabe8",
  PYTHON_VERSION: "3.11.16",
});

export class Rc7GateCRlmLauncherError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCRlmLauncherError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new Rc7GateCRlmLauncherError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_ARTIFACT", `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJsonV1(actual) !== canonicalJsonV1(wanted)) fail("MALFORMED_ARTIFACT", `${label} keys mismatched`, { actual, expected: wanted });
}

function withDigest(value, key) {
  return { ...value, [key]: sha256V1(canonicalJsonV1(value)) };
}

function packageBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function normalized(value) {
  return path.resolve(value).replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase();
}

function normalizedPhysicalPath(value) {
  return process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
}

function nestedOrSame(candidate, parent) {
  const child = normalized(candidate);
  const root = normalized(parent);
  return child === root || child.startsWith(`${root}\\`);
}

async function assertNoLinkSegments(target, stop) {
  let current = path.resolve(target);
  const boundary = path.resolve(stop);
  for (;;) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) fail("ALIASED_PATH", "Symbolic-link or junction path components are denied", { current });
    if (normalized(current) === normalized(boundary)) return;
    const parent = path.dirname(current);
    if (parent === current || !nestedOrSame(current, boundary)) fail("PATH_ESCAPE", "Path escaped its expected boundary", { target, stop });
    current = parent;
  }
}

export async function assertRc7GateCRlmExternalRoot(root, { requireEmpty = false } = {}) {
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("INVALID_ROOT", "Launcher root must be one explicit absolute path");
  const resolved = path.resolve(root);
  const segments = resolved.split(/[\\/]+/u).filter(Boolean);
  if (segments.length < 3) fail("BROAD_ROOT", "Launcher root is too broad");
  if (segments.some((segment) => CREDENTIAL_LIKE.test(segment))) fail("CREDENTIAL_LIKE_ROOT", "Credential-like launcher roots are denied");
  let physical;
  try { physical = await realpath(resolved); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_ROOT", "Caller must create the disposable launcher root");
    throw error;
  }
  if (normalized(physical) !== normalized(resolved)) fail("ALIASED_PATH", "Launcher root must resolve lexically to itself");
  const info = await stat(physical);
  if (!info.isDirectory()) fail("INVALID_ROOT", "Launcher root must be a directory");
  await assertNoLinkSegments(physical, path.parse(physical).root);
  if (nestedOrSame(physical, REPOSITORY_ROOT) || nestedOrSame(REPOSITORY_ROOT, physical)) fail("REPOSITORY_ROOT_DENIED", "Launcher root must remain outside the repository");
  const belowTemp = nestedOrSame(physical, tmpdir());
  if ((nestedOrSame(physical, homedir()) || nestedOrSame(homedir(), physical)) && !belowTemp) fail("USER_LAYER_ROOT_DENIED", "User-layer launcher roots are denied outside an OS-temp child");
  const entries = await readdir(physical);
  if (requireEmpty && entries.length !== 0) fail("NONEMPTY_ROOT", "Preparation requires an empty caller-owned launcher root");
  return physical;
}

async function rlmRootIdentity(root) {
  const info = await lstat(root, { bigint: true });
  return withDigest({
    schema_version: "rc7-gate-c-rlm-root-identity-v1",
    normalized_physical_root: normalizedPhysicalPath(await realpath(root)),
    device_id: info.dev.toString(10),
    file_id: info.ino.toString(10),
    birthtime_ns: info.birthtimeNs.toString(10),
  }, "rlm_root_sha256");
}

function validateRlmRootIdentity(value) {
  exactKeys(value, [
    "schema_version", "normalized_physical_root", "device_id", "file_id", "birthtime_ns", "rlm_root_sha256",
  ], "RLM root identity");
  const projection = { ...value };
  delete projection.rlm_root_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-root-identity-v1"
    || typeof value.normalized_physical_root !== "string" || !path.isAbsolute(value.normalized_physical_root)
    || !/^\d+$/u.test(value.device_id ?? "") || !/^\d+$/u.test(value.file_id ?? "") || !/^\d+$/u.test(value.birthtime_ns ?? "")
    || value.rlm_root_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("RLM_ROOT_IDENTITY_MISMATCH", "RLM root physical identity is malformed or self-digest mismatched");
  return value;
}

async function physicalDirectory(target, root, label) {
  if (!nestedOrSame(target, root)) fail("PATH_ESCAPE", `${label} escaped the launcher root`);
  await assertNoLinkSegments(target, root);
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("ALIASED_PATH", `${label} must be one physical directory`);
  return target;
}

async function physicalFile(target, root, label, maximum = RC7_GATE_C_RLM_LIMITS.exchange_artifact_bytes) {
  if (!nestedOrSame(target, root)) fail("PATH_ESCAPE", `${label} escaped the launcher root`);
  await assertNoLinkSegments(path.dirname(target), root);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > maximum) fail("MALFORMED_ARTIFACT", `${label} must be one bounded physical file`);
  return target;
}

async function readCanonical(target, root, label, maximum) {
  await physicalFile(target, root, label, maximum);
  const bytes = await readFile(target);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("MALFORMED_ARTIFACT", `${label} is malformed JSON`); }
  if (!bytes.equals(packageBytes(value))) fail("NONCANONICAL_ARTIFACT", `${label} is not canonical JSON`);
  return { bytes, value };
}

async function atomicWrite(target, value) {
  const bytes = packageBytes(value);
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try { await link(temporary, target); } finally { await unlink(temporary).catch(() => undefined); }
}

async function fileIdentity(target, id) {
  const bytes = await readFile(target);
  return { id, bytes: bytes.byteLength, sha256: sha256V1(bytes) };
}

export async function buildRc7GateCRlmImageDefinition() {
  const [dockerfile, worker, seccomp, seccompBytes] = await Promise.all([
    fileIdentity(path.join(FIXTURE_ROOT, "Dockerfile"), "rc7-gate-c-rlm-dockerfile-v1"),
    fileIdentity(path.join(FIXTURE_ROOT, "gate-c-rlm-worker.mjs"), "rc7-gate-c-rlm-worker-v1"),
    fileIdentity(OUTER_SECCOMP_PATH, "rc7-gate-c-outer-seccomp-reused-gate-b-v1"),
    readFile(OUTER_SECCOMP_PATH),
  ]);
  let seccompInspectSha256;
  try { seccompInspectSha256 = sha256V1(`seccomp=${JSON.stringify(JSON.parse(seccompBytes.toString("utf8")))}`); }
  catch { fail("SECCOMP_POLICY_MISMATCH", "Frozen outer seccomp fixture is malformed"); }
  return withDigest({
    schema_version: "rc7-gate-c-rlm-image-definition-v1",
    policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
    final_image_id: RC7_GATE_C_RLM_IMAGE_ID,
    final_image_state: "built-once-and-immutable-digest-pinned",
    bases: RC7_GATE_C_RLM_BASE_IMAGE_IDS,
    component_commit: RC7_GATE_C_RLM_COMPONENT_COMMIT,
    locks: RC7_GATE_C_RLM_LOCK_IDENTITIES,
    files: { dockerfile, worker, outer_seccomp: seccomp, outer_seccomp_inspect_sha256: seccompInspectSha256 },
    entrypoint: ["/usr/local/bin/node", "/opt/rc7/app/gate-c-rlm-worker.mjs"],
    entrypoint_override_permitted: false,
    component_runtime: {
      kernel_manager: "/opt/rc7/component/packages/rlm-jupyter/lib/kernel.js",
      python_resolution: "/opt/rc7/component/packages/rlm-jupyter/lib/python.js",
      python: "/opt/rc7/python/bin/python",
      bridge: "dsh_rlm_runtime.bootstrap+typed-host-request",
    },
    build_contract: {
      context_entries: ["Dockerfile", "gate-c-rlm-worker.mjs", "component"],
      component_source_must_match_commit_and_lock_identities: true,
      worker_build_arg: `RC7_GATE_C_WORKER_SHA256=${worker.sha256}`,
      "network-permitted-only-during-separately-authorized-lock-pinned-image-build": true,
      live_container_network: "none",
    },
    nonclaims: [
      "The pinned image ID identifies the one authorized lockfile-built Gate-C image; it does not prove a running container.",
      "This image definition does not execute Docker, RLM, a provider, or credentials.",
      "The locally reviewed file-exchange launcher is not an upstream RLM invocation contract.",
    ],
  }, "image_definition_sha256");
}

function validatePrepareInput(input) {
  exactKeys(input, [
    "activation_sha256", "arm", "case_id", "dispatch_sha256", "image_id", "intent_sha256", "run_identity", "selected_route",
    "semantic_request", "semantic_request_sha256",
  ], "launcher preparation input");
  for (const name of ["activation_sha256", "dispatch_sha256", "intent_sha256", "run_identity", "semantic_request_sha256"]) {
    if (!HASH.test(input[name] ?? "")) fail("IDENTITY_MISMATCH", `${name} must be one SHA-256 identity`);
  }
  if (!IMAGE.test(input.image_id ?? "")) fail("IMAGE_ID_REQUIRED", "The exact built Gate-C image ID must be pinned before preparation");
  if (input.image_id !== RC7_GATE_C_RLM_IMAGE_ID) fail("IMAGE_ID_MISMATCH", "The Gate-C RLM image differs from the immutable built digest");
  if (!ELIGIBLE_CASES.has(input.case_id) || input.arm !== "rc-rlm" || input.selected_route !== "rc-rlm") fail("RLM_ROUTE_DENIED", "Only a registered eligible forced-treatment run may prepare the RLM launcher");
  if (!input.semantic_request || typeof input.semantic_request !== "object" || Array.isArray(input.semantic_request)) fail("MALFORMED_SEMANTIC_REQUEST", "Semantic request must be an object");
  const text = canonicalJsonV1(input.semantic_request);
  if (LEAK_PATTERN.test(text)) fail("ROUTE_VISIBILITY_LEAK", "Evaluator-only or eligibility-shaped bytes are denied from the RLM input");
  const bytes = packageBytes(input.semantic_request);
  if (bytes.byteLength > RC7_GATE_C_RLM_LIMITS.semantic_request_bytes) fail("SEMANTIC_REQUEST_OVERSIZED", "Semantic request exceeds the frozen byte ceiling");
  if (sha256V1(bytes) !== input.semantic_request_sha256) fail("SEMANTIC_REQUEST_MISMATCH", "Semantic request bytes and identity differ");
  return bytes;
}

function validateLaunch(value, imageDefinition) {
  exactKeys(value, [
    "schema_version", "policy_identity", "activation_sha256", "run_identity", "case_id", "arm", "selected_route", "intent_sha256",
    "dispatch_sha256", "semantic_request_sha256", "image_id", "image_definition_sha256", "worker_sha256",
    "max_children", "max_depth", "direct_provider_access", "exchange_protocol", "launch_sha256",
  ], "launch contract");
  const projection = { ...value };
  delete projection.launch_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-launch-contract-v1" || value.policy_identity !== RC7_GATE_C_RLM_LAUNCHER_POLICY_ID
    || !HASH.test(value.activation_sha256 ?? "") || !HASH.test(value.run_identity ?? "") || !HASH.test(value.intent_sha256 ?? "")
    || !ELIGIBLE_CASES.has(value.case_id) || value.arm !== "rc-rlm" || value.selected_route !== "rc-rlm"
    || !HASH.test(value.dispatch_sha256 ?? "") || !HASH.test(value.semantic_request_sha256 ?? "") || value.image_id !== RC7_GATE_C_RLM_IMAGE_ID
    || value.image_definition_sha256 !== imageDefinition.image_definition_sha256
    || value.worker_sha256 !== imageDefinition.files.worker.sha256 || value.max_children !== RC7_GATE_C_RLM_LIMITS.child_requests
    || value.max_depth !== RC7_GATE_C_RLM_LIMITS.depth || value.direct_provider_access !== "denied-network-none"
    || value.exchange_protocol !== RC7_GATE_C_RLM_EXCHANGE_SCHEMA || value.launch_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("LAUNCH_IDENTITY_MISMATCH", "Launch contract identity mismatched");
  return value;
}

function validatePackage(value, launch, imageDefinition, currentRootIdentity) {
  exactKeys(value, [
    "schema_version", "state", "policy_identity", "launch_sha256", "image_definition_sha256",
    "rlm_root_identity", "visible_source", "launcher_input", "exchange", "containment", "one_variable", "counts", "package_sha256",
  ], "launch package");
  validateRlmRootIdentity(value.rlm_root_identity);
  if (canonicalJsonV1(value.rlm_root_identity) !== canonicalJsonV1(currentRootIdentity)) fail("RLM_ROOT_IDENTITY_MISMATCH", "Launcher package is not retained in its original physical RLM root");
  const projection = { ...value };
  delete projection.package_sha256;
  if (value.schema_version !== RC7_GATE_C_RLM_LAUNCHER_SCHEMA || value.state !== "prepared-provider-unreachable"
    || value.policy_identity !== RC7_GATE_C_RLM_LAUNCHER_POLICY_ID || value.launch_sha256 !== launch.launch_sha256
    || value.image_definition_sha256 !== imageDefinition.image_definition_sha256
    || value.package_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("PACKAGE_IDENTITY_MISMATCH", "Launch package identity mismatched");
  return value;
}

export async function prepareRc7GateCRlmLauncher(root, input) {
  const safeRoot = await assertRc7GateCRlmExternalRoot(root, { requireEmpty: true });
  const rootIdentity = await rlmRootIdentity(safeRoot);
  const semanticBytes = validatePrepareInput(input);
  const imageDefinition = await buildRc7GateCRlmImageDefinition();
  const sourceRoot = path.join(safeRoot, SOURCE_DIR);
  const launcherRoot = path.join(safeRoot, LAUNCHER_DIR);
  const exchangeRoot = path.join(safeRoot, EXCHANGE_DIR);
  const retainedRoot = path.join(safeRoot, RETAINED_DIR);
  await Promise.all([mkdir(sourceRoot), mkdir(launcherRoot), mkdir(exchangeRoot), mkdir(retainedRoot)]);
  await Promise.all([
    mkdir(path.join(exchangeRoot, "commands")), mkdir(path.join(exchangeRoot, "requests")),
    mkdir(path.join(exchangeRoot, "responses")), mkdir(path.join(exchangeRoot, "results")),
    mkdir(path.join(exchangeRoot, "checkpoints")),
  ]);
  await writeFile(path.join(sourceRoot, "semantic-request.json"), semanticBytes, { flag: "wx", mode: 0o400 });
  const launch = withDigest({
    schema_version: "rc7-gate-c-rlm-launch-contract-v1", policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
    activation_sha256: input.activation_sha256, run_identity: input.run_identity, case_id: input.case_id,
    arm: input.arm, selected_route: input.selected_route, intent_sha256: input.intent_sha256,
    dispatch_sha256: input.dispatch_sha256, semantic_request_sha256: input.semantic_request_sha256,
    image_id: input.image_id, image_definition_sha256: imageDefinition.image_definition_sha256,
    worker_sha256: imageDefinition.files.worker.sha256, max_children: RC7_GATE_C_RLM_LIMITS.child_requests,
    max_depth: RC7_GATE_C_RLM_LIMITS.depth, direct_provider_access: "denied-network-none",
    exchange_protocol: RC7_GATE_C_RLM_EXCHANGE_SCHEMA,
  }, "launch_sha256");
  await atomicWrite(path.join(launcherRoot, "launch.json"), launch);
  const packageValue = withDigest({
    schema_version: RC7_GATE_C_RLM_LAUNCHER_SCHEMA, state: "prepared-provider-unreachable",
    policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID, launch_sha256: launch.launch_sha256,
    image_definition_sha256: imageDefinition.image_definition_sha256,
    rlm_root_identity: rootIdentity,
    visible_source: { directory: SOURCE_DIR, files: ["semantic-request.json"], read_only_mount: "/rc7/source", semantic_request_sha256: input.semantic_request_sha256 },
    launcher_input: { directory: LAUNCHER_DIR, files: ["launch.json"], read_only_mount: "/rc7/launcher", launch_sha256: launch.launch_sha256 },
    exchange: {
      directory: EXCHANGE_DIR, mount: "/rc7/exchange", mode: "one-exact-read-write-bind",
      protocol: RC7_GATE_C_RLM_EXCHANGE_SCHEMA, atomic_publication: "same-directory-hard-link-exclusive",
      container_child_proposals_are_provider_unreachable: true, host_broker_must_durably_reserve_before_provider_reachability: true,
      replay_after_unknown_dispatch: false,
    },
    containment: {
      image_id: input.image_id, image_definition_sha256: imageDefinition.image_definition_sha256,
      network: "none", rootfs: "read-only", user: "65532:65532", capabilities: "drop-all",
      no_new_privileges: true, outer_seccomp_sha256: imageDefinition.files.outer_seccomp.sha256,
      internal_state_tmpfs: true, internal_output_tmpfs: true, direct_provider_access: "denied-network-none",
      python_exchange_access_after_phase_two: "denied-by-tsync-open-and-mutation-syscall-filter",
    },
    one_variable: {
      fixed_across_arms: ["provider", "model", "configured-snapshot", "reasoning", "top-level-semantic-prompt", "visible-source", "output-contract", "evaluator", "shared-permission-identity"],
      treatment_only: ["pinned-RLM-KernelManager", "contained-persistent-Python", "typed-host-request-bridge", "up-to-four-brokered-child-requests", "declared-contained-OS-authority"],
      generic_cases_must_not_prepare_this_launcher: true,
    },
    counts: { provider_calls: 0, simulated_provider_requests: 0, rlm_executions: 0, credential_accesses: 0, network_requests: 0, docker_executions: 0 },
  }, "package_sha256");
  await atomicWrite(path.join(retainedRoot, PACKAGE_FILE), packageValue);
  return { root: safeRoot, root_identity: rootIdentity, image_definition: imageDefinition, launch, package: packageValue };
}

export async function publishRc7GateCRlmProgram(root, input) {
  exactKeys(input, ["activation_sha256", "base_output", "base_output_sha256", "dispatch_sha256", "intent_sha256", "python_code", "run_identity", "semantic_request_sha256"], "program publication input");
  const context = await inspectRc7GateCRlmLauncher(root);
  const launch = context.launch;
  for (const key of ["activation_sha256", "dispatch_sha256", "intent_sha256", "run_identity", "semantic_request_sha256"]) if (input[key] !== launch[key]) fail("PROGRAM_IDENTITY_MISMATCH", `${key} differs from the launch contract`);
  if (typeof input.python_code !== "string" || Buffer.byteLength(input.python_code, "utf8") < 1 || Buffer.byteLength(input.python_code, "utf8") > RC7_GATE_C_RLM_LIMITS.program_bytes) fail("PROGRAM_OVERSIZED", "RLM Python program is missing or oversized");
  let parsedBaseOutput;
  try { parsedBaseOutput = parseRc7GateCStructuredOutput(Buffer.from(canonicalJsonV1(input.base_output), "utf8"), launch.case_id); }
  catch { fail("PROGRAM_BASE_OUTPUT_MISMATCH", "RLM base output is not one closed route output"); }
  if (input.base_output_sha256 !== parsedBaseOutput.normalized_sha256) fail("PROGRAM_BASE_OUTPUT_MISMATCH", "RLM base output digest mismatched");
  const program = withDigest({
    schema_version: "rc7-gate-c-rlm-program-v2", activation_sha256: launch.activation_sha256,
    run_identity: launch.run_identity, intent_sha256: launch.intent_sha256, dispatch_sha256: launch.dispatch_sha256,
    semantic_request_sha256: launch.semantic_request_sha256,
    base_output: parsedBaseOutput.value, base_output_sha256: parsedBaseOutput.normalized_sha256,
    python_code: input.python_code,
    python_code_sha256: sha256V1(input.python_code),
  }, "program_sha256");
  await atomicWrite(path.join(context.root, EXCHANGE_DIR, "commands", "program.json"), program);
  return program;
}

function mountSource(root, child) {
  return path.join(root, child);
}

export function buildRc7GateCRlmCreateArguments(context, seccompPath = OUTER_SECCOMP_PATH) {
  const { launch, root } = context;
  const labels = {
    "rc7.policy": RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
    "rc7.lease": launch.dispatch_sha256,
    "rc7.mode": "gate-c-rlm-launcher",
    "rc7.gate-c.activation-sha256": launch.activation_sha256,
    "rc7.gate-c.run-identity": launch.run_identity,
    "rc7.gate-c.case-id": launch.case_id,
    "rc7.gate-c.intent-sha256": launch.intent_sha256,
    "rc7.gate-c.dispatch-sha256": launch.dispatch_sha256,
    "rc7.gate-c.semantic-request-sha256": launch.semantic_request_sha256,
    "rc7.gate-c.image-definition-sha256": launch.image_definition_sha256,
    "rc7.gate-c.worker-sha256": launch.worker_sha256,
    "rc7.gate-c.permission-identity": RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
    "rc7.gate-c.direct-provider-access": "denied-network-none",
  };
  const args = ["create", "--name", `rc7-gc-rlm-${launch.dispatch_sha256.slice(0, 20)}`];
  for (const [name, value] of Object.entries(labels).sort(([left], [right]) => left.localeCompare(right))) args.push("--label", `${name}=${value}`);
  args.push(
    "--pull=never", "--network=none", "--read-only", "--user", "65532:65532", "--cap-drop=ALL",
    "--security-opt", "no-new-privileges:true", "--security-opt", `seccomp=${seccompPath}`,
    "--ipc=none", "--cgroupns=private", "--pids-limit", String(RC7_GATE_C_RLM_LIMITS.pids), "--cpus", "1",
    "--memory", String(RC7_GATE_C_RLM_LIMITS.memory_bytes), "--memory-swap", String(RC7_GATE_C_RLM_LIMITS.memory_bytes),
    "--ulimit", `fsize=${RC7_GATE_C_RLM_LIMITS.file_size_bytes}:${RC7_GATE_C_RLM_LIMITS.file_size_bytes}`,
    "--ulimit", `nofile=${RC7_GATE_C_RLM_LIMITS.nofile}:${RC7_GATE_C_RLM_LIMITS.nofile}`,
    "--init", "--log-driver=none", "--runtime=runc", "--stop-timeout=1",
    "--mount", `type=bind,src=${mountSource(root, SOURCE_DIR)},dst=/rc7/source,readonly`,
    "--mount", `type=bind,src=${mountSource(root, LAUNCHER_DIR)},dst=/rc7/launcher,readonly`,
    "--mount", `type=bind,src=${mountSource(root, EXCHANGE_DIR)},dst=/rc7/exchange`,
    "--tmpfs", `/rc7/state:rw,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.state_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.state_inodes},uid=65532,gid=65532,mode=0700`,
    "--tmpfs", `/rc7/output:rw,noexec,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.output_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.output_inodes},uid=65532,gid=65532,mode=0700`,
    "--env", `RC7_GATE_C_POLICY=${RC7_GATE_C_RLM_LAUNCHER_POLICY_ID}`, "--env", `RC7_GATE_C_ACTIVATION_SHA256=${launch.activation_sha256}`,
    "--env", `RC7_GATE_C_RUN_IDENTITY=${launch.run_identity}`, "--env", `RC7_GATE_C_INTENT_SHA256=${launch.intent_sha256}`,
    "--env", `RC7_GATE_C_DISPATCH_SHA256=${launch.dispatch_sha256}`, "--env", "TZ=UTC", "--env", "LANG=C.UTF-8", "--env", "LC_ALL=C.UTF-8", "--env", "HOME=/rc7/state/home", "--env", "TMPDIR=/rc7/state/tmp",
    launch.image_id,
  );
  return { args, labels, seccomp_path: seccompPath };
}

function inspectEnv(values) {
  if (!Array.isArray(values)) fail("ENVIRONMENT_IDENTITY_MISMATCH", "Container environment is absent");
  const entries = values.map((value) => {
    const delimiter = typeof value === "string" ? value.indexOf("=") : -1;
    if (delimiter < 1) fail("ENVIRONMENT_IDENTITY_MISMATCH", "Container environment entry is malformed");
    return [value.slice(0, delimiter), value.slice(delimiter + 1)];
  });
  if (new Set(entries.map(([name]) => name)).size !== entries.length) fail("ENVIRONMENT_IDENTITY_MISMATCH", "Container environment contains duplicate names");
  return Object.fromEntries(entries);
}

function expectedEnvironment(context) {
  return {
    ...RC7_GATE_C_RLM_INHERITED_ENVIRONMENT,
    HOME: "/rc7/state/home",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    RC7_GATE_C_ACTIVATION_SHA256: context.launch.activation_sha256,
    RC7_GATE_C_DISPATCH_SHA256: context.launch.dispatch_sha256,
    RC7_GATE_C_INTENT_SHA256: context.launch.intent_sha256,
    RC7_GATE_C_POLICY: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
    RC7_GATE_C_RUN_IDENTITY: context.launch.run_identity,
    TMPDIR: "/rc7/state/tmp",
    TZ: "UTC",
  };
}

function validateMounts(item, context) {
  if (!Array.isArray(item.Mounts) || item.Mounts.length !== 3) fail("MOUNT_IDENTITY_MISMATCH", "Gate C launcher requires exactly three binds");
  const byDestination = new Map(item.Mounts.map((entry) => [entry.Destination, entry]));
  const expected = [
    ["/rc7/source", mountSource(context.root, SOURCE_DIR), false],
    ["/rc7/launcher", mountSource(context.root, LAUNCHER_DIR), false],
    ["/rc7/exchange", mountSource(context.root, EXCHANGE_DIR), true],
  ];
  for (const [destination, source, writable] of expected) {
    const observed = byDestination.get(destination);
    if (!observed || observed.Type !== "bind" || normalized(observed.Source) !== normalized(source) || observed.RW !== writable) fail("MOUNT_IDENTITY_MISMATCH", `${destination} bind identity mismatched`);
  }
}

export function validateRc7GateCRlmDockerInspect(value, context, containerId) {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== "object") fail("DOCKER_INSPECT_MISMATCH", "Expected one exact Docker inspection");
  const item = value[0];
  const host = item.HostConfig ?? {};
  const config = item.Config ?? {};
  const state = item.State ?? {};
  if (item.Id !== containerId || item.Image !== context.launch.image_id || state.Running !== true || state.Paused !== false || state.Restarting !== false || state.Dead !== false) fail("CONTAINER_IDENTITY_MISMATCH", "Live container identity or state mismatched");
  if (host.NetworkMode !== "none" || host.ReadonlyRootfs !== true || host.Privileged !== false || host.IpcMode !== "none"
    || !["", "private"].includes(host.PidMode) || host.CgroupnsMode !== "private" || config.User !== "65532:65532") fail("CONTAINMENT_WEAKENED", "Namespace, rootfs, privilege, or user boundary weakened");
  if ((host.CapAdd?.length ?? 0) !== 0 || canonicalJsonV1(host.CapDrop ?? []) !== canonicalJsonV1(["ALL"])) fail("CONTAINMENT_WEAKENED", "Capability boundary weakened");
  const security = [...(host.SecurityOpt ?? [])];
  const seccomp = security.filter((entry) => entry.startsWith("seccomp="));
  if (security.length !== 2 || !security.includes("no-new-privileges:true") || seccomp.length !== 1
    || sha256V1(seccomp[0]) !== context.image_definition.files.outer_seccomp_inspect_sha256) fail("CONTAINMENT_WEAKENED", "Security options mismatched");
  if (host.PidsLimit !== RC7_GATE_C_RLM_LIMITS.pids || host.Memory !== RC7_GATE_C_RLM_LIMITS.memory_bytes
    || host.MemorySwap !== RC7_GATE_C_RLM_LIMITS.memory_bytes || host.NanoCpus !== RC7_GATE_C_RLM_LIMITS.cpu_nanos) fail("RESOURCE_IDENTITY_MISMATCH", "Container resources mismatched");
  const ulimits = [...(host.Ulimits ?? [])].map((entry) => ({ Name: entry.Name, Soft: entry.Soft, Hard: entry.Hard })).sort((left, right) => left.Name.localeCompare(right.Name));
  if (canonicalJsonV1(ulimits) !== canonicalJsonV1([
    { Name: "fsize", Soft: RC7_GATE_C_RLM_LIMITS.file_size_bytes, Hard: RC7_GATE_C_RLM_LIMITS.file_size_bytes },
    { Name: "nofile", Soft: RC7_GATE_C_RLM_LIMITS.nofile, Hard: RC7_GATE_C_RLM_LIMITS.nofile },
  ])) fail("RESOURCE_IDENTITY_MISMATCH", "Container ulimit identity mismatched");
  const labels = config.Labels ?? {};
  const expectedLabels = buildRc7GateCRlmCreateArguments(context).labels;
  for (const [name, expected] of Object.entries(expectedLabels)) if (labels[name] !== expected) fail("CONTAINER_IDENTITY_MISMATCH", `Container label ${name} mismatched`);
  if (Object.keys(labels).some((name) => name.startsWith("rc7.gate-c.") && !(name in expectedLabels))) fail("CONTAINER_IDENTITY_MISMATCH", "Unregistered Gate C labels are denied");
  if (canonicalJsonV1(inspectEnv(config.Env)) !== canonicalJsonV1(expectedEnvironment(context))) fail("ENVIRONMENT_IDENTITY_MISMATCH", "Container environment identity mismatched");
  if (host.Init !== true || host.LogConfig?.Type !== "none" || Object.keys(host.LogConfig?.Config ?? {}).length !== 0 || host.Runtime !== "runc" || config.StopTimeout !== 1
    || !host.RestartPolicy || host.RestartPolicy.Name !== "no" || (host.RestartPolicy.MaximumRetryCount ?? 0) !== 0) fail("CONTAINMENT_WEAKENED", "Container lifecycle or logging boundary weakened");
  if (host.Binds?.length || host.Devices?.length || host.DeviceRequests?.length || host.Links?.length || host.VolumesFrom?.length
    || host.PortBindings && Object.keys(host.PortBindings).length || config.ExposedPorts && Object.keys(config.ExposedPorts).length
    || Object.keys(item.NetworkSettings?.Ports ?? {}).length) fail("CONTAINMENT_WEAKENED", "Unexpected device, port, volume, or link authority present");
  validateMounts(item, context);
  const expectedTmpfs = {
    "/rc7/state": `rw,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.state_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.state_inodes},uid=65532,gid=65532,mode=0700`,
    "/rc7/output": `rw,noexec,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.output_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.output_inodes},uid=65532,gid=65532,mode=0700`,
  };
  for (const [destination, options] of Object.entries(expectedTmpfs)) {
    const actual = (host.Tmpfs?.[destination] ?? "").split(",").filter(Boolean).sort();
    if (canonicalJsonV1(actual) !== canonicalJsonV1(options.split(",").sort())) fail("MOUNT_IDENTITY_MISMATCH", `${destination} tmpfs identity mismatched`);
  }
  return item;
}

export function buildRc7GateCRlmLiveInspectIdentity(item, context) {
  const value = {
    schema_version: "rc7-gate-c-rlm-live-inspect-v1", state: "broker-inspect-live-rlm-container",
    policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID, activation_sha256: context.launch.activation_sha256,
    run_identity: context.launch.run_identity, intent_sha256: context.launch.intent_sha256,
    dispatch_sha256: context.launch.dispatch_sha256, semantic_request_sha256: context.launch.semantic_request_sha256,
    container_id: item.Id, image_id: item.Image, image_definition_sha256: context.launch.image_definition_sha256,
    source_mount_sha256: context.launch.semantic_request_sha256, launcher_mount_sha256: context.launch.launch_sha256,
    exchange_identity: sha256V1(canonicalJsonV1({ protocol: RC7_GATE_C_RLM_EXCHANGE_SCHEMA, root: path.basename(context.root), dispatch_sha256: context.launch.dispatch_sha256 })),
    network: "none", direct_container_provider_access: "denied-network-none",
    phase_two_expected: "worker-result-must-prove-tsync-and-python-filesystem-open-denial",
  };
  return withDigest(value, "attestation_sha256");
}

export function buildRc7GateCHostHandoff({ broker_result: brokerResult, nonce = randomBytes(32).toString("hex") }) {
  exactKeys(brokerResult, ["sealed", "dispatch", "expected_closure", "wire_contract", "gate_b"], "broker preflight result");
  if (!HASH.test(nonce)) fail("HOST_HANDOFF_MISMATCH", "Host handoff nonce must be one 256-bit lowercase identity");
  return withDigest({
    schema_version: "rc7-gate-c-host-handoff-v1", state: "host-preflight-complete-one-use",
    nonce, broker_result: brokerResult,
  }, "handoff_sha256");
}

export function validateRc7GateCHostHandoffAck(ack, handoff, expected) {
  exactKeys(ack, ["schema_version", "state", "nonce", "handoff_sha256", "dispatch_sha256", "stage_manifest_sha256", "capsule_sha256", "ack_sha256"], "host handoff ack");
  exactKeys(expected, ["capsule_sha256", "dispatch_sha256", "stage_manifest_sha256"], "host handoff expected ack");
  const projection = { ...ack };
  delete projection.ack_sha256;
  if (ack.schema_version !== "rc7-gate-c-host-handoff-ack-v1" || ack.state !== "accepted-before-credential-or-provider-authority"
    || ack.nonce !== handoff.nonce || ack.handoff_sha256 !== handoff.handoff_sha256
    || ack.dispatch_sha256 !== expected.dispatch_sha256 || ack.stage_manifest_sha256 !== expected.stage_manifest_sha256
    || ack.capsule_sha256 !== expected.capsule_sha256 || ack.ack_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("HOST_HANDOFF_ACK_MISMATCH", "Capsule ack does not match the host-owned preflight and exact stage");
  return ack;
}

export function buildRc7GateCHostHandoffCommit(handoff, ack) {
  return withDigest({
    schema_version: "rc7-gate-c-host-handoff-commit-v1", state: "host-ack-validated-execute-once",
    nonce: handoff.nonce, handoff_sha256: handoff.handoff_sha256, ack_sha256: ack.ack_sha256,
  }, "commit_sha256");
}

function validateProgram(value, launch) {
  exactKeys(value, ["schema_version", "activation_sha256", "run_identity", "intent_sha256", "dispatch_sha256", "semantic_request_sha256", "base_output", "base_output_sha256", "python_code", "python_code_sha256", "program_sha256"], "RLM program");
  const projection = { ...value };
  delete projection.program_sha256;
  let parsedBaseOutput;
  try { parsedBaseOutput = parseRc7GateCStructuredOutput(Buffer.from(canonicalJsonV1(value.base_output), "utf8"), launch.case_id); }
  catch { fail("PROGRAM_IDENTITY_MISMATCH", "RLM program base output is malformed"); }
  if (value.schema_version !== "rc7-gate-c-rlm-program-v2" || value.activation_sha256 !== launch.activation_sha256
    || value.run_identity !== launch.run_identity || value.intent_sha256 !== launch.intent_sha256
    || value.dispatch_sha256 !== launch.dispatch_sha256 || value.semantic_request_sha256 !== launch.semantic_request_sha256
    || value.base_output_sha256 !== parsedBaseOutput.normalized_sha256
    || typeof value.python_code !== "string" || Buffer.byteLength(value.python_code, "utf8") < 1
    || Buffer.byteLength(value.python_code, "utf8") > RC7_GATE_C_RLM_LIMITS.program_bytes
    || value.python_code_sha256 !== sha256V1(value.python_code) || value.program_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("PROGRAM_IDENTITY_MISMATCH", "RLM program identity mismatched");
  return value;
}

function validateChildProposal(value, launch, expectedSequence) {
  exactKeys(value, [
    "schema_version", "state", "activation_sha256", "run_identity", "intent_sha256", "dispatch_sha256",
    "semantic_request_sha256", "child_sequence", "parent_depth", "child_depth", "child_question", "excerpt_locator",
    "max_children", "max_depth", "request_sha256",
  ], "child proposal");
  const projection = { ...value };
  delete projection.request_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-child-proposal-v1" || value.state !== "proposed-provider-unreachable"
    || value.activation_sha256 !== launch.activation_sha256 || value.run_identity !== launch.run_identity
    || value.intent_sha256 !== launch.intent_sha256 || value.dispatch_sha256 !== launch.dispatch_sha256
    || value.semantic_request_sha256 !== launch.semantic_request_sha256 || value.child_sequence !== expectedSequence
    || value.parent_depth < 0 || value.child_depth !== value.parent_depth + 1 || value.child_depth > RC7_GATE_C_RLM_LIMITS.depth
    || value.max_children !== RC7_GATE_C_RLM_LIMITS.child_requests || value.max_depth !== RC7_GATE_C_RLM_LIMITS.depth
    || typeof value.child_question !== "string" || Buffer.byteLength(value.child_question, "utf8") < 1
    || Buffer.byteLength(value.child_question, "utf8") > 2_048 || /(?:https?:\/\/|ftp:\/\/|file:\/\/|credential|secret|oauth|api[-_]?key)/iu.test(value.child_question)
    || !value.excerpt_locator || typeof value.excerpt_locator !== "object" || Array.isArray(value.excerpt_locator)
    || value.request_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("CHILD_PROPOSAL_MISMATCH", "Child proposal identity, authority, depth, or budget mismatched");
  return value;
}

function validateBrokerChildResult(value, request) {
  exactKeys(value, ["state", "request_sha256", "durable_intent_sha256", "durable_dispatch_sha256", "sealed_result_sha256", "response_text", "response_text_sha256"], "broker child result");
  if (value.state !== "durable-intent-dispatched-once-trusted-sealed" || value.request_sha256 !== request.request_sha256
    || !HASH.test(value.durable_intent_sha256 ?? "") || !HASH.test(value.durable_dispatch_sha256 ?? "")
    || !HASH.test(value.sealed_result_sha256 ?? "") || typeof value.response_text !== "string"
    || Buffer.byteLength(value.response_text, "utf8") > 32_768 || value.response_text_sha256 !== sha256V1(value.response_text)) fail("BROKER_CHILD_RESULT_MISMATCH", "Broker child result is not one durable trusted sealed result");
  return value;
}

function validatePhaseTwoAttestation(value, launch) {
  exactKeys(value, [
    "schema_version", "state", "activation_sha256", "run_identity", "intent_sha256", "dispatch_sha256",
    "semantic_request_sha256", "worker_sha256", "phase_two", "phase_two_sha256",
  ], "phase-two attestation");
  exactKeys(value.phase_two, [
    "all_before_capabilities_zero", "all_before_no_new_privileges", "all_before_seccomp_two", "clone3_action",
    "filesystem_open_denied_after_filter", "flag", "new_thread_survived",
  ], "phase-two evidence");
  const projection = { ...value };
  delete projection.phase_two_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-phase-two-attestation-v1" || value.state !== "tsync-active-before-program-and-child-proposals"
    || value.activation_sha256 !== launch.activation_sha256 || value.run_identity !== launch.run_identity
    || value.intent_sha256 !== launch.intent_sha256 || value.dispatch_sha256 !== launch.dispatch_sha256
    || value.semantic_request_sha256 !== launch.semantic_request_sha256 || value.worker_sha256 !== launch.worker_sha256
    || value.phase_two.flag !== "SECCOMP_FILTER_FLAG_TSYNC" || value.phase_two.clone3_action !== "ENOSYS-for-safe-clone-thread-fallback"
    || value.phase_two.all_before_capabilities_zero !== true || value.phase_two.all_before_no_new_privileges !== true
    || value.phase_two.all_before_seccomp_two !== true || value.phase_two.filesystem_open_denied_after_filter !== true
    || value.phase_two.new_thread_survived !== true || value.phase_two_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("PHASE_TWO_NOT_PROVEN", "Phase-two TSYNC evidence is absent, malformed, or not bound to this launch");
  return value;
}

async function readPhaseTwoAttestation(context, { optional = false } = {}) {
  try {
    const record = await readCanonical(path.join(context.root, EXCHANGE_DIR, "results", PHASE_TWO_FILE), context.root, "phase-two attestation");
    return validatePhaseTwoAttestation(record.value, context.launch);
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    if (error?.code === "ENOENT") fail("PHASE_TWO_NOT_PROVEN", "Phase-two TSYNC evidence must be retained before any child proposal can reach the broker");
    throw error;
  }
}

function responseFor(request, brokerResult) {
  return withDigest({
    schema_version: "rc7-gate-c-rlm-child-response-v1", state: "trusted-sealed",
    activation_sha256: request.activation_sha256, run_identity: request.run_identity,
    dispatch_sha256: request.dispatch_sha256, child_sequence: request.child_sequence,
    request_sha256: request.request_sha256, response_text: brokerResult.response_text,
    response_text_sha256: brokerResult.response_text_sha256, sealed_result_sha256: brokerResult.sealed_result_sha256,
  }, "response_sha256");
}

async function checkpoint(context, sequence, event, data) {
  const value = withDigest({
    schema_version: "rc7-gate-c-rlm-launch-checkpoint-v1", sequence, event,
    dispatch_sha256: context.launch.dispatch_sha256, data,
  }, "checkpoint_sha256");
  await atomicWrite(path.join(context.root, EXCHANGE_DIR, "checkpoints", `${String(sequence).padStart(4, "0")}-${event.toLowerCase()}.json`), value);
  return value;
}

export async function serviceRc7GateCRlmChildProposal(root, brokerChild, timing = undefined) {
  if (typeof brokerChild !== "function") fail("BROKER_REQUIRED", "A host-owned durable child broker callback is required");
  const deadlineMs = timing?.deadline_ms ?? (Date.now() + 300_000);
  const abortSignal = timing?.abort_signal ?? null;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) fail("CONTAINER_TIMEOUT", "Child broker deadline is malformed");
  if (abortSignal !== null && !(abortSignal instanceof AbortSignal)) fail("CONTAINER_TIMEOUT", "Child broker abort signal is malformed");
  const context = await inspectRc7GateCRlmLauncher(root);
  await readPhaseTwoAttestation(context);
  const requestRoot = path.join(context.root, EXCHANGE_DIR, "requests");
  const responseRoot = path.join(context.root, EXCHANGE_DIR, "responses");
  const requestEntries = (await readdir(requestRoot)).sort();
  const responses = new Set((await readdir(responseRoot)).sort());
  const requests = requestEntries.filter((entry) => REQUEST_FILE.test(entry));
  const transientRequests = requestEntries.filter((entry) => REQUEST_TEMP_FILE.test(entry));
  if (requestEntries.length !== requests.length + transientRequests.length || transientRequests.length > 1
    || [...responses].some((entry) => !REQUEST_FILE.test(entry))) fail("UNKNOWN_RESIDUE", "Unknown broker exchange artifacts are denied");
  if (transientRequests.length === 1) {
    const sequence = Number(REQUEST_TEMP_FILE.exec(transientRequests[0])[1]);
    const finalSequences = new Set(requests.map((entry) => Number(entry.slice(0, 4))));
    if (sequence < 1 || sequence > RC7_GATE_C_RLM_LIMITS.child_requests
      || !(sequence === requests.length + 1 || finalSequences.has(sequence))) fail("UNKNOWN_RESIDUE", "Transient broker publication is out of sequence");
    return { serviced: false, sequence: null };
  }
  let expectedSequence = 1;
  for (const entry of requests) {
    const sequence = Number(entry.slice(0, 4));
    if (sequence !== expectedSequence || sequence > RC7_GATE_C_RLM_LIMITS.child_requests) fail("CHILD_SEQUENCE_MISMATCH", "Child proposal sequence is missing, duplicated, or over budget");
    const requestRecord = await readCanonical(path.join(requestRoot, entry), context.root, "child proposal");
    const request = validateChildProposal(requestRecord.value, context.launch, sequence);
    if (!responses.has(entry)) {
      await checkpoint(context, 100 + sequence * 2, "CHILD_BROKER_HANDOFF_STARTED", { child_sequence: sequence, request_sha256: request.request_sha256, provider_reachability_indeterminate_after_this_checkpoint: true });
      const remainingMs = Math.min(120_000, deadlineMs - Date.now());
      if (remainingMs < 1) fail("CONTAINER_TIMEOUT", "RLM wall expired before the child request could complete");
      const childDeadlineMs = Date.now() + remainingMs;
      let timer;
      let abortListener;
      const unvalidated = await Promise.race([
        brokerChild(request, Object.freeze({ deadline_ms: childDeadlineMs, host_timeout_ms: remainingMs })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Rc7GateCRlmLauncherError("CHILD_RESPONSE_TIMEOUT", "Child broker exceeded the remaining closed RLM wall")), remainingMs); }),
        ...(abortSignal === null ? [] : [new Promise((_, reject) => {
          abortListener = () => reject(new Rc7GateCRlmLauncherError("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired"));
          if (abortSignal.aborted) abortListener();
          else abortSignal.addEventListener("abort", abortListener, { once: true });
        })]),
      ]).finally(() => {
        clearTimeout(timer);
        if (abortListener) abortSignal.removeEventListener("abort", abortListener);
      });
      const brokerResult = validateBrokerChildResult(unvalidated, request);
      const response = responseFor(request, brokerResult);
      await atomicWrite(path.join(responseRoot, entry), response);
      await checkpoint(context, 101 + sequence * 2, "CHILD_RESPONSE_SEALED", {
        child_sequence: sequence, request_sha256: request.request_sha256,
        durable_intent_sha256: brokerResult.durable_intent_sha256, durable_dispatch_sha256: brokerResult.durable_dispatch_sha256,
        sealed_result_sha256: brokerResult.sealed_result_sha256, response_sha256: response.response_sha256,
      });
      return { serviced: true, sequence, request, response };
    }
    const responseRecord = await readCanonical(path.join(responseRoot, entry), context.root, "child response");
    exactKeys(responseRecord.value, ["schema_version", "state", "activation_sha256", "run_identity", "dispatch_sha256", "child_sequence", "request_sha256", "response_text", "response_text_sha256", "sealed_result_sha256", "response_sha256"], "child response");
    if (responseRecord.value.request_sha256 !== request.request_sha256 || responseRecord.value.child_sequence !== sequence) fail("CHILD_RESPONSE_MISMATCH", "Retained child response mismatched its proposal");
    expectedSequence += 1;
  }
  return { serviced: false, sequence: null };
}

function validateContainerResult(value, context) {
  exactKeys(value, [
    "schema_version", "state", "policy_identity", "activation_sha256", "run_identity", "intent_sha256",
    "dispatch_sha256", "semantic_request_sha256", "image_id", "worker_sha256", "program_sha256",
    "component_commit", "kernel_generation", "phase_two", "child_request_count", "child_request_sha256s",
    "route_output", "route_output_sha256", "direct_container_provider_access", "result_sha256",
  ], "container result");
  const projection = { ...value };
  delete projection.result_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-container-result-v1" || value.state !== "sealed-provider-free-container-output"
    || value.policy_identity !== RC7_GATE_C_RLM_LAUNCHER_POLICY_ID || value.activation_sha256 !== context.launch.activation_sha256
    || value.run_identity !== context.launch.run_identity || value.intent_sha256 !== context.launch.intent_sha256
    || value.dispatch_sha256 !== context.launch.dispatch_sha256 || value.semantic_request_sha256 !== context.launch.semantic_request_sha256
    || value.image_id !== context.launch.image_id || value.worker_sha256 !== context.launch.worker_sha256
    || value.component_commit !== RC7_GATE_C_RLM_COMPONENT_COMMIT || !Number.isSafeInteger(value.kernel_generation) || value.kernel_generation < 1
    || !Number.isSafeInteger(value.child_request_count) || value.child_request_count < 0 || value.child_request_count > RC7_GATE_C_RLM_LIMITS.child_requests
    || !Array.isArray(value.child_request_sha256s) || value.child_request_sha256s.length !== value.child_request_count
    || value.child_request_sha256s.some((digest) => !HASH.test(digest)) || value.direct_container_provider_access !== "denied-network-none"
    || value.phase_two?.flag !== "SECCOMP_FILTER_FLAG_TSYNC" || value.phase_two?.filesystem_open_denied_after_filter !== true
    || value.phase_two?.new_thread_survived !== true || value.route_output_sha256 !== sha256V1(canonicalJsonV1(value.route_output))
    || value.result_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("CONTAINER_RESULT_MISMATCH", "Container result identity, containment, budget, or artifact mismatched");
  return value;
}

function validateRetainedLiveInspect(value, context) {
  exactKeys(value, [
    "schema_version", "state", "policy_identity", "activation_sha256", "run_identity", "intent_sha256", "dispatch_sha256",
    "semantic_request_sha256", "container_id", "image_id", "image_definition_sha256", "source_mount_sha256",
    "launcher_mount_sha256", "exchange_identity", "network", "direct_container_provider_access", "phase_two_expected", "attestation_sha256",
  ], "retained live inspection");
  const projection = { ...value };
  delete projection.attestation_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-live-inspect-v1" || value.state !== "broker-inspect-live-rlm-container"
    || value.policy_identity !== RC7_GATE_C_RLM_LAUNCHER_POLICY_ID || value.activation_sha256 !== context.launch.activation_sha256
    || value.run_identity !== context.launch.run_identity || value.intent_sha256 !== context.launch.intent_sha256
    || value.dispatch_sha256 !== context.launch.dispatch_sha256 || value.semantic_request_sha256 !== context.launch.semantic_request_sha256
    || !CONTAINER.test(value.container_id ?? "") || value.image_id !== context.launch.image_id
    || value.image_definition_sha256 !== context.launch.image_definition_sha256 || value.source_mount_sha256 !== context.launch.semantic_request_sha256
    || value.launcher_mount_sha256 !== context.launch.launch_sha256 || value.network !== "none"
    || value.direct_container_provider_access !== "denied-network-none"
    || value.phase_two_expected !== "worker-result-must-prove-tsync-and-python-filesystem-open-denial"
    || value.attestation_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("CONTAINER_RESULT_MISMATCH", "Retained live inspection no longer binds the exact launch");
  return value;
}

function validateFinalArtifact(value, context, evidence) {
  exactKeys(value, [
    "schema_version", "state", "policy_identity", "activation_sha256", "run_identity", "intent_sha256", "dispatch_sha256",
    "image_id", "live_inspect_sha256", "program_sha256", "phase_two_sha256", "container_result_sha256", "route_output",
    "route_output_sha256", "child_request_count", "cleanup_state", "cleanup_residue_entries", "artifact_sha256",
  ], "RLM final artifact");
  const projection = { ...value };
  delete projection.artifact_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-final-artifact-v1" || value.state !== "trusted-sealed-cleanup-verified"
    || value.policy_identity !== RC7_GATE_C_RLM_LAUNCHER_POLICY_ID || value.activation_sha256 !== context.launch.activation_sha256
    || value.run_identity !== context.launch.run_identity || value.intent_sha256 !== context.launch.intent_sha256
    || value.dispatch_sha256 !== context.launch.dispatch_sha256 || value.image_id !== context.launch.image_id
    || value.live_inspect_sha256 !== evidence.live_inspect.attestation_sha256 || value.program_sha256 !== evidence.program.program_sha256
    || value.phase_two_sha256 !== evidence.phase_two.phase_two_sha256 || value.container_result_sha256 !== evidence.container_result.result_sha256
    || canonicalJsonV1(value.route_output) !== canonicalJsonV1(evidence.container_result.route_output)
    || value.route_output_sha256 !== evidence.container_result.route_output_sha256
    || value.child_request_count !== evidence.container_result.child_request_count
    || value.cleanup_state !== "verified-no-labelled-container-residue" || value.cleanup_residue_entries !== 0
    || value.artifact_sha256 !== sha256V1(canonicalJsonV1(projection))) fail("CONTAINER_RESULT_MISMATCH", "RLM final artifact no longer closes over the retained launch evidence");
  return value;
}

export async function inspectRc7GateCRlmCompletedArtifact(root) {
  const context = await inspectRc7GateCRlmLauncher(root);
  const [programRecord, liveRecord, containerRecord, finalRecord] = await Promise.all([
    readCanonical(path.join(context.root, EXCHANGE_DIR, "commands", "program.json"), context.root, "RLM program", RC7_GATE_C_RLM_LIMITS.exchange_artifact_bytes),
    readCanonical(path.join(context.root, RETAINED_DIR, LIVE_INSPECT_FILE), context.root, "retained live inspection"),
    readCanonical(path.join(context.root, EXCHANGE_DIR, "results", "container-result.json"), context.root, "container result", 262_144),
    readCanonical(path.join(context.root, RETAINED_DIR, FINAL_FILE), context.root, "RLM final artifact", 262_144),
  ]);
  const program = validateProgram(programRecord.value, context.launch);
  const liveInspect = validateRetainedLiveInspect(liveRecord.value, context);
  const phaseTwo = await readPhaseTwoAttestation(context);
  const containerResult = validateContainerResult(containerRecord.value, context);
  if (canonicalJsonV1(containerResult.phase_two) !== canonicalJsonV1(phaseTwo.phase_two)) fail("PHASE_TWO_NOT_PROVEN", "Retained container result changed the phase-two evidence");
  const finalArtifact = validateFinalArtifact(finalRecord.value, context, { program, live_inspect: liveInspect, phase_two: phaseTwo, container_result: containerResult });
  return { root: context.root, launch: context.launch, program, live_inspect: liveInspect, phase_two: phaseTwo, container_result: containerResult, final_artifact: finalArtifact };
}

async function acquireLock(root) {
  try { return await open(path.join(root, LOCK_FILE), fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600); }
  catch (error) { if (error?.code === "EEXIST") fail("CONCURRENT_RECOVERY", "Launcher root is already locked"); throw error; }
}

async function releaseLock(root, handle) {
  await handle.close();
  await unlink(path.join(root, LOCK_FILE)).catch(() => undefined);
}

export async function inspectRc7GateCRlmLauncher(root) {
  const safeRoot = await assertRc7GateCRlmExternalRoot(root);
  const rootIdentity = await rlmRootIdentity(safeRoot);
  for (const name of [SOURCE_DIR, LAUNCHER_DIR, EXCHANGE_DIR, RETAINED_DIR]) await physicalDirectory(path.join(safeRoot, name), safeRoot, name);
  for (const name of ["commands", "requests", "responses", "results", "checkpoints"]) await physicalDirectory(path.join(safeRoot, EXCHANGE_DIR, name), safeRoot, `exchange/${name}`);
  const imageDefinition = await buildRc7GateCRlmImageDefinition();
  const semantic = await readCanonical(path.join(safeRoot, SOURCE_DIR, "semantic-request.json"), safeRoot, "semantic request", RC7_GATE_C_RLM_LIMITS.semantic_request_bytes + 1);
  const launchRecord = await readCanonical(path.join(safeRoot, LAUNCHER_DIR, "launch.json"), safeRoot, "launch contract");
  const launch = validateLaunch(launchRecord.value, imageDefinition);
  if (sha256V1(semantic.bytes) !== launch.semantic_request_sha256 || LEAK_PATTERN.test(semantic.bytes.toString("utf8"))) fail("SEMANTIC_REQUEST_MISMATCH", "Mounted semantic request is mismatched or evaluator-shaped");
  const packageRecord = await readCanonical(path.join(safeRoot, RETAINED_DIR, PACKAGE_FILE), safeRoot, "launch package");
  const packageValue = validatePackage(packageRecord.value, launch, imageDefinition, rootIdentity);
  const sourceEntries = (await readdir(path.join(safeRoot, SOURCE_DIR))).sort();
  const launcherEntries = (await readdir(path.join(safeRoot, LAUNCHER_DIR))).sort();
  if (canonicalJsonV1(sourceEntries) !== canonicalJsonV1(["semantic-request.json"]) || canonicalJsonV1(launcherEntries) !== canonicalJsonV1(["launch.json"])) fail("UNKNOWN_RESIDUE", "Read-only input roots contain unknown bytes");
  return { root: safeRoot, root_identity: rootIdentity, image_definition: imageDefinition, semantic_request: semantic.value, launch, package: packageValue };
}

async function labelled(controller, launch) {
  const values = await controller.list({ policy: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID, dispatch_sha256: launch.dispatch_sha256 });
  if (!Array.isArray(values) || values.some((value) => !CONTAINER.test(value))) fail("CONTROLLER_MISMATCH", "Fake or live controller returned malformed container identities");
  return values;
}

export async function runRc7GateCRlmWithController(root, options) {
  exactKeys(options, ["abort_signal", "broker_child", "controller"], "launcher run options");
  const controller = options.controller;
  if (!(options.abort_signal instanceof AbortSignal)) fail("CONTROLLER_REQUIRED", "Launcher requires the executor-owned abort signal");
  for (const method of ["create", "inspect", "list", "remove", "start", "tick"]) if (typeof controller?.[method] !== "function") fail("CONTROLLER_REQUIRED", `Injected controller.${method} is required`);
  const context = await inspectRc7GateCRlmLauncher(root);
  const lock = await acquireLock(context.root);
  let containerId = null;
  let outcome = null;
  let phaseTwoAttestation = null;
  let failure = null;
  const deadline = Date.now() + RC7_GATE_C_RLM_LIMITS.wall_timeout_ms;
  const assertActiveWall = () => {
    if (options.abort_signal.aborted) fail("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired");
    if (Date.now() >= deadline) fail("CONTAINER_TIMEOUT", "Container exceeded the frozen launcher wall timeout");
  };
  try {
    const programRecord = await readCanonical(path.join(context.root, EXCHANGE_DIR, "commands", "program.json"), context.root, "RLM program", RC7_GATE_C_RLM_LIMITS.exchange_artifact_bytes);
    const program = validateProgram(programRecord.value, context.launch);
    assertActiveWall();
    if ((await labelled(controller, context.launch)).length !== 0) fail("PREEXISTING_CONTAINER_RESIDUE", "A matching Gate C launcher container already exists");
    assertActiveWall();
    await checkpoint(context, 1, "CONTAINER_CREATE_INTENT", { image_id: context.launch.image_id, program_sha256: program.program_sha256 });
    const create = buildRc7GateCRlmCreateArguments(context);
    containerId = await controller.create(create);
    if (!CONTAINER.test(containerId ?? "")) fail("CONTAINER_IDENTITY_MISMATCH", "Controller create returned a malformed container ID");
    await checkpoint(context, 2, "CONTAINER_CREATED", { container_id: containerId });
    assertActiveWall();
    await controller.start(containerId);
    await checkpoint(context, 3, "CONTAINER_STARTED_PROVIDER_UNREACHABLE", { container_id: containerId });
    assertActiveWall();
    const inspected = validateRc7GateCRlmDockerInspect(await controller.inspect(containerId), context, containerId);
    const liveInspect = buildRc7GateCRlmLiveInspectIdentity(inspected, context);
    await atomicWrite(path.join(context.root, RETAINED_DIR, LIVE_INSPECT_FILE), liveInspect);
    await checkpoint(context, 4, "LIVE_INSPECT_SEALED_BEFORE_BROKER_SERVICE", { container_id: containerId, attestation_sha256: liveInspect.attestation_sha256 });
    for (;;) {
      assertActiveWall();
      await controller.tick({ container_id: containerId, context });
      phaseTwoAttestation ??= await readPhaseTwoAttestation(context, { optional: true });
      const proposalEntries = (await readdir(path.join(context.root, EXCHANGE_DIR, "requests"))).filter((entry) => /^\d{4}\.json$/u.test(entry));
      if (phaseTwoAttestation === null && proposalEntries.length !== 0) fail("PHASE_TWO_NOT_PROVEN", "A child proposal appeared before retained phase-two TSYNC evidence");
      if (phaseTwoAttestation !== null) {
        const serviced = await serviceRc7GateCRlmChildProposal(context.root, options.broker_child, { abort_signal: options.abort_signal, deadline_ms: deadline });
        if (serviced.serviced) continue;
      }
      const resultPath = path.join(context.root, EXCHANGE_DIR, "results", "container-result.json");
      try {
        await access(resultPath);
        const resultRecord = await readCanonical(resultPath, context.root, "container result", 262_144);
        if (phaseTwoAttestation === null) fail("PHASE_TWO_NOT_PROVEN", "Container result appeared without retained phase-two TSYNC evidence");
        const result = validateContainerResult(resultRecord.value, context);
        if (canonicalJsonV1(result.phase_two) !== canonicalJsonV1(phaseTwoAttestation.phase_two)) fail("PHASE_TWO_NOT_PROVEN", "Final container result changed the pre-program phase-two evidence");
        outcome = { liveInspect, phaseTwoAttestation, program, result };
        break;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const state = await controller.inspect(containerId);
      if (!Array.isArray(state) || state.length !== 1 || state[0]?.State?.Running !== true) fail("CONTAINER_EXITED_UNSEALED", "Container exited without one trusted sealed result");
      if (Date.now() >= deadline) fail("CONTAINER_TIMEOUT", "Container exceeded the frozen launcher wall timeout");
    }
  } catch (error) {
    failure = error;
  }
  let cleanupResidue = [];
  if (containerId && CONTAINER.test(containerId)) {
    try {
      await checkpoint(context, 950, "CLEANUP_INTENT", { container_id: containerId, sealed_result_observed: outcome !== null });
      await controller.remove(containerId);
      cleanupResidue = await labelled(controller, context.launch);
      if (cleanupResidue.includes(containerId)) fail("CLEANUP_RESIDUE", "Exact Gate C launcher container remained after cleanup");
      await checkpoint(context, 951, "CLEANUP_VERIFIED", { container_id: containerId, residue_count: cleanupResidue.length });
    } catch (error) {
      failure ??= error;
    }
  }
  let final = null;
  if (failure === null && outcome !== null) {
    final = withDigest({
      schema_version: "rc7-gate-c-rlm-final-artifact-v1", state: "trusted-sealed-cleanup-verified",
      policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID, activation_sha256: context.launch.activation_sha256,
      run_identity: context.launch.run_identity, intent_sha256: context.launch.intent_sha256,
      dispatch_sha256: context.launch.dispatch_sha256, image_id: context.launch.image_id,
      live_inspect_sha256: outcome.liveInspect.attestation_sha256, program_sha256: outcome.program.program_sha256,
      phase_two_sha256: outcome.phaseTwoAttestation.phase_two_sha256,
      container_result_sha256: outcome.result.result_sha256, route_output: outcome.result.route_output,
      route_output_sha256: outcome.result.route_output_sha256, child_request_count: outcome.result.child_request_count,
      cleanup_state: "verified-no-labelled-container-residue", cleanup_residue_entries: cleanupResidue.length,
    }, "artifact_sha256");
    await atomicWrite(path.join(context.root, RETAINED_DIR, FINAL_FILE), final);
    await checkpoint(context, 900, "FINAL_ARTIFACT_SEALED_AFTER_CLEANUP", { artifact_sha256: final.artifact_sha256, container_result_sha256: outcome.result.result_sha256 });
  }
  await releaseLock(context.root, lock).catch(() => undefined);
  if (failure !== null) throw failure;
  if (outcome === null || final === null) fail("CONTAINER_EXITED_UNSEALED", "Launcher ended without one trusted sealed final artifact");
  return { context, container_id: containerId, live_inspect: outcome.liveInspect, result: outcome.result, final_artifact: final };
}

function terminalProjection(value) {
  const projection = { ...value };
  delete projection.terminal_sha256;
  return projection;
}

export async function recoverRc7GateCRlmLauncher(root, options) {
  exactKeys(options, ["controller"], "launcher recovery options");
  const controller = options.controller;
  if (typeof controller?.list !== "function" || typeof controller?.remove !== "function") fail("CONTROLLER_REQUIRED", "Recovery requires injected list/remove controller methods");
  const context = await inspectRc7GateCRlmLauncher(root);
  const lock = await acquireLock(context.root);
  try {
    const terminalPath = path.join(context.root, RETAINED_DIR, TERMINAL_FILE);
    try {
      const retained = await readCanonical(terminalPath, context.root, "launcher terminal");
      if (retained.value.terminal_sha256 !== sha256V1(canonicalJsonV1(terminalProjection(retained.value)))) fail("TERMINAL_MISMATCH", "Retained launcher terminal digest mismatched");
      return { changed: false, terminal: retained.value };
    } catch (error) { if (error?.code !== "ENOENT") throw error; }
    const containers = await labelled(controller, context.launch);
    let cleaned = 0;
    for (const containerId of containers) { await controller.remove(containerId); cleaned += 1; }
    const residue = await labelled(controller, context.launch);
    if (residue.length !== 0) fail("CLEANUP_RESIDUE", "Recovery left labelled launcher containers");
    const requests = (await readdir(path.join(context.root, EXCHANGE_DIR, "requests"))).filter((entry) => /^\d{4}\.json$/u.test(entry)).length;
    const responses = (await readdir(path.join(context.root, EXCHANGE_DIR, "responses"))).filter((entry) => /^\d{4}\.json$/u.test(entry)).length;
    const finalExists = await access(path.join(context.root, RETAINED_DIR, FINAL_FILE)).then(() => true, () => false);
    const terminal = withDigest({
      schema_version: "rc7-gate-c-rlm-launch-terminal-v1",
      state: finalExists ? "sealed-cleanup-recovered" : "indeterminate-no-replay",
      policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID, activation_sha256: context.launch.activation_sha256,
      run_identity: context.launch.run_identity, intent_sha256: context.launch.intent_sha256,
      dispatch_sha256: context.launch.dispatch_sha256, image_id: context.launch.image_id,
      child_proposals: requests, child_responses: responses, provider_reachable_dispatches_upper_bound: requests,
      replay_permitted: false, containers_cleaned: cleaned, cleanup_residue_entries: residue.length,
      final_artifact_present: finalExists,
    }, "terminal_sha256");
    await atomicWrite(terminalPath, terminal);
    return { changed: true, terminal };
  } finally {
    await releaseLock(context.root, lock).catch(() => undefined);
  }
}

export function formatRc7GateCRlmLauncherError(error) {
  if (error instanceof Rc7GateCRlmLauncherError) return { error: error.code, message: error.message, details: error.details ?? null };
  return { error: "UNEXPECTED", message: error instanceof Error ? error.message : String(error), details: null };
}

export const __test = Object.freeze({
  fixture_root: FIXTURE_ROOT,
  outer_seccomp_path: OUTER_SECCOMP_PATH,
  validate_child_proposal: validateChildProposal,
  validate_container_result: validateContainerResult,
});
