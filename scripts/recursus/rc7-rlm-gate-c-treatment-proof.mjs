#!/usr/bin/env node

import path from "node:path";
import { readdir } from "node:fs/promises";

import {
  RC7_GATE_C_TREATMENT_PROOF_RETAINED_FAILURE_WALL_CEILING_MS,
  createRc7GateCProductionDockerController,
  executeRc7GateCTreatmentProofAttempt,
} from "../../lib/recursus/rc7-rlm-gate-c-executor.mjs";
import {
  preflightRc7GateCCredentialHomeEnvironment,
  preflightRc7GateCTreatmentProofHostStage,
} from "../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs";
import { recoverRc7GateCRlmLauncher } from "../../lib/recursus/rc7-rlm-gate-c-rlm-launcher.mjs";
import {
  RC7_GATE_C_TREATMENT_PROOF_RESULT_NAME,
  RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
  formatRc7GateCTreatmentProofError,
  initializeRc7GateCTreatmentProofLedger,
  inspectRc7GateCTreatmentProofLedger,
  prepareRc7GateCTreatmentProofFreeze,
  publishRc7GateCTreatmentProofSuccess,
  recoverRc7GateCTreatmentProofLedger,
  recordRc7GateCTreatmentProofApproval,
} from "../../lib/recursus/rc7-rlm-gate-c-treatment-proof.mjs";

const HASH = /^[0-9a-f]{64}$/u;
const FIELDS = Object.freeze({
  prepare: ["freeze_root", "ledger_root", "results_root", "rlm_root", "conformance_rlm_root", "conformance_ledger_root"],
  approve: ["ledger_root", "results_root", "rlm_root", "conformance_rlm_root", "conformance_ledger_root", "freeze_sha256", "future_activation_sha256", "approval_text"],
  initialize: ["ledger_root"],
  run: ["ledger_root", "results_root", "rlm_root", "runtime_root", "stage_root"],
  recover: ["ledger_root", "rlm_root"],
  inspect: ["ledger_root"],
});
const FLAGS = new Map([
  ["--freeze-root", "freeze_root"], ["--ledger-root", "ledger_root"], ["--results-root", "results_root"],
  ["--rlm-root", "rlm_root"], ["--runtime-root", "runtime_root"], ["--stage-root", "stage_root"],
  ["--conformance-rlm-root", "conformance_rlm_root"], ["--conformance-ledger-root", "conformance_ledger_root"],
  ["--freeze-sha256", "freeze_sha256"], ["--future-activation-sha256", "future_activation_sha256"],
  ["--approval-text", "approval_text"],
]);

function usage() {
  return "Usage: prepare --freeze-root <empty> --ledger-root <empty> --results-root <empty> --rlm-root <empty> --conformance-rlm-root <completed> --conformance-ledger-root <sealed> | approve --ledger-root <empty> --results-root <empty> --rlm-root <empty> --conformance-rlm-root <completed> --conformance-ledger-root <sealed> --freeze-sha256 <hex> --future-activation-sha256 <hex> --approval-text <exact> | initialize --ledger-root <approved> | run --ledger-root <initialized> --results-root <empty> --rlm-root <empty> --runtime-root <runtime> --stage-root <stage> | recover --ledger-root <ledger> --rlm-root <rlm> | inspect --ledger-root <ledger>";
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const required = FIELDS[command];
  if (!required || rest.length % 2 !== 0) throw Object.assign(new Error(usage()), { code: "USAGE" });
  const value = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const field = FLAGS.get(rest[index]);
    if (!field || !required.includes(field) || Object.hasOwn(value, field) || rest[index + 1] === undefined) throw Object.assign(new Error(usage()), { code: "USAGE" });
    value[field] = rest[index + 1];
  }
  for (const field of required) if (!Object.hasOwn(value, field)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  for (const field of required.filter((item) => item.endsWith("_root"))) {
    if (!path.isAbsolute(value[field])) throw Object.assign(new Error(`${field} must be absolute`), { code: "USAGE" });
    value[field] = path.resolve(value[field]);
  }
  for (const field of ["freeze_sha256", "future_activation_sha256"].filter((item) => required.includes(item))) {
    if (!HASH.test(value[field])) throw Object.assign(new Error(usage()), { code: "USAGE" });
  }
  return value;
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const hardWall = ["run", "recover"].includes(input.command)
    ? setTimeout(() => {
      process.stderr.write(`${JSON.stringify({ ok: false, code: "TREATMENT_PROOF_RETAINED_FAILURE_WALL_EXPIRED", replay_permitted: false, recovery_required: true })}\n`);
      process.exit(124);
    }, RC7_GATE_C_TREATMENT_PROOF_RETAINED_FAILURE_WALL_CEILING_MS) : null;
  try {
    let result;
    if (input.command === "prepare") {
      result = await prepareRc7GateCTreatmentProofFreeze(
        input.freeze_root, input.ledger_root, input.results_root, input.rlm_root,
        input.conformance_rlm_root, input.conformance_ledger_root,
      );
    } else if (input.command === "approve") {
      result = await recordRc7GateCTreatmentProofApproval(input.ledger_root, {
        results_root: input.results_root,
        rlm_root: input.rlm_root,
        conformance_rlm_root: input.conformance_rlm_root,
        conformance_ledger_root: input.conformance_ledger_root,
        freeze_sha256: input.freeze_sha256,
        future_activation_sha256: input.future_activation_sha256,
        exact_approval_text: input.approval_text,
      });
    } else if (input.command === "initialize") {
      result = await initializeRc7GateCTreatmentProofLedger(input.ledger_root);
    } else if (input.command === "run") {
      preflightRc7GateCCredentialHomeEnvironment();
      await preflightRc7GateCTreatmentProofHostStage({
        ledger_root: input.ledger_root,
        runtime_root: input.runtime_root,
        stage_root: input.stage_root,
      });
      const execution = await executeRc7GateCTreatmentProofAttempt({
        ledger_root: input.ledger_root,
        rlm_root: input.rlm_root,
        runtime_root: input.runtime_root,
        stage_root: input.stage_root,
        run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
      });
      const retained = await publishRc7GateCTreatmentProofSuccess(input.results_root, input.ledger_root, execution);
      result = { state: retained.state, result_name: RC7_GATE_C_TREATMENT_PROOF_RESULT_NAME, result_sha256: retained.result_sha256, terminal_decision: retained.terminal_decision };
    } else if (input.command === "recover") {
      let rlm = { changed: false, state: "not-prepared" };
      if ((await readdir(input.rlm_root)).length !== 0) {
        const controller = createRc7GateCProductionDockerController({ ledger_root: input.ledger_root });
        rlm = await recoverRc7GateCRlmLauncher(input.rlm_root, { controller });
      }
      const ledger = await recoverRc7GateCTreatmentProofLedger(input.ledger_root);
      result = { state: "recovered-no-replay", ledger, rlm };
    } else result = await inspectRc7GateCTreatmentProofLedger(input.ledger_root);
    process.stdout.write(`${JSON.stringify({ ok: true, command: input.command, ...result })}\n`);
  } finally { if (hardWall !== null) clearTimeout(hardWall); }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatRc7GateCTreatmentProofError(error))}\n`);
  process.exitCode = 1;
});
