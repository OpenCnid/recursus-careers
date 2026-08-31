import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import {
  RC7_GATE_C_RLM_IMAGE_ID,
  inspectRc7GateCRlmCompletedArtifact,
} from "./rc7-rlm-gate-c-rlm-launcher.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const RC7_GATE_C_PROOF_PREREQUISITE_SCHEMA = "rc7-gate-c-successful-treatment-proof-prerequisite-v1";
export const RC7_GATE_C_PROOF_PREREQUISITE_TERMINAL = "SUCCESSFUL_NONMATRIX_TREATMENT_PROOF_REVALIDATED";

const RC7_GATE_C_TREATMENT_PROOF_POLICY_ID = "rc7-gate-c-lab01-complete-rlm-treatment-proof-v15";
const RC7_GATE_C_TREATMENT_PROOF_RUN_ID = "382b4ea0b261e55eb7322857a1c7b8651e071c7c2c6ac3f6fe961bfd2db782fb";
const RC7_GATE_C_TREATMENT_PROOF_RESULT_NAME = "treatment-proof-result.json";
const SUCCESSFUL_PROOF = Object.freeze({
  closure_sha256: "cd8ee05fcc9143d502ac2437c6bcf32fe99cc93371acc8a4f0ee57e3bd5059fc",
  freeze_sha256: "43799fabc0c0eec35226b1d338ad36cf7e294834baa7081f53cbbc8475bc473a",
  approval_sha256: "331b812442338185d321608b29f4b11be2678bf6aeb635017cc94f91017350e4",
  activation_sha256: "bbfbd04701250e91861b24f85af264ada9d631159e7f983068c10528657401d3",
  result_sha256: "095d89c7f17f56960f14c8ba941883f3bab5a62b39c6fe0f6c4a5417d38203ca",
  ledger_sha256: "b62ec8f88e29259ffff6747dc2c71b8c22d313af7e86f98fe0b9c0cc5483baad",
  conformance_sha256: "fffbf353b958e60ecc09d6777862511b9609459f7b4f6f8ec608789c345c6137",
});

const RESULT_KEYS = [
  "accounting", "activation_sha256", "case_id", "children", "cleanup", "combined_artifact",
  "combined_artifact_sha256", "contained_rlm", "matrix_member", "nonclaims", "policy_identity",
  "replacement", "replay_permitted", "result_sha256", "run_id", "schema_version", "score_bearing",
  "state", "terminal_decision", "top_level",
];
const RESULT_ENTRY_KEYS = ["artifact", "dispatch_sha256", "observations", "sealed_result_sha256", "terminal_sha256", "usage"];
const CHILD_RESULT_ENTRY_KEYS = ["artifact", "child_sequence", "dispatch_sha256", "observations", "sealed_result_sha256", "terminal_sha256", "usage"];

export class Rc7GateCProofPrerequisiteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Rc7GateCProofPrerequisiteError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new Rc7GateCProofPrerequisiteError(code, message);
}

function projection(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} keys mismatched`);
  }
}

function normalized(value) {
  return path.resolve(value).replaceAll("/", "\\").replace(/[\\]+$/u, "").toLowerCase();
}

async function readCanonicalFile(target, label, maximumBytes = 1_048_576) {
  let stat;
  try { stat = await lstat(target); }
  catch { fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} is missing or inaccessible`); }
  if (!stat.isFile() || stat.isSymbolicLink() || normalized(await realpath(target)) !== normalized(target)) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} must be one physical file`);
  }
  const bytes = await readFile(target);
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} byte count is outside the closed bound`);
  }
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} is not valid JSON`); }
  if (!bytes.equals(Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8"))) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} is not canonical normalized JSON`);
  }
  return { value, bytes };
}

async function assertBoundRoot(inputRoot, retainedIdentity, label) {
  if (typeof inputRoot !== "string" || !path.isAbsolute(inputRoot)
    || normalized(inputRoot) !== normalized(retainedIdentity?.normalized_physical_root)) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} path differs from the approved proof`);
  }
  let stat;
  try { stat = await lstat(inputRoot, { bigint: true }); }
  catch { fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} is missing or inaccessible`); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || normalized(await realpath(inputRoot)) !== normalized(inputRoot)
    || String(stat.dev) !== retainedIdentity.device_id || String(stat.ino) !== retainedIdentity.file_id
    || String(stat.birthtimeNs) !== retainedIdentity.birthtime_ns) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${label} physical identity changed`);
  }
  return path.resolve(inputRoot);
}

function validateResultEntry(value, terminal, childSequence) {
  exactKeys(value, childSequence === 0 ? RESULT_ENTRY_KEYS : CHILD_RESULT_ENTRY_KEYS, "treatment-proof result entry");
  if ((childSequence !== 0 && value.child_sequence !== childSequence)
    || value.dispatch_sha256 !== terminal.dispatch_sha256
    || value.terminal_sha256 !== terminal.terminal_sha256
    || value.sealed_result_sha256 !== terminal.sealed_result?.sealed_result_sha256
    || canonicalJsonV1(value.usage) !== canonicalJsonV1(terminal.accounting?.usage)
    || canonicalJsonV1(value.observations) !== canonicalJsonV1(terminal.accounting?.observations)
    || terminal.sealed_result?.artifact_sha256 !== sha256V1(`${canonicalJsonV1(value.artifact)}\n`)
    || terminal.sealed_result?.usage_sha256 !== sha256V1(`${canonicalJsonV1(value.usage)}\n`)) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Treatment-proof result entry differs from its trusted ledger terminal");
  }
}

function resultAccounting(entries) {
  return entries.reduce((total, entry) => ({
    generation_https_posts: total.generation_https_posts + entry.observations.provider_posts,
    oauth_refresh_https_posts: total.oauth_refresh_https_posts + entry.observations.oauth_refresh_posts,
    provider_active_milliseconds: total.provider_active_milliseconds + entry.observations.provider_active_milliseconds,
    input_tokens: total.input_tokens + entry.usage.input_tokens + entry.usage.cache_read_tokens + entry.usage.cache_write_tokens,
    output_plus_reasoning_tokens: total.output_plus_reasoning_tokens + entry.usage.output_tokens + (entry.usage.reasoning_tokens ?? 0),
  }), {
    generation_https_posts: 0,
    oauth_refresh_https_posts: 0,
    provider_active_milliseconds: 0,
    input_tokens: 0,
    output_plus_reasoning_tokens: 0,
  });
}

function validateRootIdentity(value, kind) {
  exactKeys(value, ["birthtime_ns", "device_id", "file_id", "normalized_physical_root", "root_sha256", "schema_version"], `${kind} root identity`);
  if (value.schema_version !== `rc7-gate-c-treatment-proof-${kind}-root-identity-v1`
    || value.root_sha256 !== sha256V1(canonicalJsonV1(projection(value, "root_sha256")))) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `${kind} root identity is malformed or self-digest mismatched`);
  }
}

function validateHistoricalApproval(value) {
  exactKeys(value, [
    "approval_sha256", "approval_text_sha256", "authority_scope", "closure_sha256", "exact_approval_text",
    "freeze_sha256", "future_activation_sha256", "ledger_root_identity", "policy_identity",
    "provider_free_rlm_conformance", "results_root_identity", "rlm_root_identity", "schema_version", "state",
  ], "historical treatment-proof approval");
  validateRootIdentity(value.ledger_root_identity, "ledger");
  validateRootIdentity(value.results_root_identity, "results");
  validateRootIdentity(value.rlm_root_identity, "rlm");
  const conformance = value.provider_free_rlm_conformance;
  if (conformance?.conformance_sha256 !== SUCCESSFUL_PROOF.conformance_sha256
    || conformance.conformance_sha256 !== sha256V1(canonicalJsonV1(projection(conformance, "conformance_sha256")))) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical provider-free conformance record changed");
  }
  if (value.schema_version !== "rc7-gate-c-treatment-proof-approval-v1" || value.state !== "operator-approved-one-treatment-only"
    || value.policy_identity !== RC7_GATE_C_TREATMENT_PROOF_POLICY_ID
    || value.closure_sha256 !== SUCCESSFUL_PROOF.closure_sha256 || value.freeze_sha256 !== SUCCESSFUL_PROOF.freeze_sha256
    || value.future_activation_sha256 !== SUCCESSFUL_PROOF.activation_sha256
    || value.approval_text_sha256 !== sha256V1(value.exact_approval_text)
    || value.approval_sha256 !== SUCCESSFUL_PROOF.approval_sha256
    || value.approval_sha256 !== sha256V1(canonicalJsonV1(projection(value, "approval_sha256")))) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical treatment-proof approval identity changed");
  }
  return value;
}

async function inspectHistoricalProofLedger(ledger, approval) {
  const expectedRootEntries = ["docker-cli-config", "handoffs", "ledger-meta.json", "operator-approval.json", "reservations", "terminals"].sort();
  if (canonicalJsonV1((await readdir(ledger)).sort()) !== canonicalJsonV1(expectedRootEntries)) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical treatment-proof ledger contains missing or extra state");
  }
  if ((await readdir(path.join(ledger, "docker-cli-config"))).length !== 0) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical treatment-proof Docker config contains residue");
  }
  const meta = (await readCanonicalFile(path.join(ledger, "ledger-meta.json"), "historical treatment-proof ledger metadata", 16_384)).value;
  exactKeys(meta, [
    "activation_sha256", "approval_sha256", "child_reservations", "generation_https_post_ceiling", "global_concurrency",
    "global_transient_replacements", "hard_output_plus_reasoning_authority_total", "ledger_sha256", "logical_requests",
    "maximum_reservations", "oauth_refresh_https_post_ceiling", "policy_identity", "retries", "run_id", "schema_version",
    "state", "top_level_reservations", "total_https_post_ceiling",
  ], "historical treatment-proof ledger metadata");
  if (meta.schema_version !== "rc7-gate-c-treatment-proof-ledger-v1" || meta.state !== "initialized-one-treatment-no-replay"
    || meta.activation_sha256 !== approval.future_activation_sha256 || meta.approval_sha256 !== approval.approval_sha256
    || meta.policy_identity !== RC7_GATE_C_TREATMENT_PROOF_POLICY_ID || meta.run_id !== RC7_GATE_C_TREATMENT_PROOF_RUN_ID
    || meta.maximum_reservations !== 6 || meta.logical_requests !== 5 || meta.top_level_reservations !== 1
    || meta.child_reservations !== 4 || meta.global_transient_replacements !== 1 || meta.global_concurrency !== 1
    || meta.retries !== 0 || meta.generation_https_post_ceiling !== 6 || meta.oauth_refresh_https_post_ceiling !== 6
    || meta.total_https_post_ceiling !== 12 || meta.hard_output_plus_reasoning_authority_total !== 768_000
    || meta.ledger_sha256 !== SUCCESSFUL_PROOF.ledger_sha256
    || meta.ledger_sha256 !== sha256V1(canonicalJsonV1(projection(meta, "ledger_sha256")))) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical treatment-proof ledger metadata changed");
  }
  const directoryNames = {};
  for (const directory of ["reservations", "terminals", "handoffs"]) {
    directoryNames[directory] = (await readdir(path.join(ledger, directory))).sort();
    if (directoryNames[directory].length !== 5 || directoryNames[directory].some((name) => !/^[0-9a-f]{64}\.json$/u.test(name))) {
      fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", `Historical treatment-proof ${directory} count or name changed`);
    }
  }
  if (canonicalJsonV1(directoryNames.reservations) !== canonicalJsonV1(directoryNames.terminals)
    || canonicalJsonV1(directoryNames.reservations) !== canonicalJsonV1(directoryNames.handoffs)) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical treatment-proof ledger identities diverged");
  }
  const entries = [];
  for (const name of directoryNames.reservations) {
    const [reservationRead, terminalRead, handoffRead] = await Promise.all([
      readCanonicalFile(path.join(ledger, "reservations", name), "historical treatment-proof reservation", 131_072),
      readCanonicalFile(path.join(ledger, "terminals", name), "historical treatment-proof terminal", 262_144),
      readCanonicalFile(path.join(ledger, "handoffs", name), "historical treatment-proof handoff", 131_072),
    ]);
    const reservation = reservationRead.value;
    const terminal = terminalRead.value;
    const handoff = handoffRead.value;
    exactKeys(reservation, [
      "activation_sha256", "arm", "case_id", "child_sequence", "dispatch_nonce", "dispatch_sha256", "intent_sha256",
      "permit_sha256", "replacement_ordinal", "request_kind", "reservation_key", "reservation_ordinal", "run_id",
      "schema_version", "selected_route", "semantic_request_sha256", "state",
    ], "historical treatment-proof reservation");
    exactKeys(terminal, [
      "accounting", "activation_sha256", "child_sequence", "dispatch_sha256", "replay_permitted", "replacement_ordinal",
      "request_kind", "reservation_key", "run_id", "schema_version", "sealed_result", "state", "terminal_sha256",
    ], "historical treatment-proof terminal");
    exactKeys(handoff, [
      "activation_sha256", "dispatch_sha256", "durable_handoff_sha256", "gate_b_attestation_sha256", "handoff_nonce",
      "reservation_key", "schema_version", "sealed_request_sha256", "state",
    ], "historical treatment-proof handoff");
    const reservationKey = name.slice(0, -5);
    if (reservation.schema_version !== "rc7-gate-c-dispatch-checkpoint-v2" || reservation.state !== "consumed-provider-reachable-handoff-started"
      || reservation.activation_sha256 !== approval.future_activation_sha256 || reservation.run_id !== RC7_GATE_C_TREATMENT_PROOF_RUN_ID
      || reservation.case_id !== "LAB-01" || reservation.arm !== "rc-rlm" || reservation.selected_route !== "rc-rlm"
      || reservation.replacement_ordinal !== 0 || reservation.reservation_key !== reservationKey
      || reservation.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(reservation, "dispatch_sha256")))
      || terminal.schema_version !== "rc7-gate-c-treatment-proof-terminal-v2" || terminal.state !== "trusted-sealed"
      || terminal.activation_sha256 !== reservation.activation_sha256 || terminal.dispatch_sha256 !== reservation.dispatch_sha256
      || terminal.reservation_key !== reservationKey || terminal.run_id !== reservation.run_id
      || terminal.request_kind !== reservation.request_kind || terminal.child_sequence !== reservation.child_sequence
      || terminal.replacement_ordinal !== 0 || terminal.replay_permitted !== false
      || terminal.terminal_sha256 !== sha256V1(canonicalJsonV1(projection(terminal, "terminal_sha256")))
      || terminal.sealed_result?.sealed_result_sha256 !== sha256V1(canonicalJsonV1(projection(terminal.sealed_result, "sealed_result_sha256")))
      || handoff.schema_version !== "rc7-gate-c-durable-provider-handoff-v1" || handoff.state !== "preflight-consumed-provider-reachability-committed"
      || handoff.activation_sha256 !== reservation.activation_sha256 || handoff.dispatch_sha256 !== reservation.dispatch_sha256
      || handoff.reservation_key !== reservationKey
      || handoff.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(handoff, "durable_handoff_sha256")))) {
      fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical treatment-proof reservation, terminal, or handoff changed");
    }
    entries.push({ reservation, terminal });
  }
  entries.sort((left, right) => left.reservation.reservation_ordinal - right.reservation.reservation_ordinal);
  const expectedShape = [["top-level", 0], ["recursive-child", 1], ["recursive-child", 2], ["recursive-child", 3], ["recursive-child", 4]];
  if (canonicalJsonV1(entries.map((entry, index) => [entry.reservation.reservation_ordinal === index + 1, entry.reservation.request_kind, entry.reservation.child_sequence]))
    !== canonicalJsonV1(expectedShape.map(([kind, child]) => [true, kind, child]))) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Historical treatment-proof logical request order changed");
  }
  return entries.map((entry) => entry.terminal);
}

export async function inspectRc7GateCTreatmentProofMatrixPrerequisite(ledgerRoot, resultsRoot, rlmRoot) {
  if (typeof ledgerRoot !== "string" || !path.isAbsolute(ledgerRoot)) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Treatment-proof ledger root must be one exact absolute path");
  }
  const approvalRead = await readCanonicalFile(path.join(path.resolve(ledgerRoot), "operator-approval.json"), "historical treatment-proof operator approval");
  const approval = validateHistoricalApproval(approvalRead.value);
  const retainedRoots = {
    ledger: approval.ledger_root_identity,
    results: approval.results_root_identity,
    rlm: approval.rlm_root_identity,
  };
  const [ledger, results, rlm] = await Promise.all([
    assertBoundRoot(ledgerRoot, retainedRoots?.ledger, "treatment-proof ledger root"),
    assertBoundRoot(resultsRoot, retainedRoots?.results, "treatment-proof results root"),
    assertBoundRoot(rlmRoot, retainedRoots?.rlm, "treatment-proof RLM root"),
  ]);
  const resultEntries = (await readdir(results)).sort();
  if (canonicalJsonV1(resultEntries) !== canonicalJsonV1([RC7_GATE_C_TREATMENT_PROOF_RESULT_NAME])) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Treatment-proof results root must contain exactly one final result");
  }
  const [{ value: result, bytes: resultBytes }, orderedTerminals, retainedRlm] = await Promise.all([
    readCanonicalFile(path.join(results, RC7_GATE_C_TREATMENT_PROOF_RESULT_NAME), "treatment-proof final result"),
    inspectHistoricalProofLedger(ledger, approval),
    inspectRc7GateCRlmCompletedArtifact(rlm),
  ]);
  exactKeys(result, RESULT_KEYS, "treatment-proof final result");
  if (result.schema_version !== "rc7-gate-c-treatment-proof-result-v1"
    || result.state !== "complete-nonmatrix-treatment-proof"
    || result.policy_identity !== RC7_GATE_C_TREATMENT_PROOF_POLICY_ID
    || result.activation_sha256 !== approval.future_activation_sha256
    || result.run_id !== RC7_GATE_C_TREATMENT_PROOF_RUN_ID || result.case_id !== "LAB-01"
    || result.matrix_member !== false || result.score_bearing !== false || result.replay_permitted !== false
    || result.replacement !== null
    || result.terminal_decision !== "ONE_COMPLETE_RLM_TREATMENT_PROVEN_NONMATRIX"
    || canonicalJsonV1(result.nonclaims) !== canonicalJsonV1([
      "not a comparative result", "not a matrix member or score", "does not authorize a matrix rerun or RC-7 closure",
    ])
    || result.result_sha256 !== SUCCESSFUL_PROOF.result_sha256
    || result.result_sha256 !== sha256V1(canonicalJsonV1(projection(result, "result_sha256")))) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Treatment proof is not the exact complete non-matrix LAB-01 prerequisite");
  }

  if (!Array.isArray(result.children) || result.children.length !== 4) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Treatment proof no longer contains four ordered children");
  }
  validateResultEntry(result.top_level, orderedTerminals[0], 0);
  for (let index = 0; index < 4; index += 1) validateResultEntry(result.children[index], orderedTerminals[index + 1], index + 1);
  const accounting = resultAccounting([result.top_level, ...result.children]);
  if (canonicalJsonV1(result.accounting) !== canonicalJsonV1(accounting)
    || accounting.generation_https_posts !== 5 || accounting.oauth_refresh_https_posts !== 0
    || accounting.input_tokens !== 8_654 || accounting.output_plus_reasoning_tokens !== 10_864
    || accounting.provider_active_milliseconds !== 204_275) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Treatment-proof actual accounting changed or mismatched its five trusted results");
  }
  exactKeys(result.contained_rlm, ["container_result_sha256", "final_artifact", "image_id", "phase_two"], "treatment-proof contained RLM result");
  if (result.contained_rlm.image_id !== RC7_GATE_C_RLM_IMAGE_ID
    || result.contained_rlm.container_result_sha256 !== retainedRlm.container_result.result_sha256
    || canonicalJsonV1(result.contained_rlm.final_artifact) !== canonicalJsonV1(retainedRlm.final_artifact)
    || canonicalJsonV1(result.contained_rlm.phase_two) !== canonicalJsonV1(retainedRlm.phase_two)
    || canonicalJsonV1(result.combined_artifact) !== canonicalJsonV1(retainedRlm.final_artifact.route_output)
    || result.combined_artifact_sha256 !== sha256V1(canonicalJsonV1(result.combined_artifact))
    || canonicalJsonV1(result.cleanup) !== canonicalJsonV1({ containers_created: 1, containers_cleaned: 1, residue_entries: 0 })
    || retainedRlm.final_artifact.state !== "trusted-sealed-cleanup-verified"
    || retainedRlm.final_artifact.cleanup_state !== "verified-no-labelled-container-residue"
    || retainedRlm.final_artifact.cleanup_residue_entries !== 0
    || retainedRlm.final_artifact.child_request_count !== 4) {
    fail("TREATMENT_PROOF_PREREQUISITE_MISMATCH", "Treatment-proof contained RLM or cleanup evidence changed");
  }

  const value = withDigest({
    schema_version: RC7_GATE_C_PROOF_PREREQUISITE_SCHEMA,
    state: "successful-nonmatrix-treatment-proof-revalidated",
    policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID,
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
    case_id: "LAB-01",
    roots: structuredClone(retainedRoots),
    proof: {
      closure_sha256: approval.closure_sha256,
      freeze_sha256: approval.freeze_sha256,
      approval_sha256: approval.approval_sha256,
      activation_sha256: approval.future_activation_sha256,
      result_sha256: result.result_sha256,
      result_file_sha256: sha256V1(resultBytes),
    },
    actual_accounting: accounting,
    treatment_shape: { top_level_results: 1, recursive_child_results: 4, contained_rlm_executions: 1, replacement_reservations: 0 },
    containment: {
      image_id: RC7_GATE_C_RLM_IMAGE_ID,
      worker_sha256: retainedRlm.launch.worker_sha256,
      phase_two_sha256: retainedRlm.phase_two.phase_two_sha256,
      container_result_sha256: retainedRlm.container_result.result_sha256,
      final_artifact_sha256: retainedRlm.final_artifact.artifact_sha256,
      combined_artifact_sha256: result.combined_artifact_sha256,
      cleanup_residue_entries: 0,
      provider_free_conformance_sha256: approval.provider_free_rlm_conformance.conformance_sha256,
    },
    authority_effect: "prerequisite-only; this successful non-matrix proof grants no matrix dispatch, score, replay, publication, deployment, or purchase authority",
    terminal_decision: RC7_GATE_C_PROOF_PREREQUISITE_TERMINAL,
  }, "prerequisite_sha256");
  return value;
}

export function buildRc7GateCTestOnlyProofPrerequisite() {
  const testRoot = (kind) => withDigest({
    schema_version: `rc7-gate-c-treatment-proof-${kind}-root-identity-v1`,
    normalized_physical_root: `x:\\provider-unreachable-test-only\\${kind}`,
    device_id: "0",
    file_id: "0",
    birthtime_ns: "0",
  }, "root_sha256");
  return withDigest({
    schema_version: RC7_GATE_C_PROOF_PREREQUISITE_SCHEMA,
    state: "test-only-provider-unreachable-synthetic-prerequisite",
    policy_identity: RC7_GATE_C_TREATMENT_PROOF_POLICY_ID,
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
    case_id: "LAB-01",
    roots: { ledger: testRoot("ledger"), results: testRoot("results"), rlm: testRoot("rlm") },
    proof: {
      closure_sha256: "0".repeat(64), freeze_sha256: "0".repeat(64), approval_sha256: "0".repeat(64),
      activation_sha256: "0".repeat(64), result_sha256: "0".repeat(64), result_file_sha256: "0".repeat(64),
    },
    actual_accounting: { generation_https_posts: 0, oauth_refresh_https_posts: 0, provider_active_milliseconds: 0, input_tokens: 0, output_plus_reasoning_tokens: 0 },
    treatment_shape: { top_level_results: 0, recursive_child_results: 0, contained_rlm_executions: 0, replacement_reservations: 0 },
    containment: {
      image_id: RC7_GATE_C_RLM_IMAGE_ID, worker_sha256: "0".repeat(64), phase_two_sha256: "0".repeat(64),
      container_result_sha256: "0".repeat(64), final_artifact_sha256: "0".repeat(64), combined_artifact_sha256: "0".repeat(64),
      cleanup_residue_entries: 0, provider_free_conformance_sha256: "0".repeat(64),
    },
    authority_effect: "test-only synthetic prerequisite grants no provider, credential, network, RLM, Docker, matrix, score, or external-mutation authority",
    terminal_decision: "TEST_ONLY_PROVIDER_UNREACHABLE_PREREQUISITE",
  }, "prerequisite_sha256");
}
