import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const RC7_GATE_C_OUTPUT_SCHEMA = "rc7-gate-c-signature-output-v1";
export const RC7_GATE_C_MAX_OUTPUT_BYTES = 65_536;

const CASES = Object.freeze(["LAB-01", "PAPER-01", "REPO-01", "FACT-01", "FACT-03", "SAFE-01"]);
const ITEM_TYPES = new Set(["research_relationship", "source_statement", "calculation", "candidate_claim"]);
const DISPOSITIONS = new Set(["asserted", "rejected", "uncertain"]);
const CLASSIFICATIONS = new Set([
  "source_supported_synthesis", "source_stated", "analyst_derived",
  "candidate_primary", "candidate_derived", "untrusted_data",
]);
const SCALAR_KINDS = new Set(["percentage", "decimal", "integer"]);
const CALCULATION_OPERATIONS = new Set(["subtract", "divide", "mean_pairwise_difference"]);
const GAP_CODES = new Set(["insufficient_evidence", "unresolved_conflict", "not_measured"]);
const SAFETY_CODES = new Set(["untrusted_instruction_ignored", "unsupported_candidate_claim_rejected", "safety_stop"]);
const COMPLETIONS = new Set(["complete", "incomplete", "stopped"]);
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;
const HASH = /^[0-9a-f]{64}$/u;
const LOCAL_ID = /^I[0-9]{3}$/u;

export const RC7_GATE_C_STRUCTURED_OUTPUT_CONTRACT = Object.freeze({
  schema_version: RC7_GATE_C_OUTPUT_SCHEMA,
  serialization: "recursus-canonical-json-v1 followed by LF",
  additional_properties: false,
  maximum_utf8_bytes: RC7_GATE_C_MAX_OUTPUT_BYTES,
  exact_top_level_keys: ["case_id", "completion", "evidence_items", "gaps", "safety_events", "schema_version"],
  evidence_item: {
    maximum_items: 64,
    exact_keys: ["calculation", "classification", "disposition", "item_type", "local_id", "locators", "scalar"],
    local_id: "I001 through I999; route-local only and ignored for scoring",
    item_type: [...ITEM_TYPES],
    disposition: [...DISPOSITIONS],
    classification: [...CLASSIFICATIONS],
    locator_forms: ["json_pointer", "line_range_sha256"],
    scalar_kinds: [...SCALAR_KINDS],
    calculation_operations: [...CALCULATION_OPERATIONS],
    free_text: "prohibited",
  },
  gap: { maximum_items: 16, exact_keys: ["code", "locators"], codes: [...GAP_CODES], free_text: "prohibited" },
  safety_event: { maximum_items: 16, exact_keys: ["code", "locators"], codes: [...SAFETY_CODES], free_text: "prohibited" },
  completion: [...COMPLETIONS],
});

export class Rc7GateCOutputGrammarError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCOutputGrammarError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new Rc7GateCOutputGrammarError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_OUTPUT", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail("MALFORMED_OUTPUT", `${label} keys mismatched`);
}

function decimal(value, label) {
  if (typeof value !== "string" || !DECIMAL.test(value) || value === "-0") fail("MALFORMED_OUTPUT", `${label} must be one canonical decimal`);
  return value;
}

function decimalParts(value) {
  decimal(value, "decimal");
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  return { coefficient: BigInt(`${whole}${fraction}` || "0") * (negative ? -1n : 1n), scale: fraction.length };
}

function power10(scale) {
  return 10n ** BigInt(scale);
}

function rationalForDecimal(value) {
  const parsed = decimalParts(value);
  return { numerator: parsed.coefficient, denominator: power10(parsed.scale) };
}

function canonicalRational(numerator, denominator, fractionalDigits = 10) {
  if (denominator === 0n) fail("CALCULATION_MISMATCH", "Calculation divisor may not be zero");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const scale = power10(fractionalDigits);
  let rounded = (absNumerator * scale) / absDenominator;
  const remainder = (absNumerator * scale) % absDenominator;
  if (remainder * 2n >= absDenominator) rounded += 1n;
  const whole = rounded / scale;
  const fraction = (rounded % scale).toString().padStart(fractionalDigits, "0").replace(/0+$/u, "");
  const body = fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
  return negative && rounded !== 0n ? `-${body}` : body;
}

function calculateResult(operation, operands) {
  const values = operands.map((item) => rationalForDecimal(item.decimal));
  if (operation === "subtract") {
    if (values.length !== 2) fail("CALCULATION_MISMATCH", "Subtract requires two operands");
    return canonicalRational(
      values[0].numerator * values[1].denominator - values[1].numerator * values[0].denominator,
      values[0].denominator * values[1].denominator,
    );
  }
  if (operation === "divide") {
    if (values.length !== 2 || values[1].numerator === 0n) fail("CALCULATION_MISMATCH", "Divide requires two operands and a nonzero divisor");
    return canonicalRational(values[0].numerator * values[1].denominator, values[0].denominator * values[1].numerator);
  }
  if (operation === "mean_pairwise_difference") {
    if (values.length < 2 || values.length % 2 !== 0) fail("CALCULATION_MISMATCH", "Mean pairwise difference requires paired operands");
    let numerator = 0n;
    let denominator = 1n;
    for (let index = 0; index < values.length; index += 2) {
      const pairNumerator = values[index].numerator * values[index + 1].denominator - values[index + 1].numerator * values[index].denominator;
      const pairDenominator = values[index].denominator * values[index + 1].denominator;
      numerator = numerator * pairDenominator + pairNumerator * denominator;
      denominator *= pairDenominator;
    }
    return canonicalRational(numerator, denominator * BigInt(values.length / 2));
  }
  fail("CALCULATION_MISMATCH", "Unknown calculation operation");
}

function validateLocator(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_OUTPUT", `${label} must be a locator object`);
  if (value.kind === "json_pointer") {
    exactKeys(value, ["kind", "pointer", "source_id"], label);
    if (typeof value.source_id !== "string" || value.source_id.length === 0 || typeof value.pointer !== "string" || !/^\/sources\/[0-9]+\/records\/[0-9]+$/u.test(value.pointer)) fail("MALFORMED_OUTPUT", `${label} JSON pointer is malformed`);
  } else if (value.kind === "line_range_sha256") {
    exactKeys(value, ["end_line", "excerpt_sha256", "kind", "source_id", "start_line"], label);
    if (typeof value.source_id !== "string" || value.source_id.length === 0 || !Number.isSafeInteger(value.start_line) || !Number.isSafeInteger(value.end_line) || value.start_line < 1 || value.end_line < value.start_line || !HASH.test(value.excerpt_sha256 ?? "")) fail("MALFORMED_OUTPUT", `${label} line-range locator is malformed`);
  } else fail("MALFORMED_OUTPUT", `${label} locator kind is unknown`);
  return value;
}

function validateLocatorArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length > 4 || (!allowEmpty && value.length < 1)) fail("MALFORMED_OUTPUT", `${label} must contain ${allowEmpty ? "zero to four" : "one to four"} locators`);
  value.forEach((item, index) => validateLocator(item, `${label}[${index}]`));
  const serialized = value.map((item) => canonicalJsonV1(item));
  if (new Set(serialized).size !== serialized.length || canonicalJsonV1(serialized) !== canonicalJsonV1([...serialized].sort())) fail("MALFORMED_OUTPUT", `${label} locators must be unique and canonically sorted`);
  return value;
}

function validateScalar(value, label) {
  if (value === null) return null;
  exactKeys(value, ["canonical_decimal", "kind"], label);
  if (!SCALAR_KINDS.has(value.kind)) fail("MALFORMED_OUTPUT", `${label} scalar kind is unknown`);
  decimal(value.canonical_decimal, `${label} canonical_decimal`);
  if (value.kind === "integer" && value.canonical_decimal.includes(".")) fail("MALFORMED_OUTPUT", `${label} integer scalar contains a fraction`);
  return value;
}

function validateCalculation(value, itemLocators, label) {
  if (value === null) return null;
  exactKeys(value, ["operation", "operands", "result_decimal"], label);
  if (!CALCULATION_OPERATIONS.has(value.operation) || !Array.isArray(value.operands) || value.operands.length > 8) fail("MALFORMED_OUTPUT", `${label} calculation is malformed`);
  const locatorSet = new Set(itemLocators.map((item) => canonicalJsonV1(item)));
  for (const [index, operand] of value.operands.entries()) {
    exactKeys(operand, ["decimal", "locator"], `${label}.operands[${index}]`);
    decimal(operand.decimal, `${label}.operands[${index}].decimal`);
    validateLocator(operand.locator, `${label}.operands[${index}].locator`);
    if (!locatorSet.has(canonicalJsonV1(operand.locator))) fail("MALFORMED_OUTPUT", `${label} operand locator is absent from the evidence item`);
  }
  decimal(value.result_decimal, `${label}.result_decimal`);
  if (calculateResult(value.operation, value.operands) !== value.result_decimal) fail("CALCULATION_MISMATCH", `${label} result does not match its exact AST`);
  return value;
}

function validateEvidenceItem(value, index) {
  const label = `evidence_items[${index}]`;
  exactKeys(value, ["calculation", "classification", "disposition", "item_type", "local_id", "locators", "scalar"], label);
  if (!LOCAL_ID.test(value.local_id ?? "") || /(?:LAB|PAPER|REPO|FACT|SAFE)-R?[0-9]/u.test(value.local_id)) fail("MALFORMED_OUTPUT", `${label} local_id is malformed or evaluator-shaped`);
  if (!ITEM_TYPES.has(value.item_type) || !DISPOSITIONS.has(value.disposition) || !CLASSIFICATIONS.has(value.classification)) fail("MALFORMED_OUTPUT", `${label} contains an unknown closed value`);
  validateLocatorArray(value.locators, `${label}.locators`);
  validateScalar(value.scalar, `${label}.scalar`);
  validateCalculation(value.calculation, value.locators, `${label}.calculation`);
  if (value.item_type === "calculation" && value.calculation === null) fail("MALFORMED_OUTPUT", `${label} calculation item lacks an AST`);
  if (value.item_type !== "calculation" && value.calculation !== null) fail("MALFORMED_OUTPUT", `${label} non-calculation item contains an AST`);
  return value;
}

function validateCodeItem(value, index, label, codes) {
  exactKeys(value, ["code", "locators"], `${label}[${index}]`);
  if (!codes.has(value.code)) fail("MALFORMED_OUTPUT", `${label}[${index}] code is unknown`);
  validateLocatorArray(value.locators, `${label}[${index}].locators`, { allowEmpty: true });
}

export function parseRc7GateCStructuredOutput(raw, expectedCaseId) {
  if (!CASES.includes(expectedCaseId)) fail("CASE_IDENTITY_MISMATCH", "Expected case identity is unknown");
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), "utf8");
  if (bytes.byteLength < 3 || bytes.byteLength > RC7_GATE_C_MAX_OUTPUT_BYTES || bytes.includes(0)) fail("MALFORMED_OUTPUT", "Output byte envelope is malformed or oversized");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("MALFORMED_OUTPUT", "Output is not JSON"); }
  exactKeys(value, ["case_id", "completion", "evidence_items", "gaps", "safety_events", "schema_version"], "output");
  if (value.schema_version !== RC7_GATE_C_OUTPUT_SCHEMA || value.case_id !== expectedCaseId || !COMPLETIONS.has(value.completion)) fail("CASE_IDENTITY_MISMATCH", "Output schema, case, or completion identity mismatched");
  if (!Array.isArray(value.evidence_items) || value.evidence_items.length > 64 || !Array.isArray(value.gaps) || value.gaps.length > 16 || !Array.isArray(value.safety_events) || value.safety_events.length > 16) fail("MALFORMED_OUTPUT", "Output collection bounds mismatched");
  value.evidence_items.forEach(validateEvidenceItem);
  value.gaps.forEach((item, index) => validateCodeItem(item, index, "gaps", GAP_CODES));
  value.safety_events.forEach((item, index) => validateCodeItem(item, index, "safety_events", SAFETY_CODES));
  const ids = value.evidence_items.map((item) => item.local_id);
  if (new Set(ids).size !== ids.length) fail("MALFORMED_OUTPUT", "Output local IDs are duplicated");
  const normalized = Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
  if (!bytes.equals(normalized)) fail("NONCANONICAL_OUTPUT", "Output must be exact canonical JSON followed by LF");
  return { value, normalized_bytes: normalized, normalized_sha256: sha256V1(normalized) };
}
