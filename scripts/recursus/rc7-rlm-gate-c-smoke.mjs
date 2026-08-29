#!/usr/bin/env node

import path from "node:path";

import {
  authorizeRc7GateCSmokeProviderDispatch,
  buildRc7GateCFixedSmokeRequest,
  buildRc7GateCSmokeDirectGateBReference,
  buildRc7GateCSmokeFinalApprovalFreeze,
  consumeRc7GateCSmokeDispatchReservation,
  formatRc7GateCSmokeError,
  initializeRc7GateCSmokeLedger,
  initializeRc7GateCSmokeResults,
  inspectRc7GateCSmokeFinalApprovalFreeze,
  inspectRc7GateCSmokeLedger,
  inspectRc7GateCSmokeResult,
  prepareRc7GateCSmokeFinalApprovalFreeze,
  recordRc7GateCSmokeOperatorApproval,
  recoverRc7GateCSmoke,
  sealRc7GateCSmokeDispatchRequest,
  settleRc7GateCSmokeFailure,
  settleRc7GateCSmokeHostLaunchResult,
} from "../../lib/recursus/rc7-rlm-gate-c-smoke.mjs";
import {
  launchRc7GateCSmokeLiveCapsuleFromHost,
  preflightRc7GateCCredentialHomeEnvironment,
} from "../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs";

const HASH = /^[0-9a-f]{64}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_-]{1,95}$/u;
const ATTEMPT_TIMEOUT_MS = 500_000;
const HOST_PROCESS_TIMEOUT_MS = 165_000;

const COMMAND_FIELDS = Object.freeze({
  "prepare-final-freeze": Object.freeze(["freeze_root", "ledger_root", "results_root"]),
  "inspect-final-freeze": Object.freeze(["freeze_root", "ledger_root", "results_root"]),
  "record-approval": Object.freeze(["ledger_root", "results_root", "final_freeze_sha256", "future_activation_sha256", "exact_approval_text"]),
  initialize: Object.freeze(["ledger_root", "results_root"]),
  inspect: Object.freeze(["ledger_root", "results_root"]),
  recover: Object.freeze(["ledger_root", "results_root"]),
  run: Object.freeze(["ledger_root", "results_root", "runtime_root", "stage_root"]),
});

const FLAG_FIELDS = new Map([
  ["--freeze-root", "freeze_root"],
  ["--ledger-root", "ledger_root"],
  ["--results-root", "results_root"],
  ["--runtime-root", "runtime_root"],
  ["--stage-root", "stage_root"],
  ["--final-freeze-sha256", "final_freeze_sha256"],
  ["--future-activation-sha256", "future_activation_sha256"],
  ["--approval-text", "exact_approval_text"],
]);

function usage() {
  return [
    "Usage:",
    "  node scripts/recursus/rc7-rlm-gate-c-smoke.mjs prepare-final-freeze --freeze-root <empty-freeze-root> --ledger-root <empty-ledger-root> --results-root <empty-results-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-smoke.mjs inspect-final-freeze --freeze-root <freeze-root> --ledger-root <same-empty-ledger-root> --results-root <same-empty-results-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-smoke.mjs record-approval --ledger-root <empty-ledger-root> --results-root <empty-results-root> --final-freeze-sha256 <64-hex> --future-activation-sha256 <64-hex> --approval-text <exact-presented-text>",
    "  node scripts/recursus/rc7-rlm-gate-c-smoke.mjs initialize --ledger-root <approved-ledger-root> --results-root <approved-results-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-smoke.mjs inspect --ledger-root <initialized-ledger-root> --results-root <initialized-results-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-smoke.mjs recover --ledger-root <initialized-ledger-root> --results-root <initialized-results-root>",
    "  node scripts/recursus/rc7-rlm-gate-c-smoke.mjs run --ledger-root <initialized-ledger-root> --results-root <initialized-results-root> --runtime-root <pinned-runtime-root> --stage-root <prepared-stage-root>",
    "",
    "The run command is fixed to one non-score-bearing SAFE-01 rc-direct top-level request. It derives the direct Gate-B non-container reference internally and hard-wires the shared smoke host facade.",
    "The trusted host must set one absolute external DSH_HOME before run. The value is forwarded only to the one-shot capsule child and is never accepted as a CLI argument, inspected, or retained.",
    "There are no caller-selectable run, case, arm, route, model, prompt, callback, scorer, evaluator, RLM, Docker, child-request, retry, provider, credential, or network controls.",
  ].join("\n");
}

function failUsage(message) {
  throw Object.assign(new Error(`${message}\n${usage()}`), { code: "USAGE" });
}

function parseArgs(argv) {
  if (argv.length === 1 && ["help", "--help", "-h"].includes(argv[0])) return { command: "help" };
  const [command, ...rest] = argv;
  const required = COMMAND_FIELDS[command];
  if (!required) failUsage("Unknown or missing smoke command");
  const permitted = new Set(required);
  const parsed = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const field = FLAG_FIELDS.get(flag);
    const value = rest[index + 1];
    if (!field || !permitted.has(field) || Object.hasOwn(parsed, field) || value === undefined || value.startsWith("--")) {
      failUsage(`Unknown, repeated, prohibited, or missing argument: ${flag ?? "<missing>"}`);
    }
    parsed[field] = value;
  }
  for (const field of required) if (!Object.hasOwn(parsed, field) || parsed[field].length === 0) failUsage(`Missing required argument for ${field}`);
  for (const field of required.filter((item) => item.endsWith("_root"))) {
    if (!path.isAbsolute(parsed[field])) failUsage(`${field} must be one explicit absolute local path`);
    parsed[field] = path.resolve(parsed[field]);
  }
  for (const field of ["final_freeze_sha256", "future_activation_sha256"].filter((item) => permitted.has(item))) {
    if (!HASH.test(parsed[field])) failUsage(`${field} must be lowercase 64-hex`);
  }
  return parsed;
}

function approvalProjection(freeze) {
  return {
    closure_sha256: freeze.closure_sha256,
    exact_approval_text: freeze.exact_approval_text,
    approval_text_sha256: freeze.approval_text_sha256,
    final_freeze_sha256: freeze.final_freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    terminal_decision: freeze.terminal_decision,
  };
}

function closedFailureCode(error) {
  return ERROR_CODE.test(error?.code ?? "") ? error.code : "UNEXPECTED_SMOKE_EXECUTION_FAILURE";
}

function retainedProjection(settled) {
  return {
    terminal_state: settled.terminal.state,
    terminal_sha256: settled.terminal.terminal_sha256,
    result_state: settled.result.state,
    result_sha256: settled.result.result_sha256,
    replay_permitted: false,
    matrix_member: false,
    score_bearing: false,
  };
}

async function runFixedSmoke(parsed) {
  preflightRc7GateCCredentialHomeEnvironment();
  let dispatch = null;
  let closedSettlement = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(Object.assign(new Error("Smoke attempt deadline expired"), { code: "ATTEMPT_EXECUTION_TIMEOUT" })), ATTEMPT_TIMEOUT_MS);
  timer.unref?.();
  try {
    await inspectRc7GateCSmokeResult(parsed.results_root, parsed.ledger_root);
    const request = await buildRc7GateCFixedSmokeRequest();
    const permit = await authorizeRc7GateCSmokeProviderDispatch(parsed.ledger_root, request.intent);
    dispatch = await consumeRc7GateCSmokeDispatchReservation(parsed.ledger_root, { intent: request.intent, permit });
    const sealedRequest = await sealRc7GateCSmokeDispatchRequest(parsed.ledger_root, {
      dispatch_sha256: dispatch.dispatch_sha256,
      request,
    });
    const gateB = buildRc7GateCSmokeDirectGateBReference({
      activation_sha256: sealedRequest.activation_sha256,
      intent: request.intent,
      dispatch,
      container_id: null,
    });
    const hostResult = await launchRc7GateCSmokeLiveCapsuleFromHost({
      abort_signal: controller.signal,
      dispatch_sha256: dispatch.dispatch_sha256,
      gate_b_attestation: gateB,
      ledger_root: parsed.ledger_root,
      process_timeout_ms: HOST_PROCESS_TIMEOUT_MS,
      runtime_root: parsed.runtime_root,
      sealed_request: sealedRequest,
      stage_root: parsed.stage_root,
    });
    closedSettlement = await settleRc7GateCSmokeHostLaunchResult({
      dispatch,
      gate_b_attestation: gateB,
      host_result: hostResult,
      ledger_root: parsed.ledger_root,
      results_root: parsed.results_root,
    });
    const ledger = await inspectRc7GateCSmokeLedger(parsed.ledger_root);
    const results = await inspectRc7GateCSmokeResult(parsed.results_root, parsed.ledger_root);
    const retained = {
      ...closedSettlement,
      terminal_state: ledger.state,
      result_state: results.state,
      terminal_decision: results.state === "smoke-succeeded-nonscore" ? "SMOKE_PASS_MATRIX_UNSTARTED" : "SMOKE_INDETERMINATE_NO_REPLAY",
      replay_permitted: false,
      matrix_member: false,
      score_bearing: false,
    };
    if (results.state !== "smoke-succeeded-nonscore") {
      throw Object.assign(new Error("Smoke ended indeterminate and was retained without replay authority"), {
        code: "SMOKE_INDETERMINATE_NO_REPLAY",
        retained,
      });
    }
    return retained;
  } catch (error) {
    if (dispatch === null) throw error;
    if (closedSettlement !== null) {
      if (!error.retained) error.retained = { ...closedSettlement, replay_permitted: false, matrix_member: false, score_bearing: false };
      throw error;
    }
    let settled;
    try {
      settled = await settleRc7GateCSmokeFailure({
        dispatch,
        failure_code: closedFailureCode(error),
        ledger_root: parsed.ledger_root,
        results_root: parsed.results_root,
      });
    } catch (settlementError) {
      throw Object.assign(new Error("Smoke failed after reservation and could not retain its no-replay terminal; run recover exactly once"), {
        cause: settlementError,
        code: "SMOKE_RECOVERY_REQUIRED_NO_REPLAY",
        original_code: closedFailureCode(error),
      });
    }
    throw Object.assign(new Error("Smoke ended indeterminate and was retained without replay authority"), {
      code: closedFailureCode(error),
      retained: retainedProjection(settled),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  let result;
  if (parsed.command === "prepare-final-freeze" || parsed.command === "inspect-final-freeze") {
    const operation = parsed.command === "prepare-final-freeze" ? prepareRc7GateCSmokeFinalApprovalFreeze : inspectRc7GateCSmokeFinalApprovalFreeze;
    const retained = await operation(parsed.freeze_root, parsed.ledger_root, parsed.results_root);
    if (parsed.command === "prepare-final-freeze") await inspectRc7GateCSmokeFinalApprovalFreeze(parsed.freeze_root, parsed.ledger_root, parsed.results_root);
    const freeze = await buildRc7GateCSmokeFinalApprovalFreeze(parsed.ledger_root, parsed.results_root);
    result = { ...retained, ...approvalProjection(freeze) };
  } else if (parsed.command === "record-approval") {
    result = await recordRc7GateCSmokeOperatorApproval(parsed.ledger_root, {
      exact_approval_text: parsed.exact_approval_text,
      final_freeze_sha256: parsed.final_freeze_sha256,
      future_activation_sha256: parsed.future_activation_sha256,
      results_root: parsed.results_root,
    });
  } else if (parsed.command === "initialize") {
    const ledger = await initializeRc7GateCSmokeLedger(parsed.ledger_root);
    const results = await initializeRc7GateCSmokeResults(parsed.results_root, parsed.ledger_root);
    result = { ledger, results };
  } else if (parsed.command === "inspect") {
    const ledger = await inspectRc7GateCSmokeLedger(parsed.ledger_root);
    const results = await inspectRc7GateCSmokeResult(parsed.results_root, parsed.ledger_root);
    result = { ledger, results };
  } else if (parsed.command === "recover") {
    result = await recoverRc7GateCSmoke({ ledger_root: parsed.ledger_root, results_root: parsed.results_root });
  } else if (parsed.command === "run") {
    result = await runFixedSmoke(parsed);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: parsed.command, ...result })}\n`);
}

main().catch((error) => {
  const formatted = formatRc7GateCSmokeError(error);
  if (formatted.code === "UNEXPECTED_SMOKE_ERROR" && typeof error?.code === "string") formatted.code = error.code;
  if (error?.retained) formatted.retained = error.retained;
  if (error?.original_code) formatted.original_code = error.original_code;
  process.stderr.write(`${JSON.stringify(formatted)}\n`);
  process.exitCode = 1;
});
