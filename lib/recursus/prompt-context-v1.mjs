import { createHash, timingSafeEqual } from "node:crypto";
import {
  constants as fsConstants,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RC4_NON_CLAIM =
  "Structural prompt and context parity validated. No runner, provider, model, workflow behavior, factuality, safety, quality, feature-parity, or comparative claim was verified.";

export const RC4_BOUNDED_CLAIM =
  "For the registered synthetic fixtures, four pilot mode contracts compile into two offline route-delivery bundles whose decoded semantic block identities, authority, trust, order, source hashes, policies, and output contracts match under the registered adapter rules.";

export const RC4_COMPILER_ID = "recursus-prompt-context-compiler";
export const RC4_COMPILER_VERSION = "1.0.0";
export const RC4_CANONICAL_VERSION = "1.0.0";
export const RC4_CAPACITY_BYTES = 196608;

const RC4_REGISTRATION_SCHEMA_ID =
  "https://career-ops.test/schemas/recursus/rc4/prompt-context-v2/registration.schema.json";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, "..", "..");
const PACKAGE_RELATIVE = "evals/recursus/rc4-prompt-context-v2";
const PACKAGE_ROOT = path.join(REPOSITORY_ROOT, ...PACKAGE_RELATIVE.split("/"));

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_OUTPUT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_ARRAY_ITEMS = 8192;
const MAX_OBJECT_PROPERTIES = 4096;
const MAX_STRING_CHARACTERS = 2 * 1024 * 1024;
const SHA256_RE = /^[a-f0-9]{64}$/;
const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const ASCII_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const SEMVER_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const WINDOWS_DEVICE_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const PACKAGE_FIXED_PATHS = Object.freeze([
  `${PACKAGE_RELATIVE}/registration.json`,
  `${PACKAGE_RELATIVE}/source-snapshot.json`,
  `${PACKAGE_RELATIVE}/schemas/registration.schema.json`,
  `${PACKAGE_RELATIVE}/schemas/mode-manifest.schema.json`,
  `${PACKAGE_RELATIVE}/schemas/adapter-manifest.schema.json`,
  `${PACKAGE_RELATIVE}/schemas/compiled-prompt.schema.json`,
  `${PACKAGE_RELATIVE}/schemas/route-bundle.schema.json`,
  `${PACKAGE_RELATIVE}/schemas/validation-result.schema.json`,
  `${PACKAGE_RELATIVE}/modes/oferta.json`,
  `${PACKAGE_RELATIVE}/modes/pdf.json`,
  `${PACKAGE_RELATIVE}/modes/cover.json`,
  `${PACKAGE_RELATIVE}/modes/email.json`,
  `${PACKAGE_RELATIVE}/adapters/co-claude-code-reference-v1.json`,
  `${PACKAGE_RELATIVE}/adapters/recursus-direct-v1.json`,
  `${PACKAGE_RELATIVE}/fixtures/invocations.json`,
]);
const PILOT_MODES = Object.freeze(["oferta", "pdf", "cover", "email"]);
const TARGET_IDS = Object.freeze([
  "co-claude-code-reference-v1",
  "recursus-direct-v1",
]);
const LAYERS = new Set([
  "system.invariant",
  "context.profile",
  "context.memory",
  "data.task",
  "invocation",
  "output.frame",
]);
const AUTHORITIES = new Set(["policy", "instruction", "reference", "data"]);
const TRUST_VALUES = new Set([
  "system_owned",
  "user_primary",
  "user_procedural",
  "derived_unverified",
  "user_cannot_confirm",
  "memory_advisory",
  "external_untrusted",
  "runtime_attested",
]);
const FORBIDDEN_SOURCE_PARTS = Object.freeze([
  "modes/_profile.md",
  "modes/_custom.md",
  "modes/_brief.md",
  "voice-dna.md",
  "config/profile.yml",
  "reports/",
  "data/",
  "documents/",
  "interview-prep/",
  "/oracles/",
  "/oracle/",
  "/scenarios/",
  "/evaluator-fixtures/",
  "/evidence/",
  "rc2-claude-code-reference",
  "rc3-recursus-direct",
  ".git/",
]);
const CREDENTIAL_PATTERN =
  /(?:-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk[-_]|ghp_|github_pat_|glpat-|xox[baprs]-)[A-Za-z0-9_-]{12,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\bBearer[ \t]+[A-Za-z0-9._~+\/-]{8,}|\b(?:proxy-)?authorization[ \t]*:[ \t]*Basic[ \t]+[A-Za-z0-9+/]{8,}={0,2}|\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key)[ \t]*[:=][ \t]*["']?[A-Za-z0-9._~+\/-]{8,}|(?:^|[^A-Za-z0-9])(?:[A-Z][A-Z0-9]*_)*(?:API_KEY|ACCESS_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[ \t]*[:=][ \t]*["']?[A-Za-z0-9._~+\/-]{8,})/i;
const PRIVATE_PATH_PATTERN =
  /(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|\/(?:Users|home)\/[A-Za-z0-9._-]+\/)/;
const EVALUATOR_ONLY_PREFIXES = Object.freeze([
  "REC-BENCH-LEAK-CANARY",
  "ORACLE-",
  "POLICY-SOURCE-",
  "MANIFEST-",
  "FIXTURE-FABRICATED-",
  "FIXTURE-FALSE-PROVENANCE-",
  "FIXTURE-PASSING-",
  "FIXTURE-SUBMIT-ATTEMPT-",
  "RESULT-",
  "RESULT-CLAIM-",
  "CLAIM-",
  "CLASS-",
  "ACTION-",
  "ACTION-RECORD-",
  "ARTIFACT-SUMMARY-",
]);
const EVALUATOR_ONLY_DIGESTS = Object.freeze([
  "d805a61754bd4ccced2c89f7c5d74aa5bfac39cce4e94e5591aef4f451b85001",
  "8a7fb5bb9ff07eb55216d2cbef257e8229a822d40b34220d4014046abaf97aa9",
  "9dde92c8f040d7e418c3cc94c01cc3d875c4845d235d7273dd72f37019ecf3c7",
  "1c1b618fe361ade578ded51a1254e64c2dd9078bc0fdab2506f9d463d2174dad",
  "d32eb9a8d0b7f453fbd658a13a29e6738121470ec9e7d8c0e95e901fe816060a",
  "ad18973260c384c5f4bd823960f3fc47287f52b7d36ae3212a72edf1f538fdfa",
  "4c046b6567c9a1d6d2c3bde38b7b3e51ec9bd11a4d07124e940e009820354ed0",
  "217647a8a18df60968d82ddc6e0dcd72c00cd1688df6cec6320f48e0dfb647b5",
  "4af839c3613139f066f95a1a97c86cc2dfdc8020d87b6e6be6ee593e227e16d1",
  "60d09de583edcc5cef69da1155f3efbde4f9acaa8687ded28c22eda4c76ca65a",
  "1b67f473ab665a63437861cec7a2747f49609b01fe1a59ba60be64b2e983179b",
]);
const EVALUATOR_ONLY_PATH_PARTS = Object.freeze([
  "evals/recursus/career-bench-v1/oracle/",
  "evals/recursus/career-bench-v1/scenarios/",
  "evals/recursus/career-bench-v1/evaluator-fixtures/",
  "evals/recursus/rc2-",
  "evals/recursus/rc3-",
  "/evidence/",
]);
const EVALUATOR_ONLY_FILE_ID_PATTERN =
  /(?:^|[^A-Za-z0-9_-])FILE-(?:00[6-9]|01[4-9]|020)(?![A-Za-z0-9_-])/i;
const EVALUATOR_ONLY_RELATIVE_PATH_PATTERN =
  /(?:^|[^a-z0-9._-])(?:oracle|scenarios|evaluator-fixtures)\//i;

const ALLOWED_SCHEMA_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "$comment",
  "title",
  "description",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "minProperties",
  "maxProperties",
  "propertyNames",
  "dependentRequired",
  "items",
  "prefixItems",
  "contains",
  "minContains",
  "maxContains",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "enum",
  "const",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
]);

const CONTEXT_INTERNALS = new WeakMap();
const VALID_WRITE_PLANS = new WeakSet();

export class PromptContextV1Error extends Error {
  constructor(code, logicalField, digestPrefix) {
    super(`${code}:${logicalField}`);
    this.name = "PromptContextV1Error";
    this.code = safeDiagnosticToken(code, "RC4_INTERNAL_ERROR");
    this.logical_field = safeDiagnosticField(logicalField);
    if (digestPrefix !== undefined) {
      this.digest_prefix = safeDigestPrefix(digestPrefix);
    }
  }

  toJSON() {
    const value = {
      code: this.code,
      logical_field: this.logical_field,
    };
    if (this.digest_prefix !== undefined) value.digest_prefix = this.digest_prefix;
    return value;
  }
}

function fail(code, logicalField, digestPrefix) {
  throw new PromptContextV1Error(code, logicalField, digestPrefix);
}

function safeDiagnosticToken(value, fallback) {
  return typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value)
    ? value
    : fallback;
}

function safeDiagnosticField(value) {
  return typeof value === "string" && /^[a-z0-9_.\[\]-]{1,160}$/.test(value)
    ? value
    : "unknown";
}

function safeDigestPrefix(value) {
  const text = String(value).replace(/^sha256:/, "").toLowerCase();
  return /^[a-f0-9]{8,16}$/.test(text) ? text : "00000000";
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function codePointLength(value) {
  return Array.from(value).length;
}

function assertNoLoneSurrogates(value, logicalField) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail("RC4_INVALID_UNICODE", logicalField);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      fail("RC4_INVALID_UNICODE", logicalField);
    }
  }
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value, logicalField, depth, ancestors) {
  if (depth > MAX_DEPTH) fail("RC4_LIMIT_EXCEEDED", logicalField);
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    assertNoLoneSurrogates(value, logicalField);
    if (codePointLength(value) > MAX_STRING_CHARACTERS) {
      fail("RC4_LIMIT_EXCEEDED", logicalField);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("RC4_NON_CANONICAL_NUMBER", logicalField);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) fail("RC4_LIMIT_EXCEEDED", logicalField);
    if (ancestors.has(value)) fail("RC4_NON_JSON_VALUE", logicalField);
    ancestors.add(value);
    const items = value.map((item, index) =>
      canonicalValue(item, `${logicalField}[${index}]`, depth + 1, ancestors),
    );
    ancestors.delete(value);
    return `[${items.join(",")}]`;
  }
  if (!isPlainObject(value)) fail("RC4_NON_JSON_VALUE", logicalField);
  const keys = Object.keys(value);
  if (keys.length > MAX_OBJECT_PROPERTIES) fail("RC4_LIMIT_EXCEEDED", logicalField);
  if (ancestors.has(value)) fail("RC4_NON_JSON_VALUE", logicalField);
  ancestors.add(value);
  keys.sort(compareCodeUnits);
  const members = [];
  for (const key of keys) {
    assertNoLoneSurrogates(key, logicalField);
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      fail("RC4_DANGEROUS_JSON_KEY", logicalField);
    }
    const item = value[key];
    if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
      fail("RC4_NON_JSON_VALUE", `${logicalField}.${key}`);
    }
    members.push(
      `${JSON.stringify(key)}:${canonicalValue(item, `${logicalField}.${key}`, depth + 1, ancestors)}`,
    );
  }
  ancestors.delete(value);
  return `{${members.join(",")}}`;
}

export function canonicalJsonV1(value) {
  return `${canonicalValue(value, "document", 0, new Set())}\n`;
}

export function sha256V1(value) {
  if (!(typeof value === "string" || Buffer.isBuffer(value) || value instanceof Uint8Array)) {
    fail("RC4_NON_BYTE_HASH_INPUT", "hash.input");
  }
  return createHash("sha256").update(value).digest("hex");
}

function domainDigest(domain, value) {
  return sha256V1(canonicalJsonV1({ domain, version: "1.0.0", value }));
}

function digestRecord(projectionId, domain, value) {
  return {
    projection_id: projectionId,
    sha256: domainDigest(domain, value),
  };
}

class StrictJsonParser {
  constructor(text, logicalField) {
    this.text = text;
    this.logicalField = logicalField;
    this.index = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue(0, this.logicalField);
    this.skipWhitespace();
    if (this.index !== this.text.length) this.invalid(this.logicalField);
    return value;
  }

  invalid(field) {
    fail("RC4_INVALID_JSON", field);
  }

  skipWhitespace() {
    while (this.index < this.text.length && /[\x20\x09\x0a\x0d]/.test(this.text[this.index])) {
      this.index += 1;
    }
  }

  parseValue(depth, field) {
    if (depth > MAX_DEPTH) fail("RC4_LIMIT_EXCEEDED", field);
    const character = this.text[this.index];
    if (character === "{") return this.parseObject(depth, field);
    if (character === "[") return this.parseArray(depth, field);
    if (character === '"') return this.parseString(field);
    if (character === "t" && this.text.slice(this.index, this.index + 4) === "true") {
      this.index += 4;
      return true;
    }
    if (character === "f" && this.text.slice(this.index, this.index + 5) === "false") {
      this.index += 5;
      return false;
    }
    if (character === "n" && this.text.slice(this.index, this.index + 4) === "null") {
      this.index += 4;
      return null;
    }
    if (character === "-" || (character >= "0" && character <= "9")) {
      return this.parseNumber(field);
    }
    this.invalid(field);
  }

  parseObject(depth, field) {
    this.index += 1;
    const value = Object.create(null);
    const keys = new Set();
    this.skipWhitespace();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return value;
    }
    while (this.index < this.text.length) {
      if (this.text[this.index] !== '"') this.invalid(field);
      const key = this.parseString(field);
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        fail("RC4_DANGEROUS_JSON_KEY", field);
      }
      if (keys.has(key)) fail("RC4_DUPLICATE_JSON_KEY", field);
      keys.add(key);
      if (keys.size > MAX_OBJECT_PROPERTIES) fail("RC4_LIMIT_EXCEEDED", field);
      this.skipWhitespace();
      if (this.text[this.index] !== ":") this.invalid(field);
      this.index += 1;
      this.skipWhitespace();
      value[key] = this.parseValue(depth + 1, `${field}.${key}`);
      this.skipWhitespace();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return value;
      }
      if (this.text[this.index] !== ",") this.invalid(field);
      this.index += 1;
      this.skipWhitespace();
    }
    this.invalid(field);
  }

  parseArray(depth, field) {
    this.index += 1;
    const value = [];
    this.skipWhitespace();
    if (this.text[this.index] === "]") {
      this.index += 1;
      return value;
    }
    while (this.index < this.text.length) {
      if (value.length >= MAX_ARRAY_ITEMS) fail("RC4_LIMIT_EXCEEDED", field);
      value.push(this.parseValue(depth + 1, `${field}[${value.length}]`));
      this.skipWhitespace();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return value;
      }
      if (this.text[this.index] !== ",") this.invalid(field);
      this.index += 1;
      this.skipWhitespace();
    }
    this.invalid(field);
  }

  parseString(field) {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.text.length) {
      const code = this.text.charCodeAt(this.index);
      if (!escaped && code === 0x22) {
        this.index += 1;
        const token = this.text.slice(start, this.index);
        let parsed;
        try {
          parsed = JSON.parse(token);
        } catch {
          this.invalid(field);
        }
        assertNoLoneSurrogates(parsed, field);
        if (codePointLength(parsed) > MAX_STRING_CHARACTERS) {
          fail("RC4_LIMIT_EXCEEDED", field);
        }
        return parsed;
      }
      if (!escaped && code < 0x20) this.invalid(field);
      if (escaped) {
        const character = this.text[this.index];
        if (character === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(this.text.slice(this.index + 1, this.index + 5))) {
            this.invalid(field);
          }
          this.index += 4;
        } else if (!'"\\/bfnrt'.includes(character)) {
          this.invalid(field);
        }
        escaped = false;
      } else if (code === 0x5c) {
        escaped = true;
      }
      this.index += 1;
    }
    this.invalid(field);
  }

  parseNumber(field) {
    const tail = this.text.slice(this.index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(tail);
    if (!match) this.invalid(field);
    this.index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number) || Object.is(number, -0)) {
      fail("RC4_NON_CANONICAL_NUMBER", field);
    }
    return number;
  }
}

function decodeUtf8Fatal(bytes, logicalField) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("RC4_UTF8_BOM_FORBIDDEN", logicalField);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    fail("RC4_MALFORMED_UTF8", logicalField);
  }
  assertNoLoneSurrogates(text, logicalField);
  return text;
}

function parseStrictJsonBytes(bytes, logicalField) {
  if (bytes.length > MAX_JSON_BYTES) fail("RC4_LIMIT_EXCEEDED", logicalField);
  const text = decodeUtf8Fatal(bytes, logicalField);
  if (text.includes("\r")) fail("RC4_NON_LF_JSON", logicalField);
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail("RC4_JSON_FINAL_NEWLINE", logicalField);
  }
  const value = new StrictJsonParser(text, logicalField).parse();
  if (text !== canonicalJsonV1(value)) fail("RC4_NON_CANONICAL_JSON", logicalField);
  return value;
}

function assertObject(value, logicalField) {
  if (!isPlainObject(value)) fail("RC4_INVALID_SHAPE", logicalField);
  return value;
}

function assertArray(value, logicalField) {
  if (!Array.isArray(value)) fail("RC4_INVALID_SHAPE", logicalField);
  return value;
}

function assertString(value, logicalField, max = 512) {
  if (typeof value !== "string" || value.length === 0 || codePointLength(value) > max) {
    fail("RC4_INVALID_SHAPE", logicalField);
  }
  assertNoLoneSurrogates(value, logicalField);
  return value;
}

function assertId(value, logicalField) {
  assertString(value, logicalField, 128);
  if (!ASCII_ID_RE.test(value)) fail("RC4_INVALID_ID", logicalField);
  return value;
}

function assertSemver(value, logicalField) {
  assertString(value, logicalField, 64);
  if (!SEMVER_RE.test(value)) fail("RC4_INVALID_VERSION", logicalField);
  return value;
}

function assertSha256(value, logicalField) {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail("RC4_INVALID_DIGEST", logicalField);
  }
  return value;
}

function assertDigest(value, logicalField) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) {
    fail("RC4_INVALID_DIGEST", logicalField);
  }
  return value;
}

function assertExactKeys(object, required, optional, logicalField) {
  assertObject(object, logicalField);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) fail("RC4_UNKNOWN_FIELD", `${logicalField}.${key}`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      fail("RC4_MISSING_FIELD", `${logicalField}.${key}`);
    }
  }
}

function normalizeRepositoryPath(value, logicalField) {
  assertString(value, logicalField, 512);
  if (!/^[\x21-\x7e]+$/.test(value)) fail("RC4_NON_ASCII_PATH", logicalField);
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\") ||
    value.includes(":") ||
    value.includes("//") ||
    value.endsWith("/")
  ) {
    fail("RC4_UNSAFE_PATH", logicalField);
  }
  const segments = value.split("/");
  if (segments.length === 0) fail("RC4_UNSAFE_PATH", logicalField);
  for (const segment of segments) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.endsWith(".") ||
      segment.endsWith(" ") ||
      !/^[A-Za-z0-9._-]+$/.test(segment) ||
      WINDOWS_DEVICE_RE.test(segment)
    ) {
      fail("RC4_UNSAFE_PATH", logicalField);
    }
  }
  if (segments.some((segment) => segment.toLowerCase() === ".git")) {
    fail("RC4_FORBIDDEN_SOURCE", logicalField);
  }
  return segments.join("/");
}

function portablePathKey(value) {
  return value.normalize("NFC").toLowerCase();
}

function assertNoPortableCollisions(paths, logicalField) {
  const seen = new Set();
  for (const item of paths) {
    const normalized = normalizeRepositoryPath(item, logicalField);
    const key = portablePathKey(normalized);
    if (seen.has(key)) fail("RC4_PORTABLE_PATH_COLLISION", logicalField);
    seen.add(key);
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function fixedPath(relativePath) {
  const normalized = normalizeRepositoryPath(relativePath, "read_plan.path");
  const resolved = path.resolve(REPOSITORY_ROOT, ...normalized.split("/"));
  if (!isWithin(REPOSITORY_ROOT, resolved)) fail("RC4_PATH_ESCAPE", "read_plan.path");
  return resolved;
}

async function assertRepoRootAssertion(candidate) {
  if (candidate === undefined) return;
  if (typeof candidate !== "string" || candidate.length === 0) {
    fail("RC4_REPO_ROOT_MISMATCH", "options.repo_root");
  }
  let asserted;
  let actual;
  try {
    asserted = await realpath(path.resolve(candidate));
    actual = await realpath(REPOSITORY_ROOT);
  } catch {
    fail("RC4_REPO_ROOT_MISMATCH", "options.repo_root");
  }
  if (portablePathKey(asserted.replaceAll("\\", "/")) !== portablePathKey(actual.replaceAll("\\", "/"))) {
    fail("RC4_REPO_ROOT_MISMATCH", "options.repo_root");
  }
}

async function validatePathChain(relativePath, logicalField, expectedType = "file") {
  const normalized = normalizeRepositoryPath(relativePath, logicalField);
  const segments = normalized.split("/");
  let current = REPOSITORY_ROOT;
  let rootReal;
  try {
    rootReal = await realpath(REPOSITORY_ROOT);
  } catch {
    fail("RC4_PATH_UNAVAILABLE", logicalField);
  }
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let info;
    try {
      info = await lstat(current);
    } catch {
      fail("RC4_PATH_UNAVAILABLE", logicalField);
    }
    if (info.isSymbolicLink()) fail("RC4_LINK_FORBIDDEN", logicalField);
    const final = index === segments.length - 1;
    if (!final && !info.isDirectory()) fail("RC4_PATH_TYPE", logicalField);
    if (final && expectedType === "file" && !info.isFile()) fail("RC4_PATH_TYPE", logicalField);
    if (final && expectedType === "directory" && !info.isDirectory()) fail("RC4_PATH_TYPE", logicalField);
    if (final && expectedType === "file" && typeof info.nlink === "number" && info.nlink !== 1) {
      fail("RC4_HARDLINK_FORBIDDEN", logicalField);
    }
    let resolved;
    try {
      resolved = await realpath(current);
    } catch {
      fail("RC4_PATH_UNAVAILABLE", logicalField);
    }
    if (!isWithin(rootReal, resolved)) fail("RC4_PATH_ESCAPE", logicalField);
  }
  return current;
}

async function readRegisteredFile(relativePath, logicalField, maxBytes, expected) {
  const absolute = await validatePathChain(relativePath, logicalField, "file");
  let info;
  try {
    info = await stat(absolute);
  } catch {
    fail("RC4_PATH_UNAVAILABLE", logicalField);
  }
  if (info.size > maxBytes) fail("RC4_LIMIT_EXCEEDED", logicalField);
  if (expected?.byte_count !== undefined && info.size !== expected.byte_count) {
    fail("RC4_SOURCE_SIZE_MISMATCH", logicalField);
  }
  let bytes;
  try {
    bytes = await readFile(absolute);
  } catch {
    fail("RC4_READ_FAILED", logicalField);
  }
  if (bytes.length !== info.size) fail("RC4_READ_RACE", logicalField);
  const digest = sha256V1(bytes);
  if (expected?.sha256 !== undefined && !safeHashEqual(digest, expected.sha256)) {
    fail("RC4_SOURCE_HASH_MISMATCH", logicalField, digest.slice(0, 12));
  }
  return { bytes, digest, absolute };
}

function safeHashEqual(left, right) {
  if (!SHA256_RE.test(left) || !SHA256_RE.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function auditSchema(schema, logicalField) {
  assertObject(schema, logicalField);
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    fail("RC4_SCHEMA_DRAFT", `${logicalField}.$schema`);
  }
  const refs = new Map();
  const nodes = new Map();

  function visit(node, pointer, depth) {
    if (depth > MAX_DEPTH) fail("RC4_SCHEMA_LIMIT", logicalField);
    if (typeof node === "boolean") return;
    assertObject(node, logicalField);
    nodes.set(pointer, node);
    for (const key of Object.keys(node)) {
      if (!ALLOWED_SCHEMA_KEYWORDS.has(key)) {
        fail("RC4_SCHEMA_KEYWORD", logicalField);
      }
    }
    if (Object.prototype.hasOwnProperty.call(node, "$ref")) {
      if (Object.keys(node).length !== 1) fail("RC4_SCHEMA_REF_SIBLING", logicalField);
      const ref = assertString(node.$ref, logicalField, 512);
      if (!ref.startsWith("#/") || ref.includes("%")) fail("RC4_SCHEMA_EXTERNAL_REF", logicalField);
      refs.set(pointer, ref);
      return;
    }
    const types = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
    if (types.includes("object") || node.properties !== undefined) {
      if (node.additionalProperties !== false) fail("RC4_SCHEMA_NOT_CLOSED", logicalField);
      // A closed object with a finite declared property set is bounded without
      // needing the optional maxProperties keyword.
    }
    if (types.includes("array") || node.items !== undefined || node.prefixItems !== undefined) {
      if (!Number.isInteger(node.maxItems) || node.maxItems < 0) {
        fail("RC4_SCHEMA_NOT_BOUNDED", logicalField);
      }
    }
    if (types.includes("string")) {
      if (!Number.isInteger(node.maxLength) || node.maxLength < 0) {
        fail("RC4_SCHEMA_NOT_BOUNDED", logicalField);
      }
    }
    if (node.$defs !== undefined) {
      assertObject(node.$defs, logicalField);
      for (const key of Object.keys(node.$defs).sort(compareCodeUnits)) {
        visit(node.$defs[key], `${pointer}/$defs/${pointerEscape(key)}`, depth + 1);
      }
    }
    if (node.properties !== undefined) {
      assertObject(node.properties, logicalField);
      for (const key of Object.keys(node.properties).sort(compareCodeUnits)) {
        visit(node.properties[key], `${pointer}/properties/${pointerEscape(key)}`, depth + 1);
      }
    }
    for (const keyword of ["items", "contains", "additionalProperties", "propertyNames", "not", "if", "then", "else"]) {
      if (node[keyword] !== undefined && typeof node[keyword] !== "boolean") {
        visit(node[keyword], `${pointer}/${keyword}`, depth + 1);
      }
    }
    if (Array.isArray(node.prefixItems)) {
      node.prefixItems.forEach((child, index) => visit(child, `${pointer}/prefixItems/${index}`, depth + 1));
    }
    for (const keyword of ["allOf", "anyOf", "oneOf"]) {
      if (node[keyword] !== undefined) {
        assertArray(node[keyword], logicalField).forEach((child, index) =>
          visit(child, `${pointer}/${keyword}/${index}`, depth + 1),
        );
      }
    }
  }

  visit(schema, "#", 0);
  const resolving = new Set();
  const resolved = new Set();
  function resolveRef(pointer) {
    if (resolved.has(pointer)) return;
    if (resolving.has(pointer)) fail("RC4_SCHEMA_REF_CYCLE", logicalField);
    resolving.add(pointer);
    const ref = refs.get(pointer);
    if (ref !== undefined) {
      const target = resolveJsonPointer(schema, ref, logicalField);
      const targetPointer = ref;
      if (target?.$ref !== undefined) resolveRef(targetPointer);
    }
    resolving.delete(pointer);
    resolved.add(pointer);
  }
  for (const pointer of refs.keys()) resolveRef(pointer);
}

function pointerEscape(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function resolveJsonPointer(root, ref, logicalField) {
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) fail("RC4_SCHEMA_EXTERNAL_REF", logicalField);
  let current = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isPlainObject(current) && !Array.isArray(current)) fail("RC4_SCHEMA_REF_MISSING", logicalField);
    if (!Object.prototype.hasOwnProperty.call(current, key)) fail("RC4_SCHEMA_REF_MISSING", logicalField);
    current = current[key];
  }
  return current;
}

function validateSchemaValue(value, schema, rootSchema, logicalField, refStack = new Set()) {
  if (typeof schema === "boolean") {
    if (!schema) fail("RC4_SCHEMA_VALIDATION", logicalField);
    return;
  }
  if (schema.$ref !== undefined) {
    if (refStack.has(schema.$ref)) fail("RC4_SCHEMA_REF_CYCLE", logicalField);
    refStack.add(schema.$ref);
    validateSchemaValue(value, resolveJsonPointer(rootSchema, schema.$ref, logicalField), rootSchema, logicalField, refStack);
    refStack.delete(schema.$ref);
    return;
  }
  if (schema.const !== undefined && canonicalJsonV1(value) !== canonicalJsonV1(schema.const)) {
    fail("RC4_SCHEMA_VALIDATION", logicalField);
  }
  if (schema.enum !== undefined) {
    const canonical = canonicalJsonV1(value);
    if (!schema.enum.some((item) => canonicalJsonV1(item) === canonical)) {
      fail("RC4_SCHEMA_VALIDATION", logicalField);
    }
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesJsonType(value, type))) fail("RC4_SCHEMA_VALIDATION", logicalField);
  }
  if (typeof value === "string") {
    const length = codePointLength(value);
    if (schema.minLength !== undefined && length < schema.minLength) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.maxLength !== undefined && length > schema.maxLength) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.pattern !== undefined) {
      let regex;
      try {
        regex = new RegExp(schema.pattern, "u");
      } catch {
        fail("RC4_SCHEMA_PATTERN", logicalField);
      }
      if (!regex.test(value)) fail("RC4_SCHEMA_VALIDATION", logicalField);
    }
    if (schema.format !== undefined) validateFormat(value, schema.format, logicalField);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.maximum !== undefined && value > schema.maximum) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.multipleOf !== undefined && value / schema.multipleOf % 1 !== 0) fail("RC4_SCHEMA_VALIDATION", logicalField);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = canonicalJsonV1(item);
        if (seen.has(key)) fail("RC4_SCHEMA_VALIDATION", logicalField);
        seen.add(key);
      }
    }
    if (Array.isArray(schema.prefixItems)) {
      schema.prefixItems.forEach((child, index) => {
        if (index < value.length) validateSchemaValue(value[index], child, rootSchema, `${logicalField}[${index}]`);
      });
    }
    if (schema.items !== undefined) {
      const start = Array.isArray(schema.prefixItems) ? schema.prefixItems.length : 0;
      for (let index = start; index < value.length; index += 1) {
        validateSchemaValue(value[index], schema.items, rootSchema, `${logicalField}[${index}]`);
      }
    }
    if (schema.contains !== undefined) {
      let count = 0;
      for (let index = 0; index < value.length; index += 1) {
        try {
          validateSchemaValue(value[index], schema.contains, rootSchema, `${logicalField}[${index}]`);
          count += 1;
        } catch (error) {
          if (!(error instanceof PromptContextV1Error) || error.code !== "RC4_SCHEMA_VALIDATION") throw error;
        }
      }
      const minimum = schema.minContains ?? 1;
      const maximum = schema.maxContains ?? Number.POSITIVE_INFINITY;
      if (count < minimum || count > maximum) fail("RC4_SCHEMA_VALIDATION", logicalField);
    }
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) fail("RC4_SCHEMA_VALIDATION", logicalField);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) fail("RC4_SCHEMA_VALIDATION", logicalField);
    const properties = schema.properties ?? Object.create(null);
    for (const required of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) fail("RC4_SCHEMA_VALIDATION", `${logicalField}.${required}`);
    }
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        validateSchemaValue(value[key], properties[key], rootSchema, `${logicalField}.${key}`);
      } else if (schema.additionalProperties === false) {
        fail("RC4_SCHEMA_VALIDATION", `${logicalField}.${key}`);
      } else if (isPlainObject(schema.additionalProperties) || typeof schema.additionalProperties === "boolean") {
        validateSchemaValue(value[key], schema.additionalProperties, rootSchema, `${logicalField}.${key}`);
      }
      if (schema.propertyNames !== undefined) validateSchemaValue(key, schema.propertyNames, rootSchema, logicalField);
    }
    for (const [key, dependencies] of Object.entries(schema.dependentRequired ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        for (const dependency of dependencies) {
          if (!Object.prototype.hasOwnProperty.call(value, dependency)) fail("RC4_SCHEMA_VALIDATION", logicalField);
        }
      }
    }
  }
  for (const child of schema.allOf ?? []) validateSchemaValue(value, child, rootSchema, logicalField);
  if (schema.anyOf !== undefined && countSchemaMatches(value, schema.anyOf, rootSchema, logicalField) < 1) {
    fail("RC4_SCHEMA_VALIDATION", logicalField);
  }
  if (schema.oneOf !== undefined && countSchemaMatches(value, schema.oneOf, rootSchema, logicalField) !== 1) {
    fail("RC4_SCHEMA_VALIDATION", logicalField);
  }
  if (schema.not !== undefined && schemaMatches(value, schema.not, rootSchema, logicalField)) {
    fail("RC4_SCHEMA_VALIDATION", logicalField);
  }
  if (schema.if !== undefined) {
    const branch = schemaMatches(value, schema.if, rootSchema, logicalField) ? schema.then : schema.else;
    if (branch !== undefined) validateSchemaValue(value, branch, rootSchema, logicalField);
  }
}

function countSchemaMatches(value, schemas, root, field) {
  return schemas.reduce((count, schema) => count + (schemaMatches(value, schema, root, field) ? 1 : 0), 0);
}

function schemaMatches(value, schema, root, field) {
  try {
    validateSchemaValue(value, schema, root, field);
    return true;
  } catch (error) {
    if (error instanceof PromptContextV1Error && error.code === "RC4_SCHEMA_VALIDATION") return false;
    throw error;
  }
}

function matchesJsonType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer") return Number.isSafeInteger(value);
  return typeof value === type;
}

function validateFormat(value, format, logicalField) {
  if (format === "sha256") return assertSha256(value, logicalField);
  if (format === "semver") return assertSemver(value, logicalField);
  if (format === "ascii-id") return assertId(value, logicalField);
  if (format === "relative-path") return normalizeRepositoryPath(value, logicalField);
  fail("RC4_SCHEMA_FORMAT", logicalField);
}

function schemaValidate(value, schema, logicalField, subSchema) {
  validateSchemaValue(value, subSchema ?? schema, schema, logicalField);
}

function getRefPath(ref, logicalField) {
  assertObject(ref, logicalField);
  return normalizeRepositoryPath(ref.path, `${logicalField}.path`);
}

function validateRefIntegrity(ref, logicalField) {
  assertObject(ref, logicalField);
  getRefPath(ref, logicalField);
  if (!Number.isSafeInteger(ref.byte_count) || ref.byte_count < 1 || ref.byte_count > MAX_JSON_BYTES) {
    fail("RC4_INVALID_SHAPE", `${logicalField}.byte_count`);
  }
  assertSha256(ref.sha256, `${logicalField}.sha256`);
}

function flattenRegistrationRefs(registration) {
  const refs = [
    registration.source_snapshot_ref,
    ...assertArray(registration.schema_refs, "registration.schema_refs"),
    ...assertArray(registration.mode_manifest_refs, "registration.mode_manifest_refs"),
    ...assertArray(registration.adapter_manifest_refs, "registration.adapter_manifest_refs"),
    registration.fixture_set_ref,
  ];
  refs.forEach((ref, index) => validateRefIntegrity(ref, `registration.refs[${index}]`));
  return refs;
}

function expectedRegisteredPaths() {
  return PACKAGE_FIXED_PATHS.filter((item) => !item.endsWith("/registration.json"));
}

function validateRegistrationRefs(registration) {
  const refs = flattenRegistrationRefs(registration);
  const paths = refs.map((ref) => getRefPath(ref, "registration.ref"));
  assertNoPortableCollisions(paths, "registration.refs");
  const expected = expectedRegisteredPaths();
  const actualSet = new Set(paths);
  if (actualSet.size !== expected.length || expected.some((item) => !actualSet.has(item))) {
    fail("RC4_REGISTRATION_CLOSURE", "registration.refs");
  }
  return new Map(refs.map((ref) => [ref.path, ref]));
}

function sourcePathAllowed(source, logicalField) {
  assertObject(source, logicalField);
  assertId(source.id, `${logicalField}.id`);
  const locator = assertString(source.path_or_mount, `${logicalField}.path_or_mount`, 512);
  if (locator.startsWith("synthetic://")) {
    if (!/^synthetic:\/\/[a-z0-9][a-z0-9._/-]{0,240}$/.test(locator) || locator.includes("..")) {
      fail("RC4_UNSAFE_PATH", `${logicalField}.path_or_mount`);
    }
  } else {
    const normalized = normalizeRepositoryPath(locator, `${logicalField}.path_or_mount`);
    const lowered = normalized.toLowerCase();
    for (const forbidden of FORBIDDEN_SOURCE_PARTS) {
      if (lowered === forbidden || lowered.includes(forbidden)) {
        fail("RC4_FORBIDDEN_SOURCE", `${logicalField}.path_or_mount`);
      }
    }
    if (lowered.endsWith("/cv.md") && !lowered.startsWith("evals/recursus/career-bench-v1/candidates/")) {
      fail("RC4_FORBIDDEN_SOURCE", `${logicalField}.path_or_mount`);
    }
    if (lowered.startsWith("evals/recursus/career-bench-v1/") &&
        !(lowered.startsWith("evals/recursus/career-bench-v1/candidates/") ||
          lowered.startsWith("evals/recursus/career-bench-v1/jobs/"))) {
      fail("RC4_EVALUATOR_SOURCE", `${logicalField}.path_or_mount`);
    }
  }
  if (!Number.isSafeInteger(source.byte_count) || source.byte_count < 1 || source.byte_count > MAX_SOURCE_BYTES) {
    fail("RC4_INVALID_SHAPE", `${logicalField}.byte_count`);
  }
  assertSha256(source.sha256, `${logicalField}.sha256`);
  assertId(source.source_class, `${logicalField}.source_class`);
  if (!AUTHORITIES.has(source.authority)) fail("RC4_INVALID_AUTHORITY", `${logicalField}.authority`);
  if (!TRUST_VALUES.has(source.trust)) fail("RC4_INVALID_TRUST", `${logicalField}.trust`);
  assertId(source.visibility, `${logicalField}.visibility`);
  assertId(source.normalization_rule_id, `${logicalField}.normalization_rule_id`);
  const allowedBlocks = assertArray(source.allowed_blocks, `${logicalField}.allowed_blocks`);
  if (allowedBlocks.length === 0 &&
      !(source.visibility === "package_internal" && ["package_contract", "implementation"].includes(source.source_class))) {
    fail("RC4_INVALID_SHAPE", `${logicalField}.allowed_blocks`);
  }
  for (const block of allowedBlocks) {
    if (!LAYERS.has(block)) fail("RC4_INVALID_LAYER", `${logicalField}.allowed_blocks`);
  }
  validateSourceClassification(source, logicalField);
}

function validateSourceClassification(source, logicalField) {
  if (source.path_or_mount.startsWith("synthetic://")) return;
  const locator = source.path_or_mount;
  if (locator.startsWith("evals/recursus/career-bench-v1/candidates/")) {
    const derived = locator.endsWith("/conflicted/story-summary.md");
    const expectedClass = derived ? "candidate_derived" : "candidate_primary";
    const expectedTrust = derived ? "derived_unverified" : "user_primary";
    if (source.source_class !== expectedClass || source.authority !== "reference" ||
        source.trust !== expectedTrust || source.visibility !== "agent_visible" ||
        canonicalJsonV1(source.allowed_blocks) !== canonicalJsonV1(["context.profile"])) {
      fail("RC4_SOURCE_CLASSIFICATION", logicalField);
    }
    return;
  }
  if (locator.startsWith("evals/recursus/career-bench-v1/jobs/")) {
    if (source.source_class !== "job_company" || source.authority !== "data" ||
        source.trust !== "external_untrusted" || source.visibility !== "agent_visible" ||
        canonicalJsonV1(source.allowed_blocks) !== canonicalJsonV1(["data.task"])) {
      fail("RC4_SOURCE_CLASSIFICATION", logicalField);
    }
    return;
  }
  const systemAuthorities = {
    "AGENTS.md": "policy",
    ".agents/skills/career-ops/SKILL.md": "instruction",
    "modes/_shared.md": "policy",
    "modes/_writing.md": "policy",
    "modes/oferta.md": "instruction",
    "modes/pdf.md": "instruction",
    "modes/cover.md": "instruction",
    "modes/email.md": "instruction",
  };
  if (Object.prototype.hasOwnProperty.call(systemAuthorities, locator)) {
    if (source.source_class !== "system_instruction" || source.authority !== systemAuthorities[locator] ||
        source.trust !== "system_owned" || source.visibility !== "agent_visible" ||
        canonicalJsonV1(source.allowed_blocks) !== canonicalJsonV1(["system.invariant"])) {
      fail("RC4_SOURCE_CLASSIFICATION", logicalField);
    }
    return;
  }
  if (!(source.visibility === "package_internal" && ["package_contract", "implementation"].includes(source.source_class))) {
    fail("RC4_UNREGISTERED_SOURCE", logicalField);
  }
}

function compareSourceDefinition(left, right, logicalField) {
  const fields = [
    "id",
    "path_or_mount",
    "byte_count",
    "sha256",
    "source_class",
    "authority",
    "trust",
    "visibility",
    "normalization_rule_id",
    "allowed_blocks",
  ];
  for (const field of fields) {
    if (canonicalJsonV1(left[field]) !== canonicalJsonV1(right[field])) {
      fail("RC4_SOURCE_DEFINITION_MISMATCH", `${logicalField}.${field}`);
    }
  }
}

function validateNoSensitiveText(text, logicalField) {
  if (CREDENTIAL_PATTERN.test(text)) fail("RC4_CREDENTIAL_LEAK", logicalField);
  if (PRIVATE_PATH_PATTERN.test(text)) fail("RC4_PRIVATE_PATH_LEAK", logicalField);
  const lower = text.toLowerCase();
  const portableLower = lower.replaceAll("\\", "/");
  if (portableLower.includes("/oracles/") || portableLower.includes("/oracle/") ||
      portableLower.includes("/scenarios/") || portableLower.includes("/evaluator-fixtures/") ||
      EVALUATOR_ONLY_PATH_PARTS.some((part) => portableLower.includes(part)) ||
      EVALUATOR_ONLY_RELATIVE_PATH_PATTERN.test(portableLower) ||
      EVALUATOR_ONLY_FILE_ID_PATTERN.test(text) ||
      lower.includes("fixture-local") || lower.includes("evidence-v17-final") ||
      lower.includes("recursus-rc2") || lower.includes("recursus-rc3") ||
      EVALUATOR_ONLY_PREFIXES.some((token) => text.includes(token)) ||
      EVALUATOR_ONLY_DIGESTS.some((digest) => lower.includes(digest))) {
    fail("RC4_EVALUATOR_LEAK", logicalField);
  }
}

function normalizeTextSource(bytes, source, logicalField) {
  const text = decodeUtf8Fatal(bytes, logicalField);
  if (text.includes("\r")) fail("RC4_TEXT_NORMALIZATION", logicalField);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    fail("RC4_TEXT_NORMALIZATION", logicalField);
  }
  if (!text.endsWith("\n")) fail("RC4_TEXT_NORMALIZATION", logicalField);
  if (source.normalization_rule_id !== "utf8-lf-preserve-code-points-v1") {
    fail("RC4_NORMALIZATION_RULE", logicalField);
  }
  validateNoSensitiveText(text, logicalField);
  return text;
}

function buildSourceIndex(snapshot) {
  const files = assertArray(snapshot.files, "source_snapshot.files");
  const byId = Object.create(null);
  const paths = [];
  files.forEach((source, index) => {
    sourcePathAllowed(source, `source_snapshot.files[${index}]`);
    if (Object.prototype.hasOwnProperty.call(byId, source.id)) {
      fail("RC4_DUPLICATE_SOURCE", "source_snapshot.files");
    }
    byId[source.id] = source;
    if (!source.path_or_mount.startsWith("synthetic://")) paths.push(source.path_or_mount);
  });
  assertNoPortableCollisions(paths, "source_snapshot.files");
  return byId;
}

function arrayToKeyed(values, key, logicalField, expectedIds) {
  const keyed = Object.create(null);
  values.forEach((value, index) => {
    assertObject(value, `${logicalField}[${index}]`);
    const id = assertId(value[key], `${logicalField}[${index}].${key}`);
    if (Object.prototype.hasOwnProperty.call(keyed, id)) fail("RC4_DUPLICATE_ID", logicalField);
    keyed[id] = value;
  });
  if (expectedIds !== undefined) {
    const ids = Object.keys(keyed).sort(compareCodeUnits);
    const expected = [...expectedIds].sort(compareCodeUnits);
    if (canonicalJsonV1(ids) !== canonicalJsonV1(expected)) fail("RC4_REGISTERED_SET", logicalField);
  }
  return keyed;
}

function validateModeManifest(mode, sourceIndex, logicalField) {
  assertId(mode.mode_id, `${logicalField}.mode_id`);
  assertSemver(mode.mode_version, `${logicalField}.mode_version`);
  if (mode.schema_version !== RC4_CANONICAL_VERSION || mode.mode_version !== "1.0.0") {
    fail("RC4_MODE_VERSION", logicalField);
  }
  assertObject(mode.workflow, `${logicalField}.workflow`);
  assertId(mode.workflow.id, `${logicalField}.workflow.id`);
  assertSemver(mode.workflow.version, `${logicalField}.workflow.version`);
  if (mode.workflow.id !== "career-ops-workflow" || mode.workflow.version !== "1.28.0") {
    fail("RC4_WORKFLOW_VERSION", `${logicalField}.workflow`);
  }
  assertObject(mode.router, `${logicalField}.router`);
  assertId(mode.router.id, `${logicalField}.router.id`);
  assertSemver(mode.router.version, `${logicalField}.router.version`);
  if (mode.router.id !== "career-ops-router" || mode.router.version !== "1.28.0") {
    fail("RC4_ROUTER_VERSION", `${logicalField}.router`);
  }
  const sourceGroups = [
    [mode.ordered_system_sources, "system.invariant"],
    [mode.permitted_profile_sources, "context.profile"],
    [mode.permitted_task_sources, "data.task"],
  ];
  for (const [sources, layer] of sourceGroups) {
    assertArray(sources, logicalField).forEach((source, index) => {
      sourcePathAllowed(source, `${logicalField}.sources[${index}]`);
      const snapshotSource = sourceIndex[source.id];
      if (snapshotSource === undefined) fail("RC4_UNREGISTERED_SOURCE", `${logicalField}.sources[${index}]`);
      compareSourceDefinition(source, snapshotSource, `${logicalField}.sources[${index}]`);
      if (!source.allowed_blocks.includes(layer)) fail("RC4_SOURCE_LAYER", `${logicalField}.sources[${index}]`);
    });
  }
  assertArray(mode.conditional_system_sources, `${logicalField}.conditional_system_sources`).forEach((entry, index) => {
    assertObject(entry, `${logicalField}.conditional_system_sources[${index}]`);
    const source = entry.source ?? entry;
    sourcePathAllowed(source, `${logicalField}.conditional_system_sources[${index}]`);
    if (!sourceIndex[source.id]) fail("RC4_UNREGISTERED_SOURCE", logicalField);
  });
  const expectedSystemPaths = mode.mode_id === "oferta" || mode.mode_id === "pdf"
    ? ["AGENTS.md", ".agents/skills/career-ops/SKILL.md", "modes/_shared.md", `modes/${mode.mode_id}.md`]
    : ["AGENTS.md", ".agents/skills/career-ops/SKILL.md", "modes/_writing.md", `modes/${mode.mode_id}.md`];
  const actualSystemPaths = mode.ordered_system_sources.map((source) => source.path_or_mount);
  const actualSet = new Set(actualSystemPaths);
  if (expectedSystemPaths.some((item) => !actualSet.has(item)) || actualSystemPaths.length !== expectedSystemPaths.length) {
    fail("RC4_SOURCE_REQUIRED_MISSING", `${logicalField}.ordered_system_sources`);
  }
  if (canonicalJsonV1(actualSystemPaths) !== canonicalJsonV1(expectedSystemPaths)) {
    fail("RC4_SOURCE_ORDER", `${logicalField}.ordered_system_sources`);
  }
  if (mode.conditional_system_sources.length !== 0) {
    fail("RC4_CONDITIONAL_SOURCE_UNSUPPORTED", `${logicalField}.conditional_system_sources`);
  }
  for (const field of ["tool_capability_profile", "language_policy", "context_budget_policy", "output_contract"]) {
    assertObject(mode[field], `${logicalField}.${field}`);
  }
  if (mode.context_budget_policy.capacity_utf8_bytes !== RC4_CAPACITY_BYTES ||
      mode.context_budget_policy.provider_context_capacity_status !== "unverified" ||
      mode.context_budget_policy.provider_context_claim !== false) {
    fail("RC4_CAPACITY_POLICY", `${logicalField}.context_budget_policy.capacity_utf8_bytes`);
  }
  const required = assertArray(mode.required_blocks, `${logicalField}.required_blocks`);
  const expectedRequired = ["system.invariant", "context.profile", "data.task", "invocation", "output.frame"];
  if (canonicalJsonV1(required) !== canonicalJsonV1(expectedRequired)) {
    fail("RC4_BLOCK_POLICY", `${logicalField}.required_blocks`);
  }
  const optional = assertArray(mode.optional_blocks, `${logicalField}.optional_blocks`);
  if (optional.includes("context.memory")) fail("RC4_MEMORY_FORBIDDEN", `${logicalField}.optional_blocks`);
}

function validateAdapterManifest(adapter, logicalField) {
  assertId(adapter.adapter_id, `${logicalField}.adapter_id`);
  assertSemver(adapter.adapter_version, `${logicalField}.adapter_version`);
  if (adapter.schema_version !== RC4_CANONICAL_VERSION || adapter.adapter_version !== "1.0.0") {
    fail("RC4_ADAPTER_VERSION", logicalField);
  }
  assertObject(adapter.target_route, `${logicalField}.target_route`);
  assertId(adapter.target_route.id, `${logicalField}.target_route.id`);
  if (!TARGET_IDS.includes(adapter.target_route.id)) fail("RC4_TARGET_UNREGISTERED", logicalField);
  if (adapter.supported_canonical_contract_version !== "compiled-prompt-v1") {
    fail("RC4_CANONICAL_VERSION", `${logicalField}.supported_canonical_contract_version`);
  }
  assertArray(adapter.role_mapping, `${logicalField}.role_mapping`);
  for (const field of [
    "content_part_mapping",
    "file_reference_behavior",
    "tool_schema_mapping",
    "capacity_mapping",
    "parameter_mapping",
    "inverse_decoder",
  ]) assertObject(adapter[field], `${logicalField}.${field}`);
  if (adapter.file_reference_behavior.supported !== false ||
      adapter.content_part_mapping.delivery !== "inline") {
    fail("RC4_FILE_REFERENCE_FORBIDDEN", `${logicalField}.file_reference_behavior`);
  }
  const ids = assertArray(adapter.permitted_transformation_rule_ids, `${logicalField}.permitted_transformation_rule_ids`);
  const rules = assertArray(adapter.transformation_rules, `${logicalField}.transformation_rules`);
  const ruleIds = rules.map((rule, index) => assertId(rule.rule_id ?? rule.id, `${logicalField}.transformation_rules[${index}]`));
  if (new Set(ids).size !== ids.length || new Set(ruleIds).size !== ruleIds.length ||
      canonicalJsonV1([...ids].sort(compareCodeUnits)) !== canonicalJsonV1([...ruleIds].sort(compareCodeUnits))) {
    fail("RC4_ADAPTER_RULE_CLOSURE", logicalField);
  }
  const expectedMappings = adapter.target_route.id === "co-claude-code-reference-v1"
    ? {
        "system.invariant": ["runner.system_equivalent", "system_equivalent"],
        "context.profile": ["runner.user_context", "user"],
        "data.task": ["runner.user_input", "user"],
        invocation: ["runner.user_input", "user"],
        "output.frame": ["runner.system_equivalent", "system_equivalent"],
      }
    : {
        "system.invariant": ["harness.system", "system"],
        "context.profile": ["harness.user", "user"],
        "data.task": ["harness.user", "user"],
        invocation: ["harness.user", "user"],
        "output.frame": ["harness.system", "system"],
      };
  const seenLayers = new Set();
  for (const mapping of adapter.role_mapping) {
    if (seenLayers.has(mapping.canonical_layer)) fail("RC4_ROLE_MAPPING", `${logicalField}.role_mapping`);
    seenLayers.add(mapping.canonical_layer);
    const expected = expectedMappings[mapping.canonical_layer];
    if (!expected || mapping.target_field !== expected[0] || mapping.target_role !== expected[1] ||
        !ids.includes(mapping.rule_id)) {
      fail("RC4_ROLE_MAPPING", `${logicalField}.role_mapping`);
    }
  }
  if (seenLayers.size !== Object.keys(expectedMappings).length) {
    fail("RC4_ROLE_MAPPING", `${logicalField}.role_mapping`);
  }
  if (adapter.capacity_mapping.capacity_utf8_bytes !== RC4_CAPACITY_BYTES ||
      adapter.capacity_mapping.estimator_id !== "utf8-byte-count-v1" ||
      adapter.capacity_mapping.overflow_action !== "fail" ||
      adapter.capacity_mapping.provider_context_capacity_status !== "unverified" ||
      adapter.capacity_mapping.provider_context_claim !== false) {
    fail("RC4_CAPACITY_POLICY", `${logicalField}.capacity_mapping`);
  }
}

function validateFixtureSet(fixtures, sourceIndex, modes) {
  assertExactKeys(
    fixtures,
    ["schema_version", "fixture_set_id", "fixture_set_version", "synthetic", "capacity", "source_registry", "invocations", "negative_cases"],
    [],
    "fixtures",
  );
  if (fixtures.schema_version !== RC4_CANONICAL_VERSION) fail("RC4_FIXTURE_VERSION", "fixtures.schema_version");
  assertId(fixtures.fixture_set_id, "fixtures.fixture_set_id");
  assertSemver(fixtures.fixture_set_version, "fixtures.fixture_set_version");
  if (fixtures.fixture_set_id !== "RC4-PROMPT-CONTEXT-FIXTURES-V1" || fixtures.fixture_set_version !== "1.0.0") {
    fail("RC4_FIXTURE_VERSION", "fixtures");
  }
  if (fixtures.synthetic !== true) fail("RC4_NON_SYNTHETIC_FIXTURE", "fixtures.synthetic");
  if (fixtures.capacity !== RC4_CAPACITY_BYTES && fixtures.capacity?.bytes !== RC4_CAPACITY_BYTES) {
    fail("RC4_CAPACITY_POLICY", "fixtures.capacity");
  }
  assertExactKeys(
    fixtures.capacity,
    ["bytes", "unit", "estimator", "provider_context_capacity_status", "provider_context_claim"],
    [],
    "fixtures.capacity",
  );
  if (fixtures.capacity.unit !== "utf8_bytes" || fixtures.capacity.provider_context_capacity_status !== "unverified" ||
      fixtures.capacity.provider_context_claim !== false) fail("RC4_CAPACITY_POLICY", "fixtures.capacity");
  assertExactKeys(fixtures.capacity.estimator, ["id", "version", "kind"], [], "fixtures.capacity.estimator");
  if (fixtures.capacity.estimator.id !== "utf8-byte-count-v1" || fixtures.capacity.estimator.version !== "1.0.0" ||
      fixtures.capacity.estimator.kind !== "deterministic_utf8_byte_count_not_provider_observed") {
    fail("RC4_CAPACITY_POLICY", "fixtures.capacity.estimator");
  }
  const registry = arrayToKeyed(assertArray(fixtures.source_registry, "fixtures.source_registry"), "id", "fixtures.source_registry");
  for (const [id, source] of Object.entries(registry)) {
    assertExactKeys(source, [
      "id", "path_or_mount", "byte_count", "sha256", "source_class", "authority", "trust",
      "visibility", "normalization_rule_id", "allowed_blocks",
    ], [], `fixtures.source_registry.${id}`);
    sourcePathAllowed(source, `fixtures.source_registry.${id}`);
    if (!sourceIndex[id]) fail("RC4_UNREGISTERED_SOURCE", `fixtures.source_registry.${id}`);
    compareSourceDefinition(source, sourceIndex[id], `fixtures.source_registry.${id}`);
  }
  const invocations = assertArray(fixtures.invocations, "fixtures.invocations");
  const ids = new Set();
  for (const invocation of invocations) {
    assertExactKeys(invocation, [
      "fixture_id", "mode_id", "category", "positive", "invocation_shape", "profile_source_ids",
      "task_source_id", "invocation_metadata", "expected_blocks", "no_memory",
    ], [], "fixtures.invocations");
    const fixtureId = assertId(invocation.fixture_id, "fixtures.invocations.fixture_id");
    if (ids.has(fixtureId)) fail("RC4_DUPLICATE_ID", "fixtures.invocations");
    ids.add(fixtureId);
    if (!modes[invocation.mode_id]) fail("RC4_MODE_UNREGISTERED", "fixtures.invocations.mode_id");
    if (!modes[invocation.mode_id].supported_invocation_shapes.includes(invocation.invocation_shape)) {
      fail("RC4_INVOCATION_SHAPE", "fixtures.invocations.invocation_shape");
    }
    if (invocation.positive !== true || invocation.no_memory !== true) {
      fail("RC4_INVALID_FIXTURE", "fixtures.invocations");
    }
    const profiles = assertArray(invocation.profile_source_ids, "fixtures.invocations.profile_source_ids");
    if (new Set(profiles).size !== profiles.length) fail("RC4_DUPLICATE_SOURCE", "fixtures.invocations.profile_source_ids");
    profiles.forEach((id) => {
      assertId(id, "fixtures.invocations.profile_source_ids");
      if (!registry[id]) fail("RC4_UNREGISTERED_SOURCE", "fixtures.invocations.profile_source_ids");
    });
    assertId(invocation.task_source_id, "fixtures.invocations.task_source_id");
    if (!registry[invocation.task_source_id]) fail("RC4_UNREGISTERED_SOURCE", "fixtures.invocations.task_source_id");
    assertObject(invocation.invocation_metadata, "fixtures.invocations.invocation_metadata");
    assertExactKeys(
      invocation.invocation_metadata,
      ["invocation_id", "current_date", "objective", "output_language"],
      ["draft_only"],
      "fixtures.invocations.invocation_metadata",
    );
    validateNoSensitiveText(
      canonicalJsonV1(invocation.invocation_metadata),
      "fixtures.invocations.invocation_metadata",
    );
    assertId(invocation.invocation_metadata.invocation_id, "fixtures.invocations.invocation_metadata.invocation_id");
    assertId(invocation.invocation_metadata.objective, "fixtures.invocations.invocation_metadata.objective");
    if (!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(invocation.invocation_metadata.current_date) ||
        invocation.invocation_metadata.output_language !== "en" ||
        (invocation.invocation_metadata.draft_only !== undefined && invocation.invocation_metadata.draft_only !== true)) {
      fail("RC4_INVALID_FIXTURE", "fixtures.invocations.invocation_metadata");
    }
    assertArray(invocation.expected_blocks, "fixtures.invocations.expected_blocks");
  }
  for (const modeId of PILOT_MODES) {
    const expected = [`${modeId}-ordinary`, `${modeId}-injection`, `${modeId}-budget`];
    if (expected.some((id) => !ids.has(id))) fail("RC4_FIXTURE_MATRIX", `fixtures.${modeId}`);
  }
  const negative = assertArray(fixtures.negative_cases, "fixtures.negative_cases");
  for (const item of negative) {
    assertExactKeys(item, ["case_id", "mode_id", "base_fixture_id", "mutation", "expected_error_code"], [], "fixtures.negative_cases");
    assertId(item.case_id, "fixtures.negative_cases.case_id");
    assertId(item.mode_id, "fixtures.negative_cases.mode_id");
    assertId(item.base_fixture_id, "fixtures.negative_cases.base_fixture_id");
    if (!modes[item.mode_id] || !ids.has(item.base_fixture_id) || !/^RC4_[A-Z0-9_]{1,91}$/.test(item.expected_error_code)) {
      fail("RC4_INVALID_FIXTURE", "fixtures.negative_cases");
    }
    assertObject(item.mutation, "fixtures.negative_cases.mutation");
    if (item.mutation.operation === "remove_required_source") {
      assertExactKeys(item.mutation, ["operation", "source_id"], [], "fixtures.negative_cases.mutation");
      assertId(item.mutation.source_id, "fixtures.negative_cases.mutation.source_id");
    } else if (item.mutation.operation === "set_capacity_utf8_bytes") {
      assertExactKeys(item.mutation, ["operation", "value"], [], "fixtures.negative_cases.mutation");
      if (!Number.isSafeInteger(item.mutation.value) || item.mutation.value < 0) {
        fail("RC4_INVALID_FIXTURE", "fixtures.negative_cases.mutation.value");
      }
    } else {
      fail("RC4_INVALID_FIXTURE", "fixtures.negative_cases.mutation.operation");
    }
  }
  const negativeIds = new Set(negative.map((item) => item.case_id));
  for (const modeId of PILOT_MODES) {
    if (!negativeIds.has(`${modeId}-missing-source`)) fail("RC4_FIXTURE_MATRIX", `fixtures.${modeId}`);
  }
  if (!negativeIds.has("global-over-budget")) fail("RC4_FIXTURE_MATRIX", "fixtures.global-over-budget");
  return registry;
}

function refByPath(refs, relativePath) {
  const ref = refs.get(relativePath);
  if (ref === undefined) fail("RC4_REGISTRATION_CLOSURE", "registration.refs");
  return ref;
}

async function readJsonWithRef(relativePath, ref, logicalField) {
  const file = await readRegisteredFile(relativePath, logicalField, MAX_JSON_BYTES, ref);
  return { value: parseStrictJsonBytes(file.bytes, logicalField), ...file };
}

function makePublicContext(context) {
  const publicContext = {
    registration: context.registration,
    source_snapshot: context.sourceSnapshot,
    schemas: context.schemas,
    modes: context.modes,
    adapters: context.adapters,
    fixtures: context.fixtures,
    sources: context.sources,
  };
  const frozen = deepFreeze(publicContext);
  CONTEXT_INTERNALS.set(frozen, context);
  return frozen;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value) || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function internalContext(context) {
  if (context !== null && typeof context === "object" && CONTEXT_INTERNALS.has(context)) {
    return CONTEXT_INTERNALS.get(context);
  }
  fail("RC4_CONTEXT_REQUIRED", "options.context");
}

export async function validatePromptContextPackage(options = {}) {
  assertObject(options, "options");
  await assertRepoRootAssertion(options.repo_root ?? options.repoRoot);
  assertNoPortableCollisions(PACKAGE_FIXED_PATHS, "read_plan.fixed_paths");
  for (const relativePath of PACKAGE_FIXED_PATHS) {
    await validatePathChain(relativePath, "read_plan.fixed_paths", "file");
  }

  const registrationPath = `${PACKAGE_RELATIVE}/registration.json`;
  const registrationFile = await readRegisteredFile(registrationPath, "registration", MAX_JSON_BYTES);
  const registration = parseStrictJsonBytes(registrationFile.bytes, "registration");
  const refs = validateRegistrationRefs(registration);

  const allPaths = [registrationPath, ...refs.keys()];
  assertNoPortableCollisions(allPaths, "read_plan.registered_paths");
  for (const relativePath of refs.keys()) {
    await validatePathChain(relativePath, "read_plan.registered_paths", "file");
  }

  const schemas = Object.create(null);
  const schemaNames = [
    "registration",
    "mode-manifest",
    "adapter-manifest",
    "compiled-prompt",
    "route-bundle",
    "validation-result",
  ];
  for (const name of schemaNames) {
    const relativePath = `${PACKAGE_RELATIVE}/schemas/${name}.schema.json`;
    const file = await readJsonWithRef(relativePath, refByPath(refs, relativePath), `schemas.${name}`);
    auditSchema(file.value, `schemas.${name}`);
    schemas[name] = file.value;
  }
  if (schemas.registration.$id !== RC4_REGISTRATION_SCHEMA_ID) {
    fail("RC4_SCHEMA_ID", "schemas.registration.$id");
  }
  schemaValidate(registration, schemas.registration, "registration");
  if (registration.status !== "frozen") {
    fail("RC4_REGISTRATION_STATUS", "registration.status");
  }
  if (registration.schema_version !== RC4_CANONICAL_VERSION ||
      registration.registration_id !== "RC4-PROMPT-CONTEXT-2026-08-25-V2" ||
      registration.registration_version !== "2.0.0" ||
      registration.compiler_contract.id !== RC4_COMPILER_ID ||
      registration.compiler_contract.version !== RC4_COMPILER_VERSION ||
      registration.compiler_contract.canonical_contract_version !== "compiled-prompt-v1" ||
      registration.text_normalization_rule_id !== "utf8-lf-preserve-code-points-v1") {
    fail("RC4_REGISTRATION_VERSION", "registration");
  }

  const snapshotRelative = `${PACKAGE_RELATIVE}/source-snapshot.json`;
  const snapshotFile = await readJsonWithRef(snapshotRelative, refByPath(refs, snapshotRelative), "source_snapshot");
  const sourceSnapshot = snapshotFile.value;
  const snapshotSchema = schemas.registration.$defs?.source_snapshot_document;
  if (snapshotSchema === undefined) fail("RC4_SCHEMA_REF_MISSING", "schemas.registration.source_snapshot_document");
  schemaValidate(sourceSnapshot, schemas.registration, "source_snapshot", snapshotSchema);
  if (sourceSnapshot.registration_id !== registration.registration_id ||
      sourceSnapshot.schema_version !== RC4_CANONICAL_VERSION ||
      sourceSnapshot.snapshot_id !== "RC4-SOURCE-SNAPSHOT-2026-08-25-V2" ||
      sourceSnapshot.snapshot_id !== registration.source_snapshot_ref.snapshot_id ||
      sourceSnapshot.snapshot_version !== "2.0.0" ||
      sourceSnapshot.canonical_serialization !== "recursus-canonical-json-v1" ||
      sourceSnapshot.text_normalization_rule_id !== "utf8-lf-preserve-code-points-v1") {
    fail("RC4_REGISTRATION_BINDING", "source_snapshot.registration_id");
  }
  const sourceIndex = buildSourceIndex(sourceSnapshot);

  const registeredSourcePaths = Object.values(sourceIndex)
    .filter((source) => !source.path_or_mount.startsWith("synthetic://"))
    .map((source) => source.path_or_mount);
  assertNoPortableCollisions([...allPaths, ...registeredSourcePaths], "read_plan.all_paths");
  for (const relativePath of registeredSourcePaths) {
    await validatePathChain(relativePath, "read_plan.sources", "file");
  }

  const sourceBytes = Object.create(null);
  for (const source of Object.values(sourceIndex)) {
    if (source.path_or_mount.startsWith("synthetic://")) continue;
    const file = await readRegisteredFile(source.path_or_mount, `sources.${source.id}`, MAX_SOURCE_BYTES, source);
    normalizeTextSource(file.bytes, source, `sources.${source.id}`);
    sourceBytes[source.id] = file.bytes;
  }

  const modeDocuments = [];
  for (const modeId of PILOT_MODES) {
    const relativePath = `${PACKAGE_RELATIVE}/modes/${modeId}.json`;
    const file = await readJsonWithRef(relativePath, refByPath(refs, relativePath), `modes.${modeId}`);
    schemaValidate(file.value, schemas["mode-manifest"], `modes.${modeId}`);
    if (file.value.mode_id !== modeId) fail("RC4_MODE_BINDING", `modes.${modeId}.mode_id`);
    validateModeManifest(file.value, sourceIndex, `modes.${modeId}`);
    modeDocuments.push(file.value);
  }
  const modes = arrayToKeyed(modeDocuments, "mode_id", "modes", PILOT_MODES);

  const adapterDocuments = [];
  for (const targetId of TARGET_IDS) {
    const relativePath = `${PACKAGE_RELATIVE}/adapters/${targetId}.json`;
    const file = await readJsonWithRef(relativePath, refByPath(refs, relativePath), `adapters.${targetId}`);
    schemaValidate(file.value, schemas["adapter-manifest"], `adapters.${targetId}`);
    if (file.value.target_route.id !== targetId) fail("RC4_TARGET_BINDING", `adapters.${targetId}`);
    validateAdapterManifest(file.value, `adapters.${targetId}`);
    adapterDocuments.push(file.value);
  }
  const adapters = arrayToKeyed(adapterDocuments, "adapter_id", "adapters");
  const adaptersByTarget = Object.create(null);
  for (const adapter of Object.values(adapters)) adaptersByTarget[adapter.target_route.id] = adapter;
  if (Object.keys(adaptersByTarget).length !== TARGET_IDS.length) fail("RC4_REGISTERED_SET", "adapters");

  const fixtureRelative = `${PACKAGE_RELATIVE}/fixtures/invocations.json`;
  const fixtureFile = await readJsonWithRef(fixtureRelative, refByPath(refs, fixtureRelative), "fixtures");
  const fixtures = fixtureFile.value;
  const fixtureSchema = schemas.registration.$defs?.fixture_set_document ?? schemas.registration.$defs?.fixture_set;
  if (fixtureSchema !== undefined) schemaValidate(fixtures, schemas.registration, "fixtures", fixtureSchema);
  const fixtureSources = validateFixtureSet(fixtures, sourceIndex, modes);

  if (registration.synthetic !== true || registration.canonical_serialization !== "recursus-canonical-json-v1") {
    fail("RC4_REGISTRATION_POLICY", "registration");
  }
  if (!canonicalJsonV1(registration.nonclaims).includes(RC4_NON_CLAIM)) {
    fail("RC4_NONCLAIM_MISMATCH", "registration.nonclaims");
  }

  const publicContext = makePublicContext({
    registration,
    sourceSnapshot,
    schemas,
    modes,
    adapters: adaptersByTarget,
    fixtures,
    fixtureSources,
    sourceIndex,
    sourceBytes,
    refs,
  });
  await validateRegisteredNegativeCases({ context: publicContext });
  return publicContext;
}

function getOption(options, snake, camel) {
  return options[snake] ?? options[camel];
}

function sourceAllowedInManifest(source, manifestSources, logicalField) {
  const match = manifestSources.find((item) => item.id === source.id);
  if (!match) fail("RC4_SOURCE_NOT_PERMITTED", logicalField);
  compareSourceDefinition(source, match, logicalField);
}

function contentBlock({ id, version, ordinal, layer, source, content, required = true }) {
  if (!LAYERS.has(layer)) fail("RC4_INVALID_LAYER", "compile.block.layer");
  const contentBytes = Buffer.from(content, "utf8");
  const block = {
    id,
    version,
    ordinal,
    layer,
    authority: source.authority,
    trust: source.trust,
    source_id: source.id,
    source_path_or_mount: source.path_or_mount,
    source_class: source.source_class,
    visibility: source.visibility,
    source_hash: source.sha256,
    normalization_rule_id: source.normalization_rule_id,
    normalized_content_hash: sha256V1(contentBytes),
    digest_projection_id: "rc4-prompt-block-digest-v1",
    required,
    budget_policy: "must_keep",
    budget_action: "keep",
    delivery: "inline",
    content,
    content_byte_count: contentBytes.length,
    content_character_count: codePointLength(content),
    character_count_unit: "unicode-code-point",
    byte_count_unit: "utf8-byte",
  };
  validateBlock(block, "compile.block");
  return block;
}

function generatedSource(id, layer, authority, trust, content) {
  const digest = sha256V1(Buffer.from(content, "utf8"));
  return {
    id,
    path_or_mount: `synthetic://${id}`,
    byte_count: Buffer.byteLength(content, "utf8"),
    sha256: digest,
    source_class: layer === "invocation" ? "synthetic_invocation" : "output_contract",
    authority,
    trust,
    visibility: "agent_visible",
    normalization_rule_id: "utf8-lf-preserve-code-points-v1",
    allowed_blocks: [layer],
  };
}

function validateBlock(block, logicalField) {
  assertId(block.id, `${logicalField}.id`);
  assertSemver(block.version, `${logicalField}.version`);
  if (!Number.isSafeInteger(block.ordinal) || block.ordinal < 0) fail("RC4_INVALID_ORDINAL", `${logicalField}.ordinal`);
  if (!LAYERS.has(block.layer) || block.layer === "context.memory") fail("RC4_MEMORY_FORBIDDEN", `${logicalField}.layer`);
  if (!AUTHORITIES.has(block.authority)) fail("RC4_INVALID_AUTHORITY", `${logicalField}.authority`);
  if (!TRUST_VALUES.has(block.trust)) fail("RC4_INVALID_TRUST", `${logicalField}.trust`);
  assertSha256(block.source_hash, `${logicalField}.source_hash`);
  assertSha256(block.normalized_content_hash, `${logicalField}.normalized_content_hash`);
  if (block.delivery !== "inline" || block.budget_policy !== "must_keep" || block.budget_action !== "keep") {
    fail("RC4_BLOCK_POLICY", logicalField);
  }
  if (typeof block.content !== "string") fail("RC4_INVALID_SHAPE", `${logicalField}.content`);
  const bytes = Buffer.from(block.content, "utf8");
  if (bytes.length !== block.content_byte_count || codePointLength(block.content) !== block.content_character_count) {
    fail("RC4_CONTENT_COUNT", logicalField);
  }
  if (!safeHashEqual(sha256V1(bytes), block.normalized_content_hash)) {
    fail("RC4_CONTENT_HASH", logicalField);
  }
  validateNoSensitiveText(block.content, logicalField);
}

function compilationProjection(compiled) {
  return {
    schema_version: compiled.schema_version,
    compiled_prompt_id: compiled.compiled_prompt_id,
    compiled_prompt_version: compiled.compiled_prompt_version,
    compiler: compiled.compiler,
    registration: compiled.registration,
    source_snapshot: compiled.source_snapshot,
    mode: compiled.mode,
    workflow: compiled.workflow,
    router: compiled.router,
    invocation: compiled.invocation,
    fixture: compiled.fixture,
    output_contract: compiled.output_contract,
    language_policy: compiled.language_policy,
    tool_capability_profile: compiled.tool_capability_profile,
    context_budget: compiled.context_budget,
    blocks: compiled.blocks,
    task_occurrence_count: compiled.task_occurrence_count,
    digests: {
      source_closure: compiled.digests.source_closure,
      invariant_system: compiled.digests.invariant_system,
      task_payload: compiled.digests.task_payload,
      profile_context: compiled.digests.profile_context,
    },
  };
}

function validateCompiledPrompt(compiled, context) {
  schemaValidate(compiled, context.schemas["compiled-prompt"], "compiled_prompt");
  const blocks = assertArray(compiled.blocks, "compiled_prompt.blocks");
  let taskCount = 0;
  blocks.forEach((block, index) => {
    validateBlock(block, `compiled_prompt.blocks[${index}]`);
    if (block.ordinal !== index) fail("RC4_INVALID_ORDINAL", `compiled_prompt.blocks[${index}]`);
    if (block.layer === "data.task") {
      taskCount += 1;
      if (block.authority !== "data" || block.trust !== "external_untrusted") {
        fail("RC4_TASK_PROMOTION", `compiled_prompt.blocks[${index}]`);
      }
    }
  });
  if (taskCount !== 1 || compiled.task_occurrence_count !== 1) fail("RC4_TASK_OCCURRENCE", "compiled_prompt");
  if (blocks.some((block) => block.layer === "context.memory")) fail("RC4_MEMORY_FORBIDDEN", "compiled_prompt.blocks");
  const invariant = blocks.filter((block) => block.layer === "system.invariant");
  const profiles = blocks.filter((block) => block.layer === "context.profile");
  const task = blocks.find((block) => block.layer === "data.task");
  const invariantContent = invariant.map((block) => block.content).join("");
  if (profiles.some((block) => invariantContent.includes(block.content))) {
    fail("RC4_PROFILE_IN_INVARIANT", "compiled_prompt.blocks");
  }
  let exactTaskOccurrences = 0;
  for (const block of blocks) {
    let offset = 0;
    while (task.content.length > 0) {
      const found = block.content.indexOf(task.content, offset);
      if (found < 0) break;
      exactTaskOccurrences += 1;
      offset = found + task.content.length;
    }
  }
  if (exactTaskOccurrences !== 1 || invariantContent.includes(task.content)) {
    fail("RC4_TASK_OCCURRENCE", "compiled_prompt.blocks");
  }
  const sourceClosure = blocks.map((block) => ({
    id: block.id,
    source_id: block.source_id,
    source_path_or_mount: block.source_path_or_mount,
    source_hash: block.source_hash,
    normalized_content_hash: block.normalized_content_hash,
  }));
  const expected = {
    source_closure: digestRecord("rc4-source-closure-digest-v1", "rc4.source-closure", sourceClosure),
    invariant_system: digestRecord("rc4-invariant-system-digest-v1", "rc4.invariant-system", invariant.map(blockIdentityProjection)),
    task_payload: digestRecord("rc4-task-payload-digest-v1", "rc4.task-payload", blockIdentityProjection(task)),
    profile_context: digestRecord("rc4-profile-context-digest-v1", "rc4.profile-context", profiles.map(blockIdentityProjection)),
  };
  for (const [key, value] of Object.entries(expected)) {
    if (canonicalJsonV1(compiled.digests[key]) !== canonicalJsonV1(value)) {
      fail("RC4_DIGEST_MISMATCH", `compiled_prompt.digests.${key}`);
    }
  }
  const compilation = domainDigest("rc4.compilation", compilationProjection(compiled));
  if (compiled.digests.compilation.projection_id !== "rc4-compilation-digest-v1" ||
      compiled.digests.compilation.sha256 !== compilation) {
    fail("RC4_DIGEST_MISMATCH", "compiled_prompt.digests.compilation");
  }
  if (compiled.validation.status !== "pass" || compiled.validation.issues.length !== 0) {
    fail("RC4_VALIDATION_STATUS", "compiled_prompt.validation");
  }
  validateCompiledBindings(compiled, context);
}

function validateCompiledBindings(compiled, context) {
  const mode = context.modes[compiled.mode.id];
  if (!mode || canonicalJsonV1(compiled.mode) !== canonicalJsonV1({ id: mode.mode_id, version: mode.mode_version })) {
    fail("RC4_MODE_BINDING", "compiled_prompt.mode");
  }
  if (compiled.schema_version !== RC4_CANONICAL_VERSION ||
      compiled.compiled_prompt_id !== `compiled.${mode.mode_id}.${compiled.fixture.id}` ||
      compiled.compiled_prompt_version !== "compiled-prompt-v1" ||
      canonicalJsonV1(compiled.compiler) !== canonicalJsonV1({
        id: RC4_COMPILER_ID,
        version: RC4_COMPILER_VERSION,
      })) {
    fail("RC4_COMPILER_BINDING", "compiled_prompt.identity");
  }
  if (canonicalJsonV1(compiled.workflow) !== canonicalJsonV1(mode.workflow) ||
      canonicalJsonV1(compiled.router) !== canonicalJsonV1({ id: mode.router.id, version: mode.router.version }) ||
      canonicalJsonV1(compiled.output_contract) !== canonicalJsonV1(mode.output_contract) ||
      canonicalJsonV1(compiled.language_policy) !== canonicalJsonV1(mode.language_policy) ||
      canonicalJsonV1(compiled.tool_capability_profile) !== canonicalJsonV1(mode.tool_capability_profile)) {
    fail("RC4_MODE_CONTRACT_BINDING", "compiled_prompt.mode_contract");
  }
  if (compiled.registration.id !== context.registration.registration_id ||
      compiled.registration.version !== context.registration.registration_version ||
      compiled.source_snapshot.id !== context.sourceSnapshot.snapshot_id ||
      compiled.source_snapshot.version !== context.sourceSnapshot.snapshot_version ||
      compiled.source_snapshot.sha256 !== context.registration.source_snapshot_ref.sha256) {
    fail("RC4_REGISTRATION_BINDING", "compiled_prompt.registration");
  }
  const fixture = context.fixtures.invocations.find((item) => item.fixture_id === compiled.fixture.id);
  if (!fixture || fixture.mode_id !== mode.mode_id ||
      canonicalJsonV1(compiled.fixture) !== canonicalJsonV1({ id: fixture.fixture_id, synthetic: true }) ||
      canonicalJsonV1(compiled.invocation) !== canonicalJsonV1({
        id: fixture.fixture_id,
        version: context.fixtures.fixture_set_version,
      })) {
    fail("RC4_FIXTURE_BINDING", "compiled_prompt.fixture");
  }
  const expectedSources = [
    ...mode.ordered_system_sources.map((source) => [source, "system.invariant"]),
    ...fixture.profile_source_ids.map((id) => [context.fixtureSources[id], "context.profile"]),
    [context.fixtureSources[fixture.task_source_id], "data.task"],
  ];
  if (compiled.blocks.length !== expectedSources.length + 2) fail("RC4_BLOCK_CLOSURE", "compiled_prompt.blocks");
  expectedSources.forEach(([source, layer], index) => {
    const block = compiled.blocks[index];
    const bytes = context.sourceBytes[source.id];
    const content = normalizeTextSource(bytes, source, `compiled_prompt.blocks[${index}]`);
    const expectedBlock = contentBlock({
      id: `${layer.replaceAll(".", "-")}.${source.id}`,
      version: mode.mode_version,
      ordinal: index,
      layer,
      source,
      content,
    });
    if (canonicalJsonV1(block) !== canonicalJsonV1(expectedBlock)) {
      fail("RC4_SOURCE_BLOCK_BINDING", `compiled_prompt.blocks[${index}]`);
    }
  });
  const invocationBlock = compiled.blocks[expectedSources.length];
  const invocationContent = canonicalJsonV1(fixture.invocation_metadata);
  const expectedInvocation = contentBlock({
    id: `invocation.${fixture.fixture_id}`,
    version: mode.mode_version,
    ordinal: expectedSources.length,
    layer: "invocation",
    source: generatedSource(
      `invocation-${fixture.fixture_id}`,
      "invocation",
      "instruction",
      "runtime_attested",
      invocationContent,
    ),
    content: invocationContent,
  });
  if (canonicalJsonV1(invocationBlock) !== canonicalJsonV1(expectedInvocation)) {
    fail("RC4_INVOCATION_BINDING", "compiled_prompt.blocks");
  }
  const outputBlock = compiled.blocks[expectedSources.length + 1];
  const outputContent = canonicalJsonV1(mode.output_contract);
  const outputId = assertId(mode.output_contract.id, "mode.output_contract.id");
  const outputVersion = assertSemver(mode.output_contract.version, "mode.output_contract.version");
  const expectedOutput = contentBlock({
    id: `output.${outputId}`,
    version: outputVersion,
    ordinal: expectedSources.length + 1,
    layer: "output.frame",
    source: generatedSource(
      `output-${outputId}`,
      "output.frame",
      "policy",
      "system_owned",
      outputContent,
    ),
    content: outputContent,
  });
  if (canonicalJsonV1(outputBlock) !== canonicalJsonV1(expectedOutput)) {
    fail("RC4_OUTPUT_BINDING", "compiled_prompt.blocks");
  }
  const usedBytes = compiled.blocks.reduce((total, block) => total + block.content_byte_count, 0);
  const usedCharacters = compiled.blocks.reduce((total, block) => total + block.content_character_count, 0);
  const expectedBudget = {
    policy_id: mode.context_budget_policy.id,
    capacity_utf8_bytes: mode.context_budget_policy.capacity_utf8_bytes,
    used_characters: usedCharacters,
    used_utf8_bytes: usedBytes,
    estimator: mode.context_budget_policy.estimator,
    decision: "fit",
    overflow_action: "fail",
    all_must_keep_present: true,
    provider_context_capacity_status: "unverified",
    provider_context_claim: false,
  };
  if (canonicalJsonV1(compiled.context_budget) !== canonicalJsonV1(expectedBudget)) {
    fail("RC4_BUDGET_BINDING", "compiled_prompt.context_budget");
  }
}

function blockIdentityProjection(block) {
  return {
    id: block.id,
    version: block.version,
    ordinal: block.ordinal,
    layer: block.layer,
    authority: block.authority,
    trust: block.trust,
    source_id: block.source_id,
    source_path_or_mount: block.source_path_or_mount,
    source_class: block.source_class,
    visibility: block.visibility,
    source_hash: block.source_hash,
    normalization_rule_id: block.normalization_rule_id,
    normalized_content_hash: block.normalized_content_hash,
    digest_projection_id: block.digest_projection_id,
    required: block.required,
    budget_policy: block.budget_policy,
    budget_action: block.budget_action,
    content_byte_count: block.content_byte_count,
    content_character_count: block.content_character_count,
    character_count_unit: block.character_count_unit,
    byte_count_unit: block.byte_count_unit,
  };
}

function enforceMustKeepCapacity(blocks, capacity, logicalField, overflowCode = "RC4_BUDGET_MUST_KEEP_OVERFLOW") {
  if (!Number.isSafeInteger(capacity) || capacity < 1) fail("RC4_INVALID_FIXTURE", logicalField);
  const totalBytes = blocks.reduce((total, block) => total + block.content_byte_count, 0);
  if (totalBytes <= capacity) return totalBytes;
  if (blocks.every((block) => block.required === true && block.budget_policy === "must_keep")) {
    fail(overflowCode, logicalField);
  }
  fail("RC4_CONTEXT_OVER_CAPACITY", logicalField);
}

export async function compilePromptContext(options = {}) {
  assertObject(options, "options");
  const publicContext = options.context ?? await validatePromptContextPackage({
    repo_root: options.repo_root ?? options.repoRoot,
  });
  const context = internalContext(publicContext);
  const modeId = getOption(options, "mode_id", "modeId") ?? options.mode;
  const fixtureId = getOption(options, "fixture_id", "fixtureId") ?? options.fixture;
  assertId(modeId, "options.mode_id");
  assertId(fixtureId, "options.fixture_id");
  const mode = context.modes[modeId];
  if (!mode) fail("RC4_MODE_UNREGISTERED", "options.mode_id");
  const fixture = context.fixtures.invocations.find((item) => item.fixture_id === fixtureId);
  if (!fixture || fixture.mode_id !== modeId || fixture.positive !== true) {
    fail("RC4_FIXTURE_UNREGISTERED", "options.fixture_id");
  }
  if (fixture.no_memory !== true) fail("RC4_MEMORY_FORBIDDEN", "fixture.no_memory");

  const blocks = [];
  const appendSource = (source, layer) => {
    const bytes = context.sourceBytes[source.id];
    if (!bytes) fail("RC4_SOURCE_UNAVAILABLE", `sources.${source.id}`);
    const content = normalizeTextSource(bytes, source, `sources.${source.id}`);
    blocks.push(contentBlock({
      id: `${layer.replaceAll(".", "-")}.${source.id}`,
      version: mode.mode_version,
      ordinal: blocks.length,
      layer,
      source,
      content,
    }));
  };
  for (const source of mode.ordered_system_sources) appendSource(source, "system.invariant");
  if (mode.conditional_system_sources.length !== 0) {
    fail("RC4_CONDITIONAL_SOURCE_UNSUPPORTED", "mode.conditional_system_sources");
  }
  for (const sourceId of fixture.profile_source_ids) {
    const source = context.fixtureSources[sourceId];
    sourceAllowedInManifest(source, mode.permitted_profile_sources, `fixture.profile_source_ids.${sourceId}`);
    if (!source.allowed_blocks.includes("context.profile") || source.authority === "policy") {
      fail("RC4_PROFILE_PROMOTION", `fixture.profile_source_ids.${sourceId}`);
    }
    appendSource(source, "context.profile");
  }
  const taskSource = context.fixtureSources[fixture.task_source_id];
  sourceAllowedInManifest(taskSource, mode.permitted_task_sources, "fixture.task_source_id");
  if (taskSource.authority !== "data" || taskSource.trust !== "external_untrusted" ||
      !taskSource.allowed_blocks.includes("data.task")) {
    fail("RC4_TASK_PROMOTION", "fixture.task_source_id");
  }
  appendSource(taskSource, "data.task");

  const invocationContent = canonicalJsonV1(fixture.invocation_metadata);
  validateNoSensitiveText(invocationContent, "fixture.invocation_metadata");
  const invocationSource = generatedSource(
    `invocation-${fixture.fixture_id}`,
    "invocation",
    "instruction",
    "runtime_attested",
    invocationContent,
  );
  blocks.push(contentBlock({
    id: `invocation.${fixture.fixture_id}`,
    version: mode.mode_version,
    ordinal: blocks.length,
    layer: "invocation",
    source: invocationSource,
    content: invocationContent,
  }));

  const outputContent = canonicalJsonV1(mode.output_contract);
  const outputId = assertId(mode.output_contract.id, "mode.output_contract.id");
  const outputVersion = assertSemver(mode.output_contract.version, "mode.output_contract.version");
  const outputSource = generatedSource(
    `output-${outputId}`,
    "output.frame",
    "policy",
    "system_owned",
    outputContent,
  );
  blocks.push(contentBlock({
    id: `output.${outputId}`,
    version: outputVersion,
    ordinal: blocks.length,
    layer: "output.frame",
    source: outputSource,
    content: outputContent,
  }));

  const totalBytes = enforceMustKeepCapacity(
    blocks,
    RC4_CAPACITY_BYTES,
    "compiled_prompt.context_budget",
    "RC4_CONTEXT_OVER_CAPACITY",
  );
  const layerClosure = [...new Set(blocks.map((block) => block.layer))];
  if (canonicalJsonV1(layerClosure) !== canonicalJsonV1(fixture.expected_blocks)) {
    fail("RC4_BLOCK_CLOSURE", "fixture.expected_blocks");
  }
  const invariant = blocks.filter((block) => block.layer === "system.invariant");
  const profiles = blocks.filter((block) => block.layer === "context.profile");
  const task = blocks.find((block) => block.layer === "data.task");
  const compiled = {
    schema_version: RC4_CANONICAL_VERSION,
    compiled_prompt_id: `compiled.${modeId}.${fixtureId}`,
    compiled_prompt_version: "compiled-prompt-v1",
    compiler: {
      id: RC4_COMPILER_ID,
      version: RC4_COMPILER_VERSION,
    },
    registration: {
      id: context.registration.registration_id,
      version: context.registration.registration_version,
    },
    source_snapshot: {
      id: context.sourceSnapshot.snapshot_id,
      version: context.sourceSnapshot.snapshot_version,
      sha256: context.registration.source_snapshot_ref.sha256,
    },
    mode: { id: mode.mode_id, version: mode.mode_version },
    workflow: mode.workflow,
    router: { id: mode.router.id, version: mode.router.version },
    invocation: {
      id: fixture.fixture_id,
      version: context.fixtures.fixture_set_version,
    },
    fixture: {
      id: fixture.fixture_id,
      synthetic: true,
    },
    output_contract: mode.output_contract,
    language_policy: mode.language_policy,
    tool_capability_profile: mode.tool_capability_profile,
    context_budget: {
      policy_id: mode.context_budget_policy.id,
      capacity_utf8_bytes: RC4_CAPACITY_BYTES,
      used_characters: blocks.reduce((total, block) => total + block.content_character_count, 0),
      used_utf8_bytes: totalBytes,
      estimator: mode.context_budget_policy.estimator,
      decision: "fit",
      overflow_action: "fail",
      all_must_keep_present: true,
      provider_context_capacity_status: "unverified",
      provider_context_claim: false,
    },
    blocks,
    task_occurrence_count: 1,
    digests: {
      source_closure: digestRecord("rc4-source-closure-digest-v1", "rc4.source-closure", blocks.map((block) => ({
        id: block.id,
        source_id: block.source_id,
        source_path_or_mount: block.source_path_or_mount,
        source_hash: block.source_hash,
        normalized_content_hash: block.normalized_content_hash,
      }))),
      invariant_system: digestRecord("rc4-invariant-system-digest-v1", "rc4.invariant-system", invariant.map(blockIdentityProjection)),
      task_payload: digestRecord("rc4-task-payload-digest-v1", "rc4.task-payload", blockIdentityProjection(task)),
      profile_context: digestRecord("rc4-profile-context-digest-v1", "rc4.profile-context", profiles.map(blockIdentityProjection)),
      compilation: {
        projection_id: "rc4-compilation-digest-v1",
        sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
    validation: { status: "pass", issues: [] },
  };
  compiled.digests.compilation.sha256 = domainDigest("rc4.compilation", compilationProjection(compiled));
  validateCompiledPrompt(compiled, context);
  return compiled;
}

async function executeRegisteredNegativeCase(negativeCase, context, publicContext) {
  if (negativeCase.mutation.operation === "remove_required_source") {
    const mode = context.modes[negativeCase.mode_id];
    const mutated = JSON.parse(canonicalJsonV1(mode));
    const originalLength = mutated.ordered_system_sources.length;
    mutated.ordered_system_sources = mutated.ordered_system_sources.filter(
      (source) => source.id !== negativeCase.mutation.source_id,
    );
    if (mutated.ordered_system_sources.length !== originalLength - 1) {
      fail("RC4_INVALID_FIXTURE", `negative_cases.${negativeCase.case_id}`);
    }
    validateModeManifest(mutated, context.sourceIndex, `negative_cases.${negativeCase.case_id}`);
    return;
  }
  if (negativeCase.mutation.operation === "set_capacity_utf8_bytes") {
    const compiled = await compilePromptContext({
      mode_id: negativeCase.mode_id,
      fixture_id: negativeCase.base_fixture_id,
      context: publicContext,
    });
    enforceMustKeepCapacity(
      compiled.blocks,
      negativeCase.mutation.value,
      `negative_cases.${negativeCase.case_id}`,
    );
    return;
  }
  fail("RC4_INVALID_FIXTURE", `negative_cases.${negativeCase.case_id}`);
}

export async function runRegisteredNegativeCase(options = {}) {
  assertObject(options, "options");
  const publicContext = options.context;
  const context = internalContext(publicContext);
  const caseId = getOption(options, "case_id", "caseId");
  assertId(caseId, "options.case_id");
  const negativeCase = context.fixtures.negative_cases.find((item) => item.case_id === caseId);
  if (!negativeCase) fail("RC4_NEGATIVE_CASE_UNREGISTERED", "options.case_id");
  let observedCode = null;
  try {
    await executeRegisteredNegativeCase(negativeCase, context, publicContext);
  } catch (error) {
    if (!(error instanceof PromptContextV1Error)) throw error;
    observedCode = error.code;
  }
  if (observedCode !== negativeCase.expected_error_code) {
    fail("RC4_NEGATIVE_CASE_MISMATCH", `negative_cases.${negativeCase.case_id}`);
  }
  return Object.freeze({
    case_id: negativeCase.case_id,
    expected_error_code: negativeCase.expected_error_code,
    observed_error_code: observedCode,
    status: "pass",
  });
}

export async function validateRegisteredNegativeCases(options = {}) {
  assertObject(options, "options");
  const publicContext = options.context;
  const context = internalContext(publicContext);
  const results = [];
  for (const negativeCase of context.fixtures.negative_cases) {
    results.push(await runRegisteredNegativeCase({
      case_id: negativeCase.case_id,
      context: publicContext,
    }));
  }
  return Object.freeze(results);
}

function roleMappingFor(adapter, layer, logicalField) {
  const mapping = Array.isArray(adapter.role_mapping)
    ? adapter.role_mapping.find((item) => item.canonical_layer === layer)
    : adapter.role_mapping[layer];
  if (!isPlainObject(mapping)) fail("RC4_ROLE_MAPPING", logicalField);
  assertId(mapping.target_role, `${logicalField}.target_role`);
  const targetField = mapping.target_field ?? (
    mapping.target_role === "user" ? "messages" : mapping.target_role
  );
  return { ...mapping, target_field: targetField };
}

function routeBundleProjection(bundle) {
  const copy = { ...bundle };
  delete copy.route_bundle_digest;
  return copy;
}

function routePartFor(block, index, targetId, adapter) {
  const mapping = roleMappingFor(adapter, block.layer, `adapter.role_mapping.${block.layer}`);
  const envelopeBytes = canonicalJsonV1(block);
  const transformationRuleId = mapping.transformation_rule_id ?? mapping.rule_id;
  if (!adapter.permitted_transformation_rule_ids.includes(transformationRuleId)) {
    fail("RC4_ADAPTER_RULE_CLOSURE", `adapter.role_mapping.${block.layer}`);
  }
  return {
    part_id: `part.${targetId}.${index}`,
    ordinal: index,
    canonical_block_id: block.id,
    canonical_block_ordinal: block.ordinal,
    target_field: mapping.target_field,
    target_role: mapping.target_role,
    part_index: 0,
    part_count: 1,
    delivery: "inline",
    transformation_rule_id: transformationRuleId,
    mapping_projection_id: "rc4-route-part-mapping-v1",
    semantic_envelope: block,
    semantic_envelope_sha256: sha256V1(envelopeBytes),
    semantic_envelope_byte_count: Buffer.byteLength(envelopeBytes, "utf8"),
    semantic_envelope_character_count: codePointLength(envelopeBytes),
    character_count_unit: "unicode-code-point",
    byte_count_unit: "utf8-byte",
  };
}

function routeNonclaims() {
  return {
    success_sentence: RC4_NON_CLAIM,
    bounded_evidence_statement: RC4_BOUNDED_CLAIM,
    provider_observation: "unverified",
    workflow_behavior: "not_run",
    factuality: "not_run",
    safety: "not_run",
    quality: "not_run",
    feature_parity: "not_run",
    comparison: "not_run",
    product_integration: "not_implemented",
  };
}

export function projectRouteBundle(options = {}) {
  assertObject(options, "options");
  const compiled = options.compiled_prompt ?? options.compiledPrompt;
  const targetId = options.target_id ?? options.targetId ?? options.target;
  const context = internalContext(options.context);
  assertObject(compiled, "options.compiled_prompt");
  assertId(targetId, "options.target_id");
  validateCompiledPrompt(compiled, context);
  const adapter = context.adapters[targetId];
  if (!adapter) fail("RC4_TARGET_UNREGISTERED", "options.target_id");
  const parts = compiled.blocks.map((block, index) => routePartFor(block, index, targetId, adapter));
  const bundle = {
    schema_version: RC4_CANONICAL_VERSION,
    route_bundle_id: `bundle.${targetId}.${compiled.mode.id}.${compiled.fixture.id}`,
    route_bundle_version: "route-bundle-v1",
    target_route: adapter.target_route,
    adapter: { id: adapter.adapter_id, version: adapter.adapter_version },
    canonical_compilation: {
      id: compiled.compiled_prompt_id,
      digest_projection_id: "rc4-compilation-digest-v1",
      sha256: compiled.digests.compilation.sha256,
    },
    mode: compiled.mode,
    workflow: compiled.workflow,
    output_contract: compiled.output_contract,
    language_policy: compiled.language_policy,
    tool_capability_profile: compiled.tool_capability_profile,
    context_budget: compiled.context_budget,
    parts,
    task_occurrence_count: compiled.task_occurrence_count,
    inverse_decoder: {
      id: adapter.inverse_decoder.id,
      version: adapter.inverse_decoder.version,
      strategy: adapter.inverse_decoder.strategy,
      status: "pass",
      recovered_compilation_digest: compiled.digests.compilation.sha256,
    },
    route_bundle_digest: {
      projection_id: "rc4-route-bundle-digest-v1",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    },
    nonclaims: routeNonclaims(),
  };
  bundle.route_bundle_digest.sha256 = domainDigest("rc4.route-bundle", routeBundleProjection(bundle));
  schemaValidate(bundle, context.schemas["route-bundle"], "route_bundle");
  decodeRouteBundle({ route_bundle: bundle, compiled_prompt: compiled, context: options.context });
  return bundle;
}

function parityViewFromBundle(bundle, adapter) {
  const allowedRules = new Set(adapter.permitted_transformation_rule_ids);
  const seenBlocks = new Set();
  const blocks = bundle.parts.map((part, index) => {
    const block = part.semantic_envelope;
    if (part.ordinal !== index || part.canonical_block_ordinal !== index || block.ordinal !== index ||
        part.canonical_block_id !== block.id) {
      fail("RC4_ROUTE_ORDER", `route_bundle.parts[${index}]`);
    }
    if (part.delivery !== "inline" || part.part_index !== 0 || part.part_count !== 1) {
      fail("RC4_ROUTE_DELIVERY", `route_bundle.parts[${index}]`);
    }
    const id = block.id;
    if (seenBlocks.has(id)) fail("RC4_ROUTE_DUPLICATE_BLOCK", `route_bundle.parts[${index}]`);
    seenBlocks.add(id);
    const mapping = roleMappingFor(adapter, block.layer, `route_bundle.parts[${index}]`);
    if (part.target_field !== mapping.target_field || part.target_role !== mapping.target_role) {
      fail("RC4_ROUTE_ROLE", `route_bundle.parts[${index}]`);
    }
    const expectedRuleId = mapping.transformation_rule_id ?? mapping.rule_id;
    if (!allowedRules.has(part.transformation_rule_id) || part.transformation_rule_id !== expectedRuleId) {
      fail("RC4_ADAPTER_RULE_CLOSURE", `route_bundle.parts[${index}]`);
    }
    const envelopeBytes = canonicalJsonV1(block);
    if (Buffer.byteLength(envelopeBytes, "utf8") !== part.semantic_envelope_byte_count ||
        codePointLength(envelopeBytes) !== part.semantic_envelope_character_count) {
      fail("RC4_CONTENT_COUNT", `route_bundle.parts[${index}]`);
    }
    const envelopeHash = sha256V1(envelopeBytes);
    if (!safeHashEqual(envelopeHash, part.semantic_envelope_sha256)) {
      fail("RC4_CONTENT_HASH", `route_bundle.parts[${index}]`, envelopeHash.slice(0, 12));
    }
    const contentBytes = Buffer.from(block.content, "utf8");
    const hash = sha256V1(contentBytes);
    if (!safeHashEqual(hash, block.normalized_content_hash)) {
      fail("RC4_CONTENT_HASH", `route_bundle.parts[${index}]`, hash.slice(0, 12));
    }
    validateBlock(block, `route_bundle.parts[${index}].semantic_envelope`);
    validateNoSensitiveText(block.content, `route_bundle.parts[${index}]`);
    if (block.layer === "context.memory") fail("RC4_MEMORY_FORBIDDEN", `route_bundle.parts[${index}]`);
    if (block.layer === "data.task" && (block.authority !== "data" || block.trust !== "external_untrusted")) {
      fail("RC4_TASK_PROMOTION", `route_bundle.parts[${index}]`);
    }
    return block;
  });
  const taskCount = blocks.filter((block) => block.layer === "data.task").length;
  if (taskCount !== 1 || bundle.task_occurrence_count !== 1) fail("RC4_TASK_OCCURRENCE", "route_bundle");
  return {
    canonical_compilation_digest: bundle.canonical_compilation.sha256,
    mode: bundle.mode,
    workflow: bundle.workflow,
    output_contract: bundle.output_contract,
    language_policy: bundle.language_policy,
    tool_capability_profile: bundle.tool_capability_profile,
    context_budget: bundle.context_budget,
    blocks,
    task_occurrence_count: taskCount,
  };
}

export function decodeRouteBundle(options = {}) {
  assertObject(options, "options");
  const bundle = options.route_bundle ?? options.routeBundle;
  const compiled = options.compiled_prompt ?? options.compiledPrompt;
  const context = internalContext(options.context);
  assertObject(bundle, "options.route_bundle");
  assertObject(compiled, "options.compiled_prompt");
  validateCompiledPrompt(compiled, context);
  schemaValidate(bundle, context.schemas["route-bundle"], "route_bundle");
  assertSha256(bundle.canonical_compilation.sha256, "route_bundle.canonical_compilation.sha256");
  assertSha256(bundle.route_bundle_digest.sha256, "route_bundle.route_bundle_digest.sha256");
  const expectedDigest = domainDigest("rc4.route-bundle", routeBundleProjection(bundle));
  if (bundle.route_bundle_digest.projection_id !== "rc4-route-bundle-digest-v1" ||
      bundle.route_bundle_digest.sha256 !== expectedDigest) {
    fail("RC4_DIGEST_MISMATCH", "route_bundle.route_bundle_digest");
  }
  const targetId = bundle.target_route.id;
  const adapter = context.adapters[targetId];
  if (!adapter || bundle.adapter.id !== adapter.adapter_id || bundle.adapter.version !== adapter.adapter_version) {
    fail("RC4_ADAPTER_BINDING", "route_bundle.adapter");
  }
  if (canonicalJsonV1(bundle.target_route) !== canonicalJsonV1(adapter.target_route)) {
    fail("RC4_TARGET_BINDING", "route_bundle.target_route");
  }
  if (bundle.schema_version !== RC4_CANONICAL_VERSION ||
      bundle.route_bundle_id !== `bundle.${targetId}.${compiled.mode.id}.${compiled.fixture.id}` ||
      bundle.route_bundle_version !== "route-bundle-v1") {
    fail("RC4_ROUTE_IDENTITY", "route_bundle.identity");
  }
  const expectedCompilation = {
    id: compiled.compiled_prompt_id,
    digest_projection_id: "rc4-compilation-digest-v1",
    sha256: compiled.digests.compilation.sha256,
  };
  const expectedDecoder = {
    id: adapter.inverse_decoder.id,
    version: adapter.inverse_decoder.version,
    strategy: adapter.inverse_decoder.strategy,
    status: "pass",
    recovered_compilation_digest: compiled.digests.compilation.sha256,
  };
  if (canonicalJsonV1(bundle.canonical_compilation) !== canonicalJsonV1(expectedCompilation) ||
      canonicalJsonV1(bundle.inverse_decoder) !== canonicalJsonV1(expectedDecoder) ||
      canonicalJsonV1(bundle.mode) !== canonicalJsonV1(compiled.mode) ||
      canonicalJsonV1(bundle.workflow) !== canonicalJsonV1(compiled.workflow) ||
      canonicalJsonV1(bundle.output_contract) !== canonicalJsonV1(compiled.output_contract) ||
      canonicalJsonV1(bundle.language_policy) !== canonicalJsonV1(compiled.language_policy) ||
      canonicalJsonV1(bundle.tool_capability_profile) !== canonicalJsonV1(compiled.tool_capability_profile) ||
      canonicalJsonV1(bundle.context_budget) !== canonicalJsonV1(compiled.context_budget) ||
      canonicalJsonV1(bundle.nonclaims) !== canonicalJsonV1(routeNonclaims()) ||
      bundle.parts.length !== compiled.blocks.length) {
    fail("RC4_CANONICAL_BINDING", "route_bundle.canonical_compilation");
  }
  bundle.parts.forEach((part, index) => {
    const expectedPart = routePartFor(compiled.blocks[index], index, targetId, adapter);
    if (canonicalJsonV1(part) !== canonicalJsonV1(expectedPart)) {
      fail("RC4_CANONICAL_BINDING", `route_bundle.parts[${index}]`);
    }
  });
  return parityViewFromBundle(bundle, adapter);
}

function compareParityViews(left, right) {
  if (canonicalJsonV1(left) !== canonicalJsonV1(right)) {
    fail("RC4_STRUCTURAL_PARITY", "comparison.views");
  }
}

export async function comparePromptContext(options = {}) {
  assertObject(options, "options");
  const publicContext = options.context ?? await validatePromptContextPackage({
    repo_root: options.repo_root ?? options.repoRoot,
  });
  const modeId = getOption(options, "mode_id", "modeId") ?? options.mode;
  const fixtureId = getOption(options, "fixture_id", "fixtureId") ?? options.fixture;
  const compiled = await compilePromptContext({ mode_id: modeId, fixture_id: fixtureId, context: publicContext });
  const bundles = TARGET_IDS.map((targetId) =>
    projectRouteBundle({ compiled_prompt: compiled, target_id: targetId, context: publicContext }),
  );
  const views = bundles.map((bundle) => decodeRouteBundle({
    route_bundle: bundle,
    compiled_prompt: compiled,
    context: publicContext,
  }));
  compareParityViews(views[0], views[1]);
  return {
    status: "pass",
    mode_id: modeId,
    fixture_id: fixtureId,
    compilation_digest: compiled.digests.compilation.sha256,
    target_ids: [...TARGET_IDS],
    views,
    non_claim: RC4_NON_CLAIM,
  };
}

function validationResult(compiled, bundle, context) {
  return {
    schema_version: RC4_CANONICAL_VERSION,
    result_id: `result.${compiled.mode.id}.${compiled.fixture.id}.${bundle.target_route.id}`,
    validator: { id: "recursus-prompt-context-validator", version: RC4_COMPILER_VERSION },
    command: "compile",
    status: "pass",
    registration_id: context.registration.registration_id,
    source_snapshot_id: context.sourceSnapshot.snapshot_id,
    mode_id: compiled.mode.id,
    fixture_id: compiled.fixture.id,
    targets: [bundle.target_route.id],
    checks: [
      { id: "registered-source-closure", status: "pass", subject: "source_closure", digest_prefix: compiled.digests.source_closure.sha256.slice(0, 12) },
      { id: "exact-one-untrusted-task", status: "pass", subject: "task_occurrence", digest_prefix: compiled.digests.task_payload.sha256.slice(0, 12) },
      { id: "capacity-fit", status: "pass", subject: "context_budget", digest_prefix: compiled.digests.compilation.sha256.slice(0, 12) },
      { id: "adapter-round-trip", status: "pass", subject: "route_bundle", digest_prefix: bundle.route_bundle_digest.sha256.slice(0, 12) },
    ],
    issues: [],
    digests: [compiled.digests.compilation, bundle.route_bundle_digest],
    nonclaims: {
      success_sentence: RC4_NON_CLAIM,
      bounded_evidence_statement: RC4_BOUNDED_CLAIM,
      provider_observation: "unverified",
      workflow_behavior: "not_run",
      factuality: "not_run",
      safety: "not_run",
      quality: "not_run",
      feature_parity: "not_run",
      comparison: "not_run",
      product_integration: "not_implemented",
    },
  };
}

async function nearestExistingAncestor(candidate) {
  let current = candidate;
  for (;;) {
    try {
      await lstat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) fail("RC4_OUTPUT_PARENT", "output_root");
      current = parent;
    }
  }
}

async function assertNoLinkedAbsoluteChain(candidate, logicalField) {
  const parsed = path.parse(candidate);
  const relative = path.relative(parsed.root, candidate);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch {
      break;
    }
    if (info.isSymbolicLink()) {
      const posix = current.replaceAll("\\", "/");
      let target = "";
      try {
        target = (await realpath(current)).replaceAll("\\", "/");
      } catch {
        fail("RC4_LINK_FORBIDDEN", logicalField);
      }
      const standardMacAlias =
        (posix === "/var" && target === "/private/var") ||
        (posix === "/tmp" && target === "/private/tmp");
      if (!standardMacAlias) fail("RC4_LINK_FORBIDDEN", logicalField);
    }
  }
}

function filesystemIdentity(info) {
  return {
    device: String(info.dev),
    inode: String(info.ino),
  };
}

async function directoryBinding(candidate, logicalField) {
  await assertNoLinkedAbsoluteChain(candidate, logicalField);
  let info;
  let resolved;
  try {
    info = await lstat(candidate);
    resolved = await realpath(candidate);
  } catch {
    fail("RC4_OUTPUT_RACE", logicalField);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) fail("RC4_OUTPUT_RACE", logicalField);
  return Object.freeze({
    ...filesystemIdentity(info),
    realpath: portablePathKey(resolved.replaceAll("\\", "/")),
  });
}

function sameFilesystemBinding(left, right) {
  return canonicalJsonV1(left) === canonicalJsonV1(right);
}

async function assertOutputRootBinding(outputRoot, expected) {
  let actual;
  try {
    actual = await directoryBinding(outputRoot, "output_root");
  } catch (error) {
    if (error instanceof PromptContextV1Error) fail("RC4_OUTPUT_RACE", "output_root");
    throw error;
  }
  if (!sameFilesystemBinding(actual, expected)) fail("RC4_OUTPUT_RACE", "output_root");
  return actual;
}

async function bindCreatedFile(destination, handle, rootBinding, record) {
  let handleInfo;
  let pathInfo;
  let resolved;
  try {
    handleInfo = await handle.stat();
    pathInfo = await lstat(destination);
    resolved = await realpath(destination);
  } catch {
    fail("RC4_OUTPUT_RACE", "output.files");
  }
  record.resolved_path = resolved;
  record.identity = filesystemIdentity(handleInfo);
  if (pathInfo.isSymbolicLink() || !pathInfo.isFile() || pathInfo.nlink !== 1 ||
      !sameFilesystemBinding(filesystemIdentity(pathInfo), record.identity) ||
      portablePathKey(path.dirname(resolved).replaceAll("\\", "/")) !== rootBinding.realpath) {
    fail("RC4_OUTPUT_RACE", "output.files");
  }
}

async function assertCreatedFileRecord(record, rootBinding) {
  let info;
  try {
    info = await lstat(record.resolved_path);
  } catch {
    fail("RC4_OUTPUT_RACE", "output.files");
  }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 ||
      !sameFilesystemBinding(filesystemIdentity(info), record.identity) ||
      portablePathKey(path.dirname(record.resolved_path).replaceAll("\\", "/")) !== rootBinding.realpath) {
    fail("RC4_OUTPUT_RACE", "output.files");
  }
}

async function preflightOutputRoot(outputRoot) {
  if (typeof outputRoot !== "string" || outputRoot.length === 0 || outputRoot.includes("\0") || !path.isAbsolute(outputRoot)) {
    fail("RC4_OUTPUT_ROOT", "output_root");
  }
  const resolved = path.resolve(outputRoot);
  if (resolved === path.parse(resolved).root) fail("RC4_OUTPUT_ROOT", "output_root");
  await assertNoLinkedAbsoluteChain(resolved, "output_root");
  const repoReal = await realpath(REPOSITORY_ROOT);
  const ancestor = await nearestExistingAncestor(resolved);
  let ancestorReal;
  try {
    ancestorReal = await realpath(ancestor);
  } catch {
    fail("RC4_OUTPUT_PARENT", "output_root");
  }
  const suffix = path.relative(ancestor, resolved);
  const prospective = path.resolve(ancestorReal, suffix);
  if (isWithin(repoReal, prospective) || isWithin(prospective, repoReal)) {
    fail("RC4_OUTPUT_OVERLAP", "output_root");
  }
  let exists = false;
  let rootBinding = null;
  let parentBinding = null;
  try {
    const info = await lstat(resolved);
    exists = true;
    if (info.isSymbolicLink() || !info.isDirectory()) fail("RC4_OUTPUT_ROOT", "output_root");
    const entries = await readdir(resolved);
    if (entries.length !== 0) fail("RC4_OUTPUT_NOT_EMPTY", "output_root");
    rootBinding = await directoryBinding(resolved, "output_root");
  } catch (error) {
    if (error instanceof PromptContextV1Error) throw error;
    if (error?.code !== "ENOENT") fail("RC4_OUTPUT_ROOT", "output_root");
    const parent = path.dirname(resolved);
    let parentInfo;
    try {
      parentInfo = await lstat(parent);
    } catch {
      fail("RC4_OUTPUT_PARENT", "output_root");
    }
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) fail("RC4_OUTPUT_PARENT", "output_root");
    parentBinding = await directoryBinding(parent, "output_root");
  }
  return { resolved, exists, rootBinding, parentBinding };
}

export async function planCompilationArtifacts(options = {}) {
  assertObject(options, "options");
  const publicContext = options.context;
  const context = internalContext(publicContext);
  const compiled = options.compiled_prompt ?? options.compiledPrompt;
  const targetId = options.target_id ?? options.targetId ?? options.target;
  const outputRoot = options.output_root ?? options.outputRoot ?? options.output;
  validateCompiledPrompt(compiled, context);
  const projected = projectRouteBundle({ compiled_prompt: compiled, target_id: targetId, context: publicContext });
  const supplied = options.route_bundle ?? options.routeBundle;
  if (supplied !== undefined && canonicalJsonV1(supplied) !== canonicalJsonV1(projected)) {
    fail("RC4_ROUTE_BUNDLE_MISMATCH", "options.route_bundle");
  }
  const bundle = supplied ?? projected;
  decodeRouteBundle({ route_bundle: bundle, compiled_prompt: compiled, context: publicContext });
  const rootState = await preflightOutputRoot(outputRoot);
  const result = validationResult(compiled, bundle, context);
  schemaValidate(result, context.schemas["validation-result"], "validation_result");
  const files = [
    ["compiled-prompt.json", canonicalJsonV1(compiled)],
    [`${targetId}.route-bundle.json`, canonicalJsonV1(bundle)],
    ["validation-result.json", canonicalJsonV1(result)],
  ].map(([name, bytes]) => {
    if (Buffer.byteLength(bytes, "utf8") > MAX_OUTPUT_FILE_BYTES) fail("RC4_LIMIT_EXCEEDED", "output.files");
    return Object.freeze({ name, bytes });
  });
  for (const file of files) {
    if (!/^[a-z0-9][a-z0-9.-]{0,127}\.json$/.test(file.name)) fail("RC4_OUTPUT_FILENAME", "output.files");
  }
  const plan = {
    output_root: rootState.resolved,
    root_existed: rootState.exists,
    root_binding: rootState.rootBinding,
    parent_binding: rootState.parentBinding,
    files: Object.freeze(files),
  };
  const frozen = Object.freeze(plan);
  VALID_WRITE_PLANS.add(frozen);
  return frozen;
}

export async function writeCompilationArtifacts(plan) {
  if (!isPlainObject(plan) || !VALID_WRITE_PLANS.has(plan) || !Object.isFrozen(plan)) {
    fail("RC4_INVALID_WRITE_PLAN", "write_plan");
  }
  let state;
  try {
    state = await preflightOutputRoot(plan.output_root);
  } catch (error) {
    if (error instanceof PromptContextV1Error) fail("RC4_OUTPUT_RACE", "output_root");
    throw error;
  }
  if (state.exists !== plan.root_existed ||
      !sameFilesystemBinding(state.rootBinding, plan.root_binding) ||
      !sameFilesystemBinding(state.parentBinding, plan.parent_binding)) {
    fail("RC4_OUTPUT_RACE", "output_root");
  }
  let createdRoot = false;
  const createdFiles = [];
  let expectedRootBinding = state.rootBinding;
  try {
    if (!state.exists) {
      await mkdir(plan.output_root, { recursive: false, mode: 0o700 });
      createdRoot = true;
      expectedRootBinding = await directoryBinding(plan.output_root, "output_root");
    }
    for (const file of plan.files) {
      await assertOutputRootBinding(plan.output_root, expectedRootBinding);
      const destination = path.join(plan.output_root, file.name);
      const relative = path.relative(plan.output_root, destination);
      if (relative.startsWith("..") || path.isAbsolute(relative)) fail("RC4_OUTPUT_ESCAPE", "write_plan.files");
      const handle = await open(destination, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
      const created = { resolved_path: null, identity: null };
      createdFiles.push(created);
      try {
        await bindCreatedFile(destination, handle, expectedRootBinding, created);
        await assertOutputRootBinding(plan.output_root, expectedRootBinding);
        await handle.writeFile(file.bytes, { encoding: "utf8" });
        await handle.sync();
        await assertOutputRootBinding(plan.output_root, expectedRootBinding);
        await bindCreatedFile(destination, handle, expectedRootBinding, created);
      } finally {
        await handle.close();
      }
      await assertOutputRootBinding(plan.output_root, expectedRootBinding);
      await assertCreatedFileRecord(created, expectedRootBinding);
    }
    await assertOutputRootBinding(plan.output_root, expectedRootBinding);
    for (const created of createdFiles) await assertCreatedFileRecord(created, expectedRootBinding);
    return { files: plan.files.map((file) => file.name) };
  } catch (error) {
    for (const created of createdFiles.reverse()) {
      try {
        if (created.resolved_path === null || created.identity === null) continue;
        const info = await lstat(created.resolved_path);
        if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 ||
            !sameFilesystemBinding(filesystemIdentity(info), created.identity)) continue;
        await unlink(created.resolved_path);
      } catch {
        // Only files created by this call are eligible for cleanup.
      }
    }
    if (createdRoot) {
      try {
        await assertOutputRootBinding(plan.output_root, expectedRootBinding);
        await rmdir(plan.output_root);
      } catch {
        // A raced-in entry makes removal unsafe, so leave the root in place.
      }
    }
    if (error instanceof PromptContextV1Error) throw error;
    fail("RC4_WRITE_FAILED", "output_root");
  }
}
