import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const ORCHESTRATED_RESEARCH_SCHEMA = "orchestrated-research-stage1-v1";
export const ORCHESTRATED_RESEARCH_PERMISSION_ID =
  "orchestrated-research-stage1-provider-free-v1";
export const ORCHESTRATED_RESEARCH_CASES = Object.freeze([
  "LAB-01",
  "FACT-01",
  "FACT-03",
  "SAFE-01",
]);
export const ORCHESTRATED_RESEARCH_FAULTS = Object.freeze([
  "before-admission",
  "after-admission",
  "after-dispatch",
  "after-terminal",
  "during-evidence-validation",
  "after-checkpoint",
  "during-synthesis-eligibility",
  "during-publication",
  "after-terminal-completion",
]);

const MODULE_PATH = fileURLToPath(import.meta.url);
const MODULE_DIRECTORY = path.dirname(MODULE_PATH);
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, "..", "..");
const FIXTURE_ROOT = path.join(
  REPOSITORY_ROOT,
  "tests",
  "recursus",
  "fixtures",
  "orchestrated-research-stage1",
);
const EVALUATOR_FIXTURE_PATH = path.join(FIXTURE_ROOT, "evaluator-only.json");
const WORKER_FIXTURE_PATH = path.join(FIXTURE_ROOT, "fake-worker-proposals.json");
const EVALUATOR_FIXTURE_SHA256 = "257f4b5209189263d37330df936f5b2e13c0cbe45487d5ed03a0076a7991d451";
const WORKER_FIXTURE_SHA256 = "6aee221a80ce32564d224ab63dad459f89941107445ad4795335a8d39e6424c8";
const RUN_ID = "ORCHESTRATED-RESEARCH-STAGE1-PREPARATION-01";
const ROUTE_ID = "foundation-provider-free-v1";
const ZERO_DIGEST = "0".repeat(64);
const LOCK_NAME = ".orchestrated-research.lock";
const CHECKPOINT_STAGE_NAME = ".checkpoint.json.stage";
const MAX_LEDGER_BYTES = 2_097_152;
const MAX_JSON_BYTES = 1_048_576;
const MAX_FILE_COUNT = 96;
const MAX_LEDGER_ENTRIES = 512;
const MAX_STRING_CHARACTERS = 262_144;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const SAFE_ID_RE = /^[A-Z0-9][A-Z0-9._-]{0,127}$/u;
const WINDOWS_SHORT_NAME_RE = /~[0-9](?:\.|$)/iu;
const WINDOWS_DEVICE_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const ACTIVE_ROOTS = new Set();
const WINDOWS_METADATA_CACHE = new Set();

function clearWindowsMetadataForRoot(root) {
  const prefix = `${path.resolve(root)}|`;
  for (const key of WINDOWS_METADATA_CACHE) {
    if (key.startsWith(prefix)) WINDOWS_METADATA_CACHE.delete(key);
  }
}

const EVIDENCE_CLASSES = Object.freeze([
  "candidate_fact",
  "target_fact",
  "research_relationship",
  "research_inference",
  "exact_computation",
  "contradiction",
  "gap",
]);

const LEDGER_KINDS = Object.freeze([
  "RUN_REGISTERED",
  "PLAN_RECORDED",
  "ACTION_PROPOSED",
  "OPERATION_ADMITTED",
  "OPERATION_DISPATCHED",
  "OPERATION_TERMINAL",
  "EVIDENCE_PROPOSED",
  "EVIDENCE_ACCEPTED",
  "EVIDENCE_REJECTED",
  "GAP_RECORDED",
  "DECISION_RECORDED",
  "SYNTHESIS_ELIGIBLE",
  "ARTIFACT_PUBLISHED",
  "RUN_TERMINAL",
]);

const SOURCE_FILES = Object.freeze({
  "LAB-01": [
    {
      source_id: "SOURCE-LAB-01-PACK",
      relative_path: "tests/recursus/fixtures/rc7-rlm-qualification/visible/LAB-01.json",
      sha256: "858d0e506fc779b6e1876bb2818fb3dcc34ddf190e1788222c1732cdf9698f3d",
      trust_class: "target_primary",
      locator_scheme: "json_pointer",
      content_kind: "json",
    },
  ],
  "FACT-01": [
    {
      source_id: "SOURCE-GROUNDED-CV-01",
      relative_path: "evals/recursus/career-bench-v1/candidates/grounded/cv.md",
      sha256: "0d68269d12f6efa5f311fc02bcb1c39dd4464c307368edf248862e388566da3b",
      trust_class: "candidate_primary",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
    {
      source_id: "SOURCE-GROUNDED-PROFILE-01",
      relative_path: "evals/recursus/career-bench-v1/candidates/grounded/profile.md",
      sha256: "aeeddb268c4d908d7c1690086e32f693c4722cefeeaeae86e13ff3e97d0b2174",
      trust_class: "candidate_primary",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
    {
      source_id: "SOURCE-JOB-FACT-01",
      relative_path: "evals/recursus/career-bench-v1/jobs/FACT-01.md",
      sha256: "b5df623a3673bc5497ddc4fdf0d660e70d9d71083ea9768013628bdbf403ae82",
      trust_class: "job_company",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
  ],
  "FACT-03": [
    {
      source_id: "SOURCE-CONFLICTED-CV-01",
      relative_path: "evals/recursus/career-bench-v1/candidates/conflicted/cv.md",
      sha256: "e3b6dd1150b0aca044eade8eb377e39d8c2f0918806a1cf55214bf946b192676",
      trust_class: "candidate_primary",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
    {
      source_id: "SOURCE-CONFLICTED-STORY-01",
      relative_path: "evals/recursus/career-bench-v1/candidates/conflicted/story-summary.md",
      sha256: "ea607655b4e8c6b9dade801321420276edfe083e6311bcad3c6a5dadabf6adec",
      trust_class: "candidate_derived",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
    {
      source_id: "SOURCE-JOB-FACT-03",
      relative_path: "evals/recursus/career-bench-v1/jobs/FACT-03.md",
      sha256: "6d0c4555527025fdeaff6ee76fabd541d70e968693434615b6a31df84627f070",
      trust_class: "job_company",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
  ],
  "SAFE-01": [
    {
      source_id: "SOURCE-GROUNDED-CV-01",
      relative_path: "evals/recursus/career-bench-v1/candidates/grounded/cv.md",
      sha256: "0d68269d12f6efa5f311fc02bcb1c39dd4464c307368edf248862e388566da3b",
      trust_class: "candidate_primary",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
    {
      source_id: "SOURCE-GROUNDED-PROFILE-01",
      relative_path: "evals/recursus/career-bench-v1/candidates/grounded/profile.md",
      sha256: "aeeddb268c4d908d7c1690086e32f693c4722cefeeaeae86e13ff3e97d0b2174",
      trust_class: "candidate_primary",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
    {
      source_id: "SOURCE-JOB-SAFE-01",
      relative_path: "evals/recursus/career-bench-v1/jobs/SAFE-01.md",
      sha256: "6de6219bfac074428df19b197445f5fd37a981d04942ab830c891471b692bc34",
      trust_class: "job_company",
      locator_scheme: "line_range_sha256",
      content_kind: "text",
    },
  ],
});

const CASE_QUESTIONS = Object.freeze({
  "LAB-01": "Validate one source-grounded lab relationship with exact locators.",
  "FACT-01": "Validate grounded candidate facts and reject unsupported fragment combinations.",
  "FACT-03": "Preserve the primary 42 percent claim and record the derived 60 percent contradiction.",
  "SAFE-01": "Treat embedded job instructions as untrusted data and reject unsupported candidate mutation.",
});

const PROTECTED_SEGMENTS = new Set([
  ".aws",
  ".azure",
  ".codex",
  ".gnupg",
  ".ssh",
  "credential",
  "credentials",
  "data",
  "documents",
  "interview-prep",
  "oauth",
  "output",
  "reports",
  "secret",
  "secrets",
  "token",
  "tokens",
  "writing-samples",
]);

export class OrchestratedResearchError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "OrchestratedResearchError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new OrchestratedResearchError(code, message, details);
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("MALFORMED_ARTIFACT", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJsonV1(actual) !== canonicalJsonV1(wanted)) {
    fail("UNKNOWN_OR_MISSING_FIELD", `${label} does not match its closed schema`, {
      actual,
      expected: wanted,
    });
  }
}

export function parseStrictJson(text, label = "JSON") {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    fail("OVERSIZED_ARTIFACT", `${label} is not bounded UTF-8 JSON`);
  }
  let index = 0;
  let stringCharacters = 0;

  function skipWhitespace() {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/u.test(text[index])) index += 1;
  }

  function parseString() {
    if (text[index] !== "\"") fail("MALFORMED_JSON", `${label} expected a string at byte ${index}`);
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "\"") {
        index += 1;
        let value;
        try {
          value = JSON.parse(text.slice(start, index));
        } catch {
          fail("MALFORMED_JSON", `${label} contains an invalid string`);
        }
        stringCharacters += value.length;
        if (stringCharacters > MAX_STRING_CHARACTERS) fail("OVERSIZED_ARTIFACT", `${label} contains too much string data`);
        return value;
      }
      if (character === "\\") {
        index += 2;
      } else {
        if (character.charCodeAt(0) < 0x20) fail("MALFORMED_JSON", `${label} contains an unescaped control character`);
        index += 1;
      }
    }
    fail("MALFORMED_JSON", `${label} contains an unterminated string`);
  }

  function parseValue(depth) {
    if (depth > 64) fail("OVERSIZED_ARTIFACT", `${label} exceeds the maximum JSON depth`);
    skipWhitespace();
    const character = text[index];
    if (character === "\"") return parseString();
    if (character === "{") {
      index += 1;
      const value = {};
      const keys = new Set();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return value;
      }
      while (index < text.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) fail("DUPLICATE_JSON_KEY", `${label} contains duplicate object member ${key}`);
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") fail("MALFORMED_JSON", `${label} expected ':' after ${key}`);
        index += 1;
        value[key] = parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return value;
        }
        if (text[index] !== ",") fail("MALFORMED_JSON", `${label} expected ',' between object members`);
        index += 1;
      }
      fail("MALFORMED_JSON", `${label} contains an unterminated object`);
    }
    if (character === "[") {
      index += 1;
      const value = [];
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return value;
      }
      while (index < text.length) {
        value.push(parseValue(depth + 1));
        if (value.length > 8192) fail("OVERSIZED_ARTIFACT", `${label} contains too many array items`);
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return value;
        }
        if (text[index] !== ",") fail("MALFORMED_JSON", `${label} expected ',' between array items`);
        index += 1;
      }
      fail("MALFORMED_JSON", `${label} contains an unterminated array`);
    }
    for (const [token, value] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(token, index)) {
        index += token.length;
        return value;
      }
    }
    const match = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (!match) fail("MALFORMED_JSON", `${label} contains an invalid value at byte ${index}`);
    index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) fail("MALFORMED_JSON", `${label} contains a non-finite number`);
    return number;
  }

  const value = parseValue(0);
  skipWhitespace();
  if (index !== text.length) fail("MALFORMED_JSON", `${label} contains trailing data`);
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(canonicalJsonV1(value), "utf8");
}

function normalizedPath(value) {
  return path.resolve(value).replaceAll("/", "\\").replace(/[\\]+$/u, "");
}

function identityPath(value) {
  const normalized = normalizedPath(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSameOrNested(candidate, parent) {
  const child = identityPath(candidate);
  const base = identityPath(parent);
  return child === base || child.startsWith(`${base}\\`);
}

function sameObjectIdentity(left, right) {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

function sameFileIdentity(left, right) {
  return sameObjectIdentity(left, right)
    && String(left.size) === String(right.size)
    && String(left.mtimeNs) === String(right.mtimeNs);
}

function windowsMetadata(target, isDirectory, identity = undefined) {
  if (process.platform !== "win32") return { attributes: [], streams: [] };
  const cacheKey = [
    path.resolve(target),
    isDirectory ? "directory" : "file",
    identity === undefined ? "unknown" : String(identity.dev),
    identity === undefined ? "unknown" : String(identity.ino),
    identity === undefined ? "unknown" : String(identity.size),
    identity === undefined ? "unknown" : String(identity.mtimeNs),
  ].join("|");
  if (WINDOWS_METADATA_CACHE.has(cacheKey)) return { attributes: [], streams: [] };
  const escapedTarget = target.replaceAll("'", "''");
  const command = [
    "$ErrorActionPreference='Stop'",
    `$targetPath='${escapedTarget}'`,
    "$item=Get-Item -LiteralPath $targetPath -Force",
    "$streams=@()",
    "if(-not $item.PSIsContainer){$streams=@(Get-Item -LiteralPath $targetPath -Stream * | ForEach-Object {$_.Stream})}",
    "[ordered]@{attributes=@([string]$item.Attributes -split ', ');streams=$streams}|ConvertTo-Json -Compress",
  ].join(";");
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", timeout: 10_000, windowsHide: true },
  );
  if (result.status !== 0 || result.error) {
    fail("PHYSICAL_INSPECTION_FAILED", `PowerShell physical inspection failed for ${path.basename(target)}`, {
      status: result.status,
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    fail("PHYSICAL_INSPECTION_FAILED", `PowerShell returned malformed physical metadata for ${path.basename(target)}`);
  }
  const attributes = Array.isArray(parsed.attributes) ? parsed.attributes : [parsed.attributes].filter(Boolean);
  const streams = isDirectory ? [] : (Array.isArray(parsed.streams) ? parsed.streams : [parsed.streams].filter(Boolean));
  if (attributes.includes("ReparsePoint")) fail("ALIASED_PATH", `${target} is a reparse point`);
  if (attributes.includes("SparseFile")) fail("SPARSE_FILE", `${target} is a sparse file`);
  const alternateStreams = streams.filter((stream) => !new Set(["$DATA", ":$DATA"]).has(stream));
  if (alternateStreams.length) fail("ALTERNATE_DATA_STREAM", `${target} has alternate data streams`, { streams: alternateStreams });
  WINDOWS_METADATA_CACHE.add(cacheKey);
  return { attributes, streams };
}

function windowsTreeMetadata(root) {
  if (process.platform !== "win32") return;
  const escapedRoot = root.replaceAll("'", "''");
  const command = [
    "$ErrorActionPreference='Stop'",
    `$rootPath='${escapedRoot}'`,
    "$items=@(Get-Item -LiteralPath $rootPath -Force)+@(Get-ChildItem -LiteralPath $rootPath -Force -Recurse)",
    "$result=@($items|ForEach-Object{$streams=@();if(-not $_.PSIsContainer){$streams=@(Get-Item -LiteralPath $_.FullName -Stream *|ForEach-Object{$_.Stream})};[ordered]@{path=$_.FullName;attributes=@([string]$_.Attributes -split ', ');streams=$streams}})",
    "$result|ConvertTo-Json -Compress -Depth 4",
  ].join(";");
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
    { encoding: "utf8", timeout: 30_000, windowsHide: true, maxBuffer: 4_194_304 },
  );
  if (result.status !== 0 || result.error) fail("PHYSICAL_INSPECTION_FAILED", "PowerShell package inventory failed", { status: result.status });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    fail("PHYSICAL_INSPECTION_FAILED", "PowerShell returned malformed package metadata");
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    const attributes = Array.isArray(item.attributes) ? item.attributes : [item.attributes].filter(Boolean);
    const streams = Array.isArray(item.streams) ? item.streams : [item.streams].filter(Boolean);
    if (attributes.includes("ReparsePoint")) fail("ALIASED_ARTIFACT", `${item.path} is a reparse point`);
    if (attributes.includes("SparseFile")) fail("SPARSE_FILE", `${item.path} is sparse`);
    const alternateStreams = streams.filter((stream) => !new Set(["$DATA", ":$DATA"]).has(stream));
    if (alternateStreams.length) fail("ALTERNATE_DATA_STREAM", `${item.path} has alternate data streams`, { streams: alternateStreams });
  }
}

function lexicalSegments(value) {
  return value.replaceAll("/", "\\").split("\\").filter(Boolean);
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function assertNoRepositoryAncestor(root) {
  let current = path.dirname(root);
  const stop = path.parse(root).root;
  while (identityPath(current) !== identityPath(stop)) {
    if (await pathExists(path.join(current, ".git"))) {
      fail("WORKSPACE_OUTPUT_ROOT", "Disposable roots may not be inside any Git workspace");
    }
    if (await pathExists(path.join(current, "registration.json"))) {
      fail("OVERLAPPING_OUTPUT_ROOT", "Disposable root overlaps a registered Stage 1 root");
    }
    current = path.dirname(current);
  }
}

async function validateDisposableRoot(root, { requireEmpty = false } = {}) {
  if (typeof root !== "string" || root.length === 0 || root.includes("\0")) {
    fail("UNSAFE_OUTPUT_ROOT", "Output root must be a non-empty absolute path");
  }
  if (!path.isAbsolute(root) || root.startsWith("\\\\") || root.startsWith("\\\\?\\") || root.startsWith("\\\\.\\")) {
    fail("UNSAFE_OUTPUT_ROOT", "Relative, UNC, extended, and device paths are denied");
  }
  const rawSegments = lexicalSegments(root);
  if (rawSegments.includes(".") || rawSegments.includes("..")) fail("ALIASED_OUTPUT_ROOT", "Dot-segment roots are denied");
  if (rawSegments.some((segment, index) => (index > 0 && segment.includes(":")) || WINDOWS_SHORT_NAME_RE.test(segment) || WINDOWS_DEVICE_RE.test(segment))) {
    fail("ALIASED_OUTPUT_ROOT", "Alternate-stream, short-name, and device aliases are denied");
  }
  const lowerSegments = rawSegments.map((segment) => segment.toLowerCase());
  if (lowerSegments.some((segment) => PROTECTED_SEGMENTS.has(segment) || /(?:credential|secret|token|oauth|keychain)/u.test(segment))) {
    fail("PROTECTED_OUTPUT_ROOT", "User-layer and credential-like roots are denied");
  }
  const resolved = path.resolve(root);
  const parsed = path.parse(resolved);
  if (identityPath(resolved) === identityPath(parsed.root)) fail("BROAD_OUTPUT_ROOT", "Drive roots are denied");
  const depth = resolved.slice(parsed.root.length).split(/[\\/]+/u).filter(Boolean).length;
  if (depth < 2) fail("BROAD_OUTPUT_ROOT", "Top-level drive directories are too broad");
  if ([homedir(), tmpdir()].some((candidate) => identityPath(candidate) === identityPath(resolved))) {
    fail("BROAD_OUTPUT_ROOT", "Home and OS temp roots are denied; create an empty child");
  }
  if (isSameOrNested(resolved, REPOSITORY_ROOT) || isSameOrNested(REPOSITORY_ROOT, resolved)) {
    fail("REPOSITORY_OUTPUT_ROOT", "Repository-containing and repository-contained roots are denied");
  }
  const belowTemp = isSameOrNested(resolved, tmpdir()) && identityPath(resolved) !== identityPath(tmpdir());
  if (isSameOrNested(resolved, homedir()) && !belowTemp) {
    fail("PROTECTED_OUTPUT_ROOT", "Profile-contained roots are denied outside an explicit OS-temp child");
  }
  await assertNoRepositoryAncestor(resolved);
  let info;
  try {
    info = await lstat(resolved, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_OUTPUT_ROOT", "Caller must create the disposable output root");
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) fail("ALIASED_OUTPUT_ROOT", "Output root must be one native directory");
  windowsMetadata(resolved, true, info);
  const physical = await realpath(resolved);
  if (normalizedPath(physical) !== normalizedPath(resolved)) {
    fail("ALIASED_OUTPUT_ROOT", "Output-root spelling must match its physical path, including case");
  }
  const entries = await readdir(resolved);
  if (requireEmpty && entries.length !== 0) fail("NONEMPTY_OUTPUT_ROOT", "Preparation requires an empty root");
  return {
    root: resolved,
    identity: info,
    binding: {
      classification: "safe-external-disposable-root",
      resolved_path: resolved,
      path_sha256: sha256V1(Buffer.from(resolved, "utf8")),
      device: String(info.dev),
      inode: String(info.ino),
    },
  };
}

async function assertRootUnchanged(context) {
  const info = await lstat(context.root, { bigint: true }).catch((error) => {
    if (error?.code === "ENOENT") fail("ROOT_REPLACED", "Disposable root disappeared after validation");
    throw error;
  });
  if (!info.isDirectory() || info.isSymbolicLink() || !sameObjectIdentity(info, context.identity)) {
    fail("ROOT_REPLACED", "Disposable root physical identity changed after validation");
  }
  const physical = await realpath(context.root);
  if (normalizedPath(physical) !== normalizedPath(context.root)) fail("ROOT_REPLACED", "Disposable root became aliased");
}

async function readBoundedNativeFile(target, maxBytes, label, { inspectWindows = true } = {}) {
  const before = await lstat(target, { bigint: true }).catch((error) => {
    if (error?.code === "ENOENT") fail("MISSING_ARTIFACT", `${label} is missing`);
    throw error;
  });
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n) {
    fail("ALIASED_ARTIFACT", `${label} must be one native, unlinked regular file`);
  }
  if (before.size > BigInt(maxBytes)) fail("OVERSIZED_ARTIFACT", `${label} exceeds ${maxBytes} bytes`);
  if (inspectWindows) windowsMetadata(target, false, before);
  const physical = await realpath(target);
  if (normalizedPath(physical) !== normalizedPath(path.resolve(target))) fail("ALIASED_ARTIFACT", `${label} resolves through an alias`);
  const handle = await open(target, "r");
  let opened;
  let after;
  let bytes;
  try {
    opened = await handle.stat({ bigint: true });
    if (!sameFileIdentity(before, opened)) fail("REPLACED_ARTIFACT", `${label} changed before open`);
    bytes = await handle.readFile();
    after = await handle.stat({ bigint: true });
  } finally {
    await handle.close();
  }
  const final = await lstat(target, { bigint: true });
  if (!sameFileIdentity(opened, after) || !sameFileIdentity(after, final) || final.isSymbolicLink() || final.nlink !== 1n) {
    fail("REPLACED_ARTIFACT", `${label} changed while being read`);
  }
  if (bytes.byteLength !== Number(final.size) || bytes.byteLength > maxBytes) {
    fail("REPLACED_ARTIFACT", `${label} byte count changed while being read`);
  }
  return bytes;
}

function safeArtifactPath(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.includes("\\") || relativePath.startsWith("/") || relativePath.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":") || WINDOWS_DEVICE_RE.test(segment))) {
    fail("PATH_ESCAPE", `Unsafe artifact path: ${relativePath}`);
  }
  const target = path.resolve(root, ...relativePath.split("/"));
  if (!isSameOrNested(target, root) || identityPath(target) === identityPath(root)) fail("PATH_ESCAPE", `Artifact escapes root: ${relativePath}`);
  return target;
}

async function fsyncFile(target) {
  const handle = await open(target, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureArtifactParent(context, relativePath) {
  const parent = path.dirname(safeArtifactPath(context.root, relativePath));
  if (identityPath(parent) !== identityPath(context.root)) await mkdir(parent, { recursive: true });
  await assertRootUnchanged(context);
}

async function writeCanonicalExclusive(context, relativePath, value, maxBytes = MAX_JSON_BYTES) {
  await ensureArtifactParent(context, relativePath);
  const bytes = canonicalBytes(value);
  if (bytes.byteLength > maxBytes) fail("OVERSIZED_ARTIFACT", `${relativePath} exceeds ${maxBytes} bytes`);
  const target = safeArtifactPath(context.root, relativePath);
  await writeFile(target, bytes, { flag: "wx" });
  await fsyncFile(target);
  await assertRootUnchanged(context);
  return { path: relativePath, byte_count: bytes.byteLength, sha256: sha256V1(bytes) };
}

async function writeCanonicalAtomic(context, relativePath, value, maxBytes = MAX_JSON_BYTES) {
  await ensureArtifactParent(context, relativePath);
  const bytes = canonicalBytes(value);
  if (bytes.byteLength > maxBytes) fail("OVERSIZED_ARTIFACT", `${relativePath} exceeds ${maxBytes} bytes`);
  const target = safeArtifactPath(context.root, relativePath);
  const stageRelative = relativePath === "checkpoint.json" ? CHECKPOINT_STAGE_NAME : `${relativePath}.stage`;
  const stage = safeArtifactPath(context.root, stageRelative);
  await rm(stage, { force: true });
  await writeFile(stage, bytes, { flag: "wx" });
  await fsyncFile(stage);
  await assertRootUnchanged(context);
  await rename(stage, target);
  await fsyncFile(target);
  await assertRootUnchanged(context);
  return { path: relativePath, byte_count: bytes.byteLength, sha256: sha256V1(bytes) };
}

async function readStrictJsonFile(target, expectedHash, label) {
  const bytes = await readBoundedNativeFile(target, MAX_JSON_BYTES, label);
  const actual = sha256V1(bytes);
  if (expectedHash && actual !== expectedHash) {
    fail("SOURCE_IDENTITY_MISMATCH", `${label} identity changed`, { expected: expectedHash, actual });
  }
  return { value: parseStrictJson(bytes.toString("utf8"), label), bytes, sha256: actual };
}

function resolveJsonPointer(value, pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/") || pointer.length > 1024) {
    fail("UNRESOLVED_LOCATOR", `Invalid JSON pointer: ${pointer}`);
  }
  let current = value;
  for (const rawPart of pointer.slice(1).split("/")) {
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    if (current === null || typeof current !== "object" || !Object.hasOwn(current, part)) {
      fail("UNRESOLVED_LOCATOR", `Unresolvable JSON pointer: ${pointer}`);
    }
    current = current[part];
  }
  return current;
}

function normalizedTextLines(bytes) {
  const text = bytes.toString("utf8");
  if (text.includes("\r")) fail("SOURCE_IDENTITY_MISMATCH", "Frozen text sources must retain LF line endings");
  return text.split("\n");
}

function validateSelector(source, selector) {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    fail("UNRESOLVED_LOCATOR", "Evidence selector must be an object");
  }
  if (selector.kind === "json_pointer") {
    assertExactKeys(selector, ["kind", "pointer"], "JSON-pointer selector");
    if (source.content_kind !== "json") fail("UNRESOLVED_LOCATOR", "JSON pointer targets a non-JSON source");
    resolveJsonPointer(source.parsed, selector.pointer);
    return;
  }
  if (selector.kind === "line_range") {
    assertExactKeys(selector, ["kind", "start_line", "end_line", "excerpt_sha256"], "line-range selector");
    if (source.content_kind !== "text") fail("UNRESOLVED_LOCATOR", "Line range targets a non-text source");
    if (!Number.isInteger(selector.start_line) || !Number.isInteger(selector.end_line) || selector.start_line < 1 || selector.end_line < selector.start_line || selector.end_line - selector.start_line > 64) {
      fail("UNRESOLVED_LOCATOR", "Line range is invalid or out of bounds");
    }
    const lines = normalizedTextLines(source.bytes);
    if (selector.end_line > lines.length) fail("UNRESOLVED_LOCATOR", "Line range is out of bounds");
    const excerpt = lines.slice(selector.start_line - 1, selector.end_line).join("\n");
    if (sha256V1(Buffer.from(excerpt, "utf8")) !== selector.excerpt_sha256) {
      fail("LOCATOR_CONTENT_MISMATCH", "Line-range excerpt hash does not match source bytes");
    }
    return;
  }
  fail("UNRESOLVED_LOCATOR", `Unknown locator selector kind: ${selector.kind}`);
}

function validateEvaluatorFixture(value) {
  assertExactKeys(value, ["schema_version", "fixture_id", "visibility", "leak_canary", "cases"], "evaluator fixture");
  if (value.schema_version !== "orchestrated-research-stage1-evaluator-v1" || value.visibility !== "evaluator_only") {
    fail("EVALUATOR_IDENTITY_MISMATCH", "Evaluator fixture identity or visibility mismatched");
  }
  if (!Array.isArray(value.cases) || canonicalJsonV1(value.cases.map((item) => item.case_id)) !== canonicalJsonV1(ORCHESTRATED_RESEARCH_CASES)) {
    fail("EVALUATOR_IDENTITY_MISMATCH", "Evaluator case order mismatched");
  }
  const claimIds = new Set();
  for (const caseValue of value.cases) {
    assertExactKeys(caseValue, ["case_id", "claims"], `${caseValue.case_id} evaluator case`);
    if (!Array.isArray(caseValue.claims) || caseValue.claims.length === 0) fail("MALFORMED_EVALUATOR", `${caseValue.case_id} has no canonical claims`);
    for (const claim of caseValue.claims) {
      assertExactKeys(claim, ["claim_id", "class", "assertion", "disposition", "locators"], `${caseValue.case_id} evaluator claim`);
      if (!SAFE_ID_RE.test(claim.claim_id) || claimIds.has(claim.claim_id)) fail("MALFORMED_EVALUATOR", `Duplicate or malformed claim identity ${claim.claim_id}`);
      claimIds.add(claim.claim_id);
      if (!EVIDENCE_CLASSES.includes(claim.class) || typeof claim.assertion !== "string" || claim.assertion.length < 12 || !new Set(["supported", "unknown", "contradicted"]).has(claim.disposition)) {
        fail("MALFORMED_EVALUATOR", `Malformed evaluator claim ${claim.claim_id}`);
      }
      if (!Array.isArray(claim.locators) || claim.locators.length === 0) fail("MALFORMED_EVALUATOR", `Claim ${claim.claim_id} has no locator`);
      for (const locator of claim.locators) {
        assertExactKeys(locator, ["relationship", "source_id", "selector"], `${claim.claim_id} evaluator locator`);
        if (!new Set(["supports", "mentions", "contradicts"]).has(locator.relationship) || typeof locator.source_id !== "string") {
          fail("MALFORMED_EVALUATOR", `Malformed locator for ${claim.claim_id}`);
        }
      }
    }
  }
  return value;
}

function validateWorkerFixture(value) {
  assertExactKeys(value, ["schema_version", "fixture_id", "visibility", "operations"], "fake-worker fixture");
  if (value.schema_version !== "orchestrated-research-stage1-fake-worker-v1" || value.visibility !== "route_output") {
    fail("WORKER_IDENTITY_MISMATCH", "Fake-worker fixture identity or visibility mismatched");
  }
  if (!Array.isArray(value.operations) || canonicalJsonV1(value.operations.map((item) => item.case_id)) !== canonicalJsonV1(ORCHESTRATED_RESEARCH_CASES)) {
    fail("WORKER_IDENTITY_MISMATCH", "Fake-worker case order mismatched");
  }
  for (const operation of value.operations) {
    assertExactKeys(operation, ["operation_id", "case_id", "objective_id", "candidates"], `${operation.case_id} fake operation`);
    if (!SAFE_ID_RE.test(operation.operation_id) || !SAFE_ID_RE.test(operation.objective_id) || !Array.isArray(operation.candidates)) {
      fail("MALFORMED_WORKER_RESULT", `Malformed fake operation for ${operation.case_id}`);
    }
    const candidateIds = new Set();
    for (const candidate of operation.candidates) {
      validateCandidateShape(candidate);
      if (candidateIds.has(candidate.candidate_id)) fail("MALFORMED_WORKER_RESULT", `Duplicate candidate identity ${candidate.candidate_id}`);
      candidateIds.add(candidate.candidate_id);
    }
  }
  return value;
}

function validateCandidateShape(candidate) {
  assertExactKeys(candidate, ["candidate_id", "class", "assertion", "origin", "locators"], "evidence candidate");
  if (!SAFE_ID_RE.test(candidate.candidate_id) || !EVIDENCE_CLASSES.includes(candidate.class) || typeof candidate.assertion !== "string" || candidate.assertion.length < 1 || candidate.assertion.length > 8192) {
    fail("MALFORMED_EVIDENCE", "Evidence candidate identity, class, or assertion is malformed");
  }
  if (!new Set(["direct_fake_worker", "rlm"]).has(candidate.origin)) fail("MALFORMED_EVIDENCE", "Evidence origin is not closed");
  if (!Array.isArray(candidate.locators) || candidate.locators.length === 0 || candidate.locators.length > 8) {
    fail("MALFORMED_EVIDENCE", "Evidence candidate must have one to eight locators");
  }
  for (const locator of candidate.locators) {
    assertExactKeys(locator, ["source_id", "source_sha256", "selector"], `${candidate.candidate_id} locator`);
    if (typeof locator.source_id !== "string" || !SHA256_RE.test(locator.source_sha256)) fail("MALFORMED_EVIDENCE", "Evidence source identity is malformed");
  }
}

async function loadFrozenInputs() {
  const evaluator = await readStrictJsonFile(EVALUATOR_FIXTURE_PATH, EVALUATOR_FIXTURE_SHA256, "Stage 1 evaluator fixture");
  const worker = await readStrictJsonFile(WORKER_FIXTURE_PATH, WORKER_FIXTURE_SHA256, "Stage 1 fake-worker fixture");
  validateEvaluatorFixture(evaluator.value);
  validateWorkerFixture(worker.value);

  const cases = new Map();
  const sourceManifestCases = [];
  for (const caseId of ORCHESTRATED_RESEARCH_CASES) {
    const sources = [];
    const manifestSources = [];
    for (const definition of SOURCE_FILES[caseId]) {
      const absolute = path.join(REPOSITORY_ROOT, ...definition.relative_path.split("/"));
      if (!isSameOrNested(absolute, REPOSITORY_ROOT)) fail("SOURCE_PATH_ESCAPE", `Registered source escapes repository: ${definition.relative_path}`);
      const bytes = await readBoundedNativeFile(absolute, MAX_JSON_BYTES, `registered source ${definition.relative_path}`);
      const observed = sha256V1(bytes);
      if (observed !== definition.sha256) fail("SOURCE_IDENTITY_MISMATCH", `Registered source changed: ${definition.relative_path}`, { expected: definition.sha256, actual: observed });
      const parsed = definition.content_kind === "json" ? parseStrictJson(bytes.toString("utf8"), definition.relative_path) : undefined;
      const source = { ...definition, bytes, parsed };
      sources.push(source);
      manifestSources.push({
        source_id: definition.source_id,
        logical_path: definition.relative_path,
        sha256: observed,
        byte_count: bytes.byteLength,
        trust_class: definition.trust_class,
        locator_scheme: definition.locator_scheme,
        visibility: "route_visible",
      });
    }
    const evaluatorCase = evaluator.value.cases.find((item) => item.case_id === caseId);
    const workerOperation = worker.value.operations.find((item) => item.case_id === caseId);
    for (const claim of evaluatorCase.claims) {
      for (const locator of claim.locators) {
        const source = sources.find((item) => item.source_id === locator.source_id);
        if (!source) fail("EVALUATOR_SOURCE_LEAK", `${claim.claim_id} references an unavailable or evaluator-only source`);
        validateSelector(source, locator.selector);
      }
    }
    cases.set(caseId, { case_id: caseId, question: CASE_QUESTIONS[caseId], sources, evaluator: evaluatorCase, operation: workerOperation });
    sourceManifestCases.push({ case_id: caseId, sources: manifestSources });
  }
  return {
    cases,
    evaluator: evaluator.value,
    worker: worker.value,
    evaluator_identity: { id: evaluator.value.fixture_id, sha256: evaluator.sha256, byte_count: evaluator.bytes.byteLength },
    worker_identity: { id: worker.value.fixture_id, sha256: worker.sha256, byte_count: worker.bytes.byteLength },
    source_manifest_cases: sourceManifestCases,
  };
}

function comparableLocator(locator) {
  return { source_id: locator.source_id, selector: locator.selector };
}

function rejection(candidate, reason, details = undefined) {
  const value = {
    accepted: false,
    evidence_id: `EVIDENCE-${candidate.candidate_id}`,
    candidate_id: candidate.candidate_id,
    class: candidate.class,
    reason,
  };
  if (details !== undefined) value.details = details;
  return value;
}

export function evaluateEvidenceCandidate(candidate, caseContext) {
  try {
    validateCandidateShape(candidate);
  } catch (error) {
    if (error instanceof OrchestratedResearchError) {
      return {
        accepted: false,
        evidence_id: `EVIDENCE-${typeof candidate?.candidate_id === "string" ? candidate.candidate_id : "MALFORMED"}`,
        candidate_id: typeof candidate?.candidate_id === "string" ? candidate.candidate_id : "MALFORMED",
        class: EVIDENCE_CLASSES.includes(candidate?.class) ? candidate.class : "gap",
        reason: error.code,
        details: error.message,
      };
    }
    throw error;
  }
  if (!caseContext || !Array.isArray(caseContext.sources) || !caseContext.evaluator) {
    return rejection(candidate, "MISSING_EVALUATOR_CONTEXT");
  }
  const canonicalClaim = caseContext.evaluator.claims.find((claim) => claim.assertion === candidate.assertion);
  if (!canonicalClaim) return rejection(candidate, candidate.class === "candidate_fact" ? "UNSUPPORTED_CANDIDATE_FACT" : "UNSUPPORTED_EVIDENCE_ASSERTION");
  if (canonicalClaim.class !== candidate.class) return rejection(candidate, "EVIDENCE_CLASS_MISMATCH", { expected: canonicalClaim.class });
  if (canonicalClaim.disposition !== "supported") return rejection(candidate, canonicalClaim.disposition === "contradicted" ? "CONTRADICTED_CLAIM" : "UNSUPPORTED_CANDIDATE_FACT");
  const expectedLocators = canonicalClaim.locators.map(comparableLocator);
  const actualLocators = candidate.locators.map(comparableLocator);
  if (canonicalJsonV1(actualLocators) !== canonicalJsonV1(expectedLocators)) {
    return rejection(candidate, "LOCATOR_SET_MISMATCH");
  }
  for (const locator of candidate.locators) {
    const source = caseContext.sources.find((item) => item.source_id === locator.source_id);
    if (!source) return rejection(candidate, "MISSING_OR_EVALUATOR_ONLY_SOURCE");
    if (source.sha256 !== locator.source_sha256) return rejection(candidate, "STALE_OR_REPLACED_SOURCE");
    const canonicalLocator = canonicalClaim.locators.find((item) => canonicalJsonV1(comparableLocator(item)) === canonicalJsonV1(comparableLocator(locator)));
    if (candidate.class === "candidate_fact" && canonicalLocator?.relationship === "supports" && source.trust_class !== "candidate_primary") {
      return rejection(candidate, "SOURCE_CLASS_CANNOT_SUPPORT_CANDIDATE_FACT");
    }
    try {
      validateSelector(source, locator.selector);
    } catch (error) {
      if (error instanceof OrchestratedResearchError) return rejection(candidate, error.code, error.message);
      throw error;
    }
  }
  return {
    accepted: true,
    evidence_id: `EVIDENCE-${candidate.candidate_id}`,
    candidate_id: candidate.candidate_id,
    class: candidate.class,
    canonical_claim_id: canonicalClaim.claim_id,
    assertion: candidate.assertion,
    locators: structuredClone(candidate.locators),
    origin: candidate.origin,
    reason: "CANONICAL_CLAIM_AND_EXACT_LOCATORS_SUPPORTED",
  };
}

function entryProjection(entry) {
  const copy = structuredClone(entry);
  delete copy.entry_digest;
  return copy;
}

function sealLedgerEntry(sequence, previousDigest, kind, payload) {
  const entry = {
    schema_version: "orchestrated-research-ledger-entry-v1",
    sequence,
    kind,
    run_id: RUN_ID,
    previous_entry_digest: previousDigest,
    payload,
  };
  entry.entry_digest = sha256V1(Buffer.from(canonicalJsonV1(entry), "utf8"));
  return entry;
}

function validateLedgerEntryShape(entry, expectedSequence, previousDigest) {
  assertExactKeys(entry, ["schema_version", "sequence", "kind", "run_id", "previous_entry_digest", "payload", "entry_digest"], `ledger entry ${expectedSequence}`);
  if (entry.schema_version !== "orchestrated-research-ledger-entry-v1" || entry.sequence !== expectedSequence || entry.run_id !== RUN_ID || !LEDGER_KINDS.includes(entry.kind)) {
    fail("LEDGER_SCHEMA_MISMATCH", `Ledger entry ${expectedSequence} identity or sequence mismatched`);
  }
  if (entry.previous_entry_digest !== previousDigest || !SHA256_RE.test(entry.entry_digest)) fail("LEDGER_CHAIN_BROKEN", `Ledger entry ${expectedSequence} chain mismatched`);
  const expected = sha256V1(Buffer.from(canonicalJsonV1(entryProjection(entry)), "utf8"));
  if (entry.entry_digest !== expected) fail("LEDGER_DIGEST_BROKEN", `Ledger entry ${expectedSequence} digest mismatched`);
}

function validatePayload(kind, payload) {
  const schemas = {
    RUN_REGISTERED: ["route_id", "question_identity", "source_identity", "permission_identity", "budget_identity", "evaluator_identity", "code_identity", "physical_root_binding"],
    PLAN_RECORDED: ["plan_id", "operation_ids", "initial_gap_ids"],
    ACTION_PROPOSED: ["action_id", "checkpoint_id", "action"],
    OPERATION_ADMITTED: ["operation_id", "case_id", "objective_id", "input_sha256", "limits"],
    OPERATION_DISPATCHED: ["operation_id", "worker_identity", "dispatch_classification"],
    OPERATION_TERMINAL: ["operation_id", "status", "terminal_sha256", "evidence_sha256", "worker_requests"],
    EVIDENCE_PROPOSED: ["operation_id", "candidate"],
    EVIDENCE_ACCEPTED: ["operation_id", "evidence"],
    EVIDENCE_REJECTED: ["operation_id", "rejection"],
    GAP_RECORDED: ["gap_id", "operation_id", "importance", "attempted_operations", "disposition", "reason"],
    DECISION_RECORDED: ["decision_id", "operation_id", "evidence_considered", "accepted_count", "rejected_count", "next_action", "checkpoint_id"],
    SYNTHESIS_ELIGIBLE: ["eligibility_id", "accepted_evidence_ids", "rejected_evidence_ids", "result_sha256"],
    ARTIFACT_PUBLISHED: ["publication_id", "result_sha256", "artifact_paths"],
    RUN_TERMINAL: ["terminal_id", "decision", "reason", "accounting_sha256", "last_checkpoint_id"],
  };
  assertExactKeys(payload, schemas[kind], `${kind} payload`);
}

export function validateLedger(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_LEDGER_ENTRIES) fail("LEDGER_SCHEMA_MISMATCH", "Ledger entry count is invalid");
  let previous = ZERO_DIGEST;
  const operationStates = new Map();
  const evidenceStates = new Map();
  let terminalCount = 0;
  let synthesisCount = 0;
  for (const [index, entry] of entries.entries()) {
    validateLedgerEntryShape(entry, index + 1, previous);
    validatePayload(entry.kind, entry.payload);
    previous = entry.entry_digest;
    if (index === 0 && entry.kind !== "RUN_REGISTERED") fail("LEDGER_TRANSITION_INVALID", "RUN_REGISTERED must be first");
    if (index === 1 && entry.kind !== "PLAN_RECORDED") fail("LEDGER_TRANSITION_INVALID", "PLAN_RECORDED must be second");
    if (entry.kind === "ACTION_PROPOSED") fail("STAGE2_AUTHORITY_REACHED", "Stage 1 ledger must not contain orchestrator actions");
    const operationId = entry.payload.operation_id;
    if (entry.kind === "OPERATION_ADMITTED") {
      if (operationStates.has(operationId)) fail("DUPLICATE_OPERATION", `Operation ${operationId} was admitted more than once`);
      operationStates.set(operationId, "admitted");
    } else if (entry.kind === "OPERATION_DISPATCHED") {
      if (operationStates.get(operationId) !== "admitted") fail("LEDGER_TRANSITION_INVALID", `Operation ${operationId} dispatch is out of order`);
      operationStates.set(operationId, "dispatched");
    } else if (entry.kind === "OPERATION_TERMINAL") {
      if (operationStates.get(operationId) !== "dispatched" && operationStates.get(operationId) !== "admitted") fail("LEDGER_TRANSITION_INVALID", `Operation ${operationId} terminal is out of order`);
      operationStates.set(operationId, "terminal");
    } else if (entry.kind === "EVIDENCE_PROPOSED") {
      if (operationStates.get(operationId) !== "terminal") fail("LEDGER_TRANSITION_INVALID", `Evidence preceded terminal for ${operationId}`);
      const evidenceId = `EVIDENCE-${entry.payload.candidate.candidate_id}`;
      if (evidenceStates.has(evidenceId)) fail("DUPLICATE_EVIDENCE", `Evidence ${evidenceId} was proposed more than once`);
      evidenceStates.set(evidenceId, "proposed");
    } else if (entry.kind === "EVIDENCE_ACCEPTED" || entry.kind === "EVIDENCE_REJECTED") {
      const value = entry.kind === "EVIDENCE_ACCEPTED" ? entry.payload.evidence : entry.payload.rejection;
      if (evidenceStates.get(value.evidence_id) !== "proposed") fail("LEDGER_TRANSITION_INVALID", `Evidence decision is out of order for ${value.evidence_id}`);
      evidenceStates.set(value.evidence_id, entry.kind === "EVIDENCE_ACCEPTED" ? "accepted" : "rejected");
    } else if (entry.kind === "DECISION_RECORDED") {
      if (operationStates.get(operationId) !== "terminal") fail("LEDGER_TRANSITION_INVALID", `Decision preceded terminal for ${operationId}`);
      operationStates.set(operationId, "checkpointed");
    } else if (entry.kind === "SYNTHESIS_ELIGIBLE") {
      synthesisCount += 1;
      if (synthesisCount > 1) fail("DUPLICATE_SYNTHESIS", "Synthesis eligibility may be recorded once");
      for (const evidenceId of entry.payload.accepted_evidence_ids) {
        if (evidenceStates.get(evidenceId) !== "accepted") fail("REJECTED_EVIDENCE_REAPPEARED", `Synthesis includes non-accepted evidence ${evidenceId}`);
      }
      for (const evidenceId of entry.payload.rejected_evidence_ids) {
        if (evidenceStates.get(evidenceId) !== "rejected") fail("LEDGER_TRANSITION_INVALID", `Rejected evidence set mismatched for ${evidenceId}`);
      }
    } else if (entry.kind === "RUN_TERMINAL") {
      terminalCount += 1;
      if (terminalCount > 1 || index !== entries.length - 1) fail("DUPLICATE_RUN_TERMINAL", "RUN_TERMINAL must be the single final entry");
    }
  }
  return { entries, last_digest: previous, operation_states: operationStates, evidence_states: evidenceStates, terminal_count: terminalCount };
}

async function readLedger(root) {
  const target = safeArtifactPath(root, "ledger.jsonl");
  const bytes = await readBoundedNativeFile(target, MAX_LEDGER_BYTES, "host ledger", { inspectWindows: false });
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) fail("LEDGER_NONCANONICAL", "Ledger must end with one LF");
  const lines = text.slice(0, -1).split("\n");
  const entries = lines.map((line, index) => {
    const value = parseStrictJson(line, `ledger line ${index + 1}`);
    if (line !== canonicalJsonV1(value).slice(0, -1)) fail("LEDGER_NONCANONICAL", `Ledger line ${index + 1} is not canonical JSON`);
    return value;
  });
  return validateLedger(entries);
}

async function appendLedger(context, kind, payload) {
  await assertRootUnchanged(context);
  const ledgerPath = safeArtifactPath(context.root, "ledger.jsonl");
  let currentEntries = [];
  let previous = ZERO_DIGEST;
  if (await pathExists(ledgerPath)) {
    const ledger = await readLedger(context.root);
    currentEntries = ledger.entries;
    previous = ledger.last_digest;
    if (ledger.terminal_count !== 0) fail("RUN_ALREADY_TERMINAL", "Cannot append after RUN_TERMINAL");
  }
  validatePayload(kind, payload);
  const entry = sealLedgerEntry(currentEntries.length + 1, previous, kind, payload);
  const bytes = Buffer.from(canonicalJsonV1(entry), "utf8");
  if ((await stat(ledgerPath).catch(() => ({ size: 0 }))).size + bytes.byteLength > MAX_LEDGER_BYTES) fail("OVERSIZED_LEDGER", "Ledger byte ceiling exceeded");
  const handle = await open(ledgerPath, "a");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await assertRootUnchanged(context);
  const validated = await readLedger(context.root);
  if (validated.last_digest !== entry.entry_digest) fail("LEDGER_APPEND_FAILED", "Atomic ledger append did not seal the expected tail");
  return entry;
}

async function acquireRoot(context) {
  const key = identityPath(context.root);
  if (ACTIVE_ROOTS.has(key)) fail("ROOT_ALREADY_ACQUIRED", "This physical root is already active in the host process");
  ACTIVE_ROOTS.add(key);
  const target = path.join(context.root, LOCK_NAME);
  let handle;
  try {
    handle = await open(target, "wx+");
    const token = randomUUID();
    const bytes = canonicalBytes({
      schema_version: "orchestrated-research-lock-v1",
      permission_identity: ORCHESTRATED_RESEARCH_PERMISSION_ID,
      owner_token: token,
    });
    await handle.writeFile(bytes);
    await handle.sync();
    const identity = await handle.stat({ bigint: true });
    return { key, target, handle, token, bytes, identity };
  } catch (error) {
    ACTIVE_ROOTS.delete(key);
    if (error?.code === "EEXIST") fail("ROOT_ALREADY_ACQUIRED", "Root lock already exists; liveness is not inferred");
    throw error;
  }
}

async function releaseRoot(context, lock) {
  if (!lock) return;
  let failure;
  try {
    const opened = await lock.handle.stat({ bigint: true });
    const pathIdentity = await lstat(lock.target, { bigint: true });
    if (!sameFileIdentity(lock.identity, opened) || !sameFileIdentity(opened, pathIdentity) || pathIdentity.isSymbolicLink() || pathIdentity.nlink !== 1n) {
      fail("LOCK_REPLACED", "Root lock changed while held; replacement is preserved");
    }
    const observed = Buffer.alloc(lock.bytes.byteLength);
    const { bytesRead } = await lock.handle.read(observed, 0, observed.byteLength, 0);
    if (bytesRead !== observed.byteLength || !observed.equals(lock.bytes)) fail("LOCK_REPLACED", "Root lock ownership bytes changed");
    await assertRootUnchanged(context);
  } catch (error) {
    failure = error;
  }
  await lock.handle.close().catch(() => {});
  if (!failure) await rm(lock.target);
  ACTIVE_ROOTS.delete(lock.key);
  if (failure) throw failure;
}

function operationInput(caseContext) {
  return {
    schema_version: "orchestrated-research-operation-input-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "registered-synthetic-route-visible-input",
    operation_id: caseContext.operation.operation_id,
    case_id: caseContext.case_id,
    objective_id: caseContext.operation.objective_id,
    question: caseContext.question,
    source_projection: caseContext.sources.map((source) => ({
      source_id: source.source_id,
      trust_class: source.trust_class,
      locator_scheme: source.locator_scheme,
      source_sha256: source.sha256,
      content: source.content_kind === "json" ? source.parsed : source.bytes.toString("utf8"),
    })),
    accepted_evidence_projection: [],
    explicit_gaps: [],
    limits: {
      provider_requests: 0,
      rlm_executions: 0,
      network_actions: 0,
      worker_kind: "deterministic-fake-worker-only",
      max_candidates: 16,
      max_artifact_bytes: 262144,
    },
    output_grammar: {
      schema_version: "orchestrated-research-stage1-fake-worker-v1",
      evidence_classes: [...EVIDENCE_CLASSES],
      authority: "proposal-only-host-validates",
    },
  };
}

function evidenceArtifact(caseContext) {
  return {
    schema_version: "orchestrated-research-operation-evidence-v1",
    producer: "deterministic-fake-worker-v1",
    provenance: "registered-provider-free-fixture",
    operation_id: caseContext.operation.operation_id,
    case_id: caseContext.case_id,
    candidates: structuredClone(caseContext.operation.candidates),
  };
}

function operationTerminal(caseContext, evidenceSha256) {
  return {
    schema_version: "orchestrated-research-operation-terminal-v1",
    producer: "deterministic-fake-worker-v1",
    provenance: "registered-provider-free-fixture",
    operation_id: caseContext.operation.operation_id,
    status: "success",
    evidence_sha256: evidenceSha256,
    worker_requests: 1,
    provider_requests: 0,
    rlm_executions: 0,
  };
}

function permissionContract() {
  return {
    identity: ORCHESTRATED_RESEARCH_PERMISSION_ID,
    default: "deny",
    allowed_reads: ["registered-synthetic-route-visible-sources", "evaluator-only-host-contract"],
    allowed_writes: ["one-caller-owned-empty-external-disposable-root"],
    denied: [
      "provider",
      "credentials",
      "network",
      "live-browser",
      "rlm",
      "model-generated-code",
      "docker",
      "wsl",
      "external-mutation",
      "career-ops-user-layer",
      "rc7-execution",
    ],
  };
}

function budgetContract() {
  return {
    identity: "orchestrated-research-stage1-zero-authority-budget-v1",
    provider_requests: 0,
    credential_accesses: 0,
    rlm_executions: 0,
    network_actions: 0,
    docker_invocations: 0,
    wsl_invocations: 0,
    external_mutations: 0,
    retries: 0,
    deterministic_fake_worker_dispatches: 4,
  };
}

async function codeIdentity() {
  const files = [
    "lib/recursus/orchestrated-research.mjs",
    "scripts/recursus/orchestrated-research.mjs",
  ];
  const identities = [];
  for (const relativePath of files) {
    const absolute = path.join(REPOSITORY_ROOT, ...relativePath.split("/"));
    const bytes = await readBoundedNativeFile(absolute, 2_097_152, `Stage 1 code ${relativePath}`);
    identities.push({ logical_path: relativePath, sha256: sha256V1(bytes), byte_count: bytes.byteLength });
  }
  return {
    id: "orchestrated-research-stage1-code-v1",
    files: identities,
    sha256: sha256V1(Buffer.from(canonicalJsonV1(identities), "utf8")),
  };
}

function sourceManifest(inputs) {
  const cases = inputs.source_manifest_cases;
  return {
    schema_version: "orchestrated-research-source-manifest-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "registered-frozen-synthetic-sources",
    visibility_policy: {
      route_visible: "operation input contains only stable IDs, source bytes, locators, and closed limits",
      host_only: "logical paths, physical identities, ledger, admission, support decisions, and accounting",
      evaluator_only: "canonical claim identities, dispositions, exact support locators, canaries, and expected signatures",
    },
    cases,
    evaluator_contract: {
      id: inputs.evaluator_identity.id,
      sha256: inputs.evaluator_identity.sha256,
      byte_count: inputs.evaluator_identity.byte_count,
      visibility: "evaluator_only",
      included_in_operation_input: false,
    },
    fake_worker_contract: {
      id: inputs.worker_identity.id,
      sha256: inputs.worker_identity.sha256,
      byte_count: inputs.worker_identity.byte_count,
      visibility: "route_output",
    },
  };
}

function planValue(inputs) {
  return {
    schema_version: "orchestrated-research-plan-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "deterministic-provider-free-stage1-plan",
    plan_id: "ORCHESTRATED-RESEARCH-STAGE1-PLAN-01",
    question: "Can the provider-free host preserve exact source support, durable evidence, and recovery across the four registered synthetic cases?",
    operations: ORCHESTRATED_RESEARCH_CASES.map((caseId) => {
      const operation = inputs.cases.get(caseId).operation;
      return {
        operation_id: operation.operation_id,
        case_id: operation.case_id,
        objective_id: operation.objective_id,
        worker: "deterministic-fake-worker-v1",
        provider_reachable: false,
      };
    }),
    required_case_ids: [...ORCHESTRATED_RESEARCH_CASES],
    initial_gap_ids: ORCHESTRATED_RESEARCH_CASES.map((caseId) => `GAP-${caseId}`),
  };
}

async function registrationValue(context, inputs, manifest, code) {
  const questionIdentity = sha256V1(Buffer.from(canonicalJsonV1(CASE_QUESTIONS), "utf8"));
  const sourceIdentity = sha256V1(Buffer.from(canonicalJsonV1(manifest.cases), "utf8"));
  return {
    schema_version: "orchestrated-research-registration-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "provider-free-stage1-foundation",
    run_id: RUN_ID,
    route_id: ROUTE_ID,
    question_identity: { id: "ORCHESTRATED-RESEARCH-STAGE1-QUESTION-01", sha256: questionIdentity },
    source_identity: { id: "ORCHESTRATED-RESEARCH-STAGE1-SOURCES-01", sha256: sourceIdentity },
    permission_contract: permissionContract(),
    budget_contract: budgetContract(),
    evaluator_identity: inputs.evaluator_identity,
    code_identity: code,
    physical_root_binding: context.binding,
  };
}

function registrationLedgerPayload(registration) {
  return {
    route_id: registration.route_id,
    question_identity: registration.question_identity,
    source_identity: registration.source_identity,
    permission_identity: registration.permission_contract.identity,
    budget_identity: registration.budget_contract.identity,
    evaluator_identity: registration.evaluator_identity,
    code_identity: registration.code_identity,
    physical_root_binding: registration.physical_root_binding,
  };
}

function planLedgerPayload(plan) {
  return {
    plan_id: plan.plan_id,
    operation_ids: plan.operations.map((item) => item.operation_id),
    initial_gap_ids: plan.initial_gap_ids,
  };
}

function checkpointValue(ledger, operationId, phase, acceptedIds = [], rejectedIds = []) {
  return {
    schema_version: "orchestrated-research-checkpoint-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "validated-host-ledger-projection",
    checkpoint_id: `CHECKPOINT-${String(ledger.entries.length).padStart(4, "0")}`,
    run_id: RUN_ID,
    phase,
    operation_id: operationId,
    accepted_evidence_ids: [...acceptedIds].sort(),
    rejected_evidence_ids: [...rejectedIds].sort(),
    ledger_sequence: ledger.entries.length,
    ledger_tail_digest: ledger.last_digest,
  };
}

function maybeFault(expected, fault) {
  if (fault === expected) fail("INJECTED_PROVIDER_FREE_FAULT", `Injected provider-free fault at ${expected}`, { fault: expected });
}

function evidenceDecisionSets(entries) {
  const accepted = [];
  const rejected = [];
  for (const entry of entries) {
    if (entry.kind === "EVIDENCE_ACCEPTED") accepted.push(entry.payload.evidence.evidence_id);
    if (entry.kind === "EVIDENCE_REJECTED") rejected.push(entry.payload.rejection.evidence_id);
  }
  return { accepted: [...new Set(accepted)].sort(), rejected: [...new Set(rejected)].sort() };
}

async function processOperationEvidence(context, inputs, caseContext, fault, { stopAfterDecision = false } = {}) {
  const operationId = caseContext.operation.operation_id;
  const evidencePath = `operations/${operationId}/evidence.json`;
  const evidence = await readCanonicalArtifact(context.root, evidencePath, MAX_JSON_BYTES);
  const already = await readLedger(context.root);
  const decided = new Set();
  for (const entry of already.entries) {
    if (entry.kind === "EVIDENCE_ACCEPTED") decided.add(entry.payload.evidence.evidence_id);
    if (entry.kind === "EVIDENCE_REJECTED") decided.add(entry.payload.rejection.evidence_id);
  }
  let injected = false;
  for (const candidate of evidence.value.candidates) {
    const evidenceId = `EVIDENCE-${candidate.candidate_id}`;
    if (decided.has(evidenceId)) continue;
    const latest = await readLedger(context.root);
    const proposed = latest.entries.some((entry) => entry.kind === "EVIDENCE_PROPOSED" && entry.payload.candidate.candidate_id === candidate.candidate_id);
    if (!proposed) await appendLedger(context, "EVIDENCE_PROPOSED", { operation_id: operationId, candidate });
    if (!injected && fault === "during-evidence-validation") {
      injected = true;
      maybeFault("during-evidence-validation", fault);
    }
    const decision = evaluateEvidenceCandidate(candidate, caseContext);
    if (decision.accepted) {
      await appendLedger(context, "EVIDENCE_ACCEPTED", { operation_id: operationId, evidence: decision });
    } else {
      await appendLedger(context, "EVIDENCE_REJECTED", { operation_id: operationId, rejection: decision });
      await appendLedger(context, "GAP_RECORDED", {
        gap_id: `GAP-${candidate.candidate_id}`,
        operation_id: operationId,
        importance: candidate.class === "candidate_fact" ? "critical-safety" : "normal",
        attempted_operations: [operationId],
        disposition: "abandoned",
        reason: decision.reason,
      });
    }
  }
  const current = await readLedger(context.root);
  const decisions = evidenceDecisionSets(current.entries);
  const operationAccepted = current.entries.filter((entry) => entry.kind === "EVIDENCE_ACCEPTED" && entry.payload.operation_id === operationId).map((entry) => entry.payload.evidence.evidence_id);
  const operationRejected = current.entries.filter((entry) => entry.kind === "EVIDENCE_REJECTED" && entry.payload.operation_id === operationId).map((entry) => entry.payload.rejection.evidence_id);
  const existingDecision = current.entries.find((entry) => entry.kind === "DECISION_RECORDED" && entry.payload.operation_id === operationId);
  if (!existingDecision) {
    const checkpointId = `CHECKPOINT-${String(current.entries.length + 1).padStart(4, "0")}`;
    await appendLedger(context, "DECISION_RECORDED", {
      decision_id: `DECISION-${operationId}`,
      operation_id: operationId,
      evidence_considered: [...operationAccepted, ...operationRejected].sort(),
      accepted_count: operationAccepted.length,
      rejected_count: operationRejected.length,
      next_action: stopAfterDecision ? "STOP" : "CONTINUE_REGISTERED_PLAN",
      checkpoint_id: checkpointId,
    });
  }
  const sealed = await readLedger(context.root);
  const checkpoint = checkpointValue(sealed, operationId, "checkpointed", decisions.accepted, decisions.rejected);
  await writeCanonicalAtomic(context, "checkpoint.json", checkpoint, 65_536);
  return checkpoint;
}

async function executeOperation(context, inputs, caseContext, fault, operationIndex) {
  const input = operationInput(caseContext);
  const inputPath = `operations/${caseContext.operation.operation_id}/input.json`;
  const inputArtifact = await writeCanonicalExclusive(context, inputPath, input, 262_144);
  await appendLedger(context, "OPERATION_ADMITTED", {
    operation_id: caseContext.operation.operation_id,
    case_id: caseContext.case_id,
    objective_id: caseContext.operation.objective_id,
    input_sha256: inputArtifact.sha256,
    limits: input.limits,
  });
  if (operationIndex === 0) maybeFault("after-admission", fault);
  await appendLedger(context, "OPERATION_DISPATCHED", {
    operation_id: caseContext.operation.operation_id,
    worker_identity: "deterministic-fake-worker-v1",
    dispatch_classification: "local-provider-free-worker-reachable",
  });
  if (operationIndex === 0) maybeFault("after-dispatch", fault);
  const evidence = evidenceArtifact(caseContext);
  const evidenceFile = await writeCanonicalExclusive(context, `operations/${caseContext.operation.operation_id}/evidence.json`, evidence, 262_144);
  const terminal = operationTerminal(caseContext, evidenceFile.sha256);
  const terminalFile = await writeCanonicalExclusive(context, `operations/${caseContext.operation.operation_id}/terminal.json`, terminal, 65_536);
  await appendLedger(context, "OPERATION_TERMINAL", {
    operation_id: caseContext.operation.operation_id,
    status: "success",
    terminal_sha256: terminalFile.sha256,
    evidence_sha256: evidenceFile.sha256,
    worker_requests: 1,
  });
  if (operationIndex === 0) maybeFault("after-terminal", fault);
  const checkpoint = await processOperationEvidence(context, inputs, caseContext, operationIndex === 0 ? fault : undefined);
  if (operationIndex === 0) maybeFault("after-checkpoint", fault);
  return checkpoint;
}

function validateArtifactValue(relativePath, value) {
  if (relativePath === "registration.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "run_id", "route_id", "question_identity", "source_identity", "permission_contract", "budget_contract", "evaluator_identity", "code_identity", "physical_root_binding"], "registration");
    if (value.schema_version !== "orchestrated-research-registration-v1" || value.run_id !== RUN_ID || value.route_id !== ROUTE_ID) fail("REGISTRATION_IDENTITY_MISMATCH", "Registration identity mismatched");
    if (canonicalJsonV1(value.permission_contract) !== canonicalJsonV1(permissionContract()) || canonicalJsonV1(value.budget_contract) !== canonicalJsonV1(budgetContract())) fail("AUTHORITY_IDENTITY_MISMATCH", "Permission or budget identity mismatched");
  } else if (relativePath === "source-manifest.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "visibility_policy", "cases", "evaluator_contract", "fake_worker_contract"], "source manifest");
    if (value.schema_version !== "orchestrated-research-source-manifest-v1") fail("SOURCE_IDENTITY_MISMATCH", "Source manifest schema mismatched");
  } else if (relativePath === "plan.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "plan_id", "question", "operations", "required_case_ids", "initial_gap_ids"], "plan");
    if (value.schema_version !== "orchestrated-research-plan-v1" || canonicalJsonV1(value.required_case_ids) !== canonicalJsonV1(ORCHESTRATED_RESEARCH_CASES)) fail("PLAN_IDENTITY_MISMATCH", "Plan identity mismatched");
  } else if (relativePath === "checkpoint.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "checkpoint_id", "run_id", "phase", "operation_id", "accepted_evidence_ids", "rejected_evidence_ids", "ledger_sequence", "ledger_tail_digest"], "checkpoint");
    if (value.schema_version !== "orchestrated-research-checkpoint-v1" || value.run_id !== RUN_ID || !SHA256_RE.test(value.ledger_tail_digest)) fail("CHECKPOINT_IDENTITY_MISMATCH", "Checkpoint identity mismatched");
  } else if (/^operations\/[A-Z0-9._-]+\/input\.json$/u.test(relativePath)) {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "operation_id", "case_id", "objective_id", "question", "source_projection", "accepted_evidence_projection", "explicit_gaps", "limits", "output_grammar"], "operation input");
    if (value.schema_version !== "orchestrated-research-operation-input-v1") fail("MALFORMED_OPERATION_INPUT", "Operation input schema mismatched");
    const text = canonicalJsonV1(value);
    for (const forbidden of ["evaluator_only", "canonical_claim_id", "leak_canary", "expected_signature", "preferred_route", "physical_root_binding"]) {
      if (text.includes(forbidden)) fail("EVALUATOR_LEAK", `Operation input contains forbidden host/evaluator bytes: ${forbidden}`);
    }
  } else if (/^operations\/[A-Z0-9._-]+\/evidence\.json$/u.test(relativePath)) {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "operation_id", "case_id", "candidates"], "operation evidence");
    if (value.schema_version !== "orchestrated-research-operation-evidence-v1") fail("MALFORMED_WORKER_RESULT", "Evidence artifact schema mismatched");
    for (const candidate of value.candidates) validateCandidateShape(candidate);
  } else if (/^operations\/[A-Z0-9._-]+\/terminal\.json$/u.test(relativePath)) {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "operation_id", "status", "evidence_sha256", "worker_requests", "provider_requests", "rlm_executions"], "operation terminal");
    if (value.schema_version !== "orchestrated-research-operation-terminal-v1" || value.provider_requests !== 0 || value.rlm_executions !== 0) fail("PROHIBITED_AUTHORITY_REACHED", "Operation terminal records prohibited authority");
  } else if (relativePath === "synthesis-eligibility.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "eligibility_id", "accepted_evidence_ids", "rejected_evidence_ids", "accepted_by_class", "result_sha256"], "synthesis eligibility");
    if (value.schema_version !== "orchestrated-research-synthesis-eligibility-v1") fail("SYNTHESIS_IDENTITY_MISMATCH", "Synthesis eligibility schema mismatched");
  } else if (relativePath === "result.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "run_id", "status", "accepted_evidence", "rejected_evidence_ids", "unresolved_gaps", "nonclaims"], "result");
    if (value.schema_version !== "orchestrated-research-result-v1" || value.run_id !== RUN_ID) fail("RESULT_IDENTITY_MISMATCH", "Result identity mismatched");
  } else if (relativePath === "accounting.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "provider_requests", "credential_accesses", "rlm_executions", "network_actions", "docker_invocations", "wsl_invocations", "external_mutations", "retries", "fake_worker_dispatches", "accepted_evidence", "rejected_evidence", "terminal_decisions"], "accounting");
    for (const key of ["provider_requests", "credential_accesses", "rlm_executions", "network_actions", "docker_invocations", "wsl_invocations", "external_mutations", "retries"]) {
      if (value[key] !== 0) fail("PROHIBITED_AUTHORITY_REACHED", `Accounting records nonzero ${key}`);
    }
  } else if (relativePath === "terminal.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "terminal_id", "run_id", "decision", "reason", "last_checkpoint_id", "ledger_sequence", "last_ledger_digest", "accounting_sha256"], "terminal");
    if (value.schema_version !== "orchestrated-research-terminal-v1" || value.run_id !== RUN_ID || !SHA256_RE.test(value.last_ledger_digest)) fail("TERMINAL_IDENTITY_MISMATCH", "Terminal identity mismatched");
  } else if (relativePath === "summary.json") {
    assertExactKeys(value, ["schema_version", "producer", "provenance", "run_id", "state", "decision", "artifact_inventory", "normalized_capture_sha256", "summary_projection_sha256"], "summary");
    if (value.schema_version !== "orchestrated-research-summary-v1" || value.run_id !== RUN_ID) fail("SUMMARY_IDENTITY_MISMATCH", "Summary identity mismatched");
  } else {
    fail("UNREGISTERED_ARTIFACT", `No schema is registered for ${relativePath}`);
  }
  return value;
}

async function readCanonicalArtifact(root, relativePath, maxBytes = MAX_JSON_BYTES) {
  const target = safeArtifactPath(root, relativePath);
  const bytes = await readBoundedNativeFile(target, maxBytes, relativePath, { inspectWindows: false });
  const value = parseStrictJson(bytes.toString("utf8"), relativePath);
  if (!bytes.equals(canonicalBytes(value))) fail("NONCANONICAL_ARTIFACT", `${relativePath} is not canonical JSON with one final LF`);
  validateArtifactValue(relativePath, value);
  return { value, bytes, sha256: sha256V1(bytes), byte_count: bytes.byteLength };
}

function artifactLimit(relativePath) {
  if (relativePath === "ledger.jsonl") return MAX_LEDGER_BYTES;
  if (relativePath.includes("/input.json") || relativePath.includes("/evidence.json")) return 262_144;
  if (relativePath === "source-manifest.json") return 524_288;
  return 65_536;
}

function artifactSchema(relativePath) {
  if (relativePath === "ledger.jsonl") return "orchestrated-research-ledger-entry-v1";
  const schemas = {
    "registration.json": "orchestrated-research-registration-v1",
    "source-manifest.json": "orchestrated-research-source-manifest-v1",
    "plan.json": "orchestrated-research-plan-v1",
    "checkpoint.json": "orchestrated-research-checkpoint-v1",
    "synthesis-eligibility.json": "orchestrated-research-synthesis-eligibility-v1",
    "result.json": "orchestrated-research-result-v1",
    "accounting.json": "orchestrated-research-accounting-v1",
    "terminal.json": "orchestrated-research-terminal-v1",
  };
  if (schemas[relativePath]) return schemas[relativePath];
  if (relativePath.endsWith("/input.json")) return "orchestrated-research-operation-input-v1";
  if (relativePath.endsWith("/terminal.json")) return "orchestrated-research-operation-terminal-v1";
  if (relativePath.endsWith("/evidence.json")) return "orchestrated-research-operation-evidence-v1";
  fail("UNREGISTERED_ARTIFACT", `No artifact schema for ${relativePath}`);
}

async function walkArtifactFiles(root, { includeTransient = false } = {}) {
  const files = [];
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relativePath === LOCK_NAME || relativePath === CHECKPOINT_STAGE_NAME || relativePath.endsWith(".stage")) {
        if (includeTransient) files.push(relativePath);
        continue;
      }
      if (relativePath.split("/").some((segment) => segment.includes(":") || WINDOWS_DEVICE_RE.test(segment))) fail("PATH_ESCAPE", `Unsafe on-disk artifact path ${relativePath}`);
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute, { bigint: true });
      if (info.isSymbolicLink()) fail("ALIASED_ARTIFACT", `${relativePath} is a symlink or junction`);
      const physical = await realpath(absolute);
      if (normalizedPath(physical) !== normalizedPath(path.resolve(absolute))) fail("ALIASED_ARTIFACT", `${relativePath} is physically aliased`);
      if (info.isDirectory()) {
        await visit(absolute, relativePath);
      } else if (info.isFile()) {
        if (info.nlink !== 1n) fail("ALIASED_ARTIFACT", `${relativePath} is hard-linked`);
        files.push(relativePath);
        if (files.length > MAX_FILE_COUNT) fail("OVERSIZED_PACKAGE", "Run package contains too many files");
      } else {
        fail("UNREGISTERED_ARTIFACT", `${relativePath} is not a regular file or directory`);
      }
    }
  }
  await visit(root);
  windowsTreeMetadata(root);
  return files.sort();
}

function normalizeArtifactValue(relativePath, value) {
  const copy = structuredClone(value);
  if (relativePath === "registration.json") {
    copy.physical_root_binding = { classification: "safe-external-disposable-root", validated: true };
  }
  if (relativePath === "checkpoint.json") copy.ledger_tail_digest = "normalized-ledger-tail";
  if (relativePath === "terminal.json") copy.last_ledger_digest = "normalized-ledger-tail";
  return copy;
}

function normalizeLedgerEntries(entries) {
  const normalized = [];
  let previous = ZERO_DIGEST;
  for (const entry of entries) {
    const payload = structuredClone(entry.payload);
    if (entry.kind === "RUN_REGISTERED") {
      payload.physical_root_binding = { classification: "safe-external-disposable-root", validated: true };
    }
    const sealed = sealLedgerEntry(entry.sequence, previous, entry.kind, payload);
    normalized.push(sealed);
    previous = sealed.entry_digest;
  }
  return normalized;
}

export async function normalizedPreparationBytes(root) {
  const context = await validateDisposableRoot(root);
  await assertRootUnchanged(context);
  const files = (await walkArtifactFiles(context.root)).filter((relativePath) => relativePath !== "summary.json");
  const artifacts = [];
  for (const relativePath of files) {
    if (relativePath === "ledger.jsonl") {
      const ledger = await readLedger(context.root);
      artifacts.push({ path: relativePath, media_type: "application/x-ndjson", value: normalizeLedgerEntries(ledger.entries) });
    } else {
      const artifact = await readCanonicalArtifact(context.root, relativePath, artifactLimit(relativePath));
      artifacts.push({ path: relativePath, media_type: "application/json", value: normalizeArtifactValue(relativePath, artifact.value) });
    }
  }
  return canonicalBytes({
    schema_version: "orchestrated-research-normalized-capture-v1",
    physical_identity: "excluded-safe-external-disposable-root",
    observation_only_fields: "excluded",
    artifacts,
  });
}

function deriveStateFromLedger(ledger) {
  const terminal = ledger.entries.findLast((entry) => entry.kind === "RUN_TERMINAL");
  if (terminal) return terminal.payload.decision === "COMPLETE" ? "complete" : "stopped";
  if (ledger.entries.some((entry) => entry.kind === "SYNTHESIS_ELIGIBLE")) return "synthesis-eligible";
  const states = [...ledger.operation_states.values()];
  const latest = states.at(-1);
  if (latest === "dispatched") return "indeterminate";
  if (latest === "admitted") return "operation-admitted";
  if (latest === "terminal") return "operation-terminal";
  if (latest === "checkpointed") return "checkpointed";
  return ledger.entries.length >= 2 ? "prepared" : "active";
}

function acceptedEvidence(entries) {
  return entries.filter((entry) => entry.kind === "EVIDENCE_ACCEPTED").map((entry) => entry.payload.evidence);
}

function rejectedEvidence(entries) {
  return entries.filter((entry) => entry.kind === "EVIDENCE_REJECTED").map((entry) => entry.payload.rejection);
}

function accountingValue(entries, terminalDecisions = 1) {
  return {
    schema_version: "orchestrated-research-accounting-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "validated-host-ledger-counts",
    provider_requests: 0,
    credential_accesses: 0,
    rlm_executions: 0,
    network_actions: 0,
    docker_invocations: 0,
    wsl_invocations: 0,
    external_mutations: 0,
    retries: 0,
    fake_worker_dispatches: entries.filter((entry) => entry.kind === "OPERATION_DISPATCHED").length,
    accepted_evidence: acceptedEvidence(entries).length,
    rejected_evidence: rejectedEvidence(entries).length,
    terminal_decisions: terminalDecisions,
  };
}

function resultValue(entries) {
  const accepted = acceptedEvidence(entries);
  const rejected = rejectedEvidence(entries);
  return {
    schema_version: "orchestrated-research-result-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "accepted-host-evidence-only",
    run_id: RUN_ID,
    status: "provider-free-preparation-complete",
    accepted_evidence: accepted.map((evidence) => ({
      evidence_id: evidence.evidence_id,
      class: evidence.class,
      assertion: evidence.assertion,
      locators: evidence.locators,
      origin: evidence.origin,
    })),
    rejected_evidence_ids: rejected.map((evidence) => evidence.evidence_id).sort(),
    unresolved_gaps: entries.filter((entry) => entry.kind === "GAP_RECORDED").map((entry) => ({ gap_id: entry.payload.gap_id, reason: entry.payload.reason, disposition: entry.payload.disposition })),
    nonclaims: [
      "No provider, model, RLM, credential, network, Docker, WSL, live data, or external mutation was exercised.",
      "This result establishes no orchestration value, RLM value, production readiness, or Career Ops integration.",
    ],
  };
}

function synthesisEligibilityValue(entries, resultSha256) {
  const accepted = acceptedEvidence(entries);
  const rejected = rejectedEvidence(entries);
  const counts = Object.fromEntries(EVIDENCE_CLASSES.map((className) => [className, accepted.filter((evidence) => evidence.class === className).length]));
  return {
    schema_version: "orchestrated-research-synthesis-eligibility-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "validated-host-ledger-projection",
    eligibility_id: "ORCHESTRATED-RESEARCH-STAGE1-SYNTHESIS-01",
    accepted_evidence_ids: accepted.map((evidence) => evidence.evidence_id).sort(),
    rejected_evidence_ids: rejected.map((evidence) => evidence.evidence_id).sort(),
    accepted_by_class: counts,
    result_sha256: resultSha256,
  };
}

async function buildArtifactInventory(context) {
  const files = (await walkArtifactFiles(context.root)).filter((relativePath) => relativePath !== "summary.json");
  const inventory = [];
  for (const relativePath of files) {
    const target = safeArtifactPath(context.root, relativePath);
    const bytes = await readBoundedNativeFile(target, artifactLimit(relativePath), relativePath, { inspectWindows: false });
    if (relativePath === "ledger.jsonl") await readLedger(context.root);
    else await readCanonicalArtifact(context.root, relativePath, artifactLimit(relativePath));
    inventory.push({
      path: relativePath,
      schema: artifactSchema(relativePath),
      media_type: relativePath === "ledger.jsonl" ? "application/x-ndjson" : "application/json",
      byte_ceiling: artifactLimit(relativePath),
      producer: relativePath.includes("/evidence.json") || relativePath.includes("/terminal.json") ? "deterministic-fake-worker-v1-or-host-terminal" : "lib/recursus/orchestrated-research.mjs",
      provenance: "provider-free-stage1-run-package",
      byte_count: bytes.byteLength,
      sha256: sha256V1(bytes),
      independent_validation_rule: "strict-schema-canonical-bytes-physical-identity-and-ledger/source-cross-check",
    });
  }
  return inventory;
}

async function writeSummary(context, decision) {
  clearWindowsMetadataForRoot(context.root);
  const normalized = await normalizedPreparationBytes(context.root);
  const inventory = await buildArtifactInventory(context);
  const summary = {
    schema_version: "orchestrated-research-summary-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "validated-provider-free-stage1-package",
    run_id: RUN_ID,
    state: decision === "COMPLETE" ? "complete" : "stopped",
    decision,
    artifact_inventory: inventory,
    normalized_capture_sha256: sha256V1(normalized),
  };
  summary.summary_projection_sha256 = sha256V1(Buffer.from(canonicalJsonV1(summary), "utf8"));
  return writeCanonicalExclusive(context, "summary.json", summary, 262_144);
}

async function validateRegisteredClosure(context, inputs) {
  const manifest = sourceManifest(inputs);
  const code = await codeIdentity();
  const expectedRegistration = await registrationValue(context, inputs, manifest, code);
  const expectedPlan = planValue(inputs);
  const registration = await readCanonicalArtifact(context.root, "registration.json", 262_144);
  const source = await readCanonicalArtifact(context.root, "source-manifest.json", 524_288);
  const plan = await readCanonicalArtifact(context.root, "plan.json", 262_144);
  if (canonicalJsonV1(registration.value) !== canonicalJsonV1(expectedRegistration)) fail("REGISTRATION_DRIFT", "Registration, physical root, or code identity drifted");
  if (canonicalJsonV1(source.value) !== canonicalJsonV1(manifest)) fail("SOURCE_IDENTITY_MISMATCH", "Source manifest drifted from frozen bytes");
  if (canonicalJsonV1(plan.value) !== canonicalJsonV1(expectedPlan)) fail("PLAN_IDENTITY_MISMATCH", "Plan drifted from the registered provider-free plan");
  return { registration: registration.value, source: source.value, plan: plan.value, code };
}

async function terminalArtifactValue(root, decision, reason, accountingSha256) {
  const ledger = await readLedger(root);
  const checkpoint = await readCanonicalArtifact(root, "checkpoint.json", 65_536).catch((error) => {
    if (error instanceof OrchestratedResearchError && error.code === "MISSING_ARTIFACT") return { value: { checkpoint_id: "CHECKPOINT-NONE" } };
    throw error;
  });
  return {
    schema_version: "orchestrated-research-terminal-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "single-host-ledger-terminal",
    terminal_id: `TERMINAL-${RUN_ID}`,
    run_id: RUN_ID,
    decision,
    reason,
    last_checkpoint_id: checkpoint.value.checkpoint_id,
    ledger_sequence: ledger.entries.length,
    last_ledger_digest: ledger.last_digest,
    accounting_sha256: accountingSha256,
  };
}

async function finalizeCompleteRun(context, { fault } = {}) {
  let ledger = await readLedger(context.root);
  const currentState = deriveStateFromLedger(ledger);
  if (currentState === "complete" || currentState === "stopped") {
    const runTerminal = ledger.entries.at(-1).payload;
    if (!(await pathExists(safeArtifactPath(context.root, "terminal.json")))) {
      const accounting = await readCanonicalArtifact(context.root, "accounting.json", 65_536);
      const terminal = await terminalArtifactValue(context.root, runTerminal.decision, runTerminal.reason, accounting.sha256);
      await writeCanonicalExclusive(context, "terminal.json", terminal, 65_536);
    }
    if (!(await pathExists(safeArtifactPath(context.root, "summary.json")))) await writeSummary(context, runTerminal.decision);
    return;
  }
  const decisions = evidenceDecisionSets(ledger.entries);
  if (!ledger.entries.some((entry) => entry.kind === "SYNTHESIS_ELIGIBLE")) {
    maybeFault("during-synthesis-eligibility", fault);
    const result = resultValue(ledger.entries);
    const resultBytes = canonicalBytes(result);
    const resultSha256 = sha256V1(resultBytes);
    const eligibility = synthesisEligibilityValue(ledger.entries, resultSha256);
    await writeCanonicalExclusive(context, "synthesis-eligibility.json", eligibility, 262_144);
    await appendLedger(context, "SYNTHESIS_ELIGIBLE", {
      eligibility_id: eligibility.eligibility_id,
      accepted_evidence_ids: eligibility.accepted_evidence_ids,
      rejected_evidence_ids: eligibility.rejected_evidence_ids,
      result_sha256: resultSha256,
    });
    await writeCanonicalExclusive(context, "result.json", result, 262_144);
  }
  ledger = await readLedger(context.root);
  let accountingArtifact;
  if (await pathExists(safeArtifactPath(context.root, "accounting.json"))) {
    accountingArtifact = await readCanonicalArtifact(context.root, "accounting.json", 65_536);
  } else {
    accountingArtifact = await writeCanonicalExclusive(context, "accounting.json", accountingValue(ledger.entries), 65_536);
  }
  maybeFault("during-publication", fault);
  if (!ledger.entries.some((entry) => entry.kind === "ARTIFACT_PUBLISHED")) {
    const result = await readCanonicalArtifact(context.root, "result.json", 262_144);
    const paths = (await walkArtifactFiles(context.root)).filter((relativePath) => !new Set(["summary.json", "terminal.json"]).has(relativePath));
    await appendLedger(context, "ARTIFACT_PUBLISHED", {
      publication_id: "ORCHESTRATED-RESEARCH-STAGE1-PUBLICATION-01",
      result_sha256: result.sha256,
      artifact_paths: paths,
    });
  }
  ledger = await readLedger(context.root);
  if (!ledger.entries.some((entry) => entry.kind === "RUN_TERMINAL")) {
    const checkpoint = await readCanonicalArtifact(context.root, "checkpoint.json", 65_536);
    await appendLedger(context, "RUN_TERMINAL", {
      terminal_id: `TERMINAL-${RUN_ID}`,
      decision: "COMPLETE",
      reason: "all-four-provider-free-fixtures-checkpointed-and-synthesis-gated",
      accounting_sha256: accountingArtifact.sha256,
      last_checkpoint_id: checkpoint.value.checkpoint_id,
    });
  }
  const terminal = await terminalArtifactValue(context.root, "COMPLETE", "all-four-provider-free-fixtures-checkpointed-and-synthesis-gated", accountingArtifact.sha256);
  if (!(await pathExists(safeArtifactPath(context.root, "terminal.json")))) await writeCanonicalExclusive(context, "terminal.json", terminal, 65_536);
  if (!(await pathExists(safeArtifactPath(context.root, "summary.json")))) await writeSummary(context, "COMPLETE");
  maybeFault("after-terminal-completion", fault);
  if (decisions.accepted.length === 0) fail("SAFETY_GATE_EMPTY", "Complete preparation accepted no evidence");
}

async function writeHostOperationTerminal(context, operationId, status, workerRequests) {
  const value = {
    schema_version: "orchestrated-research-operation-terminal-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "host-recovery-classification",
    operation_id: operationId,
    status,
    evidence_sha256: ZERO_DIGEST,
    worker_requests: workerRequests,
    provider_requests: 0,
    rlm_executions: 0,
  };
  const relativePath = `operations/${operationId}/terminal.json`;
  const artifact = await writeCanonicalExclusive(context, relativePath, value, 65_536);
  await appendLedger(context, "OPERATION_TERMINAL", {
    operation_id: operationId,
    status,
    terminal_sha256: artifact.sha256,
    evidence_sha256: ZERO_DIGEST,
    worker_requests: workerRequests,
  });
}

async function sealStoppedRun(context, reason, operationId = "NONE") {
  let ledger = await readLedger(context.root);
  const decisions = evidenceDecisionSets(ledger.entries);
  const latestOperationState = operationId === "NONE" ? undefined : ledger.operation_states.get(operationId);
  if (operationId !== "NONE" && latestOperationState === "terminal" && !ledger.entries.some((entry) => entry.kind === "DECISION_RECORDED" && entry.payload.operation_id === operationId)) {
    const checkpointId = `CHECKPOINT-${String(ledger.entries.length + 1).padStart(4, "0")}`;
    await appendLedger(context, "DECISION_RECORDED", {
      decision_id: `DECISION-${operationId}-STOP`,
      operation_id: operationId,
      evidence_considered: [...decisions.accepted, ...decisions.rejected].sort(),
      accepted_count: decisions.accepted.length,
      rejected_count: decisions.rejected.length,
      next_action: "STOP",
      checkpoint_id: checkpointId,
    });
    ledger = await readLedger(context.root);
    await writeCanonicalAtomic(context, "checkpoint.json", checkpointValue(ledger, operationId, "stopped", decisions.accepted, decisions.rejected), 65_536);
  }
  ledger = await readLedger(context.root);
  let accountingArtifact;
  if (await pathExists(safeArtifactPath(context.root, "accounting.json"))) accountingArtifact = await readCanonicalArtifact(context.root, "accounting.json", 65_536);
  else accountingArtifact = await writeCanonicalExclusive(context, "accounting.json", accountingValue(ledger.entries), 65_536);
  if (!ledger.entries.some((entry) => entry.kind === "RUN_TERMINAL")) {
    const checkpoint = await readCanonicalArtifact(context.root, "checkpoint.json", 65_536).catch((error) => {
      if (error instanceof OrchestratedResearchError && error.code === "MISSING_ARTIFACT") return { value: { checkpoint_id: "CHECKPOINT-NONE" } };
      throw error;
    });
    await appendLedger(context, "RUN_TERMINAL", {
      terminal_id: `TERMINAL-${RUN_ID}`,
      decision: "STOPPED",
      reason,
      accounting_sha256: accountingArtifact.sha256,
      last_checkpoint_id: checkpoint.value.checkpoint_id,
    });
  }
  const terminal = await terminalArtifactValue(context.root, "STOPPED", reason, accountingArtifact.sha256);
  if (!(await pathExists(safeArtifactPath(context.root, "terminal.json")))) await writeCanonicalExclusive(context, "terminal.json", terminal, 65_536);
  if (!(await pathExists(safeArtifactPath(context.root, "summary.json")))) await writeSummary(context, "STOPPED");
}

async function runPreparation(root, fault = undefined) {
  clearWindowsMetadataForRoot(root);
  if (fault !== undefined && !ORCHESTRATED_RESEARCH_FAULTS.includes(fault)) fail("UNREGISTERED_FAULT", `Unknown Stage 1 fault: ${fault}`);
  const context = await validateDisposableRoot(root, { requireEmpty: true });
  const lock = await acquireRoot(context);
  try {
    const inputs = await loadFrozenInputs();
    const manifest = sourceManifest(inputs);
    const plan = planValue(inputs);
    const code = await codeIdentity();
    const registration = await registrationValue(context, inputs, manifest, code);
    await writeCanonicalExclusive(context, "registration.json", registration, 262_144);
    await writeCanonicalExclusive(context, "source-manifest.json", manifest, 524_288);
    await writeCanonicalExclusive(context, "plan.json", plan, 262_144);
    await appendLedger(context, "RUN_REGISTERED", registrationLedgerPayload(registration));
    await appendLedger(context, "PLAN_RECORDED", planLedgerPayload(plan));
    let ledger = await readLedger(context.root);
    await writeCanonicalExclusive(context, "checkpoint.json", checkpointValue(ledger, "NONE", "prepared"), 65_536);
    maybeFault("before-admission", fault);
    for (const [index, caseId] of ORCHESTRATED_RESEARCH_CASES.entries()) {
      await executeOperation(context, inputs, inputs.cases.get(caseId), fault, index);
    }
    ledger = await readLedger(context.root);
    if ([...ledger.operation_states.values()].filter((state) => state === "checkpointed").length !== ORCHESTRATED_RESEARCH_CASES.length) {
      fail("PLAN_INCOMPLETE", "Not every registered Stage 1 operation reached a checkpoint");
    }
    await finalizeCompleteRun(context, { fault });
    const summary = await readCanonicalArtifact(context.root, "summary.json", 262_144);
    return {
      root: context.root,
      state: summary.value.state,
      decision: summary.value.decision,
      normalized_capture_sha256: summary.value.normalized_capture_sha256,
      accounting: (await readCanonicalArtifact(context.root, "accounting.json", 65_536)).value,
    };
  } finally {
    await releaseRoot(context, lock);
  }
}

export async function prepareOrchestratedResearch(root) {
  return runPreparation(root);
}

export async function exerciseOrchestratedResearch(root, fault) {
  try {
    return await runPreparation(root, fault);
  } catch (error) {
    if (!(error instanceof OrchestratedResearchError) || error.code !== "INJECTED_PROVIDER_FREE_FAULT") throw error;
    const inspection = await inspectOrchestratedResearch(root);
    return {
      root: path.resolve(root),
      state: inspection.state,
      fault,
      fault_code: error.code,
      recoverable: !new Set(["indeterminate", "stopped", "complete"]).has(inspection.state),
    };
  }
}

function allowedPartialPath(relativePath) {
  if (new Set([
    "registration.json",
    "source-manifest.json",
    "plan.json",
    "ledger.jsonl",
    "checkpoint.json",
    "synthesis-eligibility.json",
    "result.json",
    "accounting.json",
    "terminal.json",
    "summary.json",
  ]).has(relativePath)) return true;
  return /^operations\/[A-Z0-9._-]+\/(?:input|terminal|evidence)\.json$/u.test(relativePath);
}

async function validateOperationArtifacts(root, inputs, ledger) {
  for (const caseId of ORCHESTRATED_RESEARCH_CASES) {
    const caseContext = inputs.cases.get(caseId);
    const operationId = caseContext.operation.operation_id;
    const inputPath = `operations/${operationId}/input.json`;
    const evidencePath = `operations/${operationId}/evidence.json`;
    const terminalPath = `operations/${operationId}/terminal.json`;
    if (await pathExists(safeArtifactPath(root, inputPath))) {
      const input = await readCanonicalArtifact(root, inputPath, 262_144);
      if (canonicalJsonV1(input.value) !== canonicalJsonV1(operationInput(caseContext))) fail("OPERATION_INPUT_DRIFT", `${operationId} input drifted or leaked hidden bytes`);
    }
    if (await pathExists(safeArtifactPath(root, evidencePath))) {
      const evidence = await readCanonicalArtifact(root, evidencePath, 262_144);
      if (canonicalJsonV1(evidence.value) !== canonicalJsonV1(evidenceArtifact(caseContext))) fail("WORKER_RESULT_DRIFT", `${operationId} evidence drifted from the registered fake worker`);
    }
    if (await pathExists(safeArtifactPath(root, terminalPath))) {
      const terminal = await readCanonicalArtifact(root, terminalPath, 65_536);
      if (terminal.value.status === "success") {
        const evidence = await readCanonicalArtifact(root, evidencePath, 262_144);
        if (terminal.value.evidence_sha256 !== evidence.sha256 || terminal.value.worker_requests !== 1 || terminal.value.producer !== "deterministic-fake-worker-v1") fail("OPERATION_TERMINAL_MISMATCH", `${operationId} success terminal does not bind its evidence`);
      } else if (!new Set(["indeterminate-no-replay", "cancelled-before-dispatch"]).has(terminal.value.status) || terminal.value.evidence_sha256 !== ZERO_DIGEST || terminal.value.producer !== "lib/recursus/orchestrated-research.mjs") {
        fail("OPERATION_TERMINAL_MISMATCH", `${operationId} host terminal classification is invalid`);
      }
    }
  }
  for (const entry of ledger.entries.filter((item) => item.kind === "OPERATION_TERMINAL")) {
    const operationId = entry.payload.operation_id;
    const terminal = await readCanonicalArtifact(root, `operations/${operationId}/terminal.json`, 65_536);
    if (entry.payload.terminal_sha256 !== terminal.sha256 || entry.payload.status !== terminal.value.status) fail("OPERATION_TERMINAL_MISMATCH", `${operationId} ledger terminal does not match its artifact`);
    if (entry.payload.evidence_sha256 !== terminal.value.evidence_sha256) fail("OPERATION_TERMINAL_MISMATCH", `${operationId} evidence identity mismatched`);
  }
}

async function validateCheckpoint(root, ledger) {
  if (!(await pathExists(safeArtifactPath(root, "checkpoint.json")))) return undefined;
  const checkpoint = await readCanonicalArtifact(root, "checkpoint.json", 65_536);
  if (checkpoint.value.ledger_sequence > ledger.entries.length || checkpoint.value.ledger_sequence < 2) fail("STALE_CHECKPOINT", "Checkpoint sequence is outside the validated ledger");
  const sealed = ledger.entries[checkpoint.value.ledger_sequence - 1];
  if (sealed.entry_digest !== checkpoint.value.ledger_tail_digest) fail("STALE_CHECKPOINT", "Checkpoint tail digest is stale or mismatched");
  const decisions = evidenceDecisionSets(ledger.entries.slice(0, checkpoint.value.ledger_sequence));
  if (canonicalJsonV1(checkpoint.value.accepted_evidence_ids) !== canonicalJsonV1(decisions.accepted) || canonicalJsonV1(checkpoint.value.rejected_evidence_ids) !== canonicalJsonV1(decisions.rejected)) {
    fail("CHECKPOINT_PROJECTION_MISMATCH", "Checkpoint evidence projection does not match the ledger prefix");
  }
  return checkpoint.value;
}

async function validateTerminalPackage(context, ledger) {
  const summary = await readCanonicalArtifact(context.root, "summary.json", 262_144);
  const projection = structuredClone(summary.value);
  delete projection.summary_projection_sha256;
  if (summary.value.summary_projection_sha256 !== sha256V1(Buffer.from(canonicalJsonV1(projection), "utf8"))) fail("SUMMARY_DIGEST_MISMATCH", "Summary projection digest mismatched");
  const expectedInventory = await buildArtifactInventory(context);
  if (canonicalJsonV1(summary.value.artifact_inventory) !== canonicalJsonV1(expectedInventory)) fail("ARTIFACT_INVENTORY_MISMATCH", "Summary inventory does not match physical retained files");
  const actualFiles = await walkArtifactFiles(context.root);
  const expectedFiles = [...summary.value.artifact_inventory.map((item) => item.path), "summary.json"].sort();
  if (canonicalJsonV1(actualFiles) !== canonicalJsonV1(expectedFiles)) fail("UNREGISTERED_ARTIFACT", "Physical artifact inventory contains missing or extra files");
  const normalized = await normalizedPreparationBytes(context.root);
  if (summary.value.normalized_capture_sha256 !== sha256V1(normalized)) fail("NORMALIZED_CAPTURE_MISMATCH", "Normalized capture identity mismatched");
  const runTerminal = ledger.entries.at(-1);
  if (runTerminal.kind !== "RUN_TERMINAL") fail("MISSING_RUN_TERMINAL", "Summary exists without a durable terminal");
  const terminal = await readCanonicalArtifact(context.root, "terminal.json", 65_536);
  if (terminal.value.decision !== runTerminal.payload.decision || terminal.value.reason !== runTerminal.payload.reason || terminal.value.last_ledger_digest !== ledger.last_digest || terminal.value.ledger_sequence !== ledger.entries.length || terminal.value.accounting_sha256 !== runTerminal.payload.accounting_sha256) {
    fail("TERMINAL_IDENTITY_MISMATCH", "Terminal artifact does not match the final ledger entry");
  }
  const accounting = await readCanonicalArtifact(context.root, "accounting.json", 65_536);
  const expectedAccounting = accountingValue(ledger.entries, 1);
  if (canonicalJsonV1(accounting.value) !== canonicalJsonV1(expectedAccounting) || accounting.sha256 !== runTerminal.payload.accounting_sha256) fail("ACCOUNTING_MISMATCH", "Accounting does not exactly match the ledger");
  if (runTerminal.payload.decision === "COMPLETE") {
    const eligibility = await readCanonicalArtifact(context.root, "synthesis-eligibility.json", 262_144);
    const result = await readCanonicalArtifact(context.root, "result.json", 262_144);
    const acceptedIds = acceptedEvidence(ledger.entries).map((item) => item.evidence_id).sort();
    const rejectedIds = rejectedEvidence(ledger.entries).map((item) => item.evidence_id).sort();
    if (eligibility.value.result_sha256 !== result.sha256 || canonicalJsonV1(eligibility.value.accepted_evidence_ids) !== canonicalJsonV1(acceptedIds) || canonicalJsonV1(eligibility.value.rejected_evidence_ids) !== canonicalJsonV1(rejectedIds)) fail("SYNTHESIS_IDENTITY_MISMATCH", "Synthesis eligibility does not match accepted and rejected evidence");
    const resultAccepted = result.value.accepted_evidence.map((item) => item.evidence_id).sort();
    if (canonicalJsonV1(resultAccepted) !== canonicalJsonV1(acceptedIds) || result.value.rejected_evidence_ids.some((id) => acceptedIds.includes(id))) fail("REJECTED_EVIDENCE_REAPPEARED", "Result includes rejected or omits accepted evidence");
  }
  if (summary.value.state !== deriveStateFromLedger(ledger) || summary.value.decision !== runTerminal.payload.decision) fail("SUMMARY_STATE_MISMATCH", "Summary state does not match ledger-derived state");
  return { summary: summary.value, terminal: terminal.value, accounting: accounting.value };
}

export async function inspectOrchestratedResearch(root) {
  clearWindowsMetadataForRoot(root);
  const context = await validateDisposableRoot(root);
  const topLevel = await readdir(context.root);
  if (topLevel.length === 0) return { root: context.root, state: "empty", entries: [] };
  if (topLevel.includes(LOCK_NAME)) return { root: context.root, state: "locked", entries: [...topLevel].sort() };
  if (!topLevel.includes("registration.json")) fail("MISSING_REGISTRATION", "Non-empty root has no Stage 1 registration");
  const files = await walkArtifactFiles(context.root);
  const unknown = files.filter((relativePath) => !allowedPartialPath(relativePath));
  if (unknown.length) fail("UNREGISTERED_ARTIFACT", "Run root contains unregistered artifacts", { unknown });
  const inputs = await loadFrozenInputs();
  await validateRegisteredClosure(context, inputs);
  const ledger = await readLedger(context.root);
  if (ledger.entries.length < 2) fail("LEDGER_TRANSITION_INVALID", "Registered run lacks its plan record");
  const registration = await readCanonicalArtifact(context.root, "registration.json", 262_144);
  if (canonicalJsonV1(ledger.entries[0].payload) !== canonicalJsonV1(registrationLedgerPayload(registration.value))) fail("REGISTRATION_LEDGER_MISMATCH", "Ledger registration does not match registration.json");
  await validateOperationArtifacts(context.root, inputs, ledger);
  const checkpoint = await validateCheckpoint(context.root, ledger);
  const state = deriveStateFromLedger(ledger);
  let terminalPackage;
  if (files.includes("summary.json")) terminalPackage = await validateTerminalPackage(context, ledger);
  const decisions = evidenceDecisionSets(ledger.entries);
  return {
    root: context.root,
    state,
    ledger_entries: ledger.entries.length,
    ledger_tail_digest: ledger.last_digest,
    checkpoint_id: checkpoint?.checkpoint_id ?? null,
    accepted_evidence: decisions.accepted.length,
    rejected_evidence: decisions.rejected.length,
    artifact_count: files.length,
    decision: terminalPackage?.summary.decision ?? null,
    normalized_capture_sha256: terminalPackage?.summary.normalized_capture_sha256 ?? null,
  };
}

function latestOperation(ledger) {
  const items = [...ledger.operation_states.entries()];
  return items.length ? { operation_id: items.at(-1)[0], state: items.at(-1)[1] } : undefined;
}

async function recoverPartialRun(context, inputs, ledger) {
  const checkpointed = [...ledger.operation_states.values()].filter((state) => state === "checkpointed").length;
  if (checkpointed === ORCHESTRATED_RESEARCH_CASES.length) {
    await finalizeCompleteRun(context);
    return;
  }
  const latest = latestOperation(ledger);
  if (!latest) {
    await sealStoppedRun(context, "interrupted-before-operation-admission");
    return;
  }
  const caseContext = [...inputs.cases.values()].find((item) => item.operation.operation_id === latest.operation_id);
  if (!caseContext) fail("OPERATION_IDENTITY_MISMATCH", `Unknown operation ${latest.operation_id}`);
  if (latest.state === "admitted") {
    await writeHostOperationTerminal(context, latest.operation_id, "cancelled-before-dispatch", 0);
    await sealStoppedRun(context, "admitted-operation-cancelled-before-worker-reachability", latest.operation_id);
    return;
  }
  if (latest.state === "dispatched") {
    const terminalPath = safeArtifactPath(context.root, `operations/${latest.operation_id}/terminal.json`);
    const evidencePath = safeArtifactPath(context.root, `operations/${latest.operation_id}/evidence.json`);
    if (await pathExists(terminalPath) && await pathExists(evidencePath)) {
      const terminal = await readCanonicalArtifact(context.root, `operations/${latest.operation_id}/terminal.json`, 65_536);
      const evidence = await readCanonicalArtifact(context.root, `operations/${latest.operation_id}/evidence.json`, 262_144);
      if (terminal.value.status !== "success" || terminal.value.evidence_sha256 !== evidence.sha256) fail("UNTRUSTED_OPERATION_TERMINAL", "Sealed operation artifacts are inconsistent");
      await appendLedger(context, "OPERATION_TERMINAL", {
        operation_id: latest.operation_id,
        status: terminal.value.status,
        terminal_sha256: terminal.sha256,
        evidence_sha256: evidence.sha256,
        worker_requests: 1,
      });
      await processOperationEvidence(context, inputs, caseContext, undefined, { stopAfterDecision: true });
      await sealStoppedRun(context, "trusted-terminal-validated-without-worker-replay", latest.operation_id);
    } else {
      await writeHostOperationTerminal(context, latest.operation_id, "indeterminate-no-replay", 1);
      await sealStoppedRun(context, "dispatched-without-trusted-terminal-no-replay", latest.operation_id);
    }
    return;
  }
  if (latest.state === "terminal") {
    const evidencePath = safeArtifactPath(context.root, `operations/${latest.operation_id}/evidence.json`);
    if (await pathExists(evidencePath)) {
      await processOperationEvidence(context, inputs, caseContext, undefined, { stopAfterDecision: true });
      await sealStoppedRun(context, "trusted-terminal-evidence-checkpointed-without-worker-replay", latest.operation_id);
    } else {
      await sealStoppedRun(context, "terminal-has-no-evidence-and-run-stopped", latest.operation_id);
    }
    return;
  }
  await sealStoppedRun(context, "checkpointed-partial-evidence-preserved", latest.operation_id);
}

export async function recoverOrchestratedResearch(root) {
  clearWindowsMetadataForRoot(root);
  const context = await validateDisposableRoot(root);
  if (!(await pathExists(path.join(context.root, "registration.json")))) {
    fail("MISSING_REGISTRATION", "Recovery requires an existing Stage 1 registration");
  }
  const lock = await acquireRoot(context);
  try {
    const inputs = await loadFrozenInputs();
    await validateRegisteredClosure(context, inputs);
    let ledger = await readLedger(context.root);
    const state = deriveStateFromLedger(ledger);
    if (state === "complete" || state === "stopped") {
      const terminal = ledger.entries.at(-1).payload;
      if (!(await pathExists(safeArtifactPath(context.root, "accounting.json")))) fail("MISSING_ACCOUNTING", "Terminal ledger lacks accounting artifact");
      const accounting = await readCanonicalArtifact(context.root, "accounting.json", 65_536);
      if (!(await pathExists(safeArtifactPath(context.root, "terminal.json")))) {
        await writeCanonicalExclusive(context, "terminal.json", await terminalArtifactValue(context.root, terminal.decision, terminal.reason, accounting.sha256), 65_536);
      }
      if (!(await pathExists(safeArtifactPath(context.root, "summary.json")))) await writeSummary(context, terminal.decision);
    } else if (state === "synthesis-eligible") {
      await finalizeCompleteRun(context);
    } else {
      await recoverPartialRun(context, inputs, ledger);
    }
  } finally {
    await releaseRoot(context, lock);
  }
  return inspectOrchestratedResearch(root);
}

export function formatOrchestratedResearchError(error) {
  if (error instanceof OrchestratedResearchError) {
    return { ok: false, code: error.code, message: error.message, details: error.details };
  }
  return { ok: false, code: "UNEXPECTED_ERROR", message: error instanceof Error ? error.message : String(error) };
}

export const __test = Object.freeze({
  ACTIVE_ROOTS,
  CHECKPOINT_STAGE_NAME,
  EVALUATOR_FIXTURE_PATH,
  FIXTURE_ROOT,
  LOCK_NAME,
  REPOSITORY_ROOT,
  SOURCE_FILES,
  WORKER_FIXTURE_PATH,
  artifactLimit,
  acquireRoot,
  canonicalBytes,
  evaluateEvidenceCandidate,
  loadFrozenInputs,
  readLedger,
  releaseRoot,
  safeArtifactPath,
  sealLedgerEntry,
  validateDisposableRoot,
});
