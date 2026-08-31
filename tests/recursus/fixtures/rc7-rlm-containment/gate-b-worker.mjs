import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { KernelManager } from "/opt/rc7/component/packages/rlm-jupyter/lib/kernel.js";
import { resolveKernelPython } from "/opt/rc7/component/packages/rlm-jupyter/lib/python.js";

const OUTPUT_ROOT = "/rc7/output";
const INPUT_ROOT = "/rc7/input";
const RESULT_PATH = path.join(OUTPUT_ROOT, "result.json");
const mode = process.argv[2] ?? "conformance";
const WORKER_SHA256 = sha256(await readFile(new URL(import.meta.url)));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorRecord(error) {
  return {
    name: error instanceof Error ? error.name : "NonError",
    code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : null,
  };
}

async function writeResult(value) {
  const bytes = `${JSON.stringify(value)}\n`;
  await writeFile(RESULT_PATH, bytes, { encoding: "utf8", flag: "wx" });
  process.stdout.write(bytes);
}

async function expectDenied(operation) {
  try {
    await operation();
    return { denied: false, error: null };
  } catch (error) {
    return { denied: true, error: errorRecord(error) };
  }
}

async function runPidsProbe() {
  const children = [];
  const errors = [];
  for (let index = 0; index < 32; index += 1) {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    child.once("error", (error) => errors.push(errorRecord(error)));
    children.push(child);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const alive = children.filter((child) => child.exitCode === null && child.signalCode === null).length;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  await writeResult({
    schema_version: "rc7-gate-b-worker-result-v1",
    mode,
    attempted_processes: 32,
    configured_pids_ceiling: 24,
    limited_before_all_processes_started: errors.length > 0 || alive < 32,
    passed: errors.length > 0 || alive < 32,
  });
}

async function runFileSizeProbe() {
  const target = path.join(OUTPUT_ROOT, "oversized-child.bin");
  const child = spawnSync(
    process.execPath,
    ["-e", `require('node:fs').writeFileSync(${JSON.stringify(target)}, Buffer.alloc(2097152, 1))`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  await rm(target, { force: true });
  await writeResult({
    schema_version: "rc7-gate-b-worker-result-v1",
    mode,
    attempted_bytes: 2_097_152,
    configured_file_size_ceiling: 1_048_576,
    denied: child.status !== 0,
    passed: child.status !== 0,
  });
}

async function runInodeProbe() {
  const root = path.join(OUTPUT_ROOT, "inode-probe");
  await mkdir(root);
  let created = 0;
  let failure = null;
  for (let index = 0; index < 400; index += 1) {
    try {
      await writeFile(path.join(root, `${String(index).padStart(3, "0")}.txt`), "", { flag: "wx" });
      created += 1;
    } catch (error) {
      failure = errorRecord(error);
      break;
    }
  }
  await rm(root, { recursive: true, force: true });
  await writeResult({
    schema_version: "rc7-gate-b-worker-result-v1",
    mode,
    attempted_inodes: 400,
    configured_inode_ceiling: 256,
    denied_before_attempt_complete: created < 400 && failure !== null,
    passed: created < 400 && failure !== null,
  });
}

async function runByteProbe() {
  const root = path.join(OUTPUT_ROOT, "byte-probe");
  await mkdir(root);
  const block = Buffer.alloc(1024 * 1024, 7);
  let bytes = 0;
  let failure = null;
  for (let index = 0; index < 32; index += 1) {
    try {
      await writeFile(path.join(root, `${index}.bin`), block, { flag: "wx" });
      bytes += block.byteLength;
    } catch (error) {
      failure = errorRecord(error);
      break;
    }
  }
  await rm(root, { recursive: true, force: true });
  await writeResult({
    schema_version: "rc7-gate-b-worker-result-v1",
    mode,
    attempted_bytes: 32 * 1024 * 1024,
    configured_byte_ceiling: 16 * 1024 * 1024,
    denied_before_attempt_complete: bytes < 32 * 1024 * 1024 && failure !== null,
    passed: bytes < 32 * 1024 * 1024 && failure !== null,
  });
}

function runMemoryProbe() {
  const retained = [];
  for (;;) retained.push(Buffer.alloc(8 * 1024 * 1024, 3));
}

function runCpuProbe() {
  for (;;) {
    // The host wall-time controller terminates this registered resource probe.
  }
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

_LD_W_ABS = 0x20
_JMP_JEQ_K = 0x15
_ALU_AND_K = 0x54
_RET_K = 0x06
_ALLOW = 0x7fff0000
_ERRNO = 0x00050000 | _errno.EPERM
_ENOSYS = 0x00050000 | _errno.ENOSYS
_KILL_PROCESS = 0x80000000
_AUDIT_ARCH_X86_64 = 0xc000003e
_CLONE_THREAD = 0x00010000
_SECCOMP_FILTER_FLAG_TSYNC = 1

def _status(_path):
    _wanted = {"NoNewPrivs", "Seccomp", "Seccomp_filters", "CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"}
    _values = {"tid": int(_path.split("/")[-2])}
    for _line in open(_path, encoding="utf-8"):
        _key, _, _value = _line.partition(":")
        if _key in _wanted:
            _values[_key] = _value.strip()
    return _values

_before = [_status(_path) for _path in sorted(_glob.glob("/proc/self/task/*/status"))]

_ins = [
    _SockFilter(_LD_W_ABS, 0, 0, 4),
    _SockFilter(_JMP_JEQ_K, 1, 0, _AUDIT_ARCH_X86_64),
    _SockFilter(_RET_K, 0, 0, _KILL_PROCESS),
    _SockFilter(_LD_W_ABS, 0, 0, 0),
    _SockFilter(_JMP_JEQ_K, 0, 5, 56),
    _SockFilter(_LD_W_ABS, 0, 0, 16),
    _SockFilter(_ALU_AND_K, 0, 0, _CLONE_THREAD),
    _SockFilter(_JMP_JEQ_K, 0, 1, 0),
    _SockFilter(_RET_K, 0, 0, _ERRNO),
    _SockFilter(_LD_W_ABS, 0, 0, 0),
]

_ins.append(_SockFilter(_JMP_JEQ_K, 0, 1, 435))
_ins.append(_SockFilter(_RET_K, 0, 0, _ENOSYS))
for _nr in (41, 53, 57, 58, 59, 101, 133, 165, 166, 250, 259, 272, 298, 304, 308, 321, 322):
    _ins.append(_SockFilter(_JMP_JEQ_K, 0, 1, _nr))
    _ins.append(_SockFilter(_RET_K, 0, 0, _ERRNO))
_ins.append(_SockFilter(_RET_K, 0, 0, _ALLOW))

_array = (_SockFilter * len(_ins))(*_ins)
_program = _SockFprog(len(_ins), _array)
_libc = _ct.CDLL(None, use_errno=True)
if _libc.prctl(38, 1, 0, 0, 0) != 0:
    raise OSError(_ct.get_errno(), "PR_SET_NO_NEW_PRIVS failed")
if _libc.syscall(317, 1, _SECCOMP_FILTER_FLAG_TSYNC, _ct.byref(_program)) != 0:
    raise OSError(_ct.get_errno(), "SECCOMP_SET_MODE_FILTER TSYNC failed")

_after = [_status(_path) for _path in sorted(_glob.glob("/proc/self/task/*/status"))]
_inherited = {}
def _capture_new_thread():
    _tid = _threading.get_native_id()
    _inherited.update(_status(f"/proc/self/task/{_tid}/status"))
_probe_thread = _threading.Thread(target=_capture_new_thread)
_probe_thread.start()
_probe_thread.join()
_before_by_tid = {_item["tid"]: _item for _item in _before}
_survivors = [_item for _item in _after if _item["tid"] in _before_by_tid]
_cap_names = ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb")
_evidence = {
    "flag": "SECCOMP_FILTER_FLAG_TSYNC",
    "clone3_action": "ENOSYS-for-safe-clone-thread-fallback",
    "all_after_seccomp_two": len(_after) > 0 and all(_item.get("Seccomp") == "2" for _item in _after),
    "all_after_no_new_privileges": len(_after) > 0 and all(_item.get("NoNewPrivs") == "1" for _item in _after),
    "all_after_capabilities_zero": len(_after) > 0 and all(all(int(_item.get(_name, "1"), 16) == 0 for _name in _cap_names) for _item in _after),
    "all_surviving_filter_counts_increased": len(_survivors) == len(_before) and len(_survivors) > 0 and all(int(_item.get("Seccomp_filters", "0")) > int(_before_by_tid[_item["tid"]].get("Seccomp_filters", "0")) for _item in _survivors),
    "new_thread_inherited": _inherited.get("Seccomp") == "2" and int(_inherited.get("Seccomp_filters", "0")) >= min(int(_item.get("Seccomp_filters", "0")) for _item in _after),
}
print("RC7_SECCOMP=" + _json.dumps(_evidence, sort_keys=True))
`;

const NEGATIVE_PROBES = String.raw`
import json as _json
import http.client as _http_client
import os as _os
import socket as _socket
import subprocess as _subprocess

def _capture(_fn):
    try:
        _fn()
        return {"denied": False, "error": None, "errno": None}
    except BaseException as _exc:
        _inner = getattr(_exc, "reason", None)
        _errno_value = getattr(_exc, "errno", None)
        if _errno_value is None and _inner is not None:
            _errno_value = getattr(_inner, "errno", None)
        return {"denied": True, "error": type(_exc).__name__, "errno": _errno_value}

_python_crud = "/rc7/output/python-crud.txt"
with open(_python_crud, "w", encoding="utf-8") as _handle:
    _handle.write("rc7")
with open(_python_crud, encoding="utf-8") as _handle:
    _crud_ok = _handle.read() == "rc7"
_os.unlink(_python_crud)

_results = {
    "subprocess": _capture(lambda: _subprocess.run(["/usr/local/bin/node", "--version"], check=True)),
    "tcp_socket": _capture(lambda: _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)),
    "udp_socket": _capture(lambda: _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)),
    "dns": _capture(lambda: _socket.getaddrinfo("rc7.invalid", 80)),
    "http": _capture(lambda: _http_client.HTTPConnection("192.0.2.1", 80, timeout=1).request("GET", "/")),
    "repository_read": _capture(lambda: open("/rc7/forbidden/repository/canary", encoding="utf-8")),
    "user_layer_read": _capture(lambda: open("/rc7/forbidden/user-layer/canary", encoding="utf-8")),
    "sibling_read": _capture(lambda: open("/rc7/forbidden/sibling/canary", encoding="utf-8")),
    "synthetic_credential_read": _capture(lambda: open("/rc7/forbidden/synthetic-credential/canary", encoding="utf-8")),
    "output_escape": _capture(lambda: open("/rc7/output/../escape", "w", encoding="utf-8")),
    "python_crud": {"passed": _crud_ok},
}
print("RC7_NEGATIVE=" + _json.dumps(_results, sort_keys=True))
`;

function parsePrefixed(stdout, prefix) {
  const line = stdout
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .findLast((value) => value.startsWith(prefix));
  if (!line) throw new Error(`Missing ${prefix} marker`);
  return line.slice(prefix.length);
}

async function runConformance() {
  const contractBytes = await readFile(path.join(INPUT_ROOT, "contract.json"));
  const contract = JSON.parse(contractBytes.toString("utf8"));
  const sourceBytes = await readFile(path.join(INPUT_ROOT, "source-pack.json"));
  if (sha256(sourceBytes) !== contract.source_pack_sha256) throw new Error("source pack digest mismatch");

  const nodeCrudPath = path.join(OUTPUT_ROOT, "node-crud.txt");
  await writeFile(nodeCrudPath, "rc7", { flag: "wx" });
  const nodeCrud = (await readFile(nodeCrudPath, "utf8")) === "rc7";
  await unlink(nodeCrudPath);
  const inputReadonly = await expectDenied(() => writeFile(path.join(INPUT_ROOT, "source-pack.json"), "x"));
  const escapeDenied = await expectDenied(() => writeFile("/rc7/escape", "x", { flag: "wx" }));
  const linkPath = path.join(OUTPUT_ROOT, "escape-link");
  await symlink("/rc7/escape-target", linkPath);
  const symlinkDenied = await expectDenied(() => writeFile(path.join(linkPath, "x"), "x", { flag: "wx" }));
  await unlink(linkPath);
  const dockerSocketAbsent = await expectDenied(() => access("/var/run/docker.sock"));
  const namedPipeAbsent = await expectDenied(() => access("/run/rc7-host-pipe"));

  const sessionRoot = path.join(OUTPUT_ROOT, "session");
  const tmpRoot = path.join(OUTPUT_ROOT, "tmp");
  const homeRoot = path.join(OUTPUT_ROOT, "home");
  const emptyPrime = path.join(OUTPUT_ROOT, "empty-prime");
  await Promise.all([
    mkdir(path.join(sessionRoot, "harness"), { recursive: true }),
    mkdir(path.join(OUTPUT_ROOT, "global-harness"), { recursive: true }),
    mkdir(tmpRoot, { recursive: true }),
    mkdir(homeRoot, { recursive: true }),
    mkdir(emptyPrime, { recursive: true }),
  ]);
  const pythonPath = "/opt/rc7/python/bin/python";
  const pythonSourcePath = [
    "/opt/rc7/component/vendor/prime-agent-runtime/src",
    "/opt/rc7/component/python/dsh-rlm-runtime/src",
  ].join(":");
  const kernelEnv = {
    PATH: "/opt/rc7/python/bin:/usr/local/bin:/usr/bin:/bin",
    PYTHONPATH: pythonSourcePath,
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    JUPYTER_PLATFORM_DIRS: "1",
    HOME: homeRoot,
    TMPDIR: tmpRoot,
    XDG_CACHE_HOME: path.join(OUTPUT_ROOT, "xdg-cache"),
    XDG_CONFIG_HOME: path.join(OUTPUT_ROOT, "xdg-config"),
    XDG_DATA_HOME: path.join(OUTPUT_ROOT, "xdg-data"),
    JUPYTER_CONFIG_DIR: path.join(OUTPUT_ROOT, "jupyter"),
    IPYTHONDIR: path.join(OUTPUT_ROOT, "ipython"),
    RLM_SESSION_DIR: sessionRoot,
    RLM_HARNESS_STATE_DIR: path.join(sessionRoot, "harness"),
    RLM_GLOBAL_HARNESS_STATE_DIR: path.join(OUTPUT_ROOT, "global-harness"),
    PRIME_AGENT_CODING_AGENT_DIR: emptyPrime,
    PI_CODING_AGENT_DIR: emptyPrime,
    RLM_DEPTH: "0",
    RLM_MAX_DEPTH: "0",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
  };
  const python = await resolveKernelPython({
    python: pythonPath,
    managedRuntimeRoot: path.join(OUTPUT_ROOT, "runtime-unused"),
    probeEnvironment: kernelEnv,
  });
  let hostRequestCount = 0;
  let kernel;
  kernel = new KernelManager({
    python,
    cwd: sessionRoot,
    env: kernelEnv,
    sessionId: "rc7-gate-b-provider-free",
    generation: 1,
    interruptGraceMs: 1_000,
    shutdownGraceMs: 2_000,
    hostRequestDrainMs: 1_000,
    isGenerationCurrent: () => true,
    dispatchHostRequest: () => {
      hostRequestCount += 1;
      return Promise.resolve({ status: "error", code: "GATE_B_NO_BROKER", error: "provider broker absent" });
    },
    onPhase: () => undefined,
  });
  await kernel.start();
  const connectionPath = kernel.connectionPath;
  if (!connectionPath) throw new Error("kernel connection path absent");
  const connection = JSON.parse(await readFile(connectionPath, "utf8"));
  const loopback = connection.ip === "127.0.0.1";
  const ports = ["shell_port", "iopub_port", "control_port", "stdin_port", "hb_port"].map((name) => connection[name]);
  const portsValid = ports.every((port) => Number.isSafeInteger(port) && port > 0);
  const hmacPresent = connection.signature_scheme === "hmac-sha256" && typeof connection.key === "string" && connection.key.length > 0;
  let bootstrap;
  let seccomp;
  let setValue;
  let computed;
  let negatives;
  try {
    bootstrap = await kernel.execute("from dsh_rlm_runtime import bootstrap; globals().update(bootstrap())", {
      maxOutputBytes: 65_536,
      internal: true,
    });
    seccomp = await kernel.execute(PHASE_TWO_SECCOMP, { maxOutputBytes: 65_536, internal: true });
    setValue = await kernel.execute("probe_value = 38", { maxOutputBytes: 65_536 });
    computed = await kernel.execute("probe_value + 4", { maxOutputBytes: 65_536 });
    negatives = await kernel.execute(NEGATIVE_PROBES, { maxOutputBytes: 131_072 });
  } finally {
    await kernel.dispose();
  }
  const connectionRemoved = await expectDenied(() => access(connectionPath));
  const seccompEvidence = JSON.parse(parsePrefixed(seccomp.stdout, "RC7_SECCOMP="));
  const negativeResults = JSON.parse(parsePrefixed(negatives.stdout, "RC7_NEGATIVE="));
  const deniedKeys = [
    "subprocess",
    "tcp_socket",
    "udp_socket",
    "dns",
    "http",
    "repository_read",
    "user_layer_read",
    "sibling_read",
    "synthetic_credential_read",
    "output_escape",
  ];
  const allDenied = deniedKeys.every((key) => negativeResults[key]?.denied === true);
  const outputEntries = (await readdir(OUTPUT_ROOT)).sort();

  const result = {
    schema_version: "rc7-gate-b-worker-result-v1",
    mode,
    input: {
      contract_sha256: sha256(contractBytes),
      source_pack_sha256: sha256(sourceBytes),
    },
    runtime: {
      node: process.version,
      python,
      worker_sha256: WORKER_SHA256,
      loopback,
      ports_valid: portsValid,
      hmac_present: hmacPresent,
      generation: computed.generation,
      phase_two_seccomp: seccompEvidence,
    },
    probes: {
      node_output_crud: nodeCrud,
      python_output_crud: negativeResults.python_crud?.passed === true,
      input_readonly: inputReadonly,
      root_escape_denied: escapeDenied,
      symlink_escape_denied: symlinkDenied,
      docker_socket_absent: dockerSocketAbsent,
      named_pipe_absent: namedPipeAbsent,
      connection_removed: connectionRemoved,
      negative_results: negativeResults,
    },
    execution: {
      bootstrap_status: bootstrap.status,
      seccomp_status: seccomp.status,
      set_status: setValue.status,
      compute_status: computed.status,
      compute_result: computed.result,
      negative_status: negatives.status,
      host_request_count: hostRequestCount,
    },
    output_entries_before_result: outputEntries,
    passed:
      nodeCrud &&
      inputReadonly.denied &&
      escapeDenied.denied &&
      symlinkDenied.denied &&
      dockerSocketAbsent.denied &&
      namedPipeAbsent.denied &&
      loopback &&
      portsValid &&
      hmacPresent &&
      seccompEvidence.flag === "SECCOMP_FILTER_FLAG_TSYNC" &&
      seccompEvidence.clone3_action === "ENOSYS-for-safe-clone-thread-fallback" &&
      seccompEvidence.all_after_seccomp_two === true &&
      seccompEvidence.all_after_no_new_privileges === true &&
      seccompEvidence.all_after_capabilities_zero === true &&
      seccompEvidence.all_surviving_filter_counts_increased === true &&
      seccompEvidence.new_thread_inherited === true &&
      bootstrap.status === "ok" &&
      seccomp.status === "ok" &&
      setValue.status === "ok" &&
      computed.status === "ok" &&
      computed.result === "42" &&
      negatives.status === "ok" &&
      allDenied &&
      negativeResults.python_crud?.passed === true &&
      hostRequestCount === 0 &&
      connectionRemoved.denied,
  };
  await writeResult(result);
}

await mkdir(OUTPUT_ROOT, { recursive: true });
if (mode === "conformance") await runConformance();
else if (mode === "pids") await runPidsProbe();
else if (mode === "file-size") await runFileSizeProbe();
else if (mode === "inodes") await runInodeProbe();
else if (mode === "bytes") await runByteProbe();
else if (mode === "memory") runMemoryProbe();
else if (mode === "cpu") runCpuProbe();
else throw new Error(`Unsupported Gate B worker mode: ${mode}`);
