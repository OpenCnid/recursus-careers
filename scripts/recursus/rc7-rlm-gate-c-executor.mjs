#!/usr/bin/env node

import {
  formatRc7GateCBrokerError,
  recoverRc7GateCDispatchLedger,
  recoverRc7GateCHostLaunchLock,
} from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";
import {
  RC7_GATE_C_RETAINED_FAILURE_WALL_CEILING_MS,
  executeRc7GateCAttempt,
  rc7GateCClosedFailureCode,
  recoverRc7GateCRlmAttempt,
} from "../../lib/recursus/rc7-rlm-gate-c-executor.mjs";
import {
  beginRc7GateCAttemptWithExecutionLock,
  publishRc7GateCAttemptWithExecutionLock,
  recoverRc7GateCAttemptTerminal,
  recoverRc7GateCResults,
} from "../../lib/recursus/rc7-rlm-gate-c-results.mjs";
import { buildRc7GateCPreregistrationPackage } from "../../lib/recursus/rc7-rlm-gate-c-preregistration.mjs";

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-executor.mjs run --ledger-root <approved-ledger> --results-root <results-root> --runtime-root <pinned-runtime> --stage-root <prepared-stage> --run-id <64-hex> [--rlm-root <empty-treatment-root>]",
    "  node scripts/recursus/rc7-rlm-gate-c-executor.mjs recover --ledger-root <approved-ledger> --results-root <results-root> --run-id <64-hex> [--rlm-root <existing-treatment-root>]",
    "",
    "This is the only frozen live attempt entrypoint. It remains unable to run until the ledger contains the current exact operator-approved activation. It never retries or replaces a run.",
  ].join("\n");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!["run", "recover"].includes(command)) throw Object.assign(new Error(usage()), { code: "USAGE" });
  const parsed = { command, ledger_root: null, results_root: null, runtime_root: null, stage_root: null, run_id: null, rlm_root: null };
  const names = new Map([
    ["--ledger-root", "ledger_root"], ["--results-root", "results_root"], ["--runtime-root", "runtime_root"],
    ["--stage-root", "stage_root"], ["--run-id", "run_id"], ["--rlm-root", "rlm_root"],
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const field = names.get(rest[index]);
    if (!field || parsed[field] !== null) throw Object.assign(new Error(`Unknown or repeated argument: ${rest[index] ?? "<missing>"}\n${usage()}`), { code: "USAGE" });
    parsed[field] = rest[++index] ?? null;
  }
  for (const field of ["ledger_root", "results_root", "run_id"]) if (!parsed[field]) throw Object.assign(new Error(usage()), { code: "USAGE" });
  if ((command === "run" && (!parsed.runtime_root || !parsed.stage_root)) || (command === "recover" && (parsed.runtime_root !== null || parsed.stage_root !== null))) throw Object.assign(new Error(usage()), { code: "USAGE" });
  if (!/^[0-9a-f]{64}$/u.test(parsed.run_id)) throw Object.assign(new Error("--run-id must be one exact registered 64-hex identity"), { code: "RUN_IDENTITY_MISMATCH" });
  return parsed;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const hardWall = setTimeout(() => {
    process.stderr.write(`${JSON.stringify({ ok: false, code: "ATTEMPT_RETAINED_FAILURE_WALL_EXPIRED", run_id: parsed.run_id, replay_permitted: false, recovery_required: true })}\n`);
    process.exit(124);
  }, RC7_GATE_C_RETAINED_FAILURE_WALL_CEILING_MS);
  let executionLock = null;
  try {
    if (parsed.command === "recover") {
      const preregistration = await buildRc7GateCPreregistrationPackage();
      const row = preregistration.ablation.schedule.find((item) => item.run_id === parsed.run_id);
      if (!row) throw Object.assign(new Error("Recovery run identity is not registered"), { code: "RUN_IDENTITY_MISMATCH" });
      if ((row.selected_route === "rc-rlm") !== (parsed.rlm_root !== null)) throw Object.assign(new Error("Eligible treatment recovery requires its exact RLM root and every other recovery forbids one"), { code: "RLM_ROOT_MISMATCH" });
      let code = "INTERRUPTED_EXECUTION_RECOVERED_NO_REPLAY";
      let cleanupResidueEntries = 0;
      let rlmInvocationCount = 0;
      const hostRecovery = await recoverRc7GateCHostLaunchLock(parsed.ledger_root, parsed.run_id);
      const topLevelHostInterruption = hostRecovery.changed && hostRecovery.request_kind === "top-level";
      if (topLevelHostInterruption) {
        code = "HOST_TOP_LEVEL_INTERRUPTED_NO_REPLAY";
      }
      if (parsed.rlm_root !== null && !topLevelHostInterruption) {
        try {
          const recovered = await recoverRc7GateCRlmAttempt({ ledger_root: parsed.ledger_root, rlm_root: parsed.rlm_root, run_id: parsed.run_id });
          cleanupResidueEntries = recovered.terminal.cleanup_residue_entries;
          rlmInvocationCount = recovered.terminal.final_artifact_present || recovered.terminal.containers_cleaned > 0
            || recovered.terminal.child_proposals > 0 || recovered.terminal.child_responses > 0 ? 1 : 0;
        } catch {
          code = "RECOVERY_GATE_FAILED";
          cleanupResidueEntries = 1;
          rlmInvocationCount = 1;
        }
      }
      await recoverRc7GateCDispatchLedger(parsed.ledger_root);
      if (row.selected_route === "rc-direct") await recoverRc7GateCResults(parsed.results_root, parsed.ledger_root);
      const attempt = await recoverRc7GateCAttemptTerminal(parsed.results_root, parsed.ledger_root, {
        cleanup_residue_entries: cleanupResidueEntries,
        error_code: code,
        rlm_invocation_count: rlmInvocationCount,
        run_id: parsed.run_id,
        wall_ms: Math.min(RC7_GATE_C_RETAINED_FAILURE_WALL_CEILING_MS, Math.max(0, Date.now() - started)),
      }, parsed.rlm_root);
      process.stdout.write(`${JSON.stringify({ ok: true, command: "recover", run_id: parsed.run_id, state: attempt.state, attempt_sha256: attempt.attempt_sha256, replay_permitted: false })}\n`);
      return;
    }
    const begun = await beginRc7GateCAttemptWithExecutionLock(
      parsed.results_root, parsed.ledger_root, parsed.run_id, parsed.rlm_root,
    );
    executionLock = begun.owner;
    const execution = await executeRc7GateCAttempt({
      ledger_root: parsed.ledger_root,
      rlm_root: parsed.rlm_root,
      run_id: parsed.run_id,
      runtime_root: parsed.runtime_root,
      stage_root: parsed.stage_root,
    });
    const attempt = await publishRc7GateCAttemptWithExecutionLock(
      parsed.results_root, parsed.ledger_root, { execution, failure: null, rlm_root: parsed.rlm_root }, executionLock,
    );
    executionLock = null;
    process.stdout.write(`${JSON.stringify({ ok: true, command: "run", run_id: parsed.run_id, state: attempt.state, attempt_sha256: attempt.attempt_sha256 })}\n`);
  } catch (error) {
    if (parsed.command === "recover") throw error;
    if (executionLock === null) {
      if (error?.code === "SYSTEMIC_FAILURE_CIRCUIT_OPEN") {
        process.stderr.write(`${JSON.stringify({ ok: false, code: error.code, run_id: parsed.run_id, circuit: error.details, replay_permitted: false, provider_authority_permitted: false })}\n`);
        process.exitCode = 2;
        return;
      }
      throw error;
    }
    let code = rc7GateCClosedFailureCode(error);
    let cleanupResidueEntries = code === "CLEANUP_RESIDUE" ? 1 : 0;
    if (parsed.rlm_root !== null && error.rc7_gate_c_rlm_invocation_count === 1) {
      try {
        const recovered = await recoverRc7GateCRlmAttempt({ ledger_root: parsed.ledger_root, rlm_root: parsed.rlm_root, run_id: parsed.run_id });
        cleanupResidueEntries = recovered.terminal.cleanup_residue_entries;
      } catch {
        code = "RECOVERY_GATE_FAILED";
        cleanupResidueEntries = Math.max(1, cleanupResidueEntries);
      }
    }
    await recoverRc7GateCDispatchLedger(parsed.ledger_root);
    const attempt = await publishRc7GateCAttemptWithExecutionLock(parsed.results_root, parsed.ledger_root, {
      execution: null,
      rlm_root: parsed.rlm_root,
      failure: {
        cleanup_residue_entries: cleanupResidueEntries,
        error_code: code,
        rlm_invocation_count: error.rc7_gate_c_rlm_invocation_count === 1 ? 1 : 0,
        run_id: parsed.run_id,
        wall_ms: Math.min(RC7_GATE_C_RETAINED_FAILURE_WALL_CEILING_MS, Math.max(0, Date.now() - started)),
      },
    }, executionLock);
    executionLock = null;
    process.stderr.write(`${JSON.stringify({ ok: false, code, run_id: parsed.run_id, state: attempt.state, attempt_sha256: attempt.attempt_sha256, replay_permitted: false })}\n`);
    process.exitCode = 1;
  } finally {
    clearTimeout(hardWall);
  }
}

main().catch((error) => {
  const formatted = formatRc7GateCBrokerError(error);
  if (formatted.code === "UNEXPECTED_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
