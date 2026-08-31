import { createHash, randomBytes } from "node:crypto";
import { access, link, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const POLICY = "rc7-rlm-gate-c-contained-launcher-v1";
const SOURCE_ROOT = "/rc7/source";
const LAUNCHER_ROOT = "/rc7/launcher";
const EXCHANGE_ROOT = "/rc7/exchange";
const STATE_ROOT = "/rc7/state";
const MAX_CHILDREN = 4;
const MAX_DEPTH = 2;
const KERNEL_GENERATION = 1;
const MAX_PROGRAM_BYTES = 16_384;
const MAX_ROUTE_OUTPUT_BYTES = 65_536;
const MAX_EXCHANGE_BYTES = 131_072;
const RESPONSE_TIMEOUT_MS = 120_000;
const HASH = /^[0-9a-f]{64}$/u;
const WORKER_SHA256 = sha256(await readFile(new URL(import.meta.url)));
let FAILURE_PHASE = "PROCESS_START";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite JSON number denied");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("non-JSON value denied");
}

function canonicalRecordBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function canonicalPackageBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n\n`, "utf8");
}

function canonicalRecordSha256(value) {
  return sha256(canonicalRecordBytes(value));
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) throw new Error(`${label} keys mismatch`);
}

function closedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readCanonicalFile(file, root, label, maxBytes = MAX_EXCHANGE_BYTES) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > maxBytes) throw new Error(`${label} is not one bounded physical file`);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escaped its root`);
  const bytes = await readFile(file);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`${label} is malformed JSON`); }
  if (!bytes.equals(canonicalPackageBytes(value))) throw new Error(`${label} is not canonical JSON`);
  return { bytes, value };
}

async function atomicPublish(file, value) {
  const bytes = canonicalPackageBytes(value);
  if (bytes.byteLength > MAX_EXCHANGE_BYTES) throw new Error("exchange artifact exceeds byte ceiling");
  const temporary = `${file}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await link(temporary, file);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function waitForPhysicalFile(file, root, label) {
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  for (;;) {
    try { return await readCanonicalFile(file, root, label); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (Date.now() >= deadline) throw new Error(`${label} timed out`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function digestRecord(value, digestKey) {
  return { ...value, [digestKey]: canonicalRecordSha256(value) };
}

function validateLaunchContract(value, semanticBytes) {
  exactKeys(value, [
    "schema_version", "policy_identity", "activation_sha256", "run_identity", "case_id", "arm", "selected_route", "intent_sha256",
    "dispatch_sha256", "semantic_request_sha256", "image_id", "image_definition_sha256", "worker_sha256", "max_children",
    "max_depth", "direct_provider_access", "exchange_protocol", "launch_sha256",
  ], "launch contract");
  const projection = { ...value };
  delete projection.launch_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-launch-contract-v1" || value.policy_identity !== POLICY
    || !HASH.test(value.activation_sha256) || !HASH.test(value.run_identity) || !HASH.test(value.intent_sha256)
    || !["LAB-01", "PAPER-01", "REPO-01"].includes(value.case_id) || value.arm !== "rc-rlm" || value.selected_route !== "rc-rlm"
    || !HASH.test(value.dispatch_sha256) || !/^sha256:[0-9a-f]{64}$/u.test(value.image_id)
    || !HASH.test(value.image_definition_sha256)
    || value.semantic_request_sha256 !== sha256(semanticBytes) || value.worker_sha256 !== WORKER_SHA256
    || value.max_children !== MAX_CHILDREN || value.max_depth !== MAX_DEPTH
    || value.direct_provider_access !== "denied-network-none"
    || value.exchange_protocol !== "rc7-gate-c-rlm-file-exchange-v1"
    || value.launch_sha256 !== canonicalRecordSha256(projection)) throw new Error("launch contract identity mismatch");
  return value;
}

function validateProgram(value, launch) {
  exactKeys(value, [
    "schema_version", "activation_sha256", "run_identity", "intent_sha256", "dispatch_sha256",
    "semantic_request_sha256", "base_output", "base_output_sha256", "python_code", "python_code_sha256", "program_sha256",
  ], "RLM program");
  const projection = { ...value };
  delete projection.program_sha256;
  exactKeys(value.base_output, ["case_id", "completion", "evidence_items", "gaps", "safety_events", "schema_version"], "RLM base output");
  const normalizedBaseOutput = `${canonicalJson(value.base_output)}\n`;
  if (value.schema_version !== "rc7-gate-c-rlm-program-v2"
    || value.activation_sha256 !== launch.activation_sha256 || value.run_identity !== launch.run_identity
    || value.intent_sha256 !== launch.intent_sha256 || value.dispatch_sha256 !== launch.dispatch_sha256
    || value.semantic_request_sha256 !== launch.semantic_request_sha256
    || value.base_output.schema_version !== "rc7-gate-c-signature-output-v1" || value.base_output.case_id !== launch.case_id
    || !["complete", "incomplete", "stopped"].includes(value.base_output.completion)
    || !Array.isArray(value.base_output.evidence_items) || value.base_output.evidence_items.length > 64
    || !Array.isArray(value.base_output.gaps) || value.base_output.gaps.length > 16
    || !Array.isArray(value.base_output.safety_events) || value.base_output.safety_events.length > 16
    || Buffer.byteLength(normalizedBaseOutput, "utf8") > MAX_ROUTE_OUTPUT_BYTES
    || value.base_output_sha256 !== sha256(normalizedBaseOutput)
    || typeof value.python_code !== "string" || Buffer.byteLength(value.python_code, "utf8") < 1
    || Buffer.byteLength(value.python_code, "utf8") > MAX_PROGRAM_BYTES
    || value.python_code_sha256 !== sha256(value.python_code)
    || value.program_sha256 !== canonicalRecordSha256(projection)) throw new Error("RLM program identity mismatch");
  return value;
}

function validateChildPayload(payload, nextSequence) {
  exactKeys(payload, ["child_question", "excerpt_locator", "parent_depth"], "child proposal payload");
  if (typeof payload.child_question !== "string" || Buffer.byteLength(payload.child_question, "utf8") < 1
    || Buffer.byteLength(payload.child_question, "utf8") > 2_048 || /(?:https?:\/\/|ftp:\/\/|file:\/\/|credential|secret|oauth|api[-_]?key)/iu.test(payload.child_question)) throw new Error("child question denied");
  if (!Number.isSafeInteger(payload.parent_depth) || payload.parent_depth < 0 || payload.parent_depth + 1 > MAX_DEPTH) throw new Error("child depth denied");
  if (!payload.excerpt_locator || typeof payload.excerpt_locator !== "object" || Array.isArray(payload.excerpt_locator)) throw new Error("child excerpt locator required");
  if (nextSequence < 1 || nextSequence > MAX_CHILDREN) throw new Error("child budget exhausted");
  return payload;
}

function validateChildResponse(value, request) {
  exactKeys(value, [
    "schema_version", "state", "activation_sha256", "run_identity", "dispatch_sha256", "child_sequence",
    "request_sha256", "response_text", "response_text_sha256", "sealed_result_sha256", "response_sha256",
  ], "child response");
  const projection = { ...value };
  delete projection.response_sha256;
  if (value.schema_version !== "rc7-gate-c-rlm-child-response-v1" || value.state !== "trusted-sealed"
    || value.activation_sha256 !== request.activation_sha256 || value.run_identity !== request.run_identity
    || value.dispatch_sha256 !== request.dispatch_sha256 || value.child_sequence !== request.child_sequence
    || value.request_sha256 !== request.request_sha256 || typeof value.response_text !== "string"
    || Buffer.byteLength(value.response_text, "utf8") > 32_768 || value.response_text_sha256 !== sha256(value.response_text)
    || !HASH.test(value.sealed_result_sha256) || value.response_sha256 !== canonicalRecordSha256(projection)) throw new Error("child response identity mismatch");
  return value;
}

function marker(stdout, prefix) {
  const line = stdout.split(/\r?\n/u).map((entry) => entry.trim()).findLast((entry) => entry.startsWith(prefix));
  if (!line) throw closedError("ROUTE_OUTPUT_MARKER_MISSING", `missing ${prefix} marker`);
  return line.slice(prefix.length);
}

export function canonicalRouteOutputFromMarker(stdout) {
  const routeOutputText = marker(stdout, "RC7_FINAL=");
  let routeOutput;
  try { routeOutput = JSON.parse(routeOutputText); } catch { throw closedError("ROUTE_OUTPUT_JSON_MALFORMED", "final route artifact is malformed JSON"); }
  if (canonicalJson(routeOutput) !== routeOutputText) throw closedError("ROUTE_OUTPUT_NONCANONICAL", "final route artifact is not canonical JSON");
  const routeOutputBytes = Buffer.from(`${routeOutputText}\n`, "utf8");
  if (routeOutputBytes.byteLength > 65_536) throw closedError("ROUTE_OUTPUT_OVERSIZED", "final route artifact exceeds byte ceiling");
  return { route_output: routeOutput, route_output_bytes: routeOutputBytes };
}

const PHASE_TWO_SECCOMP = String.raw`
import ctypes as _ct
import errno as _errno
import glob as _glob
import json as _json
import platform as _platform
import threading as _threading

if _platform.machine() != "x86_64":
    raise RuntimeError("RC7 phase-two seccomp requires linux/amd64")

class _SockFilter(_ct.Structure):
    _fields_ = [("code", _ct.c_ushort), ("jt", _ct.c_ubyte), ("jf", _ct.c_ubyte), ("k", _ct.c_uint)]
class _SockFprog(_ct.Structure):
    _fields_ = [("len", _ct.c_ushort), ("filter", _ct.POINTER(_SockFilter))]

_LD_W_ABS=0x20; _JMP_JEQ_K=0x15; _ALU_AND_K=0x54; _RET_K=0x06
_ALLOW=0x7fff0000; _ERRNO=0x00050000|_errno.EPERM; _ENOSYS=0x00050000|_errno.ENOSYS
_KILL_PROCESS=0x80000000; _AUDIT_ARCH_X86_64=0xc000003e; _CLONE_THREAD=0x00010000

def _status(_path):
    _wanted={"NoNewPrivs","Seccomp","Seccomp_filters","CapInh","CapPrm","CapEff","CapBnd","CapAmb"}
    _values={"tid":int(_path.split("/")[-2])}
    for _line in open(_path,encoding="utf-8"):
        _key,_,_value=_line.partition(":")
        if _key in _wanted: _values[_key]=_value.strip()
    return _values

_before=[_status(_path) for _path in sorted(_glob.glob("/proc/self/task/*/status"))]
_ins=[
    _SockFilter(_LD_W_ABS,0,0,4), _SockFilter(_JMP_JEQ_K,1,0,_AUDIT_ARCH_X86_64), _SockFilter(_RET_K,0,0,_KILL_PROCESS),
    _SockFilter(_LD_W_ABS,0,0,0), _SockFilter(_JMP_JEQ_K,0,5,56), _SockFilter(_LD_W_ABS,0,0,16),
    _SockFilter(_ALU_AND_K,0,0,_CLONE_THREAD), _SockFilter(_JMP_JEQ_K,0,1,0), _SockFilter(_RET_K,0,0,_ERRNO),
    _SockFilter(_LD_W_ABS,0,0,0),
]
_ins.append(_SockFilter(_JMP_JEQ_K,0,1,435)); _ins.append(_SockFilter(_RET_K,0,0,_ENOSYS))
for _nr in (2,41,53,57,58,59,76,77,82,83,84,85,86,87,88,90,91,92,93,94,101,133,165,166,250,257,258,259,263,264,265,266,268,272,298,304,308,316,321,322,437):
    _ins.append(_SockFilter(_JMP_JEQ_K,0,1,_nr)); _ins.append(_SockFilter(_RET_K,0,0,_ERRNO))
_ins.append(_SockFilter(_RET_K,0,0,_ALLOW))
_array=(_SockFilter*len(_ins))(*_ins); _program=_SockFprog(len(_ins),_array); _libc=_ct.CDLL(None,use_errno=True)
if _libc.prctl(38,1,0,0,0)!=0: raise OSError(_ct.get_errno(),"PR_SET_NO_NEW_PRIVS failed")
if _libc.syscall(317,1,1,_ct.byref(_program))!=0: raise OSError(_ct.get_errno(),"SECCOMP_SET_MODE_FILTER TSYNC failed")
_after=[]
for _item in _before:
    _path=f"/proc/self/task/{_item['tid']}/status"
    try:
        _after.append(_status(_path))
    except PermissionError:
        pass
_inherited={}
def _capture_new_thread():
    _inherited["created"] = True
_probe_thread=_threading.Thread(target=_capture_new_thread); _probe_thread.start(); _probe_thread.join()
try:
    open("/rc7/exchange/forbidden",encoding="utf-8")
    _exchange_open_denied=False
except PermissionError:
    _exchange_open_denied=True
_cap_names=("CapInh","CapPrm","CapEff","CapBnd","CapAmb")
_evidence={
    "flag":"SECCOMP_FILTER_FLAG_TSYNC",
    "clone3_action":"ENOSYS-for-safe-clone-thread-fallback",
    "all_before_seccomp_two":len(_before)>0 and all(_item.get("Seccomp")=="2" for _item in _before),
    "all_before_no_new_privileges":len(_before)>0 and all(_item.get("NoNewPrivs")=="1" for _item in _before),
    "all_before_capabilities_zero":len(_before)>0 and all(all(int(_item.get(_name,"1"),16)==0 for _name in _cap_names) for _item in _before),
    "new_thread_survived":_inherited.get("created") is True,
    "filesystem_open_denied_after_filter":_exchange_open_denied,
}
print("RC7_GATE_C_SECCOMP="+_json.dumps(_evidence,sort_keys=True))
`;

async function main() {
  FAILURE_PHASE = "COMPONENT_IMPORT";
  const [{ KernelManager }, { resolveKernelPython }] = await Promise.all([
    import("/opt/rc7/component/packages/rlm-jupyter/lib/kernel.js"),
    import("/opt/rc7/component/packages/rlm-jupyter/lib/python.js"),
  ]);
  FAILURE_PHASE = "INPUT_READ";
  const semantic = await readCanonicalFile(path.join(SOURCE_ROOT, "semantic-request.json"), SOURCE_ROOT, "semantic request", 32_769);
  const launchRecord = await readCanonicalFile(path.join(LAUNCHER_ROOT, "launch.json"), LAUNCHER_ROOT, "launch contract");
  FAILURE_PHASE = "LAUNCH_VALIDATE";
  const launch = validateLaunchContract(launchRecord.value, semantic.bytes);
  FAILURE_PHASE = "PROGRAM_READ";
  const programRecord = await waitForPhysicalFile(path.join(EXCHANGE_ROOT, "commands", "program.json"), EXCHANGE_ROOT, "RLM program");
  FAILURE_PHASE = "PROGRAM_VALIDATE";
  const program = validateProgram(programRecord.value, launch);

  FAILURE_PHASE = "STATE_PREPARE";
  await Promise.all([
    mkdir(path.join(STATE_ROOT, "session", "harness"), { recursive: true }),
    mkdir(path.join(STATE_ROOT, "global-harness"), { recursive: true }),
    mkdir(path.join(STATE_ROOT, "tmp"), { recursive: true }),
    mkdir(path.join(STATE_ROOT, "home"), { recursive: true }),
    mkdir(path.join(STATE_ROOT, "empty-prime"), { recursive: true }),
  ]);
  const pythonPath = "/opt/rc7/python/bin/python";
  const kernelEnv = {
    PATH: "/opt/rc7/python/bin:/usr/local/bin:/usr/bin:/bin",
    PYTHONPATH: "/opt/rc7/component/vendor/prime-agent-runtime/src:/opt/rc7/component/python/dsh-rlm-runtime/src",
    PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", JUPYTER_PLATFORM_DIRS: "1",
    HOME: path.join(STATE_ROOT, "home"), TMPDIR: path.join(STATE_ROOT, "tmp"),
    XDG_CACHE_HOME: path.join(STATE_ROOT, "xdg-cache"), XDG_CONFIG_HOME: path.join(STATE_ROOT, "xdg-config"),
    XDG_DATA_HOME: path.join(STATE_ROOT, "xdg-data"), JUPYTER_CONFIG_DIR: path.join(STATE_ROOT, "jupyter"),
    IPYTHONDIR: path.join(STATE_ROOT, "ipython"), RLM_SESSION_DIR: path.join(STATE_ROOT, "session"),
    RLM_HARNESS_STATE_DIR: path.join(STATE_ROOT, "session", "harness"), RLM_GLOBAL_HARNESS_STATE_DIR: path.join(STATE_ROOT, "global-harness"),
    PRIME_AGENT_CODING_AGENT_DIR: path.join(STATE_ROOT, "empty-prime"), PI_CODING_AGENT_DIR: path.join(STATE_ROOT, "empty-prime"),
    RLM_DEPTH: "0", RLM_MAX_DEPTH: String(MAX_DEPTH), LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC",
  };
  FAILURE_PHASE = "PYTHON_RESOLVE";
  const python = await resolveKernelPython({ python: pythonPath, managedRuntimeRoot: path.join(STATE_ROOT, "runtime-unused"), probeEnvironment: kernelEnv });
  let childCount = 0;
  const requestDigests = [];
  let kernel;
  kernel = new KernelManager({
    python, cwd: path.join(STATE_ROOT, "session"), env: kernelEnv, sessionId: launch.run_identity.slice(0, 32), generation: KERNEL_GENERATION,
    interruptGraceMs: 1_000, shutdownGraceMs: 2_000, hostRequestDrainMs: 120_000,
    isGenerationCurrent: () => true,
    dispatchHostRequest: async (type, payload) => {
      if (type !== "rc7.child") throw new Error("unsupported host request");
      const sequence = childCount + 1;
      validateChildPayload(payload, sequence);
      childCount = sequence;
      const request = digestRecord({
        schema_version: "rc7-gate-c-rlm-child-proposal-v1", state: "proposed-provider-unreachable",
        activation_sha256: launch.activation_sha256, run_identity: launch.run_identity, intent_sha256: launch.intent_sha256,
        dispatch_sha256: launch.dispatch_sha256, semantic_request_sha256: launch.semantic_request_sha256,
        child_sequence: sequence, parent_depth: payload.parent_depth, child_depth: payload.parent_depth + 1,
        child_question: payload.child_question, excerpt_locator: payload.excerpt_locator,
        max_children: MAX_CHILDREN, max_depth: MAX_DEPTH,
      }, "request_sha256");
      requestDigests.push(request.request_sha256);
      const name = String(sequence).padStart(4, "0");
      await atomicPublish(path.join(EXCHANGE_ROOT, "requests", `${name}.json`), request);
      const responseRecord = await waitForPhysicalFile(path.join(EXCHANGE_ROOT, "responses", `${name}.json`), EXCHANGE_ROOT, "child response");
      const response = validateChildResponse(responseRecord.value, request);
      return { response_text: response.response_text, sealed_result_sha256: response.sealed_result_sha256, child_sequence: sequence };
    },
    onPhase: () => undefined,
  });
  let bootstrap;
  let seccomp;
  let executed;
  let phaseTwo;
  try {
    FAILURE_PHASE = "KERNEL_START";
    await kernel.start();
    FAILURE_PHASE = "KERNEL_BOOTSTRAP";
    bootstrap = await kernel.execute(`from dsh_rlm_runtime import bootstrap; globals().update(bootstrap())\nRC7_VISIBLE_SEMANTIC_REQUEST = ${JSON.stringify(semantic.bytes.toString("utf8"))}\nRC7_BASE_OUTPUT_JSON = ${JSON.stringify(canonicalJson(program.base_output))}`, { maxOutputBytes: 65_536, internal: true });
    FAILURE_PHASE = "PHASE_TWO_EXECUTE";
    seccomp = await kernel.execute(PHASE_TWO_SECCOMP, { maxOutputBytes: 65_536, internal: true });
    FAILURE_PHASE = "PHASE_TWO_VALIDATE";
    if (bootstrap.status !== "ok" || seccomp.status !== "ok") throw new Error("RLM kernel bootstrap or phase-two execution failed closed");
    phaseTwo = JSON.parse(marker(seccomp.stdout, "RC7_GATE_C_SECCOMP="));
    if (phaseTwo.flag !== "SECCOMP_FILTER_FLAG_TSYNC" || phaseTwo.filesystem_open_denied_after_filter !== true || phaseTwo.new_thread_survived !== true) throw new Error("phase-two confinement attestation failed");
    const phaseTwoRecord = digestRecord({
      schema_version: "rc7-gate-c-rlm-phase-two-attestation-v1", state: "tsync-active-before-program-and-child-proposals",
      activation_sha256: launch.activation_sha256, run_identity: launch.run_identity,
      intent_sha256: launch.intent_sha256, dispatch_sha256: launch.dispatch_sha256,
      semantic_request_sha256: launch.semantic_request_sha256, worker_sha256: WORKER_SHA256,
      phase_two: phaseTwo,
    }, "phase_two_sha256");
    await atomicPublish(path.join(EXCHANGE_ROOT, "results", "phase-two.json"), phaseTwoRecord);
    FAILURE_PHASE = "PROGRAM_EXECUTE";
    executed = await kernel.execute(program.python_code, { maxOutputBytes: 131_072 });
  } finally {
    await kernel.dispose().catch(() => undefined);
  }
  FAILURE_PHASE = "ROUTE_OUTPUT_VALIDATE";
  if (executed.status !== "ok") throw closedError("PROGRAM_EXECUTION_FAILED", "RLM program execution failed closed");
  const { route_output: routeOutput, route_output_bytes: routeOutputBytes } = canonicalRouteOutputFromMarker(executed.stdout);
  FAILURE_PHASE = "RESULT_BUILD";
  const result = digestRecord({
    schema_version: "rc7-gate-c-rlm-container-result-v1", state: "sealed-provider-free-container-output",
    policy_identity: POLICY, activation_sha256: launch.activation_sha256, run_identity: launch.run_identity,
    intent_sha256: launch.intent_sha256, dispatch_sha256: launch.dispatch_sha256,
    semantic_request_sha256: launch.semantic_request_sha256, image_id: launch.image_id,
    worker_sha256: WORKER_SHA256, program_sha256: program.program_sha256,
    component_commit: "4772c12b0630706f14d16e70be0ad67bff116690",
    kernel_generation: KERNEL_GENERATION, phase_two: phaseTwo, child_request_count: childCount,
    child_request_sha256s: requestDigests, route_output: routeOutput,
    route_output_sha256: sha256(routeOutputBytes), direct_container_provider_access: "denied-network-none",
  }, "result_sha256");
  FAILURE_PHASE = "RESULT_PUBLISH";
  await atomicPublish(path.join(EXCHANGE_ROOT, "results", "container-result.json"), result);
  FAILURE_PHASE = "COMPLETE";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    const failure = digestRecord({
      schema_version: "rc7-gate-c-rlm-container-failure-v1", state: "failed-closed",
      worker_sha256: WORKER_SHA256, error_name: error instanceof Error ? error.name : "NonError",
      error_code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : null,
      failure_phase: FAILURE_PHASE,
    }, "failure_sha256");
    await atomicPublish(path.join(EXCHANGE_ROOT, "results", "container-failure.json"), failure).catch(() => undefined);
    process.exitCode = 1;
  }
}
