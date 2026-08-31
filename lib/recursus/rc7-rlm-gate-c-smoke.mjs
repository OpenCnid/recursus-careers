import { lstat, open, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import { buildRc7GateCRequestIntent } from "./rc7-rlm-gate-c-broker.mjs";
import {
  buildRc7GateCPreregistrationPackage,
  validateRc7GateCPreregistrationPackage,
} from "./rc7-rlm-gate-c-preregistration.mjs";
import {
  RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  RC7_GATE_C_INTEGRATION_FAILURE_PHASES,
  RC7_GATE_C_RUNTIME_CLOSURE,
  buildRc7GateCSealedResult,
  classifyRc7GateCIntegrationFailurePhase,
  validateRc7GateCLegacySmokeSemanticRequest,
  validateRc7GateCSemanticRequest,
} from "./rc7-rlm-gate-c-worker.mjs";
import {
  RC7_GATE_C_STRUCTURED_OUTPUT_CONTRACT,
  parseRc7GateCStructuredOutput,
} from "./rc7-rlm-gate-c-output-grammar.mjs";

export const RC7_GATE_C_SMOKE_AUTHORITY_PROFILE = "safe01-direct-live-launch-smoke";
export const RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v6";
export const RC7_GATE_C_SMOKE_BROKER_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-broker-v6";
export const RC7_GATE_C_SMOKE_INTENT_SCHEMA = "rc7-gate-c-smoke-request-intent-v6";
export const RC7_GATE_C_SMOKE_PERMIT_SCHEMA = "rc7-gate-c-smoke-dispatch-permit-v6";
export const RC7_GATE_C_SMOKE_SEALED_REQUEST_SCHEMA = "rc7-gate-c-smoke-sealed-worker-request-v6";
export const RC7_GATE_C_SMOKE_DISPATCH_SCHEMA = "rc7-gate-c-smoke-dispatch-checkpoint-v6";
export const RC7_GATE_C_SMOKE_FINAL_FREEZE_SCHEMA = "rc7-gate-c-smoke-final-approval-freeze-v6";
export const RC7_GATE_C_SMOKE_ACTIVATION_SCHEMA = "rc7-gate-c-smoke-activation-v6";
export const RC7_GATE_C_SMOKE_APPROVAL_SCHEMA = "rc7-gate-c-smoke-operator-approval-v6";
export const RC7_GATE_C_SMOKE_FREEZE_PACKAGE_NAME = "gate-c-smoke-final-approval-freeze-v6.json";

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const HASH = /^[0-9a-f]{64}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_-]{1,95}$/u;
const PROVIDER_TERMINAL_FAILURE_CODES = new Set([
  "ABORTED", "AUTH", "CONTEXT_WINDOW_EXCEEDED", "EMPTY_RESPONSE", "INTEGRATION", "INVALID_REQUEST",
  "MALFORMED_RESPONSE", "PERMISSION", "RATE_LIMIT", "TIMEOUT", "UNAVAILABLE",
]);
const REFERENCE_MATRIX_RUN_ID = "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff";
const REFERENCE_SEMANTIC_SHA256 = "bc7ae0845b8445b929e3a4a3fe7184dba7d6ead3e1f4fa633eefe2a5aaf69985";
const REFERENCE_SEMANTIC_BYTE_COUNT = 5_075;
const REFERENCE_SOURCE_ID = "CAREER-BENCH-V1-SAFE-01-VISIBLE";
const REFERENCE_SOURCE_SHA256 = "74b5520b80c94f14d283b68e69636b730607deca592361fca004f47e308ac74e";
const FIRST_SMOKE_RUN_ID = "5daee97191ab9f3c38825f4290a7c2de2003fc35cc26b85a1b0f2b403af0fcbf";
const FIRST_SMOKE_ACTIVATION_SHA256 = "a1a877fd080620a7049e4f77cdba5ed2889903f05f228edf2372a6e4df7b4a01";
const FIRST_SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v1";
const PRIOR_SMOKE_RUN_ID = "9227e007106ce349d891ef4fecc1fb075cdb3b653075a554b7d2028d59867f3e";
const PRIOR_SMOKE_ACTIVATION_SHA256 = "c6eb89180de82ac7b66edaff393864596256053738b4d63e20be4c054a0df024";
const PRIOR_SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v2";
const THIRD_SMOKE_RUN_ID = "13d977b1848db852a120b3b3b87cfecd223da028bd7cf5f6a904e721f987bd7d";
const THIRD_SMOKE_ACTIVATION_SHA256 = "22e11e3a00b6c172657568ea7a2acb96520a3b586d94a14124c44d3268a1c32b";
const THIRD_SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v3";
const FOURTH_SMOKE_RUN_ID = "2bb3f31c17651986d4971bd2f7e46005f4ba1f501d0e27bad07b21110afb41c6";
const FOURTH_SMOKE_ACTIVATION_SHA256 = "292645e46d8834c89314a92097d30fdedb1feb686dfea28640074d6d3fb2ce13";
const FOURTH_SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v4";
const FIFTH_SMOKE_RUN_ID = "c02cfcb43850796b65d56f3d51efc7a492b38814325fdcbd2f4e10a79fa0ee13";
const FIFTH_SMOKE_ACTIVATION_SHA256 = "8849566f24bb9718265969aa8ca2b7e8b3369c37b71febcaf1c7adde3c314077";
const FIFTH_SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v5";
const SMOKE_RUN_ID = "c64d76145abe5b7dc8526e6bba97e88bedded2d548a0bebc8498e6d8de213b28";
const PROVIDER_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const REFRESH_ENDPOINT = "https://auth.openai.com/oauth/token";
const PROVIDER_ID = "openai-codex";
const ADAPTER_REVISION = "2fc02090af1632b86ee1175a6720904dfd71081c";
const CONFIGURED_MODEL = "gpt-5.6-sol";
const REASONING_SETTING = "xhigh";
const APPROVAL_FILE = "smoke-operator-approval.json";
const LEDGER_META_FILE = "smoke-ledger.json";
const RESERVATION_FILE = "smoke-reservation.json";
const ACTIVE_DISPATCH_FILE = "smoke-active-dispatch.json";
const HANDOFF_FILE = "smoke-durable-handoff.json";
const TERMINAL_FILE = "smoke-terminal.json";
const LEDGER_LOCK_FILE = ".smoke-ledger.lock";
const RESULTS_META_FILE = "smoke-results.json";
const RESULT_FILE = "smoke-result.json";
const RESULTS_LOCK_FILE = ".smoke-results.lock";
const PROTECTED_SEGMENTS = new Set([
  ".aws", ".azure", ".codex", ".config", ".gnupg", ".kube", ".ssh", "credential", "credentials",
  "data", "documents", "interview-prep", "keychain", "output", "reports", "secrets", "tokens", "wallet",
]);

const HISTORICAL_DISCLOSURE = Object.freeze({
  schema_version: "rc7-gate-c-smoke-historical-disclosure-v6",
  state: "eight-immutable-indeterminate-no-replay-attempts-preserved-and-excluded",
  matrix_attempts: [
    {
      ordinal: 1,
      activation_sha256: "8ac19650d78b7be57e77b454e396d26344e1af7080b155457e077fca4d5f4633",
      retained_failure_code: "HOST_ACK_TIMEOUT",
      attempt_sha256: "b1150c600f88f1c6bc43dc8e8cea005c7e612256e25c87fed918e7a07ef63179",
      ledger_root_sha256: "11d591dd8a469003613f3151d8a0e29e2a9475672ccfd3c17240b50770e75aab",
      results_root_sha256: "d2131afb2355a040bd64cccbca6698a406bfac00ebe1180780908edae5b44891",
    },
    {
      ordinal: 2,
      activation_sha256: "abd0c80b9a502b61506bc0bee8119b426dfdd7f773234963c6997e5ef825c48f",
      retained_failure_code: "MALFORMED_HOST_HANDOFF",
      attempt_sha256: "26f0a4e0691b79e114287de917b29e33d17dca2798c8843861f3367441fbdeb5",
      ledger_root_sha256: "41e3916c7c6f1d7bbf930235824e4f12bec140e0c810fff4217b780785b57380",
      results_root_sha256: "6e1725e3b189cc7c23216b0fa3ff87aaa28692be061219590a9f766b5b620aa3",
    },
    {
      ordinal: 3,
      activation_sha256: "a6306d45519a71d9f3fe8eb28ffda2c9e0883932bb2b5a4a27ab22cf836c3de2",
      retained_failure_code: "MALFORMED_EXECUTION",
      attempt_sha256: "3e0081198f3cdaaa6897d855ac0d32ab3602a67c8e0aaa5c63db01623f9e0c7a",
      ledger_root_sha256: "bfea14254b676bcd1806b9cae7766ef2204225274f356316cfcc40c706f54e95",
      results_root_sha256: "6efc394d10de488e79992906f1d9df17c7a68c793a857129d0d3f1299bb59f10",
    },
  ],
  prior_smoke_attempts: [
    {
      ordinal: 1,
      policy_identity: FIRST_SMOKE_PERMISSION_POLICY_ID,
      closure_sha256: "01a09676c22a13a410bb9e2f7e850ee31e5cb07d324becd7c49e4f0b6b1fac29",
      final_freeze_sha256: "969d9442cd2caa8886836ea17bcab89961238846c82c872080cd471a9ece9383",
      activation_sha256: FIRST_SMOKE_ACTIVATION_SHA256,
      run_id: FIRST_SMOKE_RUN_ID,
      retained_failure_code: "PROVIDER_DISPATCH_COUNT_MISMATCH",
      dispatch_sha256: "01d24153b9e5b0a0ec37b56dbdc0df4c8d7c04e79138b1117ddc2fa1bab44722",
      terminal_sha256: "d769f36d387b014f83ad53d20ce1a610e5eafd3944274e74ffe6194fbabce872",
      result_sha256: "93db559bae1055a4f9b815814daf8827c0d78b99727773d8da4d227ba8d6c20f",
      ledger_root_sha256: "4daea1f6cfe8f4b4060f60e23a09b491ed090b67f5354a5bd8ab42377a59c322",
      results_root_sha256: "9a4ec983832b19da2790fd7050265c23ececdaf7a24916ce24eaedfdacea7fb2",
    },
    {
      ordinal: 2,
      policy_identity: PRIOR_SMOKE_PERMISSION_POLICY_ID,
      closure_sha256: "51fb58695edb90dcba0d14e576f2bf50681cb2d937d2769d6b60e4fa40bf3f64",
      final_freeze_sha256: "65ad673624fce6aafcfb9ddebbd13c2117e309edd419c874236950f52f3d10fb",
      activation_sha256: PRIOR_SMOKE_ACTIVATION_SHA256,
      run_id: PRIOR_SMOKE_RUN_ID,
      retained_failure_code: "UNTRUSTED_TERMINAL",
      dispatch_sha256: "0a6f6183d4306b8aef407d76a85d46d28c7c6bd098171494b58f7376ee6d6bd0",
      terminal_sha256: "1c444d5ce269897479b1923049a741a211093c573f1e6f3d48946a732f19db8a",
      result_sha256: "189e3ab3877dfb3f996e10261e630e0ed9bb5698464d8bcd9413d580b314ef33",
      ledger_root_sha256: "824d86396c21bc2dcc6c23285f56297fb3f0e8b29f6852c926d2fe2ecd3a1560",
      results_root_sha256: "d7505a80c5871c9116b774e37ce6685155eabae8838190d641c3f6da236fe548",
    },
    {
      ordinal: 3,
      policy_identity: THIRD_SMOKE_PERMISSION_POLICY_ID,
      closure_sha256: "d23e4cf13a19f48b74ae53bfe3063acc3089952c43f02209915e25b12bc6e88f",
      final_freeze_sha256: "4ce4f7013ba7bb7022d5b25c0c6f3e2308ecab6155dbc775c1a3c994a2be6fd5",
      activation_sha256: THIRD_SMOKE_ACTIVATION_SHA256,
      run_id: THIRD_SMOKE_RUN_ID,
      retained_failure_code: "SMOKE_SCHEMA_MISMATCH",
      dispatch_sha256: "fb16bdb54ea9b604e8bdedb6670948be8942bba945e77314d6a731d407e136c1",
      terminal_sha256: "80948ca9bca9ba1e44f8a08ce108bea89f9010c3fdf8473525f90c3669d495dc",
      result_sha256: "8d8ab37be5e1ba75b62f26837cbfdd3db75d8d987a21f3b79688695dea6db60a",
      ledger_root_sha256: "138eda8359c9f9c9614943811d73450317c84cccf1e0bbb9348c975d5a8eed31",
      results_root_sha256: "adaa7636eb0a6338327b351223bd2c64d4e2085ddbee22cf9f8e92c3b51cbe5b",
    },
    {
      ordinal: 4,
      policy_identity: FOURTH_SMOKE_PERMISSION_POLICY_ID,
      closure_sha256: "1edbe4f1d9c505518da2bdd2d69f5f7f57379e8118e42ec5b57d7264d37377a4",
      final_freeze_sha256: "13cc688dc52b9ac89e4a9d7cfff1a40895a2dd6129b40319e6fc826c5b9ac547",
      activation_sha256: FOURTH_SMOKE_ACTIVATION_SHA256,
      run_id: FOURTH_SMOKE_RUN_ID,
      retained_failure_code: "PROVIDER_TERMINAL_REJECTED",
      terminal_kind: "error",
      provider_failure_code: "INTEGRATION",
      integration_failure_phase: null,
      dispatch_sha256: "8c4b7986f5dd557ba21ed5f6f373f2897c0a633a55b9c97f059428b609cc88dc",
      terminal_sha256: "79f1134931cb48e390a06c5c115848eac3fd02bd3aedcdab0fd3f51b72a13d7a",
      result_sha256: "736f1a08bb6ed8acdea805a5b49c9b431b7f5ab9142cbea4b3ae505257063ce6",
      ledger_root_sha256: "3b4e89132212bf3956dab84fc70293ca5d13fed58cacc7983c341b09f79499a0",
      results_root_sha256: "4877c1f07f0677d78cfa7de8067ed723f67531c9916711b11b4d8e9c3eecde06",
    },
    {
      ordinal: 5,
      policy_identity: FIFTH_SMOKE_PERMISSION_POLICY_ID,
      closure_sha256: "f94793d727075cb019b35f83d7381f1ff80643a51330d96a0583b1c6c51f7608",
      final_freeze_sha256: "9a6bd10128df7cfd71bfeaf5e54579af35747a0b91feb02a3015e69fad7a476f",
      activation_sha256: FIFTH_SMOKE_ACTIVATION_SHA256,
      run_id: FIFTH_SMOKE_RUN_ID,
      retained_failure_code: "PROVIDER_DISPATCH_COUNT_MISMATCH",
      terminal_kind: null,
      provider_failure_code: null,
      integration_failure_phase: null,
      dispatch_sha256: "3d3124efde412e69c3f8ddb29ab9ae1230f5cf4fc5683957525e2636b84248c6",
      terminal_sha256: "51f59e09430aee44d587b83dcda19703e521787f24df0dfe0d5ed1562296018f",
      result_sha256: "bb31c87275094eb132fd0758c67051d7fba399d3e889bdfecedb97bd10c2f42a",
      ledger_root_sha256: "1dc396e98b9a88938133f953c0d5bf66e0942e0e6a613d1663e25623168f2b59",
      results_root_sha256: "523e0cd3038acf7b2e7201634d0c34509b89e02166e11a59794544b2f9f1925a",
    },
  ],
  each_preserved_attempt_conservative_accounting: {
    generation_https_posts: 1,
    oauth_refresh_https_posts: 1,
    total_https_posts: 2,
    input_tokens: 32_768,
    output_plus_reasoning_tokens: 8_192,
    provider_active_seconds: 120,
    actual_provider_post_count: null,
    actual_credential_access_count: null,
  },
  smoke_plus_history_cumulative_ceiling: {
    generation_https_posts: 9,
    oauth_refresh_https_posts: 9,
    total_https_posts: 18,
    input_tokens: 294_912,
    output_plus_reasoning_tokens: 73_728,
    provider_active_seconds: 1_080,
    planning_credits: 66.37,
    api_equivalent_planning_usd: 2.67,
    additional_credit_purchases: 0,
    incremental_cash_purchases: 0,
  },
  preservation_rule: "all three matrix roots and all five prior smoke roots and bytes remain immutable; smoke run 06 is a distinct attempt and creates no replay, relabel, copy-in, matrix membership, or score authority",
});

export class Rc7GateCSmokeError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCSmokeError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new Rc7GateCSmokeError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("SMOKE_SCHEMA_MISMATCH", `${label} must be one object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail("SMOKE_SCHEMA_MISMATCH", `${label} keys mismatched`);
}

function projection(value, digestField) {
  const copy = structuredClone(value);
  delete copy[digestField];
  return copy;
}

function withDigest(value, digestField) {
  return { ...value, [digestField]: sha256V1(canonicalJsonV1(value)) };
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function historicalRouteOutputContract() {
  const current = RC7_GATE_C_STRUCTURED_OUTPUT_CONTRACT;
  return {
    schema_version: current.schema_version,
    serialization: "recursus-canonical-json-v1 followed by LF",
    additional_properties: false,
    maximum_utf8_bytes: current.maximum_utf8_bytes,
    exact_top_level_keys: current.exact_top_level_keys,
    evidence_item: {
      maximum_items: 64,
      exact_keys: current.evidence_item.exact_keys,
      local_id: "I001 through I999; route-local only and ignored for scoring",
      item_type: current.evidence_item.item_type,
      disposition: current.evidence_item.disposition,
      classification: current.evidence_item.classification,
      locator_forms: ["json_pointer", "line_range_sha256"],
      scalar_kinds: current.evidence_item.scalar.kind,
      calculation_operations: current.evidence_item.calculation.operation,
      free_text: "prohibited",
    },
    gap: { maximum_items: 16, exact_keys: ["code", "locators"], codes: current.gap.codes, free_text: "prohibited" },
    safety_event: { maximum_items: 16, exact_keys: ["code", "locators"], codes: current.safety_event.codes, free_text: "prohibited" },
    completion: current.completion,
  };
}

function normalizedPath(value) {
  return path.resolve(value).replaceAll("/", "\\").toLowerCase();
}

function normalizedPhysicalPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function nestedOrSame(candidate, parent) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertSmokeRoot(root, { requireEmpty = false, role = "root" } = {}) {
  if (typeof root !== "string" || root.length === 0 || !path.isAbsolute(root)) fail("UNSAFE_SMOKE_ROOT", `${role} must be one explicit absolute path`);
  const resolved = path.resolve(root);
  if (normalizedPath(resolved) === normalizedPath(path.parse(resolved).root)
    || normalizedPath(resolved) === normalizedPath(tmpdir()) || normalizedPath(resolved) === normalizedPath(homedir())) fail("BROAD_SMOKE_ROOT", `${role} is broad`);
  const segments = resolved.split(/[\\/]+/u).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => PROTECTED_SEGMENTS.has(segment) || /(?:credential|secret|api[-_]?key|oauth|token)/iu.test(segment))) fail("PROTECTED_SMOKE_ROOT", `${role} is credential-like or user-layer shaped`);
  if (nestedOrSame(resolved, REPOSITORY_ROOT) || nestedOrSame(REPOSITORY_ROOT, resolved)) fail("REPOSITORY_SMOKE_ROOT", `${role} overlaps the repository`);
  let info;
  try { info = await lstat(resolved); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_SMOKE_ROOT", `${role} must be caller-created`);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink() || normalizedPath(await realpath(resolved)) !== normalizedPath(resolved)) fail("ALIASED_SMOKE_ROOT", `${role} must be one physical unaliased directory`);
  if (requireEmpty && (await readdir(resolved)).length !== 0) fail("NONEMPTY_SMOKE_ROOT", `${role} must be empty`);
  if (role === "ledger" && !path.basename(resolved).toLowerCase().includes("smoke")) fail("SMOKE_ROOT_ROLE_MISMATCH", "Smoke ledger root name must explicitly identify smoke authority");
  if (role === "results" && !path.basename(resolved).toLowerCase().includes("smoke")) fail("SMOKE_ROOT_ROLE_MISMATCH", "Smoke results root name must explicitly identify smoke authority");
  return resolved;
}

async function physicalRootIdentity(root, role, requireEmpty = false) {
  const safe = await assertSmokeRoot(root, { requireEmpty, role });
  const info = await lstat(safe, { bigint: true });
  return withDigest({
    schema_version: `rc7-gate-c-smoke-${role}-root-identity-v6`,
    normalized_physical_root: normalizedPhysicalPath(await realpath(safe)),
    device_id: info.dev.toString(10),
    file_id: info.ino.toString(10),
    birthtime_ns: info.birthtimeNs.toString(10),
  }, `${role}_root_sha256`);
}

function validateRootIdentity(value, role) {
  const digestField = `${role}_root_sha256`;
  exactKeys(value, ["schema_version", "normalized_physical_root", "device_id", "file_id", "birthtime_ns", digestField], `${role} root identity`);
  if (value.schema_version !== `rc7-gate-c-smoke-${role}-root-identity-v6` || !path.isAbsolute(value.normalized_physical_root)
    || !/^\d+$/u.test(value.device_id) || !/^\d+$/u.test(value.file_id) || !/^\d+$/u.test(value.birthtime_ns)
    || value[digestField] !== sha256V1(canonicalJsonV1(projection(value, digestField)))) fail("SMOKE_ROOT_IDENTITY_MISMATCH", `${role} root identity mismatched`);
  return value;
}

async function assertPhysicalFile(target, parent, label) {
  let info;
  try { info = await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_SMOKE_PATH", `${label} is missing`);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || normalizedPath(await realpath(target)) !== normalizedPath(target)
    || normalizedPath(path.dirname(target)) !== normalizedPath(parent)) fail("ALIASED_SMOKE_PATH", `${label} is aliased or escaped its root`);
  return target;
}

async function optionalPhysicalFile(target, parent, label) {
  try { await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return assertPhysicalFile(target, parent, label);
}

async function readCanonicalJson(target, parent, label) {
  await assertPhysicalFile(target, parent, label);
  const bytes = await readFile(target);
  if (bytes.byteLength < 3 || bytes.byteLength > 2_097_152 || bytes.includes(0)) fail("MALFORMED_SMOKE_ARTIFACT", `${label} is missing, oversized, or contains NUL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("MALFORMED_SMOKE_ARTIFACT", `${label} is not JSON`); }
  if (!bytes.equals(canonicalBytes(value))) fail("MALFORMED_SMOKE_ARTIFACT", `${label} is not canonical JSON`);
  return value;
}

async function writeExclusive(target, value) {
  await writeFile(target, canonicalBytes(value), { flag: "wx" });
}

async function acquireLock(root, name) {
  try { return await open(path.join(root, name), "wx"); } catch (error) {
    if (error?.code === "EEXIST") fail("CONCURRENT_SMOKE_OPERATION_EXCLUDED", "Another smoke operation owns this root");
    throw error;
  }
}

async function releaseLock(root, name, handle) {
  const target = path.join(root, name);
  const owned = await handle.stat();
  const current = await lstat(target);
  if (owned.dev !== current.dev || owned.ino !== current.ino) fail("SMOKE_LOCK_OWNERSHIP_LOST", "Smoke lock was replaced while owned");
  await handle.close();
  await rm(target);
}

async function repositoryFileIdentity(relativePath, id) {
  const bytes = await readFile(path.join(REPOSITORY_ROOT, ...relativePath.split("/")));
  return { id, path: relativePath, byte_count: bytes.byteLength, sha256: sha256V1(bytes) };
}

function validateExecutionFileIdentity(value, label) {
  exactKeys(value, ["id", "path", "byte_count", "sha256"], label);
  if (typeof value.id !== "string" || value.id.length === 0 || typeof value.path !== "string" || value.path.length === 0
    || path.isAbsolute(value.path) || value.path.includes("\\") || value.path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    || !Number.isSafeInteger(value.byte_count) || value.byte_count <= 0 || !HASH.test(value.sha256)) fail("SMOKE_EXECUTION_CLOSURE_MISMATCH", `${label} is malformed`);
  return value;
}

function smokeRunManifest(reference) {
  return {
    schema_version: "rc7-gate-c-smoke-run-manifest-v6",
    benchmark_id: "RC7-GATE-C-SAFE01-DIRECT-LIVE-LAUNCH-SMOKE-06",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    smoke_attempt_ordinal: 6,
    prior_smoke_run_id: FIFTH_SMOKE_RUN_ID,
    prior_smoke_activation_sha256: FIFTH_SMOKE_ACTIVATION_SHA256,
    case_id: "SAFE-01",
    arm: "rc-direct",
    selected_route: "rc-direct",
    matrix_member: false,
    score_bearing: false,
    request_kind: "top-level",
    child_sequence: 0,
    reference_matrix_run_id: reference.reference_matrix_run_id ?? reference.run_id,
    route_visible_source_pack_id: reference.route_visible_source_pack_id,
    route_visible_source_pack_sha256: reference.route_visible_source_pack_sha256,
    semantic_request_sha256: reference.semantic_request_sha256,
    semantic_request_byte_count: reference.semantic_request_byte_count,
  };
}

function deriveSmokeRunId(manifest) {
  return sha256V1(`rc7-gate-c-smoke-run-v6\u0000${canonicalJsonV1(manifest)}`);
}

function historical120SecondReference(request) {
  const prefix = "Valid source-grounded shape example (do not copy it as the answer; extend or replace its evidence using only the authorized source pack):\n";
  const suffix = "\nBefore returning, verify the exact key sets, closed values, locator forms, canonical key order, and final LF against the contract.\n";
  const start = request.semantic_request.user_text.indexOf(prefix);
  const end = start < 0 ? -1 : request.semantic_request.user_text.indexOf(suffix, start + prefix.length);
  if (start < 0 || end < 0) fail("MATRIX_REFERENCE_MISMATCH", "Current prompt cannot be projected to the immutable pre-example smoke reference");
  const preExampleUserText = request.semantic_request.user_text.slice(0, start)
    + request.semantic_request.user_text.slice(end + suffix.length);
  const currentContract = canonicalJsonV1(RC7_GATE_C_STRUCTURED_OUTPUT_CONTRACT).trimEnd();
  const historicalContract = canonicalJsonV1(historicalRouteOutputContract()).trimEnd();
  const contractStart = preExampleUserText.indexOf(currentContract);
  if (contractStart < 0 || preExampleUserText.indexOf(currentContract, contractStart + 1) >= 0) {
    fail("MATRIX_REFERENCE_MISMATCH", "Current output contract cannot be projected to the immutable smoke contract");
  }
  const historicalUserText = preExampleUserText.replace(currentContract, historicalContract);
  const historicalSemanticValue = {
    ...request.semantic_request,
    max_output_plus_reasoning_tokens: 8_192,
    timeout_ms: 120_000,
    user_text: historicalUserText,
  };
  const historicalSemanticBytes = canonicalBytes(historicalSemanticValue);
  const semantic = {
    value: historicalSemanticValue,
    bytes: historicalSemanticBytes,
    byte_count: historicalSemanticBytes.byteLength,
    sha256: sha256V1(historicalSemanticBytes),
  };
  const intentProjection = projection(request.intent, "intent_sha256");
  intentProjection.semantic_request_sha256 = semantic.sha256;
  intentProjection.semantic_request_byte_count = semantic.byte_count;
  intentProjection.provider_active_timeout_seconds = 120;
  const intent = { ...intentProjection, intent_sha256: sha256V1(canonicalJsonV1(intentProjection)) };
  return { intent, semantic_request: semantic.value, semantic_request_bytes: semantic.bytes };
}

async function buildSmokeRegistration() {
  const preregistration = await buildRc7GateCPreregistrationPackage();
  validateRc7GateCPreregistrationPackage(preregistration);
  const rows = preregistration.ablation.schedule;
  if (!Array.isArray(rows) || rows.length !== 36 || new Set(rows.map((row) => row.run_id)).size !== 36) fail("MATRIX_REFERENCE_MISMATCH", "Reference matrix schedule is not the exact closed 36-run schedule");
  const referenceRows = rows.filter((row) => row.case_id === "SAFE-01" && row.arm === "rc-direct" && row.repeat_index === 3 && row.selected_route === "rc-direct");
  if (referenceRows.length !== 1 || referenceRows[0].run_id !== REFERENCE_MATRIX_RUN_ID) fail("MATRIX_REFERENCE_MISMATCH", "Exact SAFE-01 direct reference row changed");
  const referenceRequest = historical120SecondReference(await buildRc7GateCRequestIntent({
    run_id: REFERENCE_MATRIX_RUN_ID,
    request_kind: "top-level",
    child_sequence: 0,
    child_question: null,
    excerpt_locator: null,
  }));
  const reference = referenceRequest.intent;
  if (reference.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256 || reference.semantic_request_byte_count !== REFERENCE_SEMANTIC_BYTE_COUNT
    || reference.route_visible_source_pack_id !== REFERENCE_SOURCE_ID || reference.route_visible_source_pack_sha256 !== REFERENCE_SOURCE_SHA256
    || reference.case_id !== "SAFE-01" || reference.arm !== "rc-direct" || reference.selected_route !== "rc-direct") fail("MATRIX_REFERENCE_MISMATCH", "Provider-visible SAFE-01 reference bytes or identity changed");
  const manifest = smokeRunManifest(reference);
  const runId = deriveSmokeRunId(manifest);
  if (runId !== SMOKE_RUN_ID || rows.some((row) => row.run_id === runId)) fail("SMOKE_RUN_COLLIDES_WITH_MATRIX", "Smoke run ID changed or collides with a matrix run");
  const value = withDigest({
    schema_version: "rc7-gate-c-safe01-direct-smoke-registration-v6",
    state: "provider-free-fixed-not-matrix",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    permission_policy_identity: RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
    run_manifest: manifest,
    run_id: runId,
    reference_matrix_preregistration_sha256: preregistration.preregistration_sha256,
    reference_matrix_schedule_sha256: sha256V1(canonicalJsonV1(rows)),
    reference_matrix_run_id: reference.run_id,
    provider_visible_semantic_request_sha256: reference.semantic_request_sha256,
    provider_visible_semantic_request_byte_count: reference.semantic_request_byte_count,
    route_visible_source_pack_id: reference.route_visible_source_pack_id,
    route_visible_source_pack_sha256: reference.route_visible_source_pack_sha256,
    matrix_member: false,
    score_bearing: false,
    evaluator_identity_present_in_smoke_intent: false,
  }, "smoke_registration_sha256");
  return { preregistration, referenceRequest, registration: value };
}

function smokeBudget() {
  return withDigest({
    schema_version: "rc7-gate-c-safe01-direct-smoke-budget-v6",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    top_level_generation_reservations: 1,
    oauth_refresh_https_posts: 1,
    total_https_posts: 2,
    child_request_reservations: 0,
    rlm_executions: 0,
    docker_invocations: 0,
    automatic_retries: 0,
    additional_credit_purchases: 0,
    incremental_cash_purchases_usd: 0,
    input_utf8_bytes: 32_768,
    input_tokens: 32_768,
    output_plus_reasoning_tokens: 8_192,
    provider_active_seconds: 120,
    host_ack_seconds: 30,
    host_process_seconds: 165,
    attempt_seconds: 500,
    recovery_seconds: 600,
    planning_credits: 7.38,
    api_equivalent_planning_usd: 0.30,
    concurrency: 1,
  }, "budget_sha256");
}

async function buildSmokeExecutionClosure(registrationData) {
  const worker = registrationData.preregistration.repository.gate_c_worker;
  const [smokeModule, brokerModule, hostModule, capsuleModule, workerModule, outputValidatorModule, smokeScript] = await Promise.all([
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-smoke.mjs", "rc7-gate-c-smoke-module-v6"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-broker.mjs", "rc7-gate-c-broker-module-reference-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-host-launcher.mjs", "rc7-gate-c-host-launcher-module-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-live-capsule.mjs", "rc7-gate-c-live-capsule-module-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-worker.mjs", "rc7-gate-c-worker-module-v1"),
    repositoryFileIdentity("lib/recursus/rc7-rlm-gate-c-output-grammar.mjs", "rc7-gate-c-structured-output-grammar-module-v1"),
    repositoryFileIdentity("scripts/recursus/rc7-rlm-gate-c-smoke.mjs", "rc7-gate-c-smoke-script-v6"),
  ]);
  if (brokerModule.sha256 !== registrationData.preregistration.repository.gate_c_broker_module.sha256
    || workerModule.sha256 !== worker.module.sha256 || capsuleModule.sha256 !== worker.live_capsule.sha256
    || RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision !== ADAPTER_REVISION) fail("SMOKE_EXECUTION_CLOSURE_MISMATCH", "Reference preregistration, adapter revision, and current production bytes differ");
  return withDigest({
    schema_version: "rc7-gate-c-smoke-execution-closure-v6",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    smoke_module: smokeModule,
    broker_module: brokerModule,
    host_launcher_module: hostModule,
    live_capsule_module: capsuleModule,
    worker_module: workerModule,
    structured_output_validator_module: outputValidatorModule,
    smoke_script: smokeScript,
    worker_package_sha256: worker.worker_package_sha256,
    worker_stage_manifest_sha256: worker.worker_stage.stage_manifest_sha256,
    runtime_closure_sha256: sha256V1(canonicalJsonV1(RC7_GATE_C_RUNTIME_CLOSURE)),
    provider_visible_reference_rule: "exact historically exposed SAFE-01 rc-direct repeat-3 semantic request bytes are preserved; only host-owned smoke intent and authority bytes differ",
    host_transport: { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5 },
    production_entrypoint_rule: "one named non-injectable SAFE-01 direct smoke entrypoint; no caller-selected run, policy, callback, Python, RLM root, Docker controller, scorer, or aggregate",
    credential_rule: "credential resolution remains in the committed one-shot capsule after durable smoke preflight",
    credential_home_environment_rule: "before reservation the host requires one absolute non-repository DSH_HOME path; only the one-shot capsule child receives that environment value, while the path and credential bytes remain absent from handoff and evidence",
    credential_home_identity_nonclaim: "the configured DSH_HOME and credential-store physical identities remain deliberately uninspected and unreported; same-host environment substitution is outside this governance proof",
    integration_failure_phase_rule: "adapter terminal finalization precedes the success-only exact-provider-post postcondition; an INTEGRATION terminal therefore retains exactly one local guarded-fetch admission phase: NO_NETWORK_POST_ADMITTED, OAUTH_REFRESH_POST_ADMITTED_NO_PROVIDER_POST, or PROVIDER_POST_ADMITTED; admission never claims remote receipt, response, or cause",
  }, "execution_closure_sha256");
}

async function buildSmokeActivationClosure(ledgerRoot, resultsRoot) {
  const ledgerIdentity = await physicalRootIdentity(ledgerRoot, "ledger", false);
  const resultsIdentity = await physicalRootIdentity(resultsRoot, "results", false);
  if (nestedOrSame(ledgerIdentity.normalized_physical_root, resultsIdentity.normalized_physical_root)
    || nestedOrSame(resultsIdentity.normalized_physical_root, ledgerIdentity.normalized_physical_root)) fail("OVERLAPPING_SMOKE_ROOTS", "Smoke ledger and results roots must be disjoint");
  const registrationData = await buildSmokeRegistration();
  const executionClosure = await buildSmokeExecutionClosure(registrationData);
  const budget = smokeBudget();
  return {
    schema_version: RC7_GATE_C_SMOKE_ACTIVATION_SCHEMA,
    state: "active",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    permission_policy_identity: RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
    smoke_registration: registrationData.registration,
    smoke_registration_sha256: registrationData.registration.smoke_registration_sha256,
    smoke_run_id: registrationData.registration.run_id,
    reference_matrix_preregistration_sha256: registrationData.registration.reference_matrix_preregistration_sha256,
    reference_matrix_schedule_sha256: registrationData.registration.reference_matrix_schedule_sha256,
    reference_matrix_run_id: REFERENCE_MATRIX_RUN_ID,
    provider_visible_semantic_request_sha256: REFERENCE_SEMANTIC_SHA256,
    provider_visible_semantic_request_byte_count: REFERENCE_SEMANTIC_BYTE_COUNT,
    route_visible_source_pack_id: REFERENCE_SOURCE_ID,
    route_visible_source_pack_sha256: REFERENCE_SOURCE_SHA256,
    matrix_member: false,
    score_bearing: false,
    budget,
    approved_generation_https_post_ceiling: 1,
    approved_oauth_refresh_https_post_ceiling: 1,
    approved_total_https_post_ceiling: 2,
    approved_child_request_ceiling: 0,
    approved_rlm_execution_ceiling: 0,
    approved_docker_invocation_ceiling: 0,
    approved_input_utf8_bytes: 32_768,
    approved_input_tokens: 32_768,
    approved_output_plus_reasoning_tokens: 8_192,
    approved_provider_active_seconds: 120,
    approved_host_ack_seconds: 30,
    approved_host_process_seconds: 165,
    approved_attempt_seconds: 500,
    approved_recovery_seconds: 600,
    approved_automatic_retries: 0,
    approved_concurrency: 1,
    approved_planning_credits: 7.38,
    approved_api_equivalent_planning_usd: 0.30,
    additional_credit_purchase_authority: 0,
    incremental_cash_purchase_authority_usd: 0,
    ledger_root_identity: ledgerIdentity,
    results_root_identity: resultsIdentity,
    historical_disclosure: structuredClone(HISTORICAL_DISCLOSURE),
    execution_closure: executionClosure,
  };
}

function activationProjection(value) {
  return projection(value, "activation_sha256");
}

function approvalText(closureSha256, closure) {
  return `I explicitly approve RC-7 Gate C sixth SAFE-01 direct live-launch smoke closure ${closureSha256} and future activation bound to physical smoke ledger ${closure.ledger_root_identity.ledger_root_sha256} and results root ${closure.results_root_identity.results_root_sha256}, policy ${RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID}, smoke run ${closure.smoke_run_id}, reference matrix run ${closure.reference_matrix_run_id}, provider-visible semantic request ${closure.provider_visible_semantic_request_sha256}, source pack ${closure.route_visible_source_pack_sha256}, and current execution closure ${closure.execution_closure.execution_closure_sha256}. The exact configured transport is provider ${PROVIDER_ID}, adapter revision ${ADAPTER_REVISION}, configured model ${CONFIGURED_MODEL}, and reasoning ${REASONING_SETTING}; the backend model snapshot and native tokenizer are unreported, so the bound model name is configured identity rather than a verified backend snapshot and input accounting conservatively counts UTF-8 bytes as tokens. The host requires one absolute non-repository DSH_HOME before reservation and forwards that value only to the one-shot credential-opaque capsule child; neither the DSH_HOME path nor credential bytes enter the handoff or evidence, and the physical DSH_HOME and credential-store identities remain deliberately uninspected and unreported. The repaired failure boundary finalizes an adapter terminal before enforcing the success-only exact-provider-post postcondition, then retains only the closed provider terminal kind, sanitized adapter failure code, and for INTEGRATION exactly one local guarded-fetch admission phase: NO_NETWORK_POST_ADMITTED, OAUTH_REFRESH_POST_ADMITTED_NO_PROVIDER_POST, or PROVIDER_POST_ADMITTED. Admission does not prove remote receipt, response, or cause; provider messages, request IDs, replay state, reasoning, and raw output remain unretained on failure. I approve exactly one direct top-level generation reservation, up to one OAuth refresh, two total HTTPS POSTs, zero child requests, zero RLM executions, zero Docker invocations, zero retries, zero purchases, 32,768 semantic-input bytes and conservative input tokens, 8,192 output-plus-reasoning tokens, 120 provider-active seconds, 30-second host acknowledgment, 165-second host process, 500-second attempt, 600-second recovery, concurrency one, 7.38 planning credits, and USD 0.30 API-equivalent planning amount. I acknowledge eight preserved immutable indeterminate no-replay attempts—the three prior matrix handoffs plus all five prior smokes—and cumulative sixth-smoke-plus-history ceilings of nine generation POSTs, nine OAuth refresh POSTs, eighteen total POSTs, 294,912 input tokens, 73,728 output-plus-reasoning tokens, 1,080 provider-active seconds, 66.37 planning credits, and USD 2.67 API-equivalent, with actual historical provider and credential counts unknown. This approval grants no matrix membership, score, aggregation, replacement, replay, alternate run, RLM, Docker, child, publication, deployment, or purchase authority; same-host durable approval and DSH_HOME forwarding remain governance evidence rather than protection from a hostile administrator, and planning cost applicability to OAuth/subscription transport remains unproven.`;
}

export async function buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, resultsRoot) {
  const closure = await buildSmokeActivationClosure(ledgerRoot, resultsRoot);
  const closureSha256 = sha256V1(canonicalJsonV1(closure));
  const exactApprovalText = approvalText(closureSha256, closure);
  const approvalTextSha256 = sha256V1(exactApprovalText);
  const expectedActivation = { ...closure, approval_text_sha256: approvalTextSha256 };
  const value = withDigest({
    schema_version: RC7_GATE_C_SMOKE_FINAL_FREEZE_SCHEMA,
    state: "provider-free-frozen-awaiting-explicit-smoke-approval",
    closure,
    closure_sha256: closureSha256,
    exact_approval_text: exactApprovalText,
    approval_text_sha256: approvalTextSha256,
    future_activation_sha256: sha256V1(canonicalJsonV1(expectedActivation)),
    authority_effect: "approval can construct only the exact one-request smoke activation; matrix, provider, credential, RLM, Docker, score, publication, and external actions remain absent from this freeze",
    accounting: { provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0, rlm_executions: 0, docker_invocations: 0, network_actions: 0, required_operator_steps: 1 },
    terminal_decision: "AWAITING_EXACT_SMOKE_APPROVAL",
  }, "final_freeze_sha256");
  validateRc7GateCSmokeFinalApprovalFreeze(value);
  return value;
}

export function validateRc7GateCSmokeFinalApprovalFreeze(value) {
  exactKeys(value, ["schema_version", "state", "closure", "closure_sha256", "exact_approval_text", "approval_text_sha256", "future_activation_sha256", "authority_effect", "accounting", "terminal_decision", "final_freeze_sha256"], "smoke final freeze");
  const closure = value.closure;
  exactKeys(closure, [
    "schema_version", "state", "authority_profile", "permission_policy_identity", "smoke_registration", "smoke_registration_sha256", "smoke_run_id",
    "reference_matrix_preregistration_sha256", "reference_matrix_schedule_sha256", "reference_matrix_run_id", "provider_visible_semantic_request_sha256",
    "provider_visible_semantic_request_byte_count", "route_visible_source_pack_id", "route_visible_source_pack_sha256", "matrix_member", "score_bearing", "budget",
    "approved_generation_https_post_ceiling", "approved_oauth_refresh_https_post_ceiling", "approved_total_https_post_ceiling", "approved_child_request_ceiling",
    "approved_rlm_execution_ceiling", "approved_docker_invocation_ceiling", "approved_input_utf8_bytes", "approved_input_tokens", "approved_output_plus_reasoning_tokens",
    "approved_provider_active_seconds", "approved_host_ack_seconds", "approved_host_process_seconds", "approved_attempt_seconds", "approved_recovery_seconds",
    "approved_automatic_retries", "approved_concurrency", "approved_planning_credits", "approved_api_equivalent_planning_usd", "additional_credit_purchase_authority",
    "incremental_cash_purchase_authority_usd", "ledger_root_identity", "results_root_identity", "historical_disclosure", "execution_closure",
  ], "smoke activation closure");
  validateRootIdentity(closure.ledger_root_identity, "ledger");
  validateRootIdentity(closure.results_root_identity, "results");
  exactKeys(closure.smoke_registration, [
    "schema_version", "state", "authority_profile", "permission_policy_identity", "run_manifest", "run_id",
    "reference_matrix_preregistration_sha256", "reference_matrix_schedule_sha256", "reference_matrix_run_id",
    "provider_visible_semantic_request_sha256", "provider_visible_semantic_request_byte_count", "route_visible_source_pack_id",
    "route_visible_source_pack_sha256", "matrix_member", "score_bearing", "evaluator_identity_present_in_smoke_intent",
    "smoke_registration_sha256",
  ], "smoke registration");
  exactKeys(closure.smoke_registration.run_manifest, [
    "schema_version", "benchmark_id", "authority_profile", "smoke_attempt_ordinal", "prior_smoke_run_id",
    "prior_smoke_activation_sha256", "case_id", "arm", "selected_route", "matrix_member",
    "score_bearing", "request_kind", "child_sequence", "reference_matrix_run_id", "route_visible_source_pack_id",
    "route_visible_source_pack_sha256", "semantic_request_sha256", "semantic_request_byte_count",
  ], "smoke run manifest");
  exactKeys(closure.execution_closure, [
    "schema_version", "authority_profile", "smoke_module", "broker_module", "host_launcher_module", "live_capsule_module",
    "worker_module", "structured_output_validator_module", "smoke_script", "worker_package_sha256", "worker_stage_manifest_sha256",
    "runtime_closure_sha256", "provider_visible_reference_rule", "host_transport", "production_entrypoint_rule",
    "credential_rule", "credential_home_environment_rule", "credential_home_identity_nonclaim", "integration_failure_phase_rule", "execution_closure_sha256",
  ], "smoke execution closure");
  const expectedBudget = smokeBudget();
  exactKeys(closure.budget, Object.keys(expectedBudget), "smoke budget");
  if (canonicalJsonV1(closure.budget) !== canonicalJsonV1(expectedBudget)) fail("SMOKE_FINAL_FREEZE_MISMATCH", "Smoke budget widened or mismatched");
  exactKeys(value.accounting, [
    "provider_calls", "simulated_provider_requests", "credential_accesses", "rlm_executions", "docker_invocations", "network_actions", "required_operator_steps",
  ], "smoke freeze accounting");
  const executionFiles = [
    ["smoke_module", "lib/recursus/rc7-rlm-gate-c-smoke.mjs", "rc7-gate-c-smoke-module-v6"],
    ["broker_module", "lib/recursus/rc7-rlm-gate-c-broker.mjs", "rc7-gate-c-broker-module-reference-v1"],
    ["host_launcher_module", "lib/recursus/rc7-rlm-gate-c-host-launcher.mjs", "rc7-gate-c-host-launcher-module-v1"],
    ["live_capsule_module", "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs", "rc7-gate-c-live-capsule-module-v1"],
    ["worker_module", "lib/recursus/rc7-rlm-gate-c-worker.mjs", "rc7-gate-c-worker-module-v1"],
    ["structured_output_validator_module", "lib/recursus/rc7-rlm-gate-c-output-grammar.mjs", "rc7-gate-c-structured-output-grammar-module-v1"],
    ["smoke_script", "scripts/recursus/rc7-rlm-gate-c-smoke.mjs", "rc7-gate-c-smoke-script-v6"],
  ];
  for (const [key, expectedPath, expectedId] of executionFiles) {
    const identity = validateExecutionFileIdentity(closure.execution_closure[key], `smoke execution closure ${key}`);
    if (identity.path !== expectedPath || identity.id !== expectedId) fail("SMOKE_EXECUTION_CLOSURE_MISMATCH", `Smoke execution closure ${key} identity widened`);
  }
  exactKeys(closure.execution_closure.host_transport, ["kind", "handoff_fd", "ack_fd", "commit_fd"], "smoke execution host transport");
  if (closure.execution_closure.host_transport.kind !== "anonymous-inherited-pipes" || closure.execution_closure.host_transport.handoff_fd !== 3
    || closure.execution_closure.host_transport.ack_fd !== 4 || closure.execution_closure.host_transport.commit_fd !== 5
    || !HASH.test(closure.execution_closure.worker_package_sha256) || !HASH.test(closure.execution_closure.worker_stage_manifest_sha256)
    || !HASH.test(closure.execution_closure.runtime_closure_sha256)) fail("SMOKE_EXECUTION_CLOSURE_MISMATCH", "Smoke execution runtime or host transport widened");
  const expectedActivation = { ...closure, approval_text_sha256: value.approval_text_sha256 };
  if (value.schema_version !== RC7_GATE_C_SMOKE_FINAL_FREEZE_SCHEMA || value.state !== "provider-free-frozen-awaiting-explicit-smoke-approval"
    || closure.schema_version !== RC7_GATE_C_SMOKE_ACTIVATION_SCHEMA || closure.state !== "active"
    || closure.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || closure.permission_policy_identity !== RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID
    || closure.smoke_run_id !== SMOKE_RUN_ID || closure.reference_matrix_run_id !== REFERENCE_MATRIX_RUN_ID
    || closure.provider_visible_semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256 || closure.provider_visible_semantic_request_byte_count !== REFERENCE_SEMANTIC_BYTE_COUNT
    || closure.route_visible_source_pack_id !== REFERENCE_SOURCE_ID || closure.route_visible_source_pack_sha256 !== REFERENCE_SOURCE_SHA256
    || closure.matrix_member !== false || closure.score_bearing !== false
    || closure.approved_generation_https_post_ceiling !== 1 || closure.approved_oauth_refresh_https_post_ceiling !== 1 || closure.approved_total_https_post_ceiling !== 2
    || closure.approved_child_request_ceiling !== 0 || closure.approved_rlm_execution_ceiling !== 0 || closure.approved_docker_invocation_ceiling !== 0
    || closure.approved_input_utf8_bytes !== 32_768 || closure.approved_input_tokens !== 32_768 || closure.approved_output_plus_reasoning_tokens !== 8_192
    || closure.approved_provider_active_seconds !== 120 || closure.approved_host_ack_seconds !== 30 || closure.approved_host_process_seconds !== 165
    || closure.approved_attempt_seconds !== 500 || closure.approved_recovery_seconds !== 600 || closure.approved_automatic_retries !== 0 || closure.approved_concurrency !== 1
    || closure.approved_planning_credits !== 7.38 || closure.approved_api_equivalent_planning_usd !== 0.30
    || closure.additional_credit_purchase_authority !== 0 || closure.incremental_cash_purchase_authority_usd !== 0
    || canonicalJsonV1(closure.historical_disclosure) !== canonicalJsonV1(HISTORICAL_DISCLOSURE)
    || closure.smoke_registration_sha256 !== closure.smoke_registration.smoke_registration_sha256
    || closure.smoke_registration.schema_version !== "rc7-gate-c-safe01-direct-smoke-registration-v6"
    || closure.smoke_registration.state !== "provider-free-fixed-not-matrix"
    || closure.smoke_registration.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || closure.smoke_registration.permission_policy_identity !== RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID
    || closure.smoke_registration.run_id !== SMOKE_RUN_ID
    || closure.smoke_registration.run_manifest.schema_version !== "rc7-gate-c-smoke-run-manifest-v6"
    || closure.smoke_registration.run_manifest.smoke_attempt_ordinal !== 6
    || closure.smoke_registration.run_manifest.prior_smoke_run_id !== FIFTH_SMOKE_RUN_ID
    || closure.smoke_registration.run_manifest.prior_smoke_activation_sha256 !== FIFTH_SMOKE_ACTIVATION_SHA256
    || deriveSmokeRunId(closure.smoke_registration.run_manifest) !== SMOKE_RUN_ID
    || closure.smoke_registration.matrix_member !== false || closure.smoke_registration.score_bearing !== false
    || closure.smoke_registration.evaluator_identity_present_in_smoke_intent !== false
    || closure.smoke_registration.smoke_registration_sha256 !== sha256V1(canonicalJsonV1(projection(closure.smoke_registration, "smoke_registration_sha256")))
    || closure.budget.budget_sha256 !== sha256V1(canonicalJsonV1(projection(closure.budget, "budget_sha256")))
    || closure.execution_closure.schema_version !== "rc7-gate-c-smoke-execution-closure-v6"
    || closure.execution_closure.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || Object.keys(closure.execution_closure).some((key) => /aggregate/iu.test(key))
    || closure.execution_closure.execution_closure_sha256 !== sha256V1(canonicalJsonV1(projection(closure.execution_closure, "execution_closure_sha256")))
    || value.closure_sha256 !== sha256V1(canonicalJsonV1(closure)) || value.exact_approval_text !== approvalText(value.closure_sha256, closure)
    || value.approval_text_sha256 !== sha256V1(value.exact_approval_text) || value.future_activation_sha256 !== sha256V1(canonicalJsonV1(expectedActivation))
    || value.accounting.provider_calls !== 0 || value.accounting.simulated_provider_requests !== 0 || value.accounting.credential_accesses !== 0
    || value.accounting.rlm_executions !== 0 || value.accounting.docker_invocations !== 0 || value.accounting.network_actions !== 0
    || value.accounting.required_operator_steps !== 1
    || value.terminal_decision !== "AWAITING_EXACT_SMOKE_APPROVAL"
    || value.final_freeze_sha256 !== sha256V1(canonicalJsonV1(projection(value, "final_freeze_sha256")))) fail("SMOKE_FINAL_FREEZE_MISMATCH", "Smoke final freeze widened or mismatched");
  return value;
}

export async function prepareRc7GateCSmokeFinalApprovalFreeze(root, ledgerRoot, resultsRoot) {
  const safeRoot = await assertSmokeRoot(root, { requireEmpty: true, role: "freeze" });
  const value = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, resultsRoot);
  await writeExclusive(path.join(safeRoot, RC7_GATE_C_SMOKE_FREEZE_PACKAGE_NAME), value);
  return { root: safeRoot, final_freeze_sha256: value.final_freeze_sha256, future_activation_sha256: value.future_activation_sha256, terminal_decision: value.terminal_decision };
}

export async function inspectRc7GateCSmokeFinalApprovalFreeze(root, ledgerRoot, resultsRoot) {
  const safeRoot = await assertSmokeRoot(root, { requireEmpty: false, role: "freeze" });
  const entries = await readdir(safeRoot);
  if (canonicalJsonV1(entries.sort()) !== canonicalJsonV1([RC7_GATE_C_SMOKE_FREEZE_PACKAGE_NAME])) fail("SMOKE_FREEZE_RESIDUE", "Smoke freeze root contains residue");
  const retained = validateRc7GateCSmokeFinalApprovalFreeze(await readCanonicalJson(path.join(safeRoot, RC7_GATE_C_SMOKE_FREEZE_PACKAGE_NAME), safeRoot, "smoke freeze"));
  const current = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, resultsRoot);
  if (canonicalJsonV1(retained) !== canonicalJsonV1(current)) fail("SMOKE_FINAL_FREEZE_STALE", "Smoke freeze no longer matches current source, stage, or roots");
  return { root: safeRoot, final_freeze_sha256: retained.final_freeze_sha256, future_activation_sha256: retained.future_activation_sha256, terminal_decision: retained.terminal_decision };
}

function buildApprovalRecord(freeze) {
  return withDigest({
    schema_version: RC7_GATE_C_SMOKE_APPROVAL_SCHEMA,
    state: "operator-approved-smoke-only",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    authority_scope: "one-safe01-direct-top-level-live-launch-smoke-only",
    final_freeze_sha256: freeze.final_freeze_sha256,
    closure_sha256: freeze.closure_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    approval_text_sha256: freeze.approval_text_sha256,
    exact_approval_text: freeze.exact_approval_text,
    ledger_root_sha256: freeze.closure.ledger_root_identity.ledger_root_sha256,
    results_root_identity: structuredClone(freeze.closure.results_root_identity),
    smoke_run_id: SMOKE_RUN_ID,
    matrix_authority: false,
    governance_nonclaim: "same-host durable approval is governance evidence, not cryptographic proof of human authorship or intent",
  }, "operator_approval_record_sha256");
}

async function validateApprovalAgainstFreeze(record, freeze, ledgerRoot) {
  exactKeys(record, ["schema_version", "state", "authority_profile", "authority_scope", "final_freeze_sha256", "closure_sha256", "future_activation_sha256", "approval_text_sha256", "exact_approval_text", "ledger_root_sha256", "results_root_identity", "smoke_run_id", "matrix_authority", "governance_nonclaim", "operator_approval_record_sha256"], "smoke approval record");
  const currentLedger = await physicalRootIdentity(ledgerRoot, "ledger", false);
  const currentResults = await physicalRootIdentity(record.results_root_identity?.normalized_physical_root, "results", false);
  if (record.schema_version !== RC7_GATE_C_SMOKE_APPROVAL_SCHEMA || record.state !== "operator-approved-smoke-only"
    || record.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || record.authority_scope !== "one-safe01-direct-top-level-live-launch-smoke-only"
    || record.final_freeze_sha256 !== freeze.final_freeze_sha256 || record.closure_sha256 !== freeze.closure_sha256
    || record.future_activation_sha256 !== freeze.future_activation_sha256 || record.approval_text_sha256 !== freeze.approval_text_sha256
    || record.exact_approval_text !== freeze.exact_approval_text || record.ledger_root_sha256 !== currentLedger.ledger_root_sha256
    || canonicalJsonV1(freeze.closure.ledger_root_identity) !== canonicalJsonV1(currentLedger)
    || canonicalJsonV1(freeze.closure.results_root_identity) !== canonicalJsonV1(currentResults)
    || canonicalJsonV1(record.results_root_identity) !== canonicalJsonV1(currentResults)
    || record.smoke_run_id !== SMOKE_RUN_ID || record.matrix_authority !== false
    || record.operator_approval_record_sha256 !== sha256V1(canonicalJsonV1(projection(record, "operator_approval_record_sha256")))) fail("EXACT_SMOKE_APPROVAL_REQUIRED", "Smoke approval does not match the current exact freeze and physical roots");
  return record;
}

export async function recordRc7GateCSmokeOperatorApproval(root, input) {
  exactKeys(input, ["exact_approval_text", "final_freeze_sha256", "future_activation_sha256", "results_root"], "smoke approval input");
  const ledgerRoot = await assertSmokeRoot(root, { requireEmpty: true, role: "ledger" });
  const resultsRoot = await assertSmokeRoot(input.results_root, { requireEmpty: true, role: "results" });
  if (nestedOrSame(ledgerRoot, resultsRoot) || nestedOrSame(resultsRoot, ledgerRoot)) fail("OVERLAPPING_SMOKE_ROOTS", "Smoke roots overlap");
  const freeze = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, resultsRoot);
  if (input.exact_approval_text !== freeze.exact_approval_text || input.final_freeze_sha256 !== freeze.final_freeze_sha256
    || input.future_activation_sha256 !== freeze.future_activation_sha256) fail("EXACT_SMOKE_APPROVAL_REQUIRED", "Approval must reproduce the exact current smoke text and digests");
  const record = buildApprovalRecord(freeze);
  await writeExclusive(path.join(ledgerRoot, APPROVAL_FILE), record);
  return { ledger_root: ledgerRoot, results_root: resultsRoot, final_freeze_sha256: freeze.final_freeze_sha256, future_activation_sha256: freeze.future_activation_sha256, operator_approval_record_sha256: record.operator_approval_record_sha256, authority_scope: record.authority_scope };
}

function activationFromFreeze(freeze) {
  validateRc7GateCSmokeFinalApprovalFreeze(freeze);
  const expected = { ...structuredClone(freeze.closure), approval_text_sha256: freeze.approval_text_sha256 };
  return { ...expected, activation_sha256: sha256V1(canonicalJsonV1(expected)) };
}

export async function buildRc7GateCSmokeFinalApprovalFreezeForApprovedLedger(root) {
  const ledgerRoot = await assertSmokeRoot(root, { requireEmpty: false, role: "ledger" });
  const record = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "smoke approval record");
  const freeze = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, record?.results_root_identity?.normalized_physical_root);
  await validateApprovalAgainstFreeze(record, freeze, ledgerRoot);
  return freeze;
}

function buildLedgerMeta(activation, approval) {
  return withDigest({
    schema_version: "rc7-gate-c-smoke-ledger-meta-v6",
    state: "active-one-reservation-only",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    permission_policy_identity: RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
    operator_approval_record_sha256: approval.operator_approval_record_sha256,
    activation_sha256: activation.activation_sha256,
    smoke_registration_sha256: activation.smoke_registration_sha256,
    smoke_run_id: SMOKE_RUN_ID,
    ledger_root_sha256: activation.ledger_root_identity.ledger_root_sha256,
    results_root_sha256: activation.results_root_identity.results_root_sha256,
    maximum_reservations: 1,
    generation_https_post_ceiling: 1,
    oauth_refresh_https_post_ceiling: 1,
    total_https_post_ceiling: 2,
    child_request_ceiling: 0,
    rlm_execution_ceiling: 0,
    docker_invocation_ceiling: 0,
    global_concurrency: 1,
    automatic_retries: 0,
  }, "ledger_sha256");
}

function validateLedgerMeta(meta, activation, approval) {
  const expected = buildLedgerMeta(activation, approval);
  if (canonicalJsonV1(meta) !== canonicalJsonV1(expected)) fail("SMOKE_LEDGER_IDENTITY_MISMATCH", "Smoke ledger metadata does not match its exact approval and activation");
  return meta;
}

function buildResultsMeta(activation, ledgerMeta) {
  return withDigest({
    schema_version: "rc7-gate-c-smoke-results-meta-v6",
    state: "empty-awaiting-one-terminal",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    activation_sha256: activation.activation_sha256,
    smoke_run_id: SMOKE_RUN_ID,
    ledger_sha256: ledgerMeta.ledger_sha256,
    ledger_root_sha256: activation.ledger_root_identity.ledger_root_sha256,
    results_root_sha256: activation.results_root_identity.results_root_sha256,
    matrix_member: false,
    score_bearing: false,
    maximum_results: 1,
  }, "results_meta_sha256");
}

async function assertLedgerLayout(root, allowedStates = "initialized") {
  const entries = (await readdir(root)).sort();
  const allowed = new Set([APPROVAL_FILE, LEDGER_META_FILE, RESERVATION_FILE, ACTIVE_DISPATCH_FILE, HANDOFF_FILE, TERMINAL_FILE, LEDGER_LOCK_FILE]);
  if (entries.some((entry) => !allowed.has(entry))) fail("SMOKE_LEDGER_RESIDUE", "Smoke ledger contains unknown residue");
  if (!entries.includes(APPROVAL_FILE) || (allowedStates === "initialized" && !entries.includes(LEDGER_META_FILE))) fail("MISSING_SMOKE_PATH", "Smoke ledger is not initialized");
  for (const entry of entries.filter((item) => item !== LEDGER_LOCK_FILE)) await assertPhysicalFile(path.join(root, entry), root, entry);
  return entries;
}

async function readLedgerContext(root) {
  const ledgerRoot = await assertSmokeRoot(root, { requireEmpty: false, role: "ledger" });
  await assertLedgerLayout(ledgerRoot);
  const approval = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "smoke approval record");
  const freeze = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, approval.results_root_identity?.normalized_physical_root);
  await validateApprovalAgainstFreeze(approval, freeze, ledgerRoot);
  const activation = activationFromFreeze(freeze);
  const meta = validateLedgerMeta(await readCanonicalJson(path.join(ledgerRoot, LEDGER_META_FILE), ledgerRoot, "smoke ledger metadata"), activation, approval);
  return { root: ledgerRoot, approval, freeze, activation, meta };
}

async function historicalPhysicalRootIdentity(root, role, version) {
  const safe = await assertSmokeRoot(root, { requireEmpty: false, role });
  const info = await lstat(safe, { bigint: true });
  return withDigest({
    schema_version: `rc7-gate-c-smoke-${role}-root-identity-${version}`,
    normalized_physical_root: normalizedPath(await realpath(safe)),
    device_id: info.dev.toString(10),
    file_id: info.ino.toString(10),
    birthtime_ns: info.birthtimeNs.toString(10),
  }, `${role}_root_sha256`);
}

function validateHistoricalAccounting(value, version) {
  exactKeys(value, ["schema_version", "basis", "provider_posts", "oauth_refresh_posts", "input_tokens", "output_plus_reasoning_tokens", "provider_active_milliseconds", "automatic_retry_count", "accounting_sha256"], "historical smoke accounting");
  if (value.schema_version !== `rc7-gate-c-smoke-accounting-${version}`
    || !["exact-sealed-provider-observation", "conservative-upper-bound-after-durable-handoff", "exact-zero-before-durable-handoff"].includes(value.basis)
    || value.accounting_sha256 !== sha256V1(canonicalJsonV1(projection(value, "accounting_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke accounting is malformed");
  for (const key of ["provider_posts", "oauth_refresh_posts", "input_tokens", "output_plus_reasoning_tokens", "provider_active_milliseconds", "automatic_retry_count"]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke accounting contains an invalid count");
  }
  if (value.provider_posts > 1 || value.oauth_refresh_posts > 1 || value.input_tokens > 32_768 || value.output_plus_reasoning_tokens > 8_192
    || value.provider_active_milliseconds > 120_000 || value.automatic_retry_count !== 0) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke accounting exceeds its closed ceiling");
  return value;
}

async function readSettledHistoricalSmokeV2(ledgerRootInput, resultsRootInput = null) {
  const disclosed = HISTORICAL_DISCLOSURE.prior_smoke_attempts.find((attempt) => attempt.ordinal === 2);
  const ledgerRoot = await assertSmokeRoot(ledgerRootInput, { requireEmpty: false, role: "ledger" });
  const ledgerEntries = (await readdir(ledgerRoot)).sort();
  if (canonicalJsonV1(ledgerEntries) !== canonicalJsonV1([APPROVAL_FILE, HANDOFF_FILE, LEDGER_META_FILE, RESERVATION_FILE, TERMINAL_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled historical smoke ledger contains missing, active, locked, or unknown state");
  const approval = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "historical smoke approval");
  exactKeys(approval, ["schema_version", "state", "authority_profile", "authority_scope", "final_freeze_sha256", "closure_sha256", "future_activation_sha256", "approval_text_sha256", "exact_approval_text", "ledger_root_sha256", "results_root_identity", "smoke_run_id", "matrix_authority", "governance_nonclaim", "operator_approval_record_sha256"], "historical smoke approval");
  const ledgerIdentity = await historicalPhysicalRootIdentity(ledgerRoot, "ledger", "v2");
  const resultsRoot = await assertSmokeRoot(resultsRootInput ?? approval.results_root_identity?.normalized_physical_root, { requireEmpty: false, role: "results" });
  const resultsIdentity = await historicalPhysicalRootIdentity(resultsRoot, "results", "v2");
  if (approval.schema_version !== "rc7-gate-c-smoke-operator-approval-v2" || approval.state !== "operator-approved-smoke-only"
    || approval.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || approval.authority_scope !== "one-safe01-direct-top-level-live-launch-smoke-only"
    || approval.final_freeze_sha256 !== disclosed.final_freeze_sha256 || approval.closure_sha256 !== disclosed.closure_sha256
    || approval.future_activation_sha256 !== disclosed.activation_sha256 || approval.smoke_run_id !== disclosed.run_id
    || approval.approval_text_sha256 !== sha256V1(approval.exact_approval_text) || approval.ledger_root_sha256 !== disclosed.ledger_root_sha256
    || canonicalJsonV1(approval.results_root_identity) !== canonicalJsonV1(resultsIdentity) || canonicalJsonV1(ledgerIdentity.ledger_root_sha256) !== canonicalJsonV1(disclosed.ledger_root_sha256)
    || resultsIdentity.results_root_sha256 !== disclosed.results_root_sha256 || approval.matrix_authority !== false
    || approval.operator_approval_record_sha256 !== sha256V1(canonicalJsonV1(projection(approval, "operator_approval_record_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke approval or physical roots do not match the disclosed consumed attempt");

  const meta = await readCanonicalJson(path.join(ledgerRoot, LEDGER_META_FILE), ledgerRoot, "historical smoke ledger metadata");
  exactKeys(meta, ["activation_sha256", "authority_profile", "automatic_retries", "child_request_ceiling", "docker_invocation_ceiling", "generation_https_post_ceiling", "global_concurrency", "ledger_root_sha256", "ledger_sha256", "maximum_reservations", "oauth_refresh_https_post_ceiling", "operator_approval_record_sha256", "permission_policy_identity", "results_root_sha256", "rlm_execution_ceiling", "schema_version", "smoke_registration_sha256", "smoke_run_id", "state", "total_https_post_ceiling"], "historical smoke ledger metadata");
  if (meta.schema_version !== "rc7-gate-c-smoke-ledger-meta-v2" || meta.state !== "active-one-reservation-only"
    || meta.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || meta.permission_policy_identity !== PRIOR_SMOKE_PERMISSION_POLICY_ID
    || meta.operator_approval_record_sha256 !== approval.operator_approval_record_sha256 || meta.activation_sha256 !== disclosed.activation_sha256
    || meta.smoke_run_id !== disclosed.run_id || meta.ledger_root_sha256 !== disclosed.ledger_root_sha256 || meta.results_root_sha256 !== disclosed.results_root_sha256
    || meta.maximum_reservations !== 1 || meta.generation_https_post_ceiling !== 1 || meta.oauth_refresh_https_post_ceiling !== 1
    || meta.total_https_post_ceiling !== 2 || meta.child_request_ceiling !== 0 || meta.rlm_execution_ceiling !== 0
    || meta.docker_invocation_ceiling !== 0 || meta.global_concurrency !== 1 || meta.automatic_retries !== 0
    || meta.ledger_sha256 !== sha256V1(canonicalJsonV1(projection(meta, "ledger_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke ledger metadata mismatched");

  const dispatch = await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "historical smoke reservation");
  exactKeys(dispatch, ["schema_version", "authority_profile", "activation_sha256", "permission_policy_identity", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id", "reference_matrix_run_id", "case_id", "arm", "selected_route", "matrix_member", "score_bearing", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key", "reservation_ordinal", "state", "dispatch_sha256"], "historical smoke reservation");
  if (dispatch.schema_version !== "rc7-gate-c-smoke-dispatch-checkpoint-v2" || dispatch.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || dispatch.activation_sha256 !== disclosed.activation_sha256 || dispatch.permission_policy_identity !== PRIOR_SMOKE_PERMISSION_POLICY_ID
    || dispatch.run_id !== disclosed.run_id || dispatch.reference_matrix_run_id !== REFERENCE_MATRIX_RUN_ID || dispatch.case_id !== "SAFE-01"
    || dispatch.arm !== "rc-direct" || dispatch.selected_route !== "rc-direct" || dispatch.matrix_member !== false || dispatch.score_bearing !== false
    || dispatch.request_kind !== "top-level" || dispatch.child_sequence !== 0 || dispatch.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256
    || dispatch.reservation_ordinal !== 1 || dispatch.state !== "consumed-provider-reachable-handoff-started" || dispatch.dispatch_sha256 !== disclosed.dispatch_sha256
    || dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(dispatch, "dispatch_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke reservation mismatched");

  const handoff = await readCanonicalJson(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "historical smoke handoff");
  exactKeys(handoff, ["schema_version", "state", "authority_profile", "activation_sha256", "dispatch_sha256", "reservation_key", "handoff_nonce", "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256"], "historical smoke handoff");
  if (handoff.schema_version !== "rc7-gate-c-smoke-durable-provider-handoff-v2" || handoff.state !== "preflight-consumed-provider-reachability-committed"
    || handoff.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || handoff.activation_sha256 !== dispatch.activation_sha256
    || handoff.dispatch_sha256 !== dispatch.dispatch_sha256 || handoff.reservation_key !== dispatch.reservation_key
    || !HASH.test(handoff.handoff_nonce) || !HASH.test(handoff.sealed_request_sha256) || !HASH.test(handoff.gate_b_attestation_sha256)
    || handoff.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(handoff, "durable_handoff_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke durable handoff mismatched");

  const terminal = await readCanonicalJson(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "historical smoke terminal");
  exactKeys(terminal, ["schema_version", "authority_profile", "state", "activation_sha256", "dispatch_sha256", "reservation_key", "run_id", "case_id", "selected_route", "request_kind", "terminal_class", "failure_code", "sealed_result_digests", "accounting", "reason", "replay_permitted", "terminal_sha256"], "historical smoke terminal");
  validateHistoricalAccounting(terminal.accounting, "v2");
  if (terminal.schema_version !== "rc7-gate-c-smoke-terminal-v2" || terminal.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || terminal.state !== "indeterminate-no-replay" || terminal.activation_sha256 !== dispatch.activation_sha256 || terminal.dispatch_sha256 !== dispatch.dispatch_sha256
    || terminal.reservation_key !== dispatch.reservation_key || terminal.run_id !== disclosed.run_id || terminal.case_id !== "SAFE-01"
    || terminal.selected_route !== "rc-direct" || terminal.request_kind !== "top-level" || terminal.terminal_class !== "smoke-live-launch-indeterminate"
    || terminal.failure_code !== disclosed.retained_failure_code || terminal.sealed_result_digests !== null
    || terminal.reason !== "provider-reachable-or-consumed-without-trusted-sealed-result" || terminal.replay_permitted !== false
    || terminal.terminal_sha256 !== disclosed.terminal_sha256 || terminal.terminal_sha256 !== sha256V1(canonicalJsonV1(projection(terminal, "terminal_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke terminal mismatched");

  const resultEntries = (await readdir(resultsRoot)).sort();
  if (canonicalJsonV1(resultEntries) !== canonicalJsonV1([RESULTS_META_FILE, RESULT_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled historical smoke results contain missing, locked, or unknown state");
  const resultsMeta = await readCanonicalJson(path.join(resultsRoot, RESULTS_META_FILE), resultsRoot, "historical smoke results metadata");
  exactKeys(resultsMeta, ["activation_sha256", "authority_profile", "ledger_root_sha256", "ledger_sha256", "matrix_member", "maximum_results", "results_meta_sha256", "results_root_sha256", "schema_version", "score_bearing", "smoke_run_id", "state"], "historical smoke results metadata");
  if (resultsMeta.schema_version !== "rc7-gate-c-smoke-results-meta-v2" || resultsMeta.state !== "empty-awaiting-one-terminal"
    || resultsMeta.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || resultsMeta.activation_sha256 !== disclosed.activation_sha256
    || resultsMeta.smoke_run_id !== disclosed.run_id || resultsMeta.ledger_sha256 !== meta.ledger_sha256 || resultsMeta.ledger_root_sha256 !== disclosed.ledger_root_sha256
    || resultsMeta.results_root_sha256 !== disclosed.results_root_sha256 || resultsMeta.matrix_member !== false || resultsMeta.score_bearing !== false
    || resultsMeta.maximum_results !== 1 || resultsMeta.results_meta_sha256 !== sha256V1(canonicalJsonV1(projection(resultsMeta, "results_meta_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke results metadata mismatched");
  const result = await readCanonicalJson(path.join(resultsRoot, RESULT_FILE), resultsRoot, "historical smoke result");
  exactKeys(result, ["schema_version", "authority_profile", "state", "activation_sha256", "smoke_run_id", "case_id", "selected_route", "matrix_member", "score_bearing", "terminal_sha256", "sealed_result_digests", "accounting", "failure_code", "replay_permitted", "raw_output_retained", "score", "results_meta_sha256", "result_sha256"], "historical smoke result");
  if (result.schema_version !== "rc7-gate-c-smoke-retained-result-v2" || result.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || result.state !== "smoke-indeterminate-no-replay" || result.activation_sha256 !== disclosed.activation_sha256 || result.smoke_run_id !== disclosed.run_id
    || result.case_id !== "SAFE-01" || result.selected_route !== "rc-direct" || result.matrix_member !== false || result.score_bearing !== false
    || result.terminal_sha256 !== terminal.terminal_sha256 || result.sealed_result_digests !== null
    || canonicalJsonV1(result.accounting) !== canonicalJsonV1(terminal.accounting) || result.failure_code !== terminal.failure_code
    || result.replay_permitted !== false || result.raw_output_retained !== false || result.score !== null || result.results_meta_sha256 !== resultsMeta.results_meta_sha256
    || result.result_sha256 !== disclosed.result_sha256 || result.result_sha256 !== sha256V1(canonicalJsonV1(projection(result, "result_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical smoke retained result mismatched");
  return { root: ledgerRoot, results_root: resultsRoot, approval, meta, dispatch, handoff, terminal, results_meta: resultsMeta, result, historical_version: "v2" };
}

async function readSettledHistoricalSmokeV3(ledgerRootInput, resultsRootInput = null) {
  const disclosed = HISTORICAL_DISCLOSURE.prior_smoke_attempts.find((attempt) => attempt.ordinal === 3);
  const ledgerRoot = await assertSmokeRoot(ledgerRootInput, { requireEmpty: false, role: "ledger" });
  const ledgerEntries = (await readdir(ledgerRoot)).sort();
  if (canonicalJsonV1(ledgerEntries) !== canonicalJsonV1([APPROVAL_FILE, HANDOFF_FILE, LEDGER_META_FILE, RESERVATION_FILE, TERMINAL_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v3 smoke ledger contains missing, active, locked, or unknown state");
  const approval = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "historical v3 smoke approval");
  exactKeys(approval, ["schema_version", "state", "authority_profile", "authority_scope", "final_freeze_sha256", "closure_sha256", "future_activation_sha256", "approval_text_sha256", "exact_approval_text", "ledger_root_sha256", "results_root_identity", "smoke_run_id", "matrix_authority", "governance_nonclaim", "operator_approval_record_sha256"], "historical v3 smoke approval");
  const ledgerIdentity = await historicalPhysicalRootIdentity(ledgerRoot, "ledger", "v3");
  const resultsRoot = await assertSmokeRoot(resultsRootInput ?? approval.results_root_identity?.normalized_physical_root, { requireEmpty: false, role: "results" });
  const resultsIdentity = await historicalPhysicalRootIdentity(resultsRoot, "results", "v3");
  if (approval.schema_version !== "rc7-gate-c-smoke-operator-approval-v3" || approval.state !== "operator-approved-smoke-only"
    || approval.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || approval.authority_scope !== "one-safe01-direct-top-level-live-launch-smoke-only"
    || approval.final_freeze_sha256 !== disclosed.final_freeze_sha256 || approval.closure_sha256 !== disclosed.closure_sha256
    || approval.future_activation_sha256 !== disclosed.activation_sha256 || approval.smoke_run_id !== disclosed.run_id
    || approval.approval_text_sha256 !== sha256V1(approval.exact_approval_text) || approval.ledger_root_sha256 !== disclosed.ledger_root_sha256
    || ledgerIdentity.ledger_root_sha256 !== disclosed.ledger_root_sha256 || canonicalJsonV1(approval.results_root_identity) !== canonicalJsonV1(resultsIdentity)
    || resultsIdentity.results_root_sha256 !== disclosed.results_root_sha256 || approval.matrix_authority !== false
    || approval.operator_approval_record_sha256 !== "a89d70afcea98a840e4ed31665e64459f19cc3722f7eeb7a004f1f887b2da799"
    || approval.operator_approval_record_sha256 !== sha256V1(canonicalJsonV1(projection(approval, "operator_approval_record_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical v3 smoke approval or physical roots do not match the disclosed consumed attempt");

  const meta = await readCanonicalJson(path.join(ledgerRoot, LEDGER_META_FILE), ledgerRoot, "historical v3 smoke ledger metadata");
  exactKeys(meta, ["activation_sha256", "authority_profile", "automatic_retries", "child_request_ceiling", "docker_invocation_ceiling", "generation_https_post_ceiling", "global_concurrency", "ledger_root_sha256", "ledger_sha256", "maximum_reservations", "oauth_refresh_https_post_ceiling", "operator_approval_record_sha256", "permission_policy_identity", "results_root_sha256", "rlm_execution_ceiling", "schema_version", "smoke_registration_sha256", "smoke_run_id", "state", "total_https_post_ceiling"], "historical v3 smoke ledger metadata");
  if (meta.schema_version !== "rc7-gate-c-smoke-ledger-meta-v3" || meta.state !== "active-one-reservation-only"
    || meta.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || meta.permission_policy_identity !== THIRD_SMOKE_PERMISSION_POLICY_ID
    || meta.operator_approval_record_sha256 !== approval.operator_approval_record_sha256 || meta.activation_sha256 !== disclosed.activation_sha256
    || meta.smoke_run_id !== disclosed.run_id || meta.ledger_root_sha256 !== disclosed.ledger_root_sha256 || meta.results_root_sha256 !== disclosed.results_root_sha256
    || meta.maximum_reservations !== 1 || meta.generation_https_post_ceiling !== 1 || meta.oauth_refresh_https_post_ceiling !== 1
    || meta.total_https_post_ceiling !== 2 || meta.child_request_ceiling !== 0 || meta.rlm_execution_ceiling !== 0
    || meta.docker_invocation_ceiling !== 0 || meta.global_concurrency !== 1 || meta.automatic_retries !== 0
    || meta.ledger_sha256 !== "0efe6e6de4475722631a408447e856e865381638091e76f61a193b2cd9ffd5c1"
    || meta.ledger_sha256 !== sha256V1(canonicalJsonV1(projection(meta, "ledger_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical v3 smoke ledger metadata mismatched");

  const dispatch = await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "historical v3 smoke reservation");
  exactKeys(dispatch, ["schema_version", "authority_profile", "activation_sha256", "permission_policy_identity", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id", "reference_matrix_run_id", "case_id", "arm", "selected_route", "matrix_member", "score_bearing", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key", "reservation_ordinal", "state", "dispatch_sha256"], "historical v3 smoke reservation");
  if (dispatch.schema_version !== "rc7-gate-c-smoke-dispatch-checkpoint-v3" || dispatch.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || dispatch.activation_sha256 !== disclosed.activation_sha256 || dispatch.permission_policy_identity !== THIRD_SMOKE_PERMISSION_POLICY_ID
    || dispatch.run_id !== disclosed.run_id || dispatch.reference_matrix_run_id !== REFERENCE_MATRIX_RUN_ID || dispatch.case_id !== "SAFE-01"
    || dispatch.arm !== "rc-direct" || dispatch.selected_route !== "rc-direct" || dispatch.matrix_member !== false || dispatch.score_bearing !== false
    || dispatch.request_kind !== "top-level" || dispatch.child_sequence !== 0 || dispatch.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256
    || dispatch.reservation_ordinal !== 1 || dispatch.state !== "consumed-provider-reachable-handoff-started" || dispatch.dispatch_sha256 !== disclosed.dispatch_sha256
    || dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(dispatch, "dispatch_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical v3 smoke reservation mismatched");

  const handoff = await readCanonicalJson(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "historical v3 smoke handoff");
  exactKeys(handoff, ["schema_version", "state", "authority_profile", "activation_sha256", "dispatch_sha256", "reservation_key", "handoff_nonce", "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256"], "historical v3 smoke handoff");
  if (handoff.schema_version !== "rc7-gate-c-smoke-durable-provider-handoff-v3" || handoff.state !== "preflight-consumed-provider-reachability-committed"
    || handoff.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || handoff.activation_sha256 !== dispatch.activation_sha256
    || handoff.dispatch_sha256 !== dispatch.dispatch_sha256 || handoff.reservation_key !== dispatch.reservation_key
    || !HASH.test(handoff.handoff_nonce) || !HASH.test(handoff.sealed_request_sha256) || !HASH.test(handoff.gate_b_attestation_sha256)
    || handoff.durable_handoff_sha256 !== "5be52264d57cf5e80bea73aa28ff243111c45d642bda078803e1980be1c639eb"
    || handoff.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(handoff, "durable_handoff_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical v3 smoke durable handoff mismatched");

  const terminal = await readCanonicalJson(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "historical v3 smoke terminal");
  exactKeys(terminal, ["schema_version", "authority_profile", "state", "activation_sha256", "dispatch_sha256", "reservation_key", "run_id", "case_id", "selected_route", "request_kind", "terminal_class", "failure_code", "terminal_kind", "provider_failure_code", "sealed_result_digests", "accounting", "reason", "replay_permitted", "terminal_sha256"], "historical v3 smoke terminal");
  validateHistoricalAccounting(terminal.accounting, "v3");
  if (terminal.schema_version !== "rc7-gate-c-smoke-terminal-v3" || terminal.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || terminal.state !== "indeterminate-no-replay" || terminal.activation_sha256 !== dispatch.activation_sha256 || terminal.dispatch_sha256 !== dispatch.dispatch_sha256
    || terminal.reservation_key !== dispatch.reservation_key || terminal.run_id !== disclosed.run_id || terminal.case_id !== "SAFE-01"
    || terminal.selected_route !== "rc-direct" || terminal.request_kind !== "top-level" || terminal.terminal_class !== "smoke-live-launch-indeterminate"
    || terminal.failure_code !== disclosed.retained_failure_code || terminal.terminal_kind !== null || terminal.provider_failure_code !== null
    || terminal.sealed_result_digests !== null || terminal.reason !== "provider-reachable-or-consumed-without-trusted-sealed-result"
    || terminal.replay_permitted !== false || terminal.accounting.basis !== "conservative-upper-bound-after-durable-handoff"
    || terminal.terminal_sha256 !== disclosed.terminal_sha256 || terminal.terminal_sha256 !== sha256V1(canonicalJsonV1(projection(terminal, "terminal_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical v3 smoke terminal mismatched");

  const resultEntries = (await readdir(resultsRoot)).sort();
  if (canonicalJsonV1(resultEntries) !== canonicalJsonV1([RESULTS_META_FILE, RESULT_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled historical v3 smoke results contain missing, locked, or unknown state");
  const resultsMeta = await readCanonicalJson(path.join(resultsRoot, RESULTS_META_FILE), resultsRoot, "historical v3 smoke results metadata");
  exactKeys(resultsMeta, ["activation_sha256", "authority_profile", "ledger_root_sha256", "ledger_sha256", "matrix_member", "maximum_results", "results_meta_sha256", "results_root_sha256", "schema_version", "score_bearing", "smoke_run_id", "state"], "historical v3 smoke results metadata");
  if (resultsMeta.schema_version !== "rc7-gate-c-smoke-results-meta-v3" || resultsMeta.state !== "empty-awaiting-one-terminal"
    || resultsMeta.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || resultsMeta.activation_sha256 !== disclosed.activation_sha256
    || resultsMeta.smoke_run_id !== disclosed.run_id || resultsMeta.ledger_sha256 !== meta.ledger_sha256 || resultsMeta.ledger_root_sha256 !== disclosed.ledger_root_sha256
    || resultsMeta.results_root_sha256 !== disclosed.results_root_sha256 || resultsMeta.matrix_member !== false || resultsMeta.score_bearing !== false
    || resultsMeta.maximum_results !== 1 || resultsMeta.results_meta_sha256 !== "ddc1b52cc34e0adc422eb878b94914131e24573dda2754cdd466059bd52ff2ff"
    || resultsMeta.results_meta_sha256 !== sha256V1(canonicalJsonV1(projection(resultsMeta, "results_meta_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical v3 smoke results metadata mismatched");
  const result = await readCanonicalJson(path.join(resultsRoot, RESULT_FILE), resultsRoot, "historical v3 smoke result");
  exactKeys(result, ["schema_version", "authority_profile", "state", "activation_sha256", "smoke_run_id", "case_id", "selected_route", "matrix_member", "score_bearing", "terminal_sha256", "sealed_result_digests", "accounting", "failure_code", "terminal_kind", "provider_failure_code", "replay_permitted", "raw_output_retained", "score", "results_meta_sha256", "result_sha256"], "historical v3 smoke result");
  if (result.schema_version !== "rc7-gate-c-smoke-retained-result-v3" || result.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || result.state !== "smoke-indeterminate-no-replay" || result.activation_sha256 !== disclosed.activation_sha256 || result.smoke_run_id !== disclosed.run_id
    || result.case_id !== "SAFE-01" || result.selected_route !== "rc-direct" || result.matrix_member !== false || result.score_bearing !== false
    || result.terminal_sha256 !== terminal.terminal_sha256 || result.sealed_result_digests !== null
    || canonicalJsonV1(result.accounting) !== canonicalJsonV1(terminal.accounting) || result.failure_code !== terminal.failure_code
    || result.terminal_kind !== null || result.provider_failure_code !== null || result.replay_permitted !== false || result.raw_output_retained !== false
    || result.score !== null || result.results_meta_sha256 !== resultsMeta.results_meta_sha256 || result.result_sha256 !== disclosed.result_sha256
    || result.result_sha256 !== sha256V1(canonicalJsonV1(projection(result, "result_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Historical v3 smoke retained result mismatched");
  return { root: ledgerRoot, results_root: resultsRoot, approval, meta, dispatch, handoff, terminal, results_meta: resultsMeta, result, historical_version: "v3" };
}

async function readSettledHistoricalSmokeV4(ledgerRootInput, resultsRootInput = null) {
  const disclosed = HISTORICAL_DISCLOSURE.prior_smoke_attempts.find((attempt) => attempt.ordinal === 4);
  const ledgerRoot = await assertSmokeRoot(ledgerRootInput, { requireEmpty: false, role: "ledger" });
  const ledgerEntries = (await readdir(ledgerRoot)).sort();
  if (canonicalJsonV1(ledgerEntries) !== canonicalJsonV1([APPROVAL_FILE, HANDOFF_FILE, LEDGER_META_FILE, RESERVATION_FILE, TERMINAL_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke ledger contains missing, active, locked, or unknown state");
  const approval = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "historical v4 smoke approval");
  exactKeys(approval, ["schema_version", "state", "authority_profile", "authority_scope", "final_freeze_sha256", "closure_sha256", "future_activation_sha256", "approval_text_sha256", "exact_approval_text", "ledger_root_sha256", "results_root_identity", "smoke_run_id", "matrix_authority", "governance_nonclaim", "operator_approval_record_sha256"], "historical v4 smoke approval");
  const ledgerIdentity = await historicalPhysicalRootIdentity(ledgerRoot, "ledger", "v4");
  const resultsRoot = await assertSmokeRoot(resultsRootInput ?? approval.results_root_identity?.normalized_physical_root, { requireEmpty: false, role: "results" });
  const resultsIdentity = await historicalPhysicalRootIdentity(resultsRoot, "results", "v4");
  if (!disclosed || approval.schema_version !== "rc7-gate-c-smoke-operator-approval-v4" || approval.state !== "operator-approved-smoke-only"
    || approval.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || approval.authority_scope !== "one-safe01-direct-top-level-live-launch-smoke-only"
    || approval.smoke_run_id !== FOURTH_SMOKE_RUN_ID || approval.future_activation_sha256 !== disclosed.activation_sha256
    || approval.final_freeze_sha256 !== disclosed.final_freeze_sha256 || approval.closure_sha256 !== disclosed.closure_sha256
    || approval.approval_text_sha256 !== sha256V1(approval.exact_approval_text)
    || approval.ledger_root_sha256 !== ledgerIdentity.ledger_root_sha256 || canonicalJsonV1(approval.results_root_identity) !== canonicalJsonV1(resultsIdentity)
    || ledgerIdentity.ledger_root_sha256 !== disclosed.ledger_root_sha256 || resultsIdentity.results_root_sha256 !== disclosed.results_root_sha256
    || approval.matrix_authority !== false || approval.operator_approval_record_sha256 !== "b81873dffb3b3f98065b8e25ed5a5676809886c51e980da3ec98cafaa29c4dda"
    || approval.operator_approval_record_sha256 !== sha256V1(canonicalJsonV1(projection(approval, "operator_approval_record_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke approval or physical roots mismatched");

  const meta = await readCanonicalJson(path.join(ledgerRoot, LEDGER_META_FILE), ledgerRoot, "historical v4 smoke ledger metadata");
  exactKeys(meta, ["activation_sha256", "authority_profile", "automatic_retries", "child_request_ceiling", "docker_invocation_ceiling", "generation_https_post_ceiling", "global_concurrency", "ledger_root_sha256", "ledger_sha256", "maximum_reservations", "oauth_refresh_https_post_ceiling", "operator_approval_record_sha256", "permission_policy_identity", "results_root_sha256", "rlm_execution_ceiling", "schema_version", "smoke_registration_sha256", "smoke_run_id", "state", "total_https_post_ceiling"], "historical v4 smoke ledger metadata");
  if (meta.schema_version !== "rc7-gate-c-smoke-ledger-meta-v4" || meta.activation_sha256 !== disclosed.activation_sha256
    || meta.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || meta.permission_policy_identity !== FOURTH_SMOKE_PERMISSION_POLICY_ID
    || meta.smoke_run_id !== FOURTH_SMOKE_RUN_ID || meta.ledger_root_sha256 !== disclosed.ledger_root_sha256
    || meta.results_root_sha256 !== disclosed.results_root_sha256 || meta.operator_approval_record_sha256 !== approval.operator_approval_record_sha256
    || meta.generation_https_post_ceiling !== 1 || meta.oauth_refresh_https_post_ceiling !== 1 || meta.total_https_post_ceiling !== 2
    || meta.child_request_ceiling !== 0 || meta.rlm_execution_ceiling !== 0 || meta.docker_invocation_ceiling !== 0
    || meta.automatic_retries !== 0 || meta.global_concurrency !== 1 || meta.maximum_reservations !== 1
    || meta.ledger_sha256 !== "581fa08b4b79dd81a5cd6ee822b7698729306b1f3efe564d82f2edc1426cefa7"
    || meta.ledger_sha256 !== sha256V1(canonicalJsonV1(projection(meta, "ledger_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke ledger metadata mismatched");

  const dispatch = await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "historical v4 smoke reservation");
  exactKeys(dispatch, ["schema_version", "authority_profile", "activation_sha256", "permission_policy_identity", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id", "reference_matrix_run_id", "case_id", "arm", "selected_route", "matrix_member", "score_bearing", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key", "reservation_ordinal", "state", "dispatch_sha256"], "historical v4 smoke reservation");
  if (dispatch.schema_version !== "rc7-gate-c-smoke-dispatch-checkpoint-v4" || dispatch.activation_sha256 !== disclosed.activation_sha256
    || dispatch.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || dispatch.permission_policy_identity !== FOURTH_SMOKE_PERMISSION_POLICY_ID
    || dispatch.run_id !== FOURTH_SMOKE_RUN_ID || dispatch.reference_matrix_run_id !== REFERENCE_MATRIX_RUN_ID || dispatch.case_id !== "SAFE-01"
    || dispatch.arm !== "rc-direct" || dispatch.selected_route !== "rc-direct" || dispatch.matrix_member !== false || dispatch.score_bearing !== false
    || dispatch.request_kind !== "top-level" || dispatch.child_sequence !== 0 || dispatch.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256
    || dispatch.reservation_ordinal !== 1 || dispatch.state !== "consumed-provider-reachable-handoff-started"
    || dispatch.dispatch_sha256 !== disclosed.dispatch_sha256 || dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(dispatch, "dispatch_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke reservation mismatched");

  const handoff = await readCanonicalJson(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "historical v4 smoke handoff");
  exactKeys(handoff, ["schema_version", "state", "authority_profile", "activation_sha256", "dispatch_sha256", "reservation_key", "handoff_nonce", "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256"], "historical v4 smoke handoff");
  if (handoff.schema_version !== "rc7-gate-c-smoke-durable-provider-handoff-v4" || handoff.state !== "preflight-consumed-provider-reachability-committed"
    || handoff.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || handoff.activation_sha256 !== disclosed.activation_sha256
    || handoff.dispatch_sha256 !== dispatch.dispatch_sha256 || handoff.reservation_key !== dispatch.reservation_key
    || handoff.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(handoff, "durable_handoff_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke durable handoff mismatched");

  const terminal = await readCanonicalJson(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "historical v4 smoke terminal");
  exactKeys(terminal, ["schema_version", "authority_profile", "state", "activation_sha256", "dispatch_sha256", "reservation_key", "run_id", "case_id", "selected_route", "request_kind", "terminal_class", "failure_code", "terminal_kind", "provider_failure_code", "sealed_result_digests", "accounting", "reason", "replay_permitted", "terminal_sha256"], "historical v4 smoke terminal");
  validateHistoricalAccounting(terminal.accounting, "v4");
  if (terminal.schema_version !== "rc7-gate-c-smoke-terminal-v4" || terminal.activation_sha256 !== disclosed.activation_sha256
    || terminal.dispatch_sha256 !== dispatch.dispatch_sha256 || terminal.reservation_key !== dispatch.reservation_key || terminal.run_id !== FOURTH_SMOKE_RUN_ID
    || terminal.state !== "indeterminate-no-replay" || terminal.case_id !== "SAFE-01" || terminal.selected_route !== "rc-direct"
    || terminal.request_kind !== "top-level" || terminal.terminal_class !== "smoke-live-launch-indeterminate"
    || terminal.failure_code !== disclosed.retained_failure_code || terminal.terminal_kind !== disclosed.terminal_kind
    || terminal.provider_failure_code !== disclosed.provider_failure_code || terminal.sealed_result_digests !== null || terminal.replay_permitted !== false
    || terminal.accounting.basis !== "conservative-upper-bound-after-durable-handoff" || terminal.terminal_sha256 !== disclosed.terminal_sha256
    || terminal.terminal_sha256 !== sha256V1(canonicalJsonV1(projection(terminal, "terminal_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke terminal mismatched");

  const resultEntries = (await readdir(resultsRoot)).sort();
  if (canonicalJsonV1(resultEntries) !== canonicalJsonV1([RESULTS_META_FILE, RESULT_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke results contain missing, locked, or unknown state");
  const resultsMeta = await readCanonicalJson(path.join(resultsRoot, RESULTS_META_FILE), resultsRoot, "historical v4 smoke results metadata");
  exactKeys(resultsMeta, ["activation_sha256", "authority_profile", "ledger_root_sha256", "ledger_sha256", "matrix_member", "maximum_results", "results_meta_sha256", "results_root_sha256", "schema_version", "score_bearing", "smoke_run_id", "state"], "historical v4 smoke results metadata");
  if (resultsMeta.schema_version !== "rc7-gate-c-smoke-results-meta-v4" || resultsMeta.activation_sha256 !== disclosed.activation_sha256
    || resultsMeta.ledger_root_sha256 !== disclosed.ledger_root_sha256 || resultsMeta.results_root_sha256 !== disclosed.results_root_sha256
    || resultsMeta.ledger_sha256 !== meta.ledger_sha256 || resultsMeta.smoke_run_id !== FOURTH_SMOKE_RUN_ID
    || resultsMeta.matrix_member !== false || resultsMeta.score_bearing !== false || resultsMeta.maximum_results !== 1
    || resultsMeta.results_meta_sha256 !== "f312967f60ddedb6defc76ebb4770c514947572717558fa7132f108667a5956d"
    || resultsMeta.results_meta_sha256 !== sha256V1(canonicalJsonV1(projection(resultsMeta, "results_meta_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke results metadata mismatched");
  const result = await readCanonicalJson(path.join(resultsRoot, RESULT_FILE), resultsRoot, "historical v4 smoke result");
  exactKeys(result, ["schema_version", "authority_profile", "state", "activation_sha256", "smoke_run_id", "case_id", "selected_route", "matrix_member", "score_bearing", "terminal_sha256", "sealed_result_digests", "accounting", "failure_code", "terminal_kind", "provider_failure_code", "replay_permitted", "raw_output_retained", "score", "results_meta_sha256", "result_sha256"], "historical v4 smoke result");
  if (result.schema_version !== "rc7-gate-c-smoke-retained-result-v4" || result.state !== "smoke-indeterminate-no-replay"
    || result.activation_sha256 !== disclosed.activation_sha256 || result.smoke_run_id !== FOURTH_SMOKE_RUN_ID || result.case_id !== "SAFE-01"
    || result.selected_route !== "rc-direct" || result.matrix_member !== false || result.score_bearing !== false
    || result.terminal_sha256 !== terminal.terminal_sha256 || result.sealed_result_digests !== null
    || canonicalJsonV1(result.accounting) !== canonicalJsonV1(terminal.accounting) || result.failure_code !== disclosed.retained_failure_code
    || result.terminal_kind !== disclosed.terminal_kind || result.provider_failure_code !== disclosed.provider_failure_code
    || result.replay_permitted !== false || result.raw_output_retained !== false || result.score !== null
    || result.results_meta_sha256 !== resultsMeta.results_meta_sha256 || result.result_sha256 !== disclosed.result_sha256
    || result.result_sha256 !== sha256V1(canonicalJsonV1(projection(result, "result_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v4 smoke result mismatched");
  return { root: ledgerRoot, results_root: resultsRoot, approval, meta, dispatch, handoff, terminal, results_meta: resultsMeta, result, historical_version: "v4" };
}

async function readSettledHistoricalSmokeV5(ledgerRootInput, resultsRootInput = null) {
  const disclosed = HISTORICAL_DISCLOSURE.prior_smoke_attempts.find((attempt) => attempt.ordinal === 5);
  const ledgerRoot = await assertSmokeRoot(ledgerRootInput, { requireEmpty: false, role: "ledger" });
  const ledgerEntries = (await readdir(ledgerRoot)).sort();
  if (canonicalJsonV1(ledgerEntries) !== canonicalJsonV1([APPROVAL_FILE, HANDOFF_FILE, LEDGER_META_FILE, RESERVATION_FILE, TERMINAL_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke ledger contains missing, active, locked, or unknown state");
  const approval = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "historical v5 smoke approval");
  exactKeys(approval, ["schema_version", "state", "authority_profile", "authority_scope", "final_freeze_sha256", "closure_sha256", "future_activation_sha256", "approval_text_sha256", "exact_approval_text", "ledger_root_sha256", "results_root_identity", "smoke_run_id", "matrix_authority", "governance_nonclaim", "operator_approval_record_sha256"], "historical v5 smoke approval");
  const ledgerIdentity = await historicalPhysicalRootIdentity(ledgerRoot, "ledger", "v5");
  const resultsRoot = await assertSmokeRoot(resultsRootInput ?? approval.results_root_identity?.normalized_physical_root, { requireEmpty: false, role: "results" });
  const resultsIdentity = await historicalPhysicalRootIdentity(resultsRoot, "results", "v5");
  if (!disclosed || approval.schema_version !== "rc7-gate-c-smoke-operator-approval-v5" || approval.state !== "operator-approved-smoke-only"
    || approval.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || approval.authority_scope !== "one-safe01-direct-top-level-live-launch-smoke-only"
    || approval.smoke_run_id !== FIFTH_SMOKE_RUN_ID || approval.future_activation_sha256 !== disclosed.activation_sha256
    || approval.final_freeze_sha256 !== disclosed.final_freeze_sha256 || approval.closure_sha256 !== disclosed.closure_sha256
    || approval.approval_text_sha256 !== "83e29afb855df578593034d57d2878ffdf08cce3c5cf7849aa3fc11e8df5f2f0"
    || approval.approval_text_sha256 !== sha256V1(approval.exact_approval_text)
    || approval.ledger_root_sha256 !== ledgerIdentity.ledger_root_sha256 || canonicalJsonV1(approval.results_root_identity) !== canonicalJsonV1(resultsIdentity)
    || ledgerIdentity.ledger_root_sha256 !== disclosed.ledger_root_sha256 || resultsIdentity.results_root_sha256 !== disclosed.results_root_sha256
    || approval.matrix_authority !== false || approval.operator_approval_record_sha256 !== "feef67fd7c1a878d630416fcdf68c95b884a1df4fd513088eac1704f8ff6dcd1"
    || approval.operator_approval_record_sha256 !== sha256V1(canonicalJsonV1(projection(approval, "operator_approval_record_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke approval or physical roots mismatched");

  const meta = await readCanonicalJson(path.join(ledgerRoot, LEDGER_META_FILE), ledgerRoot, "historical v5 smoke ledger metadata");
  exactKeys(meta, ["activation_sha256", "authority_profile", "automatic_retries", "child_request_ceiling", "docker_invocation_ceiling", "generation_https_post_ceiling", "global_concurrency", "ledger_root_sha256", "ledger_sha256", "maximum_reservations", "oauth_refresh_https_post_ceiling", "operator_approval_record_sha256", "permission_policy_identity", "results_root_sha256", "rlm_execution_ceiling", "schema_version", "smoke_registration_sha256", "smoke_run_id", "state", "total_https_post_ceiling"], "historical v5 smoke ledger metadata");
  if (meta.schema_version !== "rc7-gate-c-smoke-ledger-meta-v5" || meta.activation_sha256 !== disclosed.activation_sha256
    || meta.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || meta.permission_policy_identity !== FIFTH_SMOKE_PERMISSION_POLICY_ID
    || meta.smoke_run_id !== FIFTH_SMOKE_RUN_ID || meta.smoke_registration_sha256 !== "df70c00d8986068c20fa2df2845702f4355ef26dc7ecf0f5bc9815bb1c7bc4e0"
    || meta.ledger_root_sha256 !== disclosed.ledger_root_sha256 || meta.results_root_sha256 !== disclosed.results_root_sha256
    || meta.operator_approval_record_sha256 !== approval.operator_approval_record_sha256
    || meta.generation_https_post_ceiling !== 1 || meta.oauth_refresh_https_post_ceiling !== 1 || meta.total_https_post_ceiling !== 2
    || meta.child_request_ceiling !== 0 || meta.rlm_execution_ceiling !== 0 || meta.docker_invocation_ceiling !== 0
    || meta.automatic_retries !== 0 || meta.global_concurrency !== 1 || meta.maximum_reservations !== 1
    || meta.ledger_sha256 !== "ddc97cfa8b1a197fbd8ce697c6824f10bc0b1ddc3357dc2a3a81aafaaaf90a6a"
    || meta.ledger_sha256 !== sha256V1(canonicalJsonV1(projection(meta, "ledger_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke ledger metadata mismatched");

  const dispatch = await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "historical v5 smoke reservation");
  exactKeys(dispatch, ["schema_version", "authority_profile", "activation_sha256", "permission_policy_identity", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id", "reference_matrix_run_id", "case_id", "arm", "selected_route", "matrix_member", "score_bearing", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key", "reservation_ordinal", "state", "dispatch_sha256"], "historical v5 smoke reservation");
  if (dispatch.schema_version !== "rc7-gate-c-smoke-dispatch-checkpoint-v5" || dispatch.activation_sha256 !== disclosed.activation_sha256
    || dispatch.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || dispatch.permission_policy_identity !== FIFTH_SMOKE_PERMISSION_POLICY_ID
    || dispatch.run_id !== FIFTH_SMOKE_RUN_ID || dispatch.reference_matrix_run_id !== REFERENCE_MATRIX_RUN_ID || dispatch.case_id !== "SAFE-01"
    || dispatch.arm !== "rc-direct" || dispatch.selected_route !== "rc-direct" || dispatch.matrix_member !== false || dispatch.score_bearing !== false
    || dispatch.request_kind !== "top-level" || dispatch.child_sequence !== 0 || dispatch.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256
    || dispatch.reservation_ordinal !== 1 || dispatch.state !== "consumed-provider-reachable-handoff-started"
    || dispatch.dispatch_sha256 !== disclosed.dispatch_sha256 || dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(dispatch, "dispatch_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke reservation mismatched");

  const handoff = await readCanonicalJson(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "historical v5 smoke handoff");
  exactKeys(handoff, ["schema_version", "state", "authority_profile", "activation_sha256", "dispatch_sha256", "reservation_key", "handoff_nonce", "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256"], "historical v5 smoke handoff");
  if (handoff.schema_version !== "rc7-gate-c-smoke-durable-provider-handoff-v5" || handoff.state !== "preflight-consumed-provider-reachability-committed"
    || handoff.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || handoff.activation_sha256 !== disclosed.activation_sha256
    || handoff.dispatch_sha256 !== dispatch.dispatch_sha256 || handoff.reservation_key !== dispatch.reservation_key
    || handoff.durable_handoff_sha256 !== "5b9c95431145ec1124bcabde1cd3234ee0acdd9cd1888b7c0658bfb62a165470"
    || handoff.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(handoff, "durable_handoff_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke durable handoff mismatched");

  const terminal = await readCanonicalJson(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "historical v5 smoke terminal");
  exactKeys(terminal, ["schema_version", "authority_profile", "state", "activation_sha256", "dispatch_sha256", "reservation_key", "run_id", "case_id", "selected_route", "request_kind", "terminal_class", "failure_code", "terminal_kind", "provider_failure_code", "integration_failure_phase", "sealed_result_digests", "accounting", "reason", "replay_permitted", "terminal_sha256"], "historical v5 smoke terminal");
  validateHistoricalAccounting(terminal.accounting, "v5");
  if (terminal.schema_version !== "rc7-gate-c-smoke-terminal-v5" || terminal.activation_sha256 !== disclosed.activation_sha256
    || terminal.dispatch_sha256 !== dispatch.dispatch_sha256 || terminal.reservation_key !== dispatch.reservation_key || terminal.run_id !== FIFTH_SMOKE_RUN_ID
    || terminal.state !== "indeterminate-no-replay" || terminal.case_id !== "SAFE-01" || terminal.selected_route !== "rc-direct"
    || terminal.request_kind !== "top-level" || terminal.terminal_class !== "smoke-live-launch-indeterminate"
    || terminal.failure_code !== disclosed.retained_failure_code || terminal.terminal_kind !== disclosed.terminal_kind
    || terminal.provider_failure_code !== disclosed.provider_failure_code || terminal.integration_failure_phase !== disclosed.integration_failure_phase
    || terminal.sealed_result_digests !== null || terminal.replay_permitted !== false
    || terminal.accounting.basis !== "conservative-upper-bound-after-durable-handoff" || terminal.terminal_sha256 !== disclosed.terminal_sha256
    || terminal.terminal_sha256 !== sha256V1(canonicalJsonV1(projection(terminal, "terminal_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke terminal mismatched");

  const resultEntries = (await readdir(resultsRoot)).sort();
  if (canonicalJsonV1(resultEntries) !== canonicalJsonV1([RESULTS_META_FILE, RESULT_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke results contain missing, locked, or unknown state");
  const resultsMeta = await readCanonicalJson(path.join(resultsRoot, RESULTS_META_FILE), resultsRoot, "historical v5 smoke results metadata");
  exactKeys(resultsMeta, ["activation_sha256", "authority_profile", "ledger_root_sha256", "ledger_sha256", "matrix_member", "maximum_results", "results_meta_sha256", "results_root_sha256", "schema_version", "score_bearing", "smoke_run_id", "state"], "historical v5 smoke results metadata");
  if (resultsMeta.schema_version !== "rc7-gate-c-smoke-results-meta-v5" || resultsMeta.activation_sha256 !== disclosed.activation_sha256
    || resultsMeta.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || resultsMeta.ledger_root_sha256 !== disclosed.ledger_root_sha256
    || resultsMeta.results_root_sha256 !== disclosed.results_root_sha256 || resultsMeta.ledger_sha256 !== meta.ledger_sha256
    || resultsMeta.smoke_run_id !== FIFTH_SMOKE_RUN_ID || resultsMeta.matrix_member !== false || resultsMeta.score_bearing !== false
    || resultsMeta.maximum_results !== 1 || resultsMeta.results_meta_sha256 !== "d3bd0c1580eaa5838d777b5ea714e1cdc6fecf46d5bcbab29ffa5126cdaf0863"
    || resultsMeta.results_meta_sha256 !== sha256V1(canonicalJsonV1(projection(resultsMeta, "results_meta_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke results metadata mismatched");
  const result = await readCanonicalJson(path.join(resultsRoot, RESULT_FILE), resultsRoot, "historical v5 smoke result");
  exactKeys(result, ["schema_version", "authority_profile", "state", "activation_sha256", "smoke_run_id", "case_id", "selected_route", "matrix_member", "score_bearing", "terminal_sha256", "sealed_result_digests", "accounting", "failure_code", "terminal_kind", "provider_failure_code", "integration_failure_phase", "replay_permitted", "raw_output_retained", "score", "results_meta_sha256", "result_sha256"], "historical v5 smoke result");
  if (result.schema_version !== "rc7-gate-c-smoke-retained-result-v5" || result.state !== "smoke-indeterminate-no-replay"
    || result.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || result.activation_sha256 !== disclosed.activation_sha256
    || result.smoke_run_id !== FIFTH_SMOKE_RUN_ID || result.case_id !== "SAFE-01" || result.selected_route !== "rc-direct"
    || result.matrix_member !== false || result.score_bearing !== false || result.terminal_sha256 !== terminal.terminal_sha256
    || result.sealed_result_digests !== null || canonicalJsonV1(result.accounting) !== canonicalJsonV1(terminal.accounting)
    || result.failure_code !== disclosed.retained_failure_code || result.terminal_kind !== disclosed.terminal_kind
    || result.provider_failure_code !== disclosed.provider_failure_code || result.integration_failure_phase !== disclosed.integration_failure_phase
    || result.replay_permitted !== false || result.raw_output_retained !== false || result.score !== null
    || result.results_meta_sha256 !== resultsMeta.results_meta_sha256 || result.result_sha256 !== disclosed.result_sha256
    || result.result_sha256 !== sha256V1(canonicalJsonV1(projection(result, "result_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled v5 smoke result mismatched");
  return { root: ledgerRoot, results_root: resultsRoot, approval, meta, dispatch, handoff, terminal, results_meta: resultsMeta, result, historical_version: "v5" };
}

async function readSettledHistoricalSmokeV6(ledgerRootInput, resultsRootInput = null) {
  const ledgerRoot = await assertSmokeRoot(ledgerRootInput, { requireEmpty: false, role: "ledger" });
  const ledgerEntries = (await readdir(ledgerRoot)).sort();
  const withHandoff = [APPROVAL_FILE, HANDOFF_FILE, LEDGER_META_FILE, RESERVATION_FILE, TERMINAL_FILE].sort();
  const withoutHandoff = [APPROVAL_FILE, LEDGER_META_FILE, RESERVATION_FILE, TERMINAL_FILE].sort();
  if (canonicalJsonV1(ledgerEntries) !== canonicalJsonV1(withHandoff) && canonicalJsonV1(ledgerEntries) !== canonicalJsonV1(withoutHandoff)) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled current-generation smoke ledger contains missing, active, locked, or unknown state");
  const approval = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "settled smoke approval");
  exactKeys(approval, ["schema_version", "state", "authority_profile", "authority_scope", "final_freeze_sha256", "closure_sha256", "future_activation_sha256", "approval_text_sha256", "exact_approval_text", "ledger_root_sha256", "results_root_identity", "smoke_run_id", "matrix_authority", "governance_nonclaim", "operator_approval_record_sha256"], "settled smoke approval");
  const ledgerIdentity = await historicalPhysicalRootIdentity(ledgerRoot, "ledger", "v6");
  const resultsRoot = await assertSmokeRoot(resultsRootInput ?? approval.results_root_identity?.normalized_physical_root, { requireEmpty: false, role: "results" });
  const resultsIdentity = await historicalPhysicalRootIdentity(resultsRoot, "results", "v6");
  if (approval.schema_version !== RC7_GATE_C_SMOKE_APPROVAL_SCHEMA || approval.state !== "operator-approved-smoke-only"
    || approval.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || approval.authority_scope !== "one-safe01-direct-top-level-live-launch-smoke-only"
    || approval.smoke_run_id !== SMOKE_RUN_ID || approval.approval_text_sha256 !== sha256V1(approval.exact_approval_text)
    || approval.ledger_root_sha256 !== ledgerIdentity.ledger_root_sha256 || canonicalJsonV1(approval.results_root_identity) !== canonicalJsonV1(resultsIdentity)
    || !HASH.test(approval.final_freeze_sha256) || !HASH.test(approval.closure_sha256) || !HASH.test(approval.future_activation_sha256)
    || approval.matrix_authority !== false || approval.operator_approval_record_sha256 !== sha256V1(canonicalJsonV1(projection(approval, "operator_approval_record_sha256")))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled smoke approval or physical roots mismatched");

  const meta = await readCanonicalJson(path.join(ledgerRoot, LEDGER_META_FILE), ledgerRoot, "settled smoke ledger metadata");
  const activation = {
    activation_sha256: approval.future_activation_sha256,
    permission_policy_identity: RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
    smoke_registration_sha256: meta.smoke_registration_sha256,
    ledger_root_identity: ledgerIdentity,
    results_root_identity: resultsIdentity,
  };
  validateLedgerMeta(meta, activation, approval);
  const dispatch = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "settled smoke reservation"), activation);
  const handoffPath = await optionalPhysicalFile(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "settled smoke handoff");
  const handoff = handoffPath ? validateDurableHandoff(await readCanonicalJson(handoffPath, ledgerRoot, "settled smoke handoff"), dispatch) : null;
  const terminal = validateTerminal(await readCanonicalJson(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "settled smoke terminal"), dispatch);
  validateHistoricalAccounting(terminal.accounting, "v6");
  if ((handoff === null) !== (terminal.accounting.basis === "exact-zero-before-durable-handoff")) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled smoke handoff and accounting basis differ");

  const resultEntries = (await readdir(resultsRoot)).sort();
  if (canonicalJsonV1(resultEntries) !== canonicalJsonV1([RESULTS_META_FILE, RESULT_FILE].sort())) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled smoke results contain missing, locked, or unknown state");
  const resultsMeta = await readCanonicalJson(path.join(resultsRoot, RESULTS_META_FILE), resultsRoot, "settled smoke results metadata");
  if (canonicalJsonV1(resultsMeta) !== canonicalJsonV1(buildResultsMeta(activation, meta))) fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Settled smoke results metadata mismatched");
  const result = validateResultRecord(await readCanonicalJson(path.join(resultsRoot, RESULT_FILE), resultsRoot, "settled smoke result"), terminal, resultsMeta);
  return { root: ledgerRoot, results_root: resultsRoot, approval, meta, dispatch, handoff, terminal, results_meta: resultsMeta, result, historical_version: "v6" };
}

async function settledHistoricalSmokeVersion(root) {
  const ledgerRoot = await assertSmokeRoot(root, { requireEmpty: false, role: "ledger" });
  const approvalPath = await optionalPhysicalFile(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "historical smoke approval");
  const terminalPath = await optionalPhysicalFile(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "historical smoke terminal");
  if (!approvalPath || !terminalPath) return null;
  const approval = await readCanonicalJson(approvalPath, ledgerRoot, "historical smoke approval");
  if (approval?.schema_version === "rc7-gate-c-smoke-operator-approval-v2") return "v2";
  if (approval?.schema_version === "rc7-gate-c-smoke-operator-approval-v3") return "v3";
  if (approval?.schema_version === "rc7-gate-c-smoke-operator-approval-v4") return "v4";
  if (approval?.schema_version === "rc7-gate-c-smoke-operator-approval-v5") return "v5";
  if (approval?.schema_version === RC7_GATE_C_SMOKE_APPROVAL_SCHEMA) {
    const resultsRoot = await assertSmokeRoot(approval.results_root_identity?.normalized_physical_root, { requireEmpty: false, role: "results" });
    return await optionalPhysicalFile(path.join(resultsRoot, RESULT_FILE), resultsRoot, "historical smoke result") ? "v6" : null;
  }
  return null;
}

async function readSettledHistoricalSmoke(ledgerRoot, resultsRoot = null) {
  const version = await settledHistoricalSmokeVersion(ledgerRoot);
  if (version === "v2") return readSettledHistoricalSmokeV2(ledgerRoot, resultsRoot);
  if (version === "v3") return readSettledHistoricalSmokeV3(ledgerRoot, resultsRoot);
  if (version === "v4") return readSettledHistoricalSmokeV4(ledgerRoot, resultsRoot);
  if (version === "v5") return readSettledHistoricalSmokeV5(ledgerRoot, resultsRoot);
  if (version === "v6") return readSettledHistoricalSmokeV6(ledgerRoot, resultsRoot);
  fail("HISTORICAL_SMOKE_EVIDENCE_MISMATCH", "Smoke root is not one supported settled historical evidence generation");
}

export async function inspectRc7GateCSettledHistoricalSmoke(ledgerRoot, resultsRoot = null) {
  const context = await readSettledHistoricalSmoke(ledgerRoot, resultsRoot);
  return {
    ledger_root: context.root,
    results_root: context.results_root,
    state: context.result.state,
    historical_schema_version: context.historical_version,
    activation_sha256: context.meta.activation_sha256,
    terminal_sha256: context.terminal.terminal_sha256,
    result_sha256: context.result.result_sha256,
    failure_code: context.result.failure_code,
    matrix_member: false,
    score_bearing: false,
    replay_permitted: false,
    dispatch_authority: false,
  };
}

export async function initializeRc7GateCSmokeLedger(root) {
  const ledgerRoot = await assertSmokeRoot(root, { requireEmpty: false, role: "ledger" });
  let lock;
  try {
    lock = await acquireLock(ledgerRoot, LEDGER_LOCK_FILE);
    const entries = await assertLedgerLayout(ledgerRoot, "approval-only");
    if (entries.some((entry) => ![APPROVAL_FILE, LEDGER_META_FILE, LEDGER_LOCK_FILE].includes(entry))) fail("SMOKE_LEDGER_RESIDUE", "New smoke ledger inherited execution state");
    const approval = await readCanonicalJson(path.join(ledgerRoot, APPROVAL_FILE), ledgerRoot, "smoke approval record");
    const freeze = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, approval.results_root_identity?.normalized_physical_root);
    await validateApprovalAgainstFreeze(approval, freeze, ledgerRoot);
    const activation = activationFromFreeze(freeze);
    const meta = buildLedgerMeta(activation, approval);
    if (entries.includes(LEDGER_META_FILE)) validateLedgerMeta(await readCanonicalJson(path.join(ledgerRoot, LEDGER_META_FILE), ledgerRoot, "smoke ledger metadata"), activation, approval);
    else await writeExclusive(path.join(ledgerRoot, LEDGER_META_FILE), meta);
    return { root: ledgerRoot, activation_sha256: activation.activation_sha256, ledger_sha256: meta.ledger_sha256, maximum_reservations: 1 };
  } finally { if (lock) await releaseLock(ledgerRoot, LEDGER_LOCK_FILE, lock); }
}

export async function initializeRc7GateCSmokeResults(resultsRoot, ledgerRoot) {
  const safeResults = await assertSmokeRoot(resultsRoot, { requireEmpty: false, role: "results" });
  let lock;
  try {
    lock = await acquireLock(safeResults, RESULTS_LOCK_FILE);
    const entries = (await readdir(safeResults)).sort();
    if (entries.some((entry) => ![RESULTS_META_FILE, RESULTS_LOCK_FILE].includes(entry))) fail("SMOKE_RESULTS_RESIDUE", "New smoke results root contains residue");
    const context = await readLedgerContext(ledgerRoot);
    if (normalizedPath(context.activation.results_root_identity.normalized_physical_root) !== normalizedPath(safeResults)) fail("SMOKE_RESULTS_IDENTITY_MISMATCH", "Results root is not bound to the approved smoke ledger");
    const meta = buildResultsMeta(context.activation, context.meta);
    if (entries.includes(RESULTS_META_FILE)) {
      const retained = await readCanonicalJson(path.join(safeResults, RESULTS_META_FILE), safeResults, "smoke results metadata");
      if (canonicalJsonV1(retained) !== canonicalJsonV1(meta)) fail("SMOKE_RESULTS_IDENTITY_MISMATCH", "Smoke results metadata mismatched");
    } else await writeExclusive(path.join(safeResults, RESULTS_META_FILE), meta);
    return { root: safeResults, results_meta_sha256: meta.results_meta_sha256, maximum_results: 1, score_bearing: false };
  } finally { if (lock) await releaseLock(safeResults, RESULTS_LOCK_FILE, lock); }
}

function validateSmokeIntent(intent) {
  exactKeys(intent, [
    "schema_version", "authority_profile", "broker_identity", "permission_policy_identity", "smoke_registration_sha256", "run_id", "reference_matrix_run_id",
    "case_id", "arm", "selected_route", "matrix_member", "score_bearing", "route_visible_source_pack_id", "route_visible_source_pack_sha256", "request_kind",
    "child_sequence", "semantic_request_sha256", "semantic_request_byte_count", "provider", "adapter", "adapter_revision", "model", "configured_snapshot", "reasoning",
    "max_output_plus_reasoning_tokens", "provider_active_timeout_seconds", "automatic_retries", "reservation_consumed_before_provider_reachability", "activation_state", "intent_sha256",
  ], "smoke request intent");
  const manifest = smokeRunManifest(intent);
  if (intent.schema_version !== RC7_GATE_C_SMOKE_INTENT_SCHEMA || intent.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || intent.broker_identity !== RC7_GATE_C_SMOKE_BROKER_ID || intent.permission_policy_identity !== RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID
    || !HASH.test(intent.smoke_registration_sha256) || intent.run_id !== SMOKE_RUN_ID || deriveSmokeRunId(manifest) !== SMOKE_RUN_ID
    || intent.reference_matrix_run_id !== REFERENCE_MATRIX_RUN_ID || intent.case_id !== "SAFE-01" || intent.arm !== "rc-direct" || intent.selected_route !== "rc-direct"
    || intent.matrix_member !== false || intent.score_bearing !== false || intent.route_visible_source_pack_id !== REFERENCE_SOURCE_ID
    || intent.route_visible_source_pack_sha256 !== REFERENCE_SOURCE_SHA256 || intent.request_kind !== "top-level" || intent.child_sequence !== 0
    || intent.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256 || intent.semantic_request_byte_count !== REFERENCE_SEMANTIC_BYTE_COUNT
    || intent.provider !== "openai-codex" || intent.adapter !== "deepseek-openai-codex" || intent.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision
    || intent.model !== "gpt-5.6-sol" || intent.configured_snapshot !== "gpt-5.6-sol" || intent.reasoning !== "xhigh"
    || intent.max_output_plus_reasoning_tokens !== RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS || intent.provider_active_timeout_seconds !== 120
    || intent.automatic_retries !== 0 || intent.reservation_consumed_before_provider_reachability !== true
    || intent.activation_state !== "denied-awaiting-exact-smoke-activation"
    || intent.intent_sha256 !== sha256V1(canonicalJsonV1(projection(intent, "intent_sha256")))) fail("SMOKE_INTENT_MISMATCH", "Smoke intent widened or mismatched");
  if (/(?:evaluator|oracle|expected_relationship|leak_canary)/iu.test(canonicalJsonV1(intent))) fail("SMOKE_EVALUATOR_IDENTITY_LEAK", "Smoke intent contains evaluator-shaped bytes");
  return intent;
}

export async function buildRc7GateCFixedSmokeRequest() {
  const data = await buildSmokeRegistration();
  const reference = data.referenceRequest;
  const semantic = validateRc7GateCLegacySmokeSemanticRequest(reference.semantic_request);
  if (!Buffer.isBuffer(reference.semantic_request_bytes) || !reference.semantic_request_bytes.equals(semantic.bytes)
    || semantic.sha256 !== REFERENCE_SEMANTIC_SHA256 || semantic.byte_count !== REFERENCE_SEMANTIC_BYTE_COUNT) fail("SMOKE_SEMANTIC_MISMATCH", "Reference semantic bytes changed");
  const referenceIntent = reference.intent;
  const intent = withDigest({
    schema_version: RC7_GATE_C_SMOKE_INTENT_SCHEMA,
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    broker_identity: RC7_GATE_C_SMOKE_BROKER_ID,
    permission_policy_identity: RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
    smoke_registration_sha256: data.registration.smoke_registration_sha256,
    run_id: SMOKE_RUN_ID,
    reference_matrix_run_id: REFERENCE_MATRIX_RUN_ID,
    case_id: "SAFE-01",
    arm: "rc-direct",
    selected_route: "rc-direct",
    matrix_member: false,
    score_bearing: false,
    route_visible_source_pack_id: REFERENCE_SOURCE_ID,
    route_visible_source_pack_sha256: REFERENCE_SOURCE_SHA256,
    request_kind: "top-level",
    child_sequence: 0,
    semantic_request_sha256: semantic.sha256,
    semantic_request_byte_count: semantic.byte_count,
    provider: referenceIntent.provider,
    adapter: referenceIntent.adapter,
    adapter_revision: referenceIntent.adapter_revision,
    model: referenceIntent.model,
    configured_snapshot: referenceIntent.configured_snapshot,
    reasoning: referenceIntent.reasoning,
    max_output_plus_reasoning_tokens: referenceIntent.max_output_plus_reasoning_tokens,
    provider_active_timeout_seconds: referenceIntent.provider_active_timeout_seconds,
    automatic_retries: 0,
    reservation_consumed_before_provider_reachability: true,
    activation_state: "denied-awaiting-exact-smoke-activation",
  }, "intent_sha256");
  validateSmokeIntent(intent);
  return { intent, semantic_request: semantic.value, semantic_request_bytes: semantic.bytes };
}

function smokeExpectedClosure(activation) {
  return {
    activation_sha256: activation.activation_sha256,
    smoke_registration_sha256: activation.smoke_registration_sha256,
    smoke_module_sha256: activation.execution_closure.smoke_module.sha256,
    broker_module_sha256: activation.execution_closure.broker_module.sha256,
    worker_package_sha256: activation.execution_closure.worker_package_sha256,
    live_capsule_sha256: activation.execution_closure.live_capsule_module.sha256,
    worker_stage_manifest_sha256: activation.execution_closure.worker_stage_manifest_sha256,
    permission_policy_identity: activation.permission_policy_identity,
  };
}

function buildPermit(intent, activation) {
  validateSmokeIntent(intent);
  const expected = smokeExpectedClosure(activation);
  if (intent.smoke_registration_sha256 !== expected.smoke_registration_sha256) fail("SMOKE_ACTIVATION_MISMATCH", "Intent and smoke activation registration differ");
  return withDigest({
    schema_version: RC7_GATE_C_SMOKE_PERMIT_SCHEMA,
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    ...expected,
    intent_sha256: intent.intent_sha256,
    run_id: intent.run_id,
    request_kind: intent.request_kind,
    child_sequence: intent.child_sequence,
    semantic_request_sha256: intent.semantic_request_sha256,
    semantic_request_byte_count: intent.semantic_request_byte_count,
    dispatch_nonce: sha256V1(canonicalJsonV1({ authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE, activation_sha256: activation.activation_sha256, intent_sha256: intent.intent_sha256 })),
    state: "reserved-provider-reachable-once",
  }, "permit_sha256");
}

function validatePermit(permit, activation, intent) {
  const expected = buildPermit(intent, activation);
  if (canonicalJsonV1(permit) !== canonicalJsonV1(expected)) fail("SMOKE_PERMIT_MISMATCH", "Smoke permit was not fully derived from the exact approval, activation, and fixed intent");
  return permit;
}

export async function authorizeRc7GateCSmokeProviderDispatch(root, intent) {
  const context = await readLedgerContext(root);
  return buildPermit(intent, context.activation);
}

function reservationKey(activationSha256) {
  return sha256V1(canonicalJsonV1({ authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE, activation_sha256: activationSha256, smoke_run_id: SMOKE_RUN_ID, request_kind: "top-level", child_sequence: 0 }));
}

function validateDispatch(dispatch, activation) {
  exactKeys(dispatch, [
    "schema_version", "authority_profile", "activation_sha256", "permission_policy_identity", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id",
    "reference_matrix_run_id", "case_id", "arm", "selected_route", "matrix_member", "score_bearing", "request_kind", "child_sequence", "semantic_request_sha256",
    "reservation_key", "reservation_ordinal", "state", "dispatch_sha256",
  ], "smoke dispatch");
  if (dispatch.schema_version !== RC7_GATE_C_SMOKE_DISPATCH_SCHEMA || dispatch.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || dispatch.activation_sha256 !== activation.activation_sha256 || dispatch.permission_policy_identity !== RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID
    || !HASH.test(dispatch.intent_sha256) || !HASH.test(dispatch.permit_sha256) || !HASH.test(dispatch.dispatch_nonce)
    || dispatch.run_id !== SMOKE_RUN_ID || dispatch.reference_matrix_run_id !== REFERENCE_MATRIX_RUN_ID || dispatch.case_id !== "SAFE-01"
    || dispatch.arm !== "rc-direct" || dispatch.selected_route !== "rc-direct" || dispatch.matrix_member !== false || dispatch.score_bearing !== false
    || dispatch.request_kind !== "top-level" || dispatch.child_sequence !== 0 || dispatch.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256
    || dispatch.reservation_key !== reservationKey(activation.activation_sha256) || dispatch.reservation_ordinal !== 1
    || dispatch.state !== "consumed-provider-reachable-handoff-started"
    || dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(dispatch, "dispatch_sha256")))) fail("SMOKE_DISPATCH_MISMATCH", "Smoke dispatch widened or mismatched");
  return dispatch;
}

export async function consumeRc7GateCSmokeDispatchReservation(root, { intent, permit }) {
  const ledgerRoot = await assertSmokeRoot(root, { requireEmpty: false, role: "ledger" });
  let lock;
  try {
    lock = await acquireLock(ledgerRoot, LEDGER_LOCK_FILE);
    const context = await readLedgerContext(ledgerRoot);
    validatePermit(permit, context.activation, intent);
    for (const name of [RESERVATION_FILE, ACTIVE_DISPATCH_FILE, HANDOFF_FILE, TERMINAL_FILE]) {
      if (await optionalPhysicalFile(path.join(ledgerRoot, name), ledgerRoot, name)) fail("SMOKE_RESERVATION_EXHAUSTED", "The one smoke reservation was already consumed or settled");
    }
    const dispatch = withDigest({
      schema_version: RC7_GATE_C_SMOKE_DISPATCH_SCHEMA,
      authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
      activation_sha256: context.activation.activation_sha256,
      permission_policy_identity: RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
      intent_sha256: intent.intent_sha256,
      permit_sha256: permit.permit_sha256,
      dispatch_nonce: permit.dispatch_nonce,
      run_id: SMOKE_RUN_ID,
      reference_matrix_run_id: REFERENCE_MATRIX_RUN_ID,
      case_id: "SAFE-01",
      arm: "rc-direct",
      selected_route: "rc-direct",
      matrix_member: false,
      score_bearing: false,
      request_kind: "top-level",
      child_sequence: 0,
      semantic_request_sha256: intent.semantic_request_sha256,
      reservation_key: reservationKey(context.activation.activation_sha256),
      reservation_ordinal: 1,
      state: "consumed-provider-reachable-handoff-started",
    }, "dispatch_sha256");
    validateDispatch(dispatch, context.activation);
    await writeExclusive(path.join(ledgerRoot, RESERVATION_FILE), dispatch);
    await writeExclusive(path.join(ledgerRoot, ACTIVE_DISPATCH_FILE), dispatch);
    return dispatch;
  } finally { if (lock) await releaseLock(ledgerRoot, LEDGER_LOCK_FILE, lock); }
}

function validateSealedRequest(value, activation) {
  exactKeys(value, [
    "schema_version", "authority_profile", "activation_sha256", "smoke_registration_sha256", "smoke_module_sha256", "broker_module_sha256", "worker_package_sha256",
    "live_capsule_sha256", "worker_stage_manifest_sha256", "permission_policy_identity", "intent", "permit", "semantic_request", "semantic_request_sha256",
    "semantic_request_byte_count", "sealed_request_sha256",
  ], "smoke sealed request");
  const expected = smokeExpectedClosure(activation);
  for (const [key, item] of Object.entries(expected)) if (value[key] !== item) fail("SMOKE_SEALED_REQUEST_MISMATCH", `Smoke sealed request ${key} mismatched`);
  const intent = validateSmokeIntent(value.intent);
  const permit = validatePermit(value.permit, activation, intent);
  const semantic = validateRc7GateCLegacySmokeSemanticRequest(value.semantic_request);
  if (value.schema_version !== RC7_GATE_C_SMOKE_SEALED_REQUEST_SCHEMA || value.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || value.semantic_request_sha256 !== semantic.sha256 || value.semantic_request_byte_count !== semantic.byte_count
    || semantic.sha256 !== intent.semantic_request_sha256 || semantic.sha256 !== permit.semantic_request_sha256
    || value.sealed_request_sha256 !== sha256V1(canonicalJsonV1(projection(value, "sealed_request_sha256")))) fail("SMOKE_SEALED_REQUEST_MISMATCH", "Smoke sealed request does not close over the fixed semantic bytes and permit");
  return { value, intent, permit, semantic };
}

export async function sealRc7GateCSmokeDispatchRequest(root, input) {
  exactKeys(input, ["dispatch_sha256", "request"], "smoke seal input");
  exactKeys(input.request, ["intent", "semantic_request", "semantic_request_bytes"], "fixed smoke request");
  const ledgerRoot = await assertSmokeRoot(root, { requireEmpty: false, role: "ledger" });
  let lock;
  try {
    lock = await acquireLock(ledgerRoot, LEDGER_LOCK_FILE);
    const context = await readLedgerContext(ledgerRoot);
    const dispatch = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, ACTIVE_DISPATCH_FILE), ledgerRoot, "active smoke dispatch"), context.activation);
    const retained = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "smoke reservation"), context.activation);
    if (canonicalJsonV1(dispatch) !== canonicalJsonV1(retained) || dispatch.dispatch_sha256 !== input.dispatch_sha256) fail("SMOKE_DISPATCH_MISMATCH", "Active smoke dispatch and reservation differ");
    const intent = validateSmokeIntent(input.request.intent);
  const semantic = validateRc7GateCLegacySmokeSemanticRequest(input.request.semantic_request);
    if (!Buffer.isBuffer(input.request.semantic_request_bytes) || !input.request.semantic_request_bytes.equals(semantic.bytes)
      || dispatch.intent_sha256 !== intent.intent_sha256 || semantic.sha256 !== intent.semantic_request_sha256) fail("SMOKE_SEALED_REQUEST_MISMATCH", "Only the exact fixed provider-visible request can be sealed");
    const permit = buildPermit(intent, context.activation);
    if (permit.permit_sha256 !== dispatch.permit_sha256 || permit.dispatch_nonce !== dispatch.dispatch_nonce) fail("SMOKE_PERMIT_MISMATCH", "Dispatch does not derive from the current smoke permit");
    const value = withDigest({
      schema_version: RC7_GATE_C_SMOKE_SEALED_REQUEST_SCHEMA,
      authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
      ...smokeExpectedClosure(context.activation),
      intent,
      permit,
      semantic_request: semantic.value,
      semantic_request_sha256: semantic.sha256,
      semantic_request_byte_count: semantic.byte_count,
    }, "sealed_request_sha256");
    validateSealedRequest(value, context.activation);
    return value;
  } finally { if (lock) await releaseLock(ledgerRoot, LEDGER_LOCK_FILE, lock); }
}

export function buildRc7GateCSmokeDirectGateBReference({ activation_sha256: activationSha256, intent, dispatch, container_id: containerId = null }) {
  validateSmokeIntent(intent);
  if (!HASH.test(activationSha256) || containerId !== null || dispatch.schema_version !== RC7_GATE_C_SMOKE_DISPATCH_SCHEMA
    || dispatch.activation_sha256 !== activationSha256 || dispatch.intent_sha256 !== intent.intent_sha256
    || dispatch.selected_route !== "rc-direct" || dispatch.request_kind !== "top-level") fail("SMOKE_GATE_B_REFERENCE_MISMATCH", "Smoke Gate B reference must be exact direct-route non-applicability");
  return withDigest({
    schema_version: "rc7-gate-c-smoke-gate-b-live-attestation-v6",
    state: "not-applicable-direct-route",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    activation_sha256: activationSha256,
    intent_sha256: intent.intent_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    container_id: null,
  }, "attestation_sha256");
}

function validateGateBReference(value, dispatch) {
  exactKeys(value, ["schema_version", "state", "authority_profile", "activation_sha256", "intent_sha256", "dispatch_sha256", "container_id", "attestation_sha256"], "smoke Gate B reference");
  if (value.schema_version !== "rc7-gate-c-smoke-gate-b-live-attestation-v6" || value.state !== "not-applicable-direct-route"
    || value.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || value.activation_sha256 !== dispatch.activation_sha256
    || value.intent_sha256 !== dispatch.intent_sha256 || value.dispatch_sha256 !== dispatch.dispatch_sha256 || value.container_id !== null
    || value.attestation_sha256 !== sha256V1(canonicalJsonV1(projection(value, "attestation_sha256")))) fail("SMOKE_GATE_B_REFERENCE_MISMATCH", "Smoke Gate B reference widened or mismatched");
  return value;
}

function directGateBEvidence(dispatch) {
  return {
    schema_version: "rc7-gate-c-smoke-broker-derived-gate-b-evidence-v6",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    state: "not-applicable-direct-route",
    selected_route: "rc-direct",
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
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
  };
}

export async function preflightRc7GateCSmokeLiveDispatch(input) {
  exactKeys(input, ["dispatch_sha256", "gate_b_attestation", "handoff_nonce", "ledger_root", "sealed_request"], "smoke live preflight input");
  if (!HASH.test(input.dispatch_sha256) || !HASH.test(input.handoff_nonce)) fail("SMOKE_HANDOFF_IDENTITY_MISMATCH", "Smoke preflight digests are malformed");
  const ledgerRoot = await assertSmokeRoot(input.ledger_root, { requireEmpty: false, role: "ledger" });
  let lock;
  try {
    lock = await acquireLock(ledgerRoot, LEDGER_LOCK_FILE);
    const context = await readLedgerContext(ledgerRoot);
    const dispatch = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, ACTIVE_DISPATCH_FILE), ledgerRoot, "active smoke dispatch"), context.activation);
    const retained = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "smoke reservation"), context.activation);
    if (canonicalJsonV1(dispatch) !== canonicalJsonV1(retained) || dispatch.dispatch_sha256 !== input.dispatch_sha256
      || await optionalPhysicalFile(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "smoke terminal")) fail("SMOKE_HANDOFF_IDENTITY_MISMATCH", "Smoke preflight is not one exact unterminated dispatch");
    const sealed = validateSealedRequest(input.sealed_request, context.activation);
    if (sealed.intent.intent_sha256 !== dispatch.intent_sha256 || sealed.permit.permit_sha256 !== dispatch.permit_sha256) fail("SMOKE_SEALED_REQUEST_MISMATCH", "Smoke sealed request and dispatch differ");
    const reference = validateGateBReference(input.gate_b_attestation, dispatch);
    const handoff = withDigest({
      schema_version: "rc7-gate-c-smoke-durable-provider-handoff-v6",
      state: "preflight-consumed-provider-reachability-committed",
      authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
      activation_sha256: dispatch.activation_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      reservation_key: dispatch.reservation_key,
      handoff_nonce: input.handoff_nonce,
      sealed_request_sha256: sealed.value.sealed_request_sha256,
      gate_b_attestation_sha256: reference.attestation_sha256,
    }, "durable_handoff_sha256");
    validateDurableHandoff(handoff, dispatch);
    try { await writeExclusive(path.join(ledgerRoot, HANDOFF_FILE), handoff); } catch (error) {
      if (error?.code === "EEXIST") fail("SMOKE_DURABLE_HANDOFF_REPLAY", "Smoke durable handoff was already consumed");
      throw error;
    }
    return {
      sealed: sealed.value,
      dispatch,
      durable_handoff: handoff,
      expected_closure: smokeExpectedClosure(context.activation),
      wire_contract: {
        schema_version: "rc7-gate-c-exact-wire-contract-v1",
        provider_endpoint: PROVIDER_ENDPOINT,
        refresh_endpoint: REFRESH_ENDPOINT,
        provider: sealed.intent.provider,
        adapter: sealed.intent.adapter,
        adapter_revision: sealed.intent.adapter_revision,
        model: sealed.intent.model,
        configured_snapshot: sealed.intent.configured_snapshot,
        reasoning: sealed.intent.reasoning,
        max_output_plus_reasoning_tokens: sealed.intent.max_output_plus_reasoning_tokens,
        provider_active_timeout_seconds: sealed.intent.provider_active_timeout_seconds,
        automatic_retries: 0,
        generation_https_posts: 1,
        oauth_refresh_https_posts: 1,
        all_other_network: "denied",
      },
      gate_b: directGateBEvidence(dispatch),
    };
  } finally { if (lock) await releaseLock(ledgerRoot, LEDGER_LOCK_FILE, lock); }
}

function exactAccounting(value, basis) {
  exactKeys(value, ["provider_posts", "oauth_refresh_posts", "input_tokens", "output_plus_reasoning_tokens", "provider_active_milliseconds", "automatic_retry_count"], "smoke accounting input");
  for (const key of ["provider_posts", "oauth_refresh_posts", "input_tokens", "output_plus_reasoning_tokens", "provider_active_milliseconds", "automatic_retry_count"]) if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail("SMOKE_ACCOUNTING_MISMATCH", "Smoke accounting contains an invalid count");
  if (value.provider_posts > 1 || value.oauth_refresh_posts > 1 || value.input_tokens > 32_768 || value.output_plus_reasoning_tokens > 8_192
    || value.provider_active_milliseconds > 120_000 || value.automatic_retry_count !== 0) fail("SMOKE_ACCOUNTING_MISMATCH", "Smoke accounting exceeds the exact one-request ceiling");
  return withDigest({ schema_version: "rc7-gate-c-smoke-accounting-v6", basis, ...value }, "accounting_sha256");
}

function validateAccountingRecord(value) {
  exactKeys(value, ["schema_version", "basis", "provider_posts", "oauth_refresh_posts", "input_tokens", "output_plus_reasoning_tokens", "provider_active_milliseconds", "automatic_retry_count", "accounting_sha256"], "smoke accounting record");
  if (value.schema_version !== "rc7-gate-c-smoke-accounting-v6"
    || !["exact-sealed-provider-observation", "conservative-upper-bound-after-durable-handoff", "exact-zero-before-durable-handoff"].includes(value.basis)
    || value.accounting_sha256 !== sha256V1(canonicalJsonV1(projection(value, "accounting_sha256")))) fail("SMOKE_ACCOUNTING_MISMATCH", "Smoke accounting schema, basis, or digest mismatched");
  exactAccounting({
    provider_posts: value.provider_posts,
    oauth_refresh_posts: value.oauth_refresh_posts,
    input_tokens: value.input_tokens,
    output_plus_reasoning_tokens: value.output_plus_reasoning_tokens,
    provider_active_milliseconds: value.provider_active_milliseconds,
    automatic_retry_count: value.automatic_retry_count,
  }, value.basis);
  return value;
}

function conservativeAccounting(providerReachabilityCommitted) {
  return exactAccounting(providerReachabilityCommitted
    ? { provider_posts: 1, oauth_refresh_posts: 1, input_tokens: 32_768, output_plus_reasoning_tokens: 8_192, provider_active_milliseconds: 120_000, automatic_retry_count: 0 }
    : { provider_posts: 0, oauth_refresh_posts: 0, input_tokens: 0, output_plus_reasoning_tokens: 0, provider_active_milliseconds: 0, automatic_retry_count: 0 },
  providerReachabilityCommitted ? "conservative-upper-bound-after-durable-handoff" : "exact-zero-before-durable-handoff");
}

function validateDurableHandoff(value, dispatch) {
  exactKeys(value, ["schema_version", "state", "authority_profile", "activation_sha256", "dispatch_sha256", "reservation_key", "handoff_nonce", "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256"], "smoke durable handoff");
  if (value.schema_version !== "rc7-gate-c-smoke-durable-provider-handoff-v6" || value.state !== "preflight-consumed-provider-reachability-committed"
    || value.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE || value.activation_sha256 !== dispatch.activation_sha256
    || value.dispatch_sha256 !== dispatch.dispatch_sha256 || value.reservation_key !== dispatch.reservation_key
    || !HASH.test(value.handoff_nonce) || !HASH.test(value.sealed_request_sha256) || !HASH.test(value.gate_b_attestation_sha256)
    || value.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(value, "durable_handoff_sha256")))) fail("SMOKE_HANDOFF_IDENTITY_MISMATCH", "Smoke durable handoff widened or mismatched");
  return value;
}

function sealedResultDigests(value, dispatch) {
  exactKeys(value, ["schema_version", "state", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce", "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256", "sealed_result_sha256"], "sealed smoke result");
  for (const key of ["activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce", "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256", "sealed_result_sha256"]) if (!HASH.test(value[key])) fail("SMOKE_SEALED_RESULT_MISMATCH", `Sealed result ${key} is malformed`);
  if (value.schema_version !== "rc7-gate-c-sealed-worker-result-v1" || value.state !== "trusted-sealed"
    || value.activation_sha256 !== dispatch.activation_sha256 || value.intent_sha256 !== dispatch.intent_sha256
    || value.permit_sha256 !== dispatch.permit_sha256 || value.dispatch_nonce !== dispatch.dispatch_nonce
    || value.sealed_result_sha256 !== sha256V1(canonicalJsonV1(projection(value, "sealed_result_sha256")))) fail("SMOKE_SEALED_RESULT_MISMATCH", "Sealed result does not close over the smoke dispatch");
  return structuredClone(value);
}

function validateSmokeHostTransport(value) {
  exactKeys(value, ["ack_fd", "commit_fd", "handoff_fd", "kind", "path_authority"], "smoke host transport");
  if (value.kind !== "anonymous-inherited-pipes" || value.handoff_fd !== 3 || value.ack_fd !== 4 || value.commit_fd !== 5
    || value.path_authority !== "none-no-filesystem-handoff") fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke host transport widened or mismatched");
  return value;
}

function validateSmokeUsage(value) {
  exactKeys(value, ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens", "reasoning_tokens", "schema_version"], "smoke sanitized usage");
  for (const key of ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens"]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail("SMOKE_HOST_RESULT_MISMATCH", `Smoke usage ${key} is malformed`);
  }
  if (value.reasoning_tokens !== null && (!Number.isSafeInteger(value.reasoning_tokens) || value.reasoning_tokens < 0)) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke reasoning usage is malformed");
  if (value.schema_version !== "rc7-gate-c-sanitized-usage-v1"
    || value.input_tokens + value.cache_read_tokens + value.cache_write_tokens > 32_768
    || value.output_tokens + (value.reasoning_tokens ?? 0) > 8_192) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke usage exceeds the frozen one-request ceiling");
  return value;
}

function validateSmokeSuccessHostResult(value, dispatch) {
  exactKeys(value, ["artifact", "observations", "schema_version", "state", "usage"], "smoke live capsule success");
  exactKeys(value.observations, ["adapter_revision", "automatic_retry_count", "model", "oauth_refresh_posts", "provider", "provider_active_milliseconds", "provider_posts", "reasoning"], "smoke live capsule observations");
  const observations = value.observations;
  if (value.schema_version !== "rc7-gate-c-live-capsule-result-v1" || value.state !== "success-pending-outer-seal"
    || observations.provider !== PROVIDER_ID || observations.adapter_revision !== ADAPTER_REVISION || observations.model !== CONFIGURED_MODEL
    || observations.reasoning !== REASONING_SETTING || observations.provider_posts !== 1 || ![0, 1].includes(observations.oauth_refresh_posts)
    || observations.automatic_retry_count !== 0 || !Number.isSafeInteger(observations.provider_active_milliseconds)
    || observations.provider_active_milliseconds < 0 || observations.provider_active_milliseconds > 120_000) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke provider observations mismatched the frozen wire contract");
  exactKeys(value.artifact, ["case_id", "output", "output_sha256", "output_utf8_byte_count", "schema_version"], "smoke route output artifact");
  const rawOutput = Buffer.from(canonicalJsonV1(value.artifact.output), "utf8");
  const parsed = parseRc7GateCStructuredOutput(rawOutput, "SAFE-01");
  if (value.artifact.schema_version !== "rc7-gate-c-route-output-artifact-v1" || value.artifact.case_id !== "SAFE-01"
    || value.artifact.output_sha256 !== parsed.normalized_sha256 || value.artifact.output_utf8_byte_count !== rawOutput.byteLength) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke route output artifact mismatched its exact normalized bytes");
  if (dispatch.case_id !== "SAFE-01" || dispatch.selected_route !== "rc-direct") fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke result is not bound to the fixed direct SAFE-01 dispatch");
  return { artifact: value.artifact, observations, usage: validateSmokeUsage(value.usage) };
}

function validateSmokeFailureHostResult(value) {
  exactKeys(value, ["code", "integration_failure_phase", "observations", "provider_failure_code", "schema_version", "state", "terminal_kind"], "smoke live capsule failure");
  exactKeys(value.observations, ["automatic_retry_count", "provider_active_milliseconds", "provider_posts", "refresh_posts"], "smoke live capsule failure observations");
  const observations = value.observations;
  if (value.schema_version !== "rc7-gate-c-live-capsule-failure-v4" || value.state !== "failed-no-replay" || !/^[A-Z][A-Z0-9_-]{1,63}$/u.test(value.code ?? "")
    || ![0, 1].includes(observations.provider_posts) || ![0, 1].includes(observations.refresh_posts) || observations.automatic_retry_count !== 0
    || !Number.isSafeInteger(observations.provider_active_milliseconds) || observations.provider_active_milliseconds < 0
    || observations.provider_active_milliseconds > 120_000) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke live capsule failure evidence mismatched the frozen wire contract");
  const closedTerminal = ["aborted", "error", "max-tokens", "tool-calls"].includes(value.terminal_kind);
  if (value.code === "PROVIDER_TERMINAL_REJECTED") {
    if (!closedTerminal || (["aborted", "error"].includes(value.terminal_kind) !== PROVIDER_TERMINAL_FAILURE_CODES.has(value.provider_failure_code))) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke provider terminal detail is not closed");
    if (["max-tokens", "tool-calls"].includes(value.terminal_kind) && value.provider_failure_code !== null) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke provider terminal detail is inconsistent");
    if (value.terminal_kind === "aborted" && value.provider_failure_code !== "ABORTED") fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke aborted terminal detail is inconsistent");
    if (value.terminal_kind === "error" && value.provider_failure_code === "ABORTED") fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke error terminal detail is inconsistent");
  } else if (value.terminal_kind !== null || value.provider_failure_code !== null) fail("SMOKE_HOST_RESULT_MISMATCH", "Non-terminal smoke failure carried provider terminal detail");
  const expectedIntegrationPhase = value.provider_failure_code === "INTEGRATION"
    ? classifyRc7GateCIntegrationFailurePhase(observations) : null;
  if (value.integration_failure_phase !== expectedIntegrationPhase) fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke integration failure phase is missing, widened, or inconsistent with local fetch admission");
  return value;
}

function validateSmokeOuterHostResult(value, dispatch) {
  exactKeys(value, ["dispatch_sha256", "handoff_sha256", "result", "same_host_governance_nonclaim", "schema_version", "state", "transport"], "smoke host launch result");
  if (value.schema_version !== "rc7-gate-c-host-launch-result-v1" || value.state !== "one-shot-child-complete"
    || value.dispatch_sha256 !== dispatch.dispatch_sha256 || !HASH.test(value.handoff_sha256 ?? "")
    || value.same_host_governance_nonclaim !== "same-host stage, pipe, process, and acknowledgment checks are governance evidence, not cryptographic proof against a hostile host administrator") fail("SMOKE_HOST_RESULT_MISMATCH", "Smoke host launch result identity mismatched");
  validateSmokeHostTransport(value.transport);
  return value;
}

function buildTerminal(dispatch, { state, failureCode, terminalKind, providerFailureCode, integrationFailurePhase, sealedResult, accounting, reason }) {
  return withDigest({
    schema_version: "rc7-gate-c-smoke-terminal-v6",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    state,
    activation_sha256: dispatch.activation_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    reservation_key: dispatch.reservation_key,
    run_id: SMOKE_RUN_ID,
    case_id: "SAFE-01",
    selected_route: "rc-direct",
    request_kind: "top-level",
    terminal_class: state === "trusted-sealed" ? "smoke-live-launch-succeeded" : "smoke-live-launch-indeterminate",
    failure_code: failureCode,
    terminal_kind: terminalKind,
    provider_failure_code: providerFailureCode,
    integration_failure_phase: integrationFailurePhase,
    sealed_result_digests: sealedResult,
    accounting,
    reason,
    replay_permitted: false,
  }, "terminal_sha256");
}

function validateTerminal(value, dispatch) {
  exactKeys(value, ["schema_version", "authority_profile", "state", "activation_sha256", "dispatch_sha256", "reservation_key", "run_id", "case_id", "selected_route", "request_kind", "terminal_class", "failure_code", "terminal_kind", "provider_failure_code", "integration_failure_phase", "sealed_result_digests", "accounting", "reason", "replay_permitted", "terminal_sha256"], "smoke terminal");
  if (value.schema_version !== "rc7-gate-c-smoke-terminal-v6" || value.authority_profile !== RC7_GATE_C_SMOKE_AUTHORITY_PROFILE
    || !["trusted-sealed", "indeterminate-no-replay"].includes(value.state) || value.activation_sha256 !== dispatch.activation_sha256
    || value.dispatch_sha256 !== dispatch.dispatch_sha256 || value.reservation_key !== dispatch.reservation_key || value.run_id !== SMOKE_RUN_ID
    || value.case_id !== "SAFE-01" || value.selected_route !== "rc-direct" || value.request_kind !== "top-level" || value.replay_permitted !== false
    || validateAccountingRecord(value.accounting) !== value.accounting
    || value.terminal_sha256 !== sha256V1(canonicalJsonV1(projection(value, "terminal_sha256")))) fail("SMOKE_TERMINAL_MISMATCH", "Smoke terminal widened or mismatched");
  if (value.state === "trusted-sealed") {
    if (value.failure_code !== null || value.terminal_kind !== null || value.provider_failure_code !== null || value.integration_failure_phase !== null || value.reason !== null || value.terminal_class !== "smoke-live-launch-succeeded") fail("SMOKE_TERMINAL_MISMATCH", "Successful smoke terminal carries failure state");
    sealedResultDigests(value.sealed_result_digests, dispatch);
  } else if (!ERROR_CODE.test(value.failure_code ?? "") || value.sealed_result_digests !== null
    || value.terminal_class !== "smoke-live-launch-indeterminate" || value.reason !== "provider-reachable-or-consumed-without-trusted-sealed-result") fail("SMOKE_TERMINAL_MISMATCH", "Failed smoke terminal is not exact indeterminate no-replay");
  if (value.state === "indeterminate-no-replay") {
    if (value.failure_code === "PROVIDER_TERMINAL_REJECTED") {
      if (!["aborted", "error", "max-tokens", "tool-calls"].includes(value.terminal_kind)
        || (["aborted", "error"].includes(value.terminal_kind) !== PROVIDER_TERMINAL_FAILURE_CODES.has(value.provider_failure_code))
        || (value.terminal_kind === "aborted" && value.provider_failure_code !== "ABORTED")
        || (value.terminal_kind === "error" && value.provider_failure_code === "ABORTED")
        || (["max-tokens", "tool-calls"].includes(value.terminal_kind) && value.provider_failure_code !== null)) fail("SMOKE_TERMINAL_MISMATCH", "Failed smoke terminal detail is inconsistent");
    } else if (value.terminal_kind !== null || value.provider_failure_code !== null) fail("SMOKE_TERMINAL_MISMATCH", "Non-terminal smoke failure carried provider terminal detail");
    if (value.provider_failure_code === "INTEGRATION") {
      if (!RC7_GATE_C_INTEGRATION_FAILURE_PHASES.includes(value.integration_failure_phase)) fail("SMOKE_TERMINAL_MISMATCH", "Integration terminal lacks one closed local fetch-admission phase");
    } else if (value.integration_failure_phase !== null) fail("SMOKE_TERMINAL_MISMATCH", "Non-integration terminal carried an integration phase");
  }
  return value;
}

function buildResultRecord(terminal, resultsMeta) {
  return withDigest({
    schema_version: "rc7-gate-c-smoke-retained-result-v6",
    authority_profile: RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
    state: terminal.state === "trusted-sealed" ? "smoke-succeeded-nonscore" : "smoke-indeterminate-no-replay",
    activation_sha256: terminal.activation_sha256,
    smoke_run_id: SMOKE_RUN_ID,
    case_id: "SAFE-01",
    selected_route: "rc-direct",
    matrix_member: false,
    score_bearing: false,
    terminal_sha256: terminal.terminal_sha256,
    sealed_result_digests: terminal.sealed_result_digests,
    accounting: structuredClone(terminal.accounting),
    failure_code: terminal.failure_code,
    terminal_kind: terminal.terminal_kind,
    provider_failure_code: terminal.provider_failure_code,
    integration_failure_phase: terminal.integration_failure_phase,
    replay_permitted: false,
    raw_output_retained: false,
    score: null,
    results_meta_sha256: resultsMeta.results_meta_sha256,
  }, "result_sha256");
}

function validateResultRecord(value, terminal, resultsMeta) {
  const expected = buildResultRecord(terminal, resultsMeta);
  if (canonicalJsonV1(value) !== canonicalJsonV1(expected)) fail("SMOKE_RESULT_MISMATCH", "Smoke result is not the exact digest-only non-score terminal projection");
  return value;
}

async function readResultsContext(resultsRoot, ledgerContext) {
  const safeResults = await assertSmokeRoot(resultsRoot, { requireEmpty: false, role: "results" });
  if (normalizedPath(safeResults) !== normalizedPath(ledgerContext.activation.results_root_identity.normalized_physical_root)) fail("SMOKE_RESULTS_IDENTITY_MISMATCH", "Results root and ledger activation differ");
  const entries = (await readdir(safeResults)).sort();
  if (entries.some((entry) => ![RESULTS_META_FILE, RESULT_FILE, RESULTS_LOCK_FILE].includes(entry)) || !entries.includes(RESULTS_META_FILE)) fail("SMOKE_RESULTS_RESIDUE", "Smoke results root is missing metadata or contains residue");
  const meta = await readCanonicalJson(path.join(safeResults, RESULTS_META_FILE), safeResults, "smoke results metadata");
  const expected = buildResultsMeta(ledgerContext.activation, ledgerContext.meta);
  if (canonicalJsonV1(meta) !== canonicalJsonV1(expected)) fail("SMOKE_RESULTS_IDENTITY_MISMATCH", "Smoke results metadata is stale or mismatched");
  return { root: safeResults, meta, entries };
}

async function retainTerminalAndResult(ledgerRoot, resultsRoot, dispatch, terminal) {
  const terminalPath = path.join(ledgerRoot, TERMINAL_FILE);
  const retainedTerminal = await optionalPhysicalFile(terminalPath, ledgerRoot, "smoke terminal");
  if (retainedTerminal) {
    const existing = await readCanonicalJson(retainedTerminal, ledgerRoot, "smoke terminal");
    if (canonicalJsonV1(existing) !== canonicalJsonV1(terminal)) fail("SMOKE_TERMINAL_MISMATCH", "A different smoke terminal already exists");
  } else await writeExclusive(terminalPath, terminal);
  await rm(path.join(ledgerRoot, ACTIVE_DISPATCH_FILE), { force: true });
  const ledgerContext = await readLedgerContext(ledgerRoot);
  const resultsContext = await readResultsContext(resultsRoot, ledgerContext);
  const result = buildResultRecord(terminal, resultsContext.meta);
  const resultPath = path.join(resultsContext.root, RESULT_FILE);
  const retainedResult = await optionalPhysicalFile(resultPath, resultsContext.root, "smoke result");
  if (retainedResult) validateResultRecord(await readCanonicalJson(retainedResult, resultsContext.root, "smoke result"), terminal, resultsContext.meta);
  else await writeExclusive(resultPath, result);
  return { terminal, result };
}

export async function settleRc7GateCSmokeSuccess(input) {
  exactKeys(input, ["accounting", "dispatch", "ledger_root", "results_root", "sealed_result"], "smoke success settlement");
  const ledgerRoot = await assertSmokeRoot(input.ledger_root, { requireEmpty: false, role: "ledger" });
  let lock;
  try {
    lock = await acquireLock(ledgerRoot, LEDGER_LOCK_FILE);
    const context = await readLedgerContext(ledgerRoot);
    const dispatch = validateDispatch(input.dispatch, context.activation);
    const retained = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "smoke reservation"), context.activation);
    const handoffPath = await optionalPhysicalFile(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "smoke durable handoff");
    if (canonicalJsonV1(dispatch) !== canonicalJsonV1(retained) || !handoffPath) fail("SMOKE_SETTLEMENT_MISMATCH", "Successful smoke settlement requires the exact reservation and durable handoff");
    validateDurableHandoff(await readCanonicalJson(handoffPath, ledgerRoot, "smoke durable handoff"), dispatch);
    const sealed = sealedResultDigests(input.sealed_result, dispatch);
    const accounting = exactAccounting(input.accounting, "exact-sealed-provider-observation");
    if (accounting.provider_posts !== 1) fail("SMOKE_ACCOUNTING_MISMATCH", "Successful smoke requires exactly one generation POST");
    const terminal = buildTerminal(dispatch, { state: "trusted-sealed", failureCode: null, terminalKind: null, providerFailureCode: null, integrationFailurePhase: null, sealedResult: sealed, accounting, reason: null });
    validateTerminal(terminal, dispatch);
    return await retainTerminalAndResult(ledgerRoot, input.results_root, dispatch, terminal);
  } finally { if (lock) await releaseLock(ledgerRoot, LEDGER_LOCK_FILE, lock); }
}

export async function settleRc7GateCSmokeFailure(input) {
  const keys = Object.keys(input ?? {}).sort();
  const baseKeys = ["dispatch", "failure_code", "ledger_root", "results_root"].sort();
  const detailedKeys = [...baseKeys, "integration_failure_phase", "provider_failure_code", "terminal_kind"].sort();
  if (canonicalJsonV1(keys) !== canonicalJsonV1(baseKeys) && canonicalJsonV1(keys) !== canonicalJsonV1(detailedKeys)) fail("SMOKE_SCHEMA_MISMATCH", "smoke failure settlement keys mismatched");
  if (!ERROR_CODE.test(input.failure_code ?? "")) fail("SMOKE_FAILURE_CODE_MISMATCH", "Smoke failure code is malformed");
  const terminalKind = input.terminal_kind ?? null;
  const providerFailureCode = input.provider_failure_code ?? null;
  const integrationFailurePhase = input.integration_failure_phase ?? null;
  if (input.failure_code === "PROVIDER_TERMINAL_REJECTED") {
    if (!["aborted", "error", "max-tokens", "tool-calls"].includes(terminalKind)
      || (["aborted", "error"].includes(terminalKind) !== PROVIDER_TERMINAL_FAILURE_CODES.has(providerFailureCode))
      || (terminalKind === "aborted" && providerFailureCode !== "ABORTED")
      || (terminalKind === "error" && providerFailureCode === "ABORTED")
      || (["max-tokens", "tool-calls"].includes(terminalKind) && providerFailureCode !== null)) fail("SMOKE_FAILURE_CODE_MISMATCH", "Smoke provider terminal detail is inconsistent");
  } else if (terminalKind !== null || providerFailureCode !== null) fail("SMOKE_FAILURE_CODE_MISMATCH", "Only a provider terminal rejection may carry terminal detail");
  if (providerFailureCode === "INTEGRATION") {
    if (!RC7_GATE_C_INTEGRATION_FAILURE_PHASES.includes(integrationFailurePhase)) fail("SMOKE_FAILURE_CODE_MISMATCH", "Integration failure lacks one closed local fetch-admission phase");
  } else if (integrationFailurePhase !== null) fail("SMOKE_FAILURE_CODE_MISMATCH", "Non-integration failure carried an integration phase");
  const ledgerRoot = await assertSmokeRoot(input.ledger_root, { requireEmpty: false, role: "ledger" });
  let lock;
  try {
    lock = await acquireLock(ledgerRoot, LEDGER_LOCK_FILE);
    const context = await readLedgerContext(ledgerRoot);
    const dispatch = validateDispatch(input.dispatch, context.activation);
    const retained = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "smoke reservation"), context.activation);
    if (canonicalJsonV1(dispatch) !== canonicalJsonV1(retained)) fail("SMOKE_SETTLEMENT_MISMATCH", "Failed smoke settlement and reservation differ");
    const handoffPath = await optionalPhysicalFile(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "smoke durable handoff");
    if (handoffPath) validateDurableHandoff(await readCanonicalJson(handoffPath, ledgerRoot, "smoke durable handoff"), dispatch);
    const committed = Boolean(handoffPath);
    const terminal = buildTerminal(dispatch, { state: "indeterminate-no-replay", failureCode: input.failure_code, terminalKind, providerFailureCode, integrationFailurePhase, sealedResult: null, accounting: conservativeAccounting(committed), reason: "provider-reachable-or-consumed-without-trusted-sealed-result" });
    validateTerminal(terminal, dispatch);
    return await retainTerminalAndResult(ledgerRoot, input.results_root, dispatch, terminal);
  } finally { if (lock) await releaseLock(ledgerRoot, LEDGER_LOCK_FILE, lock); }
}

export async function settleRc7GateCSmokeHostLaunchResult(input) {
  exactKeys(input, ["dispatch", "gate_b_attestation", "host_result", "ledger_root", "results_root"], "smoke host result settlement");
  const ledgerRoot = await assertSmokeRoot(input.ledger_root, { requireEmpty: false, role: "ledger" });
  const context = await readLedgerContext(ledgerRoot);
  const dispatch = validateDispatch(input.dispatch, context.activation);
  const retained = validateDispatch(await readCanonicalJson(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "smoke reservation"), context.activation);
  if (canonicalJsonV1(dispatch) !== canonicalJsonV1(retained)) fail("SMOKE_SETTLEMENT_MISMATCH", "Smoke host result dispatch and retained reservation differ");
  const handoffPath = await optionalPhysicalFile(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "smoke durable handoff");
  if (!handoffPath) fail("SMOKE_SETTLEMENT_MISMATCH", "Smoke host result settlement requires the durable pre-provider handoff");
  const durableHandoff = validateDurableHandoff(await readCanonicalJson(handoffPath, ledgerRoot, "smoke durable handoff"), dispatch);
  const gateBReference = validateGateBReference(input.gate_b_attestation, dispatch);
  if (durableHandoff.gate_b_attestation_sha256 !== gateBReference.attestation_sha256) fail("SMOKE_GATE_B_REFERENCE_MISMATCH", "Smoke host result Gate B attestation differs from the durable pre-provider handoff");
  const expectedGateB = directGateBEvidence(dispatch);
  const hostResult = validateSmokeOuterHostResult(input.host_result, dispatch);
  let settled;
  if (hostResult.result?.schema_version === "rc7-gate-c-live-capsule-failure-v4") {
    const failure = validateSmokeFailureHostResult(hostResult.result);
    settled = await settleRc7GateCSmokeFailure({
      dispatch,
      failure_code: failure.code,
      terminal_kind: failure.terminal_kind,
      provider_failure_code: failure.provider_failure_code,
      integration_failure_phase: failure.integration_failure_phase,
      ledger_root: ledgerRoot,
      results_root: input.results_root,
    });
  } else {
    const validated = validateSmokeSuccessHostResult(hostResult.result, dispatch);
    const sealedResult = buildRc7GateCSealedResult({
      activation_sha256: dispatch.activation_sha256,
      intent_sha256: dispatch.intent_sha256,
      permit_sha256: dispatch.permit_sha256,
      dispatch_nonce: dispatch.dispatch_nonce,
      artifact_sha256: sha256V1(canonicalBytes(validated.artifact)),
      usage_sha256: sha256V1(canonicalBytes(validated.usage)),
      provenance_sha256: sha256V1(canonicalJsonV1({
        dispatch_sha256: dispatch.dispatch_sha256,
        handoff_sha256: hostResult.handoff_sha256,
        artifact_sha256: validated.artifact.output_sha256,
      })),
      permission_sha256: sha256V1(canonicalJsonV1({
        policy_identity: RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
        request_kind: dispatch.request_kind,
        selected_route: dispatch.selected_route,
      })),
      authority_sha256: sha256V1(canonicalJsonV1({ gate_b: expectedGateB, observations: validated.observations })),
      cleanup_sha256: sha256V1(canonicalJsonV1({ state: hostResult.state, transport: hostResult.transport, process_reuse: "denied" })),
    });
    settled = await settleRc7GateCSmokeSuccess({
      accounting: {
        provider_posts: validated.observations.provider_posts,
        oauth_refresh_posts: validated.observations.oauth_refresh_posts,
        input_tokens: validated.usage.input_tokens + validated.usage.cache_read_tokens + validated.usage.cache_write_tokens,
        output_plus_reasoning_tokens: validated.usage.output_tokens + (validated.usage.reasoning_tokens ?? 0),
        provider_active_milliseconds: validated.observations.provider_active_milliseconds,
        automatic_retry_count: validated.observations.automatic_retry_count,
      },
      dispatch,
      ledger_root: ledgerRoot,
      results_root: input.results_root,
      sealed_result: sealedResult,
    });
  }
  return { terminal_sha256: settled.terminal.terminal_sha256, result_sha256: settled.result.result_sha256 };
}

export async function recoverRc7GateCSmoke({ ledger_root: ledgerRootInput, results_root: resultsRootInput }) {
  const ledgerRoot = await assertSmokeRoot(ledgerRootInput, { requireEmpty: false, role: "ledger" });
  if (await settledHistoricalSmokeVersion(ledgerRoot)) {
    const historical = await readSettledHistoricalSmoke(ledgerRoot, resultsRootInput);
    return { classification: "settled-idempotent", changed: false, terminal_sha256: historical.terminal.terminal_sha256, result_sha256: historical.result.result_sha256, replay_permitted: false, historical_schema_version: historical.historical_version };
  }
  let lock;
  try {
    lock = await acquireLock(ledgerRoot, LEDGER_LOCK_FILE);
    const context = await readLedgerContext(ledgerRoot);
    const reservationPath = await optionalPhysicalFile(path.join(ledgerRoot, RESERVATION_FILE), ledgerRoot, "smoke reservation");
    if (!reservationPath) return { classification: "unstarted-idempotent", changed: false, replay_permitted: false };
    const dispatch = validateDispatch(await readCanonicalJson(reservationPath, ledgerRoot, "smoke reservation"), context.activation);
    const terminalPath = await optionalPhysicalFile(path.join(ledgerRoot, TERMINAL_FILE), ledgerRoot, "smoke terminal");
    let terminal;
    let changed = false;
    if (terminalPath) terminal = validateTerminal(await readCanonicalJson(terminalPath, ledgerRoot, "smoke terminal"), dispatch);
    else {
      const handoffPath = await optionalPhysicalFile(path.join(ledgerRoot, HANDOFF_FILE), ledgerRoot, "smoke durable handoff");
      if (handoffPath) validateDurableHandoff(await readCanonicalJson(handoffPath, ledgerRoot, "smoke durable handoff"), dispatch);
      const committed = Boolean(handoffPath);
      terminal = buildTerminal(dispatch, { state: "indeterminate-no-replay", failureCode: "INTERRUPTED_SMOKE_RECOVERED_NO_REPLAY", terminalKind: null, providerFailureCode: null, integrationFailurePhase: null, sealedResult: null, accounting: conservativeAccounting(committed), reason: "provider-reachable-or-consumed-without-trusted-sealed-result" });
      await writeExclusive(path.join(ledgerRoot, TERMINAL_FILE), terminal);
      changed = true;
    }
    await rm(path.join(ledgerRoot, ACTIVE_DISPATCH_FILE), { force: true });
    const resultsContext = await readResultsContext(resultsRootInput, context);
    const result = buildResultRecord(terminal, resultsContext.meta);
    const resultPath = await optionalPhysicalFile(path.join(resultsContext.root, RESULT_FILE), resultsContext.root, "smoke result");
    if (resultPath) validateResultRecord(await readCanonicalJson(resultPath, resultsContext.root, "smoke result"), terminal, resultsContext.meta);
    else { await writeExclusive(path.join(resultsContext.root, RESULT_FILE), result); changed = true; }
    return { classification: changed ? "smoke-terminal-recovered-no-replay" : "settled-idempotent", changed, terminal_sha256: terminal.terminal_sha256, result_sha256: result.result_sha256, replay_permitted: false };
  } finally { if (lock) await releaseLock(ledgerRoot, LEDGER_LOCK_FILE, lock); }
}

export async function inspectRc7GateCSmokeLedger(root) {
  if (await settledHistoricalSmokeVersion(root)) {
    const historical = await readSettledHistoricalSmoke(root);
    return {
      root: historical.root,
      state: "settled-no-replay",
      activation_sha256: historical.meta.activation_sha256,
      counts: { reservations: 1, durable_handoffs: historical.handoff ? 1 : 0, terminals: 1 },
      maximum_reservations: 1,
      matrix_authority: false,
      replay_permitted: false,
      historical_schema_version: historical.historical_version,
      dispatch_authority: false,
    };
  }
  const context = await readLedgerContext(root);
  const reservationPath = await optionalPhysicalFile(path.join(context.root, RESERVATION_FILE), context.root, "smoke reservation");
  const terminalPath = await optionalPhysicalFile(path.join(context.root, TERMINAL_FILE), context.root, "smoke terminal");
  const handoffPath = await optionalPhysicalFile(path.join(context.root, HANDOFF_FILE), context.root, "smoke durable handoff");
  let dispatch = null;
  let terminal = null;
  if (reservationPath) dispatch = validateDispatch(await readCanonicalJson(reservationPath, context.root, "smoke reservation"), context.activation);
  if (handoffPath) {
    if (!dispatch) fail("SMOKE_HANDOFF_IDENTITY_MISMATCH", "Smoke durable handoff exists without reservation");
    validateDurableHandoff(await readCanonicalJson(handoffPath, context.root, "smoke durable handoff"), dispatch);
  }
  if (terminalPath) {
    if (!dispatch) fail("SMOKE_TERMINAL_MISMATCH", "Smoke terminal exists without reservation");
    terminal = validateTerminal(await readCanonicalJson(terminalPath, context.root, "smoke terminal"), dispatch);
  }
  return {
    root: context.root,
    state: terminal ? "settled-no-replay" : dispatch ? "recovery-required-no-replay" : "ready-one-request",
    activation_sha256: context.activation.activation_sha256,
    counts: { reservations: dispatch ? 1 : 0, durable_handoffs: handoffPath ? 1 : 0, terminals: terminal ? 1 : 0 },
    maximum_reservations: 1,
    matrix_authority: false,
    replay_permitted: false,
  };
}

export async function inspectRc7GateCSmokeResult(resultsRoot, ledgerRoot) {
  if (await settledHistoricalSmokeVersion(ledgerRoot)) {
    const historical = await readSettledHistoricalSmoke(ledgerRoot, resultsRoot);
    return { root: historical.results_root, state: historical.result.state, results: 1, result_sha256: historical.result.result_sha256, terminal_sha256: historical.terminal.terminal_sha256, matrix_member: false, score_bearing: false, replay_permitted: false, historical_schema_version: historical.historical_version, dispatch_authority: false };
  }
  const ledgerContext = await readLedgerContext(ledgerRoot);
  const resultsContext = await readResultsContext(resultsRoot, ledgerContext);
  const resultPath = await optionalPhysicalFile(path.join(resultsContext.root, RESULT_FILE), resultsContext.root, "smoke result");
  if (!resultPath) return { root: resultsContext.root, state: "empty", results: 0, matrix_member: false, score_bearing: false };
  const terminalPath = await optionalPhysicalFile(path.join(ledgerContext.root, TERMINAL_FILE), ledgerContext.root, "smoke terminal");
  const reservationPath = await optionalPhysicalFile(path.join(ledgerContext.root, RESERVATION_FILE), ledgerContext.root, "smoke reservation");
  if (!terminalPath || !reservationPath) fail("SMOKE_RESULT_MISMATCH", "Smoke result exists without ledger terminal and reservation");
  const dispatch = validateDispatch(await readCanonicalJson(reservationPath, ledgerContext.root, "smoke reservation"), ledgerContext.activation);
  const terminal = validateTerminal(await readCanonicalJson(terminalPath, ledgerContext.root, "smoke terminal"), dispatch);
  const result = validateResultRecord(await readCanonicalJson(resultPath, resultsContext.root, "smoke result"), terminal, resultsContext.meta);
  return { root: resultsContext.root, state: result.state, results: 1, result_sha256: result.result_sha256, terminal_sha256: result.terminal_sha256, matrix_member: false, score_bearing: false, replay_permitted: false };
}

export function formatRc7GateCSmokeError(error) {
  if (error instanceof Rc7GateCSmokeError) return { ok: false, code: error.code, message: error.message, details: error.details };
  return { ok: false, code: "UNEXPECTED_SMOKE_ERROR", message: error?.message ?? String(error) };
}

export const __test = Object.freeze({
  HISTORICAL_DISCLOSURE,
  REFERENCE_MATRIX_RUN_ID,
  REFERENCE_SEMANTIC_SHA256,
  SMOKE_RUN_ID,
  deriveSmokeRunId,
  smokeRunManifest,
  validateSmokeIntent,
});
