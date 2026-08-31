import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";

import { __test as brokerTest } from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";
import {
  RC7_GATE_C_PROOF_PREREQUISITE_SCHEMA,
  Rc7GateCProofPrerequisiteError,
  buildRc7GateCTestOnlyProofPrerequisite,
  inspectRc7GateCTreatmentProofMatrixPrerequisite,
} from "../../lib/recursus/rc7-rlm-gate-c-proof-prerequisite.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const CREATED = [];

after(async () => {
  for (const target of CREATED.reverse()) await rm(target, { recursive: true, force: true });
});

async function freshRoots() {
  const parent = await mkdtemp(path.join(path.dirname(brokerTest.REPOSITORY_ROOT), "rc7-gate-c-proof-prerequisite-test-"));
  CREATED.push(parent);
  const roots = ["ledger", "results", "rlm"].map((name) => path.join(parent, name));
  for (const root of roots) await mkdir(root);
  return roots;
}

test("the provider-unreachable prerequisite fixture is self-digested and cannot satisfy production validation", () => {
  const value = buildRc7GateCTestOnlyProofPrerequisite();
  assert.equal(value.schema_version, RC7_GATE_C_PROOF_PREREQUISITE_SCHEMA);
  const projection = structuredClone(value);
  delete projection.prerequisite_sha256;
  assert.equal(value.prerequisite_sha256, sha256V1(canonicalJsonV1(projection)));
  assert.equal(brokerTest.validateSuccessfulTreatmentProofPrerequisite(value, true), value);
  assert.throws(() => brokerTest.validateSuccessfulTreatmentProofPrerequisite(value, false), (error) => error.code === "MATRIX_PROOF_REQUIRED");
});

test("missing or empty historical proof roots fail closed before matrix authority", async () => {
  const [ledger, results, rlm] = await freshRoots();
  await assert.rejects(
    () => inspectRc7GateCTreatmentProofMatrixPrerequisite(ledger, results, rlm),
    (error) => error instanceof Rc7GateCProofPrerequisiteError && error.code === "TREATMENT_PROOF_PREREQUISITE_MISMATCH",
  );
});
