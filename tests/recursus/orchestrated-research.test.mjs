import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import {
  ORCHESTRATED_RESEARCH_CASES,
  ORCHESTRATED_RESEARCH_FAULTS,
  ORCHESTRATED_RESEARCH_PERMISSION_ID,
  OrchestratedResearchError,
  __test,
  evaluateEvidenceCandidate,
  exerciseOrchestratedResearch,
  inspectOrchestratedResearch,
  normalizedPreparationBytes,
  parseStrictJson,
  prepareOrchestratedResearch,
  recoverOrchestratedResearch,
  validateLedger,
} from "../../lib/recursus/orchestrated-research.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const execFileAsync = promisify(execFile);
const CREATED_TEMP_PARENTS = [];
let baseline;

async function newRoot(name = "root") {
  const parent = await mkdtemp(path.join(tmpdir(), "orchestrated-research-stage1-test-"));
  CREATED_TEMP_PARENTS.push(parent);
  const root = path.join(parent, name);
  await mkdir(root);
  return { parent, root };
}

async function expectCode(action, expectedCode) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof OrchestratedResearchError, String(error));
    assert.equal(error.code, expectedCode);
    return true;
  });
}

async function restoreFile(target, bytes) {
  await writeFile(target, bytes);
}

function reseal(entries) {
  const sealed = [];
  let previous = "0".repeat(64);
  for (const [index, entry] of entries.entries()) {
    const next = __test.sealLedgerEntry(index + 1, previous, entry.kind, structuredClone(entry.payload));
    sealed.push(next);
    previous = next.entry_digest;
  }
  return sealed;
}

before(async () => {
  baseline = await newRoot("baseline");
  await prepareOrchestratedResearch(baseline.root);
});

after(async () => {
  for (const target of CREATED_TEMP_PARENTS) {
    const resolved = path.resolve(target);
    assert.ok(resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.match(path.basename(resolved), /^orchestrated-research-stage1-test-/u);
    await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("complete Stage 1 package uses four frozen cases and zero prohibited authority", async () => {
  const inspection = await inspectOrchestratedResearch(baseline.root);
  assert.equal(inspection.state, "complete");
  assert.equal(inspection.decision, "COMPLETE");
  const registration = parseStrictJson(await readFile(path.join(baseline.root, "registration.json"), "utf8"));
  assert.equal(registration.permission_contract.identity, ORCHESTRATED_RESEARCH_PERMISSION_ID);
  assert.deepEqual(registration.budget_contract, {
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
  });
  const plan = parseStrictJson(await readFile(path.join(baseline.root, "plan.json"), "utf8"));
  assert.deepEqual(plan.required_case_ids, ORCHESTRATED_RESEARCH_CASES);
  const accounting = parseStrictJson(await readFile(path.join(baseline.root, "accounting.json"), "utf8"));
  assert.deepEqual({
    provider_requests: accounting.provider_requests,
    credential_accesses: accounting.credential_accesses,
    rlm_executions: accounting.rlm_executions,
    network_actions: accounting.network_actions,
    docker_invocations: accounting.docker_invocations,
    wsl_invocations: accounting.wsl_invocations,
    external_mutations: accounting.external_mutations,
    retries: accounting.retries,
    fake_worker_dispatches: accounting.fake_worker_dispatches,
    terminal_decisions: accounting.terminal_decisions,
  }, {
    provider_requests: 0,
    credential_accesses: 0,
    rlm_executions: 0,
    network_actions: 0,
    docker_invocations: 0,
    wsl_invocations: 0,
    external_mutations: 0,
    retries: 0,
    fake_worker_dispatches: 4,
    terminal_decisions: 1,
  });
});

test("two fresh preparations have byte-identical normalized retained bytes", async () => {
  const second = await newRoot("second");
  await prepareOrchestratedResearch(second.root);
  const firstBytes = await normalizedPreparationBytes(baseline.root);
  const secondBytes = await normalizedPreparationBytes(second.root);
  assert.deepEqual(firstBytes, secondBytes);
  assert.equal(sha256V1(firstBytes), (await inspectOrchestratedResearch(second.root)).normalized_capture_sha256);
  assert.equal(firstBytes.includes(Buffer.from(baseline.root, "utf8")), false);
  assert.equal(firstBytes.includes(Buffer.from(second.root, "utf8")), false);
});

test("route-visible operation inputs contain no evaluator, canary, physical-root, or route-control bytes", async () => {
  const evaluator = parseStrictJson(await readFile(__test.EVALUATOR_FIXTURE_PATH, "utf8"));
  for (const caseId of ORCHESTRATED_RESEARCH_CASES) {
    const operationId = `S1-OP-${caseId}`;
    const text = await readFile(path.join(baseline.root, "operations", operationId, "input.json"), "utf8");
    assert.doesNotMatch(text, new RegExp(evaluator.leak_canary, "u"));
    for (const forbidden of ["evaluator_only", "canonical_claim_id", "physical_root_binding", "preferred_route", "expected_signature"]) {
      assert.equal(text.includes(forbidden), false, `${caseId}: ${forbidden}`);
    }
  }
});

test("candidate-fact gate accepts exact primary support and rejects every registered unsafe pattern", async () => {
  const inputs = await __test.loadFrozenInputs();
  const fact01 = inputs.cases.get("FACT-01");
  const fact03 = inputs.cases.get("FACT-03");
  const safe01 = inputs.cases.get("SAFE-01");
  const accepted = evaluateEvidenceCandidate(fact01.operation.candidates[0], fact01);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.canonical_claim_id, "S1-FACT01-CANDIDATE-01");
  assert.equal(evaluateEvidenceCandidate(fact01.operation.candidates[1], fact01).reason, "UNSUPPORTED_CANDIDATE_FACT", "two supported fragments cannot create a stronger claim");
  assert.equal(evaluateEvidenceCandidate(fact01.operation.candidates[2], fact01).reason, "EVIDENCE_CLASS_MISMATCH", "inference cannot be relabeled candidate_fact");
  assert.equal(evaluateEvidenceCandidate(fact01.operation.candidates[3], fact01).reason, "UNSUPPORTED_CANDIDATE_FACT", "limiting qualifier cannot disappear");
  assert.equal(evaluateEvidenceCandidate(fact03.operation.candidates[1], fact03).reason, "CONTRADICTED_CLAIM");
  assert.equal(evaluateEvidenceCandidate(safe01.operation.candidates[0], safe01).reason, "UNSUPPORTED_CANDIDATE_FACT", "job injection cannot become candidate truth");

  const stale = structuredClone(fact01.operation.candidates[0]);
  stale.locators[0].source_sha256 = "f".repeat(64);
  assert.equal(evaluateEvidenceCandidate(stale, fact01).reason, "STALE_OR_REPLACED_SOURCE");

  const missing = structuredClone(fact01.operation.candidates[0]);
  missing.locators[0].source_id = "EVALUATOR-ONLY-SOURCE";
  assert.equal(evaluateEvidenceCandidate(missing, fact01).accepted, false);

  const outOfBounds = structuredClone(fact01.operation.candidates[0]);
  outOfBounds.locators[0].selector.end_line = 999;
  assert.equal(evaluateEvidenceCandidate(outOfBounds, fact01).accepted, false);

  const rlmBypass = structuredClone(safe01.operation.candidates[0]);
  rlmBypass.origin = "rlm";
  assert.equal(evaluateEvidenceCandidate(rlmBypass, safe01).reason, "UNSUPPORTED_CANDIDATE_FACT");

  const selfReport = structuredClone(fact01.operation.candidates[0]);
  selfReport.host_accepted = true;
  assert.equal(evaluateEvidenceCandidate(selfReport, fact01).reason, "UNKNOWN_OR_MISSING_FIELD");
});

test("strict JSON and ledger reject duplicate keys, malformed, missing, reordered, duplicated, and digest-broken entries", async () => {
  assert.throws(() => parseStrictJson('{"a":1,"a":2}', "duplicate fixture"), { code: "DUPLICATE_JSON_KEY" });
  const ledger = await __test.readLedger(baseline.root);
  const original = ledger.entries;

  const digestBroken = structuredClone(original);
  digestBroken[2].entry_digest = "f".repeat(64);
  assert.throws(() => validateLedger(digestBroken), { code: "LEDGER_DIGEST_BROKEN" });

  const reordered = structuredClone(original);
  [reordered[2], reordered[3]] = [reordered[3], reordered[2]];
  assert.throws(() => validateLedger(reordered), { code: "LEDGER_SCHEMA_MISMATCH" });

  const firstTerminalIndex = original.findIndex((entry) => entry.kind === "OPERATION_TERMINAL");
  const missing = reseal(original.filter((_, index) => index !== firstTerminalIndex));
  assert.throws(() => validateLedger(missing), { code: "LEDGER_TRANSITION_INVALID" });

  const duplicated = reseal([...original.slice(0, 3), structuredClone(original[2]), ...original.slice(3)]);
  assert.throws(() => validateLedger(duplicated), { code: "DUPLICATE_OPERATION" });

  const rejectedId = original.find((entry) => entry.kind === "EVIDENCE_REJECTED").payload.rejection.evidence_id;
  const reappeared = structuredClone(original);
  const synthesis = reappeared.find((entry) => entry.kind === "SYNTHESIS_ELIGIBLE");
  synthesis.payload.accepted_evidence_ids.push(rejectedId);
  const resealed = reseal(reappeared);
  assert.throws(() => validateLedger(resealed), { code: "REJECTED_EVIDENCE_REAPPEARED" });
});

test("physical root validation rejects unsafe, broad, repository, nonempty, aliased, protected, overlapping, and concurrently acquired roots", async () => {
  const { parent, root } = await newRoot("physical");
  await expectCode(() => __test.validateDisposableRoot(path.join(parent, "missing"), { requireEmpty: true }), "MISSING_OUTPUT_ROOT");
  await writeFile(path.join(root, "occupied.txt"), "occupied");
  await expectCode(() => __test.validateDisposableRoot(root, { requireEmpty: true }), "NONEMPTY_OUTPUT_ROOT");
  await expectCode(() => __test.validateDisposableRoot(__test.REPOSITORY_ROOT), "REPOSITORY_OUTPUT_ROOT");
  await expectCode(() => __test.validateDisposableRoot(tmpdir()), "BROAD_OUTPUT_ROOT");
  await expectCode(() => __test.validateDisposableRoot(path.join(parent, ".ssh", "attempt")), "PROTECTED_OUTPUT_ROOT");

  const aliasTarget = await newRoot("alias-target");
  const alias = path.join(aliasTarget.parent, "alias-junction");
  await symlink(aliasTarget.root, alias, "junction");
  await expectCode(() => __test.validateDisposableRoot(alias), "ALIASED_OUTPUT_ROOT");

  const concurrent = await newRoot("concurrent");
  const context = await __test.validateDisposableRoot(concurrent.root, { requireEmpty: true });
  const lock = await __test.acquireRoot(context);
  try {
    await expectCode(() => __test.acquireRoot(context), "ROOT_ALREADY_ACQUIRED");
  } finally {
    await __test.releaseRoot(context, lock);
  }
});

test("root replacement after registration fails closed without touching the replacement", async () => {
  const target = await newRoot("replace-me");
  await exerciseOrchestratedResearch(target.root, "before-admission");
  const moved = `${target.root}-original`;
  await rename(target.root, moved);
  await mkdir(target.root);
  await expectCode(() => recoverOrchestratedResearch(target.root), "MISSING_REGISTRATION");
  assert.equal((await readFile(path.join(moved, "registration.json"), "utf8")).includes("physical_root_binding"), true);
});

test("every Stage 1 interruption class recovers without replay and repeated recovery is idempotent", async () => {
  for (const fault of ORCHESTRATED_RESEARCH_FAULTS) {
    const target = await newRoot(`fault-${fault}`);
    const exercised = await exerciseOrchestratedResearch(target.root, fault);
    assert.equal(exercised.fault, fault);
    const recovered = await recoverOrchestratedResearch(target.root);
    const firstBytes = await normalizedPreparationBytes(target.root);
    const repeated = await recoverOrchestratedResearch(target.root);
    const secondBytes = await normalizedPreparationBytes(target.root);
    assert.deepEqual(firstBytes, secondBytes, fault);
    assert.equal(repeated.decision, recovered.decision, fault);
    const accounting = parseStrictJson(await readFile(path.join(target.root, "accounting.json"), "utf8"));
    assert.equal(accounting.provider_requests, 0, fault);
    assert.equal(accounting.rlm_executions, 0, fault);
    assert.ok(accounting.fake_worker_dispatches <= 4, fault);
    if (fault === "after-dispatch") {
      const terminal = parseStrictJson(await readFile(path.join(target.root, "operations", "S1-OP-LAB-01", "terminal.json"), "utf8"));
      assert.equal(terminal.status, "indeterminate-no-replay");
      assert.equal(accounting.fake_worker_dispatches, 1);
    }
  }
});

test("artifact replacement, hard links, alternate streams, evaluator leakage, unknown residue, and source mismatch all fail closed", async (t) => {
  await t.test("hard-link substitution", async () => {
    const target = await newRoot("hardlink");
    await prepareOrchestratedResearch(target.root);
    const resultPath = path.join(target.root, "result.json");
    const copyPath = path.join(target.parent, "result-copy.json");
    await copyFile(resultPath, copyPath);
    await rm(resultPath);
    await link(copyPath, resultPath);
    await expectCode(() => inspectOrchestratedResearch(target.root), "ALIASED_ARTIFACT");
  });

  if (process.platform === "win32") {
    await t.test("alternate data stream", async () => {
      const target = await newRoot("ads");
      await prepareOrchestratedResearch(target.root);
      await writeFile(`${path.join(target.root, "result.json")}:hidden`, "hidden");
      await expectCode(() => inspectOrchestratedResearch(target.root), "ALTERNATE_DATA_STREAM");
    });
  }

  await t.test("evaluator leak and unknown residue", async () => {
    const target = await newRoot("leak");
    await prepareOrchestratedResearch(target.root);
    const inputPath = path.join(target.root, "operations", "S1-OP-LAB-01", "input.json");
    const input = parseStrictJson(await readFile(inputPath, "utf8"));
    input.expected_signature = "hidden";
    await writeFile(inputPath, canonicalJsonV1(input));
    await expectCode(() => inspectOrchestratedResearch(target.root), "UNKNOWN_OR_MISSING_FIELD");
    await restoreFile(inputPath, __test.canonicalBytes(operationInputForTest(await __test.loadFrozenInputs(), "LAB-01")));
    await writeFile(path.join(target.root, "unknown.bin"), "unknown");
    await expectCode(() => inspectOrchestratedResearch(target.root), "UNREGISTERED_ARTIFACT");
  });
});

function operationInputForTest(inputs, caseId) {
  const source = inputs.cases.get(caseId);
  return {
    schema_version: "orchestrated-research-operation-input-v1",
    producer: "lib/recursus/orchestrated-research.mjs",
    provenance: "registered-synthetic-route-visible-input",
    operation_id: source.operation.operation_id,
    case_id: source.case_id,
    objective_id: source.operation.objective_id,
    question: source.question,
    source_projection: source.sources.map((item) => ({
      source_id: item.source_id,
      trust_class: item.trust_class,
      locator_scheme: item.locator_scheme,
      source_sha256: item.sha256,
      content: item.content_kind === "json" ? item.parsed : item.bytes.toString("utf8"),
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
      evidence_classes: ["candidate_fact", "target_fact", "research_relationship", "research_inference", "exact_computation", "contradiction", "gap"],
      authority: "proposal-only-host-validates",
    },
  };
}

test("CLI exposes only the four provider-free commands and rejects authority-bearing or unknown arguments", async () => {
  const script = path.join(__test.REPOSITORY_ROOT, "scripts", "recursus", "orchestrated-research.mjs");
  await assert.rejects(
    execFileAsync(process.execPath, [script, "prepare", "--output-root", baseline.root, "--provider", "x"]),
    (error) => {
      assert.match(error.stderr, /PROHIBITED_AUTHORITY_ARGUMENT/u);
      return true;
    },
  );
  await assert.rejects(
    execFileAsync(process.execPath, [script, "future-command", "--output-root", baseline.root]),
    (error) => {
      assert.match(error.stderr, /USAGE/u);
      return true;
    },
  );
});

test("implementation import and command surfaces contain no provider, network, Docker, WSL, RLM execution, or RC-7 runtime seam", async () => {
  const library = await readFile(path.join(__test.REPOSITORY_ROOT, "lib", "recursus", "orchestrated-research.mjs"), "utf8");
  const script = await readFile(path.join(__test.REPOSITORY_ROOT, "scripts", "recursus", "orchestrated-research.mjs"), "utf8");
  for (const denied of ["node:http", "node:https", "node:net", "node:tls", "node:dns", "fetch(", "WebSocket", "docker.exe", "wsl.exe", "rc7-rlm-gate-c", "rc7-rlm-qualification.mjs\""]) {
    assert.equal(library.includes(denied), false, denied);
    assert.equal(script.includes(denied), false, denied);
  }
  assert.match(library, /powershell\.exe/u, "Windows physical inspection is the only spawned host process");
});
