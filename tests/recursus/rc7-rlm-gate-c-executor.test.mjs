import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  RC7_GATE_C_EXECUTOR_ID,
  __test,
  buildRc7GateCGateBReference,
  buildRc7GateCRlmChildSpecs,
  buildRc7GateCRlmProgram,
  createRc7GateCProductionDockerController,
  rc7GateCExecutorContract,
} from "../../lib/recursus/rc7-rlm-gate-c-executor.mjs";
import { buildRc7GateCPreregistrationPackage } from "../../lib/recursus/rc7-rlm-gate-c-preregistration.mjs";
import { RC7_GATE_C_RUNTIME_CLOSURE } from "../../lib/recursus/rc7-rlm-gate-c-worker.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const H = Object.freeze({
  activation: "1".repeat(64),
  permit: "2".repeat(64),
  dispatch: "3".repeat(64),
  nonce: "4".repeat(64),
  handoff: "5".repeat(64),
  container: "6".repeat(64),
  phase: "7".repeat(64),
});

function output(caseId) {
  return {
    schema_version: "rc7-gate-c-signature-output-v1",
    case_id: caseId,
    completion: "complete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
  };
}

function hostResult(dispatchSha256, caseId) {
  const value = output(caseId);
  const raw = Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
  return {
    schema_version: "rc7-gate-c-host-launch-result-v1",
    state: "one-shot-child-complete",
    dispatch_sha256: dispatchSha256,
    handoff_sha256: H.handoff,
    transport: { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" },
    result: {
      schema_version: "rc7-gate-c-live-capsule-result-v1",
      state: "success-pending-outer-seal",
      artifact: {
        schema_version: "rc7-gate-c-route-output-artifact-v1",
        case_id: caseId,
        output_utf8_byte_count: raw.byteLength,
        output_sha256: sha256V1(raw),
        output: value,
      },
      usage: {
        schema_version: "rc7-gate-c-sanitized-usage-v1",
        input_tokens: 10,
        output_tokens: 20,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        reasoning_tokens: 30,
      },
      observations: {
        provider_posts: 1,
        oauth_refresh_posts: 0,
        adapter_revision: RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision,
        provider: "openai-codex",
        model: "gpt-5.6-sol",
        reasoning: "xhigh",
        provider_active_milliseconds: 25,
        automatic_retry_count: 0,
      },
    },
    same_host_governance_nonclaim: "same-host evidence only",
  };
}

function failedHostResult(dispatchSha256, code) {
  return {
    schema_version: "rc7-gate-c-host-launch-result-v1",
    state: "one-shot-child-complete",
    dispatch_sha256: dispatchSha256,
    handoff_sha256: H.handoff,
    transport: { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" },
    result: {
      schema_version: "rc7-gate-c-live-capsule-failure-v1",
      state: "failed-no-replay",
      code,
      observations: {
        provider_posts: 0,
        refresh_posts: 0,
        provider_active_milliseconds: 25,
        automatic_retry_count: 0,
      },
    },
    same_host_governance_nonclaim: "same-host evidence only",
  };
}

test("closed capsule failure codes survive the host-to-executor bridge", () => {
  for (const code of ["PROVIDER_FREE_SYNTHETIC_FAILURE", "NETWORK_AUTHORITY_DENIED", "ADAPTER-FAILED"]) {
    assert.throws(
      () => __test.validateSuccessfulHostResult(failedHostResult(H.dispatch, code), "SAFE-01", H.dispatch),
      (error) => error.code === code,
      code,
    );
  }
  const malformed = failedHostResult(H.dispatch, "NETWORK_AUTHORITY_DENIED");
  malformed.result.observations.provider_posts = 2;
  assert.throws(
    () => __test.validateSuccessfulHostResult(malformed, "SAFE-01", H.dispatch),
    (error) => error.code === "PROVIDER_RESULT_MISMATCH",
  );
});

test("closed program fixes four evaluator-blind child requests and canonical deterministic merge code", async () => {
  for (const caseId of ["LAB-01", "PAPER-01", "REPO-01"]) {
    const first = await buildRc7GateCRlmProgram({ case_id: caseId, base_output: output(caseId) });
    const second = await buildRc7GateCRlmProgram({ case_id: caseId, base_output: output(caseId) });
    assert.equal(first.closed_program_sha256, second.closed_program_sha256);
    assert.equal(first.child_specs.length, 4);
    assert.equal(first.python_code.includes('await _rlm.host_request("rc7.child"'), true);
    assert.equal(first.python_code.includes("RC7_FINAL="), true);
    assert.equal(first.python_code.includes("expected_items"), false);
    assert.deepEqual(first.child_specs, await buildRc7GateCRlmChildSpecs(caseId));
  }
  await assert.rejects(buildRc7GateCRlmProgram({ case_id: "FACT-01", base_output: output("FACT-01") }), (error) => error.code === "RLM_CASE_NOT_ELIGIBLE");
});

test("Gate B references distinguish direct top-level, RLM top-level, and contained recursive child", () => {
  const intent = { intent_sha256: "8".repeat(64), request_kind: "top-level", child_sequence: 0 };
  const directDispatch = { activation_sha256: H.activation, intent_sha256: intent.intent_sha256, dispatch_sha256: H.dispatch, request_kind: "top-level", child_sequence: 0, selected_route: "rc-direct" };
  assert.equal(buildRc7GateCGateBReference({ activation_sha256: H.activation, intent, dispatch: directDispatch, container_id: null }).state, "not-applicable-direct-route");
  const rlmDispatch = { ...directDispatch, selected_route: "rc-rlm" };
  assert.equal(buildRc7GateCGateBReference({ activation_sha256: H.activation, intent, dispatch: rlmDispatch, container_id: null }).state, "not-applicable-top-level-host-provider");
  const childIntent = { intent_sha256: "9".repeat(64), request_kind: "recursive-child", child_sequence: 1 };
  const childDispatch = { ...rlmDispatch, intent_sha256: childIntent.intent_sha256, request_kind: "recursive-child", child_sequence: 1 };
  assert.equal(buildRc7GateCGateBReference({ activation_sha256: H.activation, intent: childIntent, dispatch: childDispatch, container_id: H.container }).state, "broker-inspect-live-rlm-container");
  assert.throws(() => buildRc7GateCGateBReference({ activation_sha256: H.activation, intent, dispatch: rlmDispatch, container_id: H.container }));
});

test("production Docker controller has no caller-injected command authority", async () => {
  assert.throws(
    () => createRc7GateCProductionDockerController({ ledger_root: "F:\\rc7-ledger", command: async () => undefined }),
    (error) => error.code === "MALFORMED_EXECUTION",
  );
  const controller = createRc7GateCProductionDockerController({ ledger_root: "F:\\rc7-ledger" });
  assert.deepEqual(Object.keys(controller).sort(), ["create", "current_container_id", "inspect", "list", "remove", "start", "tick"]);
  const source = await readFile(fileURLToPath(new URL("../../lib/recursus/rc7-rlm-gate-c-executor.mjs", import.meta.url)), "utf8");
  assert.equal(source.includes("export function createRc7GateCProductionDockerController({"), false);
  assert.equal(source.includes("command = productionDockerCommand"), false);
  assert.equal(Object.hasOwn(__test, "runProviderDispatch"), false);
  assert.equal(Object.hasOwn(__test, "productionDockerCommand"), false);
});

function fakeExecutionDependencies(preregistration, events) {
  let ordinal = 0;
  let topDispatch;
  const closes = [];
  const dependencies = {
    preregistration: async () => preregistration,
    buildRequest: async (input) => {
      const built = await import("../../lib/recursus/rc7-rlm-gate-c-broker.mjs").then((module) => module.buildRc7GateCRequestIntent(input));
      events.push(`request:${input.request_kind}:${input.child_sequence}`);
      return built;
    },
    authorize: async () => ({ permit_sha256: H.permit }),
    consume: async (_root, { intent }) => {
      ordinal += 1;
      const dispatch = {
        activation_sha256: H.activation,
        intent_sha256: intent.intent_sha256,
        permit_sha256: H.permit,
        dispatch_nonce: sha256V1(`${H.nonce}:${ordinal}`),
        dispatch_sha256: sha256V1(`${H.dispatch}:${ordinal}`),
        run_id: intent.run_id,
        case_id: intent.case_id,
        arm: intent.arm,
        selected_route: intent.selected_route,
        request_kind: intent.request_kind,
        child_sequence: intent.child_sequence,
        semantic_request_sha256: intent.semantic_request_sha256,
      };
      if (intent.request_kind === "top-level") topDispatch = dispatch;
      events.push(`consume:${intent.request_kind}:${intent.child_sequence}`);
      return dispatch;
    },
    seal: async (_root, { request }) => ({ activation_sha256: H.activation, intent: request.intent }),
    hostLaunch: async (input) => {
      events.push(`host:${input.sealed_request.intent.request_kind}:${input.sealed_request.intent.child_sequence}`);
      return hostResult(input.dispatch_sha256, input.sealed_request.intent.case_id);
    },
    close: async (_root, dispatch, terminal) => {
      closes.push({ dispatch, terminal });
      events.push(`close:${dispatch.request_kind}:${dispatch.child_sequence}:${terminal.state}`);
      return { state: terminal.state, terminal_sha256: sha256V1(canonicalJsonV1({ dispatch: dispatch.dispatch_sha256, state: terminal.state })) };
    },
    prepareRlm: async (root) => { events.push("prepare-rlm"); return { root }; },
    publishRlm: async (_root, program) => { events.push("publish-rlm"); return program; },
    dockerController: () => ({ current_container_id: H.container }),
    runRlm: async (_root, options) => {
      events.push("run-rlm");
      for (let sequence = 1; sequence <= 4; sequence += 1) {
        const spec = (await buildRc7GateCRlmChildSpecs(topDispatch.case_id))[sequence - 1];
        await options.broker_child({
          activation_sha256: topDispatch.activation_sha256,
          run_identity: topDispatch.run_id,
          intent_sha256: topDispatch.intent_sha256,
          dispatch_sha256: topDispatch.dispatch_sha256,
          semantic_request_sha256: topDispatch.semantic_request_sha256,
          child_sequence: sequence,
          child_question: spec.child_question,
          excerpt_locator: spec.excerpt_locator,
          request_sha256: sha256V1(`proposal:${sequence}`),
        });
      }
      return {
        result: { child_request_count: 4 },
        final_artifact: { phase_two_sha256: H.phase, route_output: output(topDispatch.case_id) },
      };
    },
  };
  return { dependencies, closes };
}

test("dependency-injected attempt execution is absent from the public test surface", () => {
  assert.equal(Object.hasOwn(__test, "executeAttempt"), false);
});

test("production contract exposes no caller-supplied Python, broker, or Docker command authority", () => {
  const contract = rc7GateCExecutorContract();
  assert.equal(contract.caller_injected_python, false);
  assert.equal(contract.caller_injected_child_broker, false);
  assert.equal(contract.caller_injected_docker_command, false);
});

test("executor contract freezes all operational timeout ceilings", () => {
  const contract = rc7GateCExecutorContract();
  assert.deepEqual(contract.timeouts_ms, { host_ack: 30_000, host_process: 165_000, provider_active_per_request: 120_000, child_response: 120_000, rlm_wall: 300_000, docker_command: 30_000, attempt_execution: 500_000, retained_failure_wall: 600_000 });
  assert.equal(contract.caller_injected_python, false);
  assert.equal(contract.caller_injected_child_broker, false);
  assert.equal(contract.caller_injected_docker_command, false);
});

test("production run and recovery share the hard wall and eligible recovery requires its RLM root", async () => {
  const source = await readFile(fileURLToPath(new URL("../../scripts/recursus/rc7-rlm-gate-c-executor.mjs", import.meta.url)), "utf8");
  const timerIndex = source.indexOf("const hardWall = setTimeout");
  const recoveryIndex = source.indexOf('if (parsed.command === "recover")');
  assert.ok(timerIndex > 0 && recoveryIndex > timerIndex);
  assert.equal(source.includes("await recoverRc7GateCResults(parsed.results_root, parsed.ledger_root)"), true);
  assert.equal(source.includes('(row.selected_route === "rc-rlm") !== (parsed.rlm_root !== null)'), true);
  assert.equal(source.includes("run_id: parsed.run_id"), true);
  assert.equal(source.includes("hardWall.unref"), false);
});
