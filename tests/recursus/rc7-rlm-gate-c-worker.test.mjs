import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES,
  RC7_GATE_C_PROVIDER_TIMEOUT_MS,
  RC7_GATE_C_RUNTIME_CLOSURE,
  RC7_GATE_C_WORKER_TERMINAL,
  Rc7GateCWorkerError,
  __test,
  buildRc7GateCProviderWireRequest,
  buildRc7GateCSemanticRequest,
  buildRc7GateCSealedResult,
  buildRc7GateCWorkerConformancePackage,
  buildRc7GateCWorkerStageManifest,
  createRc7GateCStreamState,
  decideRc7GateCFetch,
  finalizeRc7GateCStream,
  reduceRc7GateCStreamChunk,
  validateRc7GateCProviderWireRequest,
  validateRc7GateCSemanticRequest,
  validateRc7GateCSealedWorkerRequest,
  validateRc7GateCWorkerConformancePackage,
  validateRc7GateCWorkerStageManifest,
} from "../../lib/recursus/rc7-rlm-gate-c-worker.mjs";
import { __test as liveCapsuleTest } from "../../lib/recursus/rc7-rlm-gate-c-live-capsule.mjs";
import { RC7_GATE_C_OUTPUT_SCHEMA } from "../../lib/recursus/rc7-rlm-gate-c-scorer.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

function withDigest(value, field) {
  value[field] = sha256V1(canonicalJsonV1(value));
  return value;
}

function expectedClosure() {
  return {
    activation_sha256: "a".repeat(64),
    broker_package_sha256: "b".repeat(64),
    preregistration_sha256: "c".repeat(64),
    scorer_contract_sha256: "d".repeat(64),
    worker_package_sha256: "e".repeat(64),
  };
}

function semantic() {
  return buildRc7GateCSemanticRequest({
    system_text: "Use only frozen synthetic source bytes and return the closed JSON signature contract.",
    user_text: "Case FACT-01 synthetic source: https://careers.lattice-lantern.test/jobs/evidence-operations",
    session_id: "1".repeat(32),
  });
}

function sealedRequest() {
  const closure = expectedClosure();
  const requestValue = semantic();
  const request = validateRc7GateCSemanticRequest(requestValue);
  const intent = withDigest({
    schema_version: "rc7-gate-c-request-intent-v2",
    broker_identity: "rc7-gate-c-credential-opaque-sealed-request-broker-v2",
    permission_policy_identity: "rc7-rlm-gate-c-docker-contained-brokered-ablation-v2",
    preregistration_sha256: closure.preregistration_sha256,
    run_id: "f".repeat(64),
    case_id: "FACT-01",
    arm: "rc-direct",
    selected_route: "rc-direct",
    repeat_index: 1,
    route_visible_source_pack_id: "CAREER-BENCH-V1-FACT-01-VISIBLE",
    route_visible_source_pack_sha256: "0".repeat(64),
    evaluator_contract_id: "CAREER-BENCH-V1-FACT-01-EVALUATOR",
    evaluator_contract_sha256: "1".repeat(64),
    request_kind: "top-level",
    child_sequence: 0,
    semantic_request_sha256: request.sha256,
    semantic_request_byte_count: request.byte_count,
    provider: "openai-codex",
    adapter: "deepseek-openai-codex",
    adapter_revision: RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision,
    model: "gpt-5.6-sol",
    configured_snapshot: "gpt-5.6-sol",
    reasoning: "xhigh",
    max_output_plus_reasoning_tokens: RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
    provider_active_timeout_seconds: RC7_GATE_C_PROVIDER_TIMEOUT_MS / 1000,
    automatic_retries: 0,
    reservation_consumed_before_provider_reachability: true,
    activation_state: "denied-awaiting-exact-digest-bound-activation",
  }, "intent_sha256");
  const permit = withDigest({
    schema_version: "rc7-gate-c-dispatch-permit-v2",
    activation_sha256: closure.activation_sha256,
    preregistration_sha256: closure.preregistration_sha256,
    broker_package_sha256: closure.broker_package_sha256,
    worker_package_sha256: closure.worker_package_sha256,
    scorer_contract_sha256: closure.scorer_contract_sha256,
    intent_sha256: intent.intent_sha256,
    run_id: intent.run_id,
    request_kind: intent.request_kind,
    child_sequence: intent.child_sequence,
    semantic_request_sha256: request.sha256,
    semantic_request_byte_count: request.byte_count,
    dispatch_nonce: "2".repeat(64),
    state: "reserved-provider-reachable-once",
  }, "permit_sha256");
  return withDigest({
    schema_version: "rc7-gate-c-sealed-worker-request-v1",
    ...closure,
    intent,
    permit,
    semantic_request: request.value,
    semantic_request_sha256: request.sha256,
    semantic_request_byte_count: request.byte_count,
  }, "sealed_request_sha256");
}

function routeOutput(caseId = "FACT-01") {
  return Buffer.from(`${canonicalJsonV1({
    schema_version: RC7_GATE_C_OUTPUT_SCHEMA,
    case_id: caseId,
    completion: "complete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
  })}\n`, "utf8");
}

function validStream(caseId = "FACT-01") {
  const text = routeOutput(caseId).toString("utf8");
  let state = createRc7GateCStreamState();
  state = reduceRc7GateCStreamChunk(state, { type: "block-start", index: 0, blockType: "reasoning" });
  state = reduceRc7GateCStreamChunk(state, { type: "reasoning-delta", index: 0, text: "discarded" });
  state = reduceRc7GateCStreamChunk(state, { type: "block-end", index: 0, block: { type: "reasoning", text: "discarded" } });
  state = reduceRc7GateCStreamChunk(state, { type: "block-start", index: 1, blockType: "text" });
  state = reduceRc7GateCStreamChunk(state, { type: "text-delta", index: 1, text });
  state = reduceRc7GateCStreamChunk(state, { type: "block-end", index: 1, block: { type: "text", text } });
  state = reduceRc7GateCStreamChunk(state, { type: "usage", usage: { inputTokens: 100, outputTokens: 200 } });
  return reduceRc7GateCStreamChunk(state, { type: "finish", reason: { kind: "stop" }, replayState: { response: { id: "discarded" } } });
}

test("semantic request freezes the standard system-slot path and exact limits", () => {
  const request = validateRc7GateCSemanticRequest(semantic());
  assert.equal(request.value.max_output_plus_reasoning_tokens, 8_192);
  assert.equal(request.value.timeout_ms, 120_000);
  assert.equal(request.value.automatic_retries, 0);
  assert.equal(request.value.transport, "sse");
  assert.deepEqual(request.value.tools, []);
  assert.ok(request.byte_count <= RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES);
  assert.equal(request.sha256, sha256V1(request.bytes));
  assert.throws(() => buildRc7GateCSemanticRequest({ system_text: "x", user_text: "https://example.com/live", session_id: "1".repeat(32) }), /external URL/u);
  assert.throws(() => buildRc7GateCSemanticRequest({ system_text: "x", user_text: "z".repeat(RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES), session_id: "1".repeat(32) }), /byte ceiling/u);
});

test("sealed worker preflight independently closes activation, intent, permit, and semantic bytes", () => {
  const value = sealedRequest();
  const validated = validateRc7GateCSealedWorkerRequest(value, expectedClosure());
  assert.equal(validated.intent.intent_sha256, value.intent.intent_sha256);
  assert.equal(validated.permit.permit_sha256, value.permit.permit_sha256);
  assert.equal(validated.semantic.sha256, value.semantic_request_sha256);
  const tampered = structuredClone(value);
  tampered.semantic_request.user_text += "x";
  assert.throws(() => validateRc7GateCSealedWorkerRequest(tampered, expectedClosure()), /identities do not close/u);
  assert.throws(() => validateRc7GateCSealedWorkerRequest(value, { ...expectedClosure(), worker_package_sha256: "9".repeat(64) }), /mismatched/u);
});

test("provider wire contract closes model, prompt, tools, reasoning, and output ceiling", () => {
  const request = semantic();
  const body = __test.expectedProviderWireBody(request);
  assert.equal(validateRc7GateCProviderWireRequest(body, request), body);
  const pinnedAdapterBody = structuredClone(body);
  delete pinnedAdapterBody.max_output_tokens;
  assert.deepEqual(buildRc7GateCProviderWireRequest(pinnedAdapterBody, request), body);
  const widenedAdapterBody = structuredClone(pinnedAdapterBody);
  widenedAdapterBody.input[0].content[0].text += " widened";
  assert.throws(() => buildRc7GateCProviderWireRequest(widenedAdapterBody, request), /adapter body widened or mismatched/u);
  for (const mutate of [
    (value) => { delete value.max_output_tokens; },
    (value) => { value.max_output_tokens = 4_000; },
    (value) => { value.model = "gpt-5.6"; },
    (value) => { value.tools = []; },
    (value) => { value.tool_choice = "none"; },
    (value) => { value.input[0].content[0].text += " widened"; },
    (value) => { value.reasoning.effort = "high"; },
  ]) {
    const changed = structuredClone(body);
    mutate(changed);
    assert.throws(() => validateRc7GateCProviderWireRequest(changed, request), /wire body widened or mismatched/u);
  }
});

test("pure fetch decisions allow one exact provider POST and one exact refresh POST only", () => {
  let counters = { provider_posts: 0, refresh_posts: 0 };
  let result = decideRc7GateCFetch({ url: __test.PROVIDER_ENDPOINT, method: "POST", redirect: "error", body_present: true }, counters);
  counters = result.counters;
  result = decideRc7GateCFetch({ url: __test.REFRESH_ENDPOINT, method: "POST", redirect: "error", body_present: true }, counters);
  counters = result.counters;
  assert.deepEqual(counters, { provider_posts: 1, refresh_posts: 1 });
  for (const input of [
    { url: `${__test.PROVIDER_ENDPOINT}?x=1`, method: "POST", redirect: "error", body_present: true },
    { url: __test.PROVIDER_ENDPOINT, method: "GET", redirect: "error", body_present: true },
    { url: "https://example.com/", method: "POST", redirect: "error", body_present: true },
    { url: "http://chatgpt.com/backend-api/codex/responses", method: "POST", redirect: "error", body_present: true },
    { url: "https://user@chatgpt.com/backend-api/codex/responses", method: "POST", redirect: "error", body_present: true },
  ]) assert.throws(() => decideRc7GateCFetch(input), /(?:denied|permitted)/u);
  assert.throws(() => decideRc7GateCFetch({ url: __test.PROVIDER_ENDPOINT, method: "POST", redirect: "error", body_present: true }, { provider_posts: 1, refresh_posts: 0 }), /Second provider/u);
});

test("pure stream reducer validates lifecycle and retains only bounded canonical route output", () => {
  const state = validStream();
  const finalized = finalizeRc7GateCStream(state, "FACT-01");
  assert.equal(finalized.artifact.output.case_id, "FACT-01");
  assert.equal(finalized.artifact.output_sha256, sha256V1(routeOutput()));
  assert.deepEqual(finalized.usage, {
    schema_version: "rc7-gate-c-sanitized-usage-v1",
    input_tokens: 100,
    output_tokens: 200,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: null,
  });
  assert.equal(canonicalJsonV1(finalized.artifact).includes("discarded"), false);
});

test("stream reducer rejects tools, bad ordering, mismatch, over-budget usage, duplicate terminals, and non-stop publication", () => {
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "tool-call-delta", index: 0, id: "x", argumentsDelta: "{}" }), /Tool or unknown/u);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: 0, text: "x" }), /ordering/u);
  let state = reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "block-start", index: 0, blockType: "text" });
  state = reduceRc7GateCStreamChunk(state, { type: "text-delta", index: 0, text: "x" });
  assert.throws(() => reduceRc7GateCStreamChunk(state, { type: "block-end", index: 0, block: { type: "text", text: "y" } }), /does not match/u);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "usage", usage: { inputTokens: 1, outputTokens: 8_193 } }), /ceiling/u);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "usage", usage: { inputTokens: 20_000, cacheReadTokens: 12_000, cacheWriteTokens: 769, outputTokens: 1 } }), /Input, cache-read, and cache-write/u);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "usage", usage: { inputTokens: 1, outputTokens: 4_096, reasoningTokens: 4_097 } }), /Visible output plus separately reported reasoning/u);
  const finished = validStream();
  assert.throws(() => reduceRc7GateCStreamChunk(finished, { type: "finish", reason: { kind: "stop" } }), /after finish/u);
  let maxed = createRc7GateCStreamState();
  maxed = reduceRc7GateCStreamChunk(maxed, { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } });
  maxed = reduceRc7GateCStreamChunk(maxed, { type: "finish", reason: { kind: "max-tokens" } });
  assert.throws(() => finalizeRc7GateCStream(maxed, "FACT-01"), (error) => error?.code === "PROVIDER_TERMINAL_REJECTED"
    && error.details?.terminal_kind === "max-tokens" && error.details?.provider_failure_code === null);
});

test("stream terminal closure retains only the closed kind and sanitized adapter failure code", () => {
  for (const [reason, expectedKind, expectedCode] of [
    [{ kind: "tool-calls" }, "tool-calls", null],
    [{ kind: "aborted", failure: { message: "safe local message", code: "ABORTED" } }, "aborted", "ABORTED"],
    [{ kind: "error", failure: { message: "safe local message", code: "AUTH", requestId: "discarded-request-id" } }, "error", "AUTH"],
    [{ kind: "error", failure: { message: "safe local message", code: "EMPTY_RESPONSE" } }, "error", "EMPTY_RESPONSE"],
  ]) {
    let state = createRc7GateCStreamState();
    state = reduceRc7GateCStreamChunk(state, { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } });
    state = reduceRc7GateCStreamChunk(state, { type: "finish", reason });
    assert.equal(state.terminal_kind, expectedKind);
    assert.equal(state.provider_failure_code, expectedCode);
    assert.doesNotMatch(canonicalJsonV1(state), /safe local message|discarded-request-id/u);
    assert.throws(() => finalizeRc7GateCStream(state, "FACT-01"), (error) => error?.code === "PROVIDER_TERMINAL_REJECTED"
      && error.details?.terminal_kind === expectedKind && error.details?.provider_failure_code === expectedCode);
    const failure = liveCapsuleTest.closedFailure(new Rc7GateCWorkerError("PROVIDER_TERMINAL_REJECTED", "closed", {
      terminal_kind: expectedKind,
      provider_failure_code: expectedCode,
    }), "safe01-direct-live-launch-smoke");
    assert.deepEqual(failure, {
      schema_version: "rc7-gate-c-live-capsule-failure-v4",
      state: "failed-no-replay",
      code: "PROVIDER_TERMINAL_REJECTED",
      terminal_kind: expectedKind,
      provider_failure_code: expectedCode,
      integration_failure_phase: null,
    });
  }
  let state = createRc7GateCStreamState();
  state = reduceRc7GateCStreamChunk(state, { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } });
  assert.throws(() => reduceRc7GateCStreamChunk(state, { type: "finish", reason: { kind: "error", failure: { message: "raw", code: "RAW_PROVIDER_BODY" } } }), /closed sanitized/u);
  assert.throws(() => reduceRc7GateCStreamChunk(state, { type: "finish", reason: { kind: "aborted", failure: { message: "safe", code: "AUTH" } } }), /differ/u);
  assert.throws(() => reduceRc7GateCStreamChunk(state, { type: "finish", reason: { kind: "stop", failure: { message: "widened", code: "AUTH" } } }), /keys mismatched/u);
});

test("artifact seals and worker conformance packages are deterministic and provider-unreachable", async () => {
  const input = {
    activation_sha256: "1".repeat(64), intent_sha256: "2".repeat(64), permit_sha256: "3".repeat(64), dispatch_nonce: "4".repeat(64),
    artifact_sha256: "5".repeat(64), usage_sha256: "6".repeat(64), provenance_sha256: "7".repeat(64), permission_sha256: "8".repeat(64),
    authority_sha256: "9".repeat(64), cleanup_sha256: "a".repeat(64),
  };
  assert.deepEqual(buildRc7GateCSealedResult(input), buildRc7GateCSealedResult(input));
  const left = await buildRc7GateCWorkerConformancePackage();
  const right = await buildRc7GateCWorkerConformancePackage();
  validateRc7GateCWorkerConformancePackage(left);
  assert.deepEqual(left, right);
  assert.equal(left.terminal_decision, RC7_GATE_C_WORKER_TERMINAL);
  assert.equal(left.accounting.provider_calls, 0);
  assert.equal(left.accounting.credential_accesses, 0);
  assert.equal(left.runtime_closure.package_profile.frozen_offline_reinstall, "passed");
  const stage = await buildRc7GateCWorkerStageManifest();
  validateRc7GateCWorkerStageManifest(stage);
  assert.equal(stage.accounting.live_capsule_imports, 0);
  assert.equal(stage.files.length, 8);
  assert.ok(stage.files.some((file) => file.path === "lib/recursus/rc7-rlm-gate-c-output-grammar.mjs"));
  assert.equal(left.worker_stage.stage_manifest_sha256, stage.stage_manifest_sha256);
});

test("runtime closure binds the complete installed tree and rejects links outside the internal pnpm store", () => {
  assert.equal(RC7_GATE_C_RUNTIME_CLOSURE.installed_tree.entry_count, 21_534);
  assert.equal(RC7_GATE_C_RUNTIME_CLOSURE.installed_tree.file_count, 17_369);
  assert.equal(RC7_GATE_C_RUNTIME_CLOSURE.installed_tree.link_count, 1_325);
  assert.match(RC7_GATE_C_RUNTIME_CLOSURE.installed_tree.records_sha256, /^[0-9a-f]{64}$/u);
  const runtime = path.resolve(path.parse(process.cwd()).root, "rc7-gate-c-runtime-unit");
  const internal = path.join(runtime, "node_modules", ".pnpm", "pkg@1", "node_modules", "pkg");
  assert.equal(__test.validateRuntimeLinkTarget(runtime, "node_modules/pkg", internal), "node_modules/.pnpm/pkg@1/node_modules/pkg");
  assert.throws(() => __test.validateRuntimeLinkTarget(runtime, "node_modules/pkg", path.resolve(path.dirname(runtime), "outside-runtime")), /escaped the exact internal pnpm store/u);
});

test("the exact staged module may inspect only its own verified parent runtime", () => {
  const runtimeRoot = path.resolve(path.parse(process.cwd()).root, "rc7-gate-c-runtime-unit");
  const stagedRoot = path.join(runtimeRoot, "stage");
  assert.equal(__test.exactSelfStagedContext(runtimeRoot, stagedRoot, stagedRoot), true);
  assert.equal(__test.exactSelfStagedContext(path.dirname(runtimeRoot), stagedRoot, stagedRoot), false);
  assert.equal(__test.exactSelfStagedContext(runtimeRoot, path.join(runtimeRoot, "replacement-stage"), stagedRoot), false);
  assert.equal(__test.exactSelfStagedContext(runtimeRoot, path.join(stagedRoot, "nested-stage"), stagedRoot), false);
});

test("provider-free worker core cannot load network, credentials, environment, child processes, or the live capsule", async () => {
  const core = await readFile(path.join(__test.REPOSITORY_ROOT, "lib/recursus/rc7-rlm-gate-c-worker.mjs"), "utf8");
  for (const denied of ["node:child_process", "node:http", "node:https", "node:net", "node:tls", "node:dns", "globalThis.fetch", "process.env", "import(\"@deepseek-ai/dsh-credentials-local\")", "import(\"deepseek-openai-codex\")"]) assert.equal(core.includes(denied), false, denied);
  const capsule = await readFile(path.join(__test.REPOSITORY_ROOT, "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs"), "utf8");
  for (const denied of ["credentialPath", "credential_path", "process.argv", ".describe(", ".validateDurable(", ".list(", ".delete(", ".unset(", "login(", "logout("]) assert.equal(capsule.includes(denied), false, denied);
  for (const callerTrusted of ["consumed_dispatch", "validateConsumedDispatch"]) assert.equal(capsule.includes(callerTrusted), false, callerTrusted);
  assert.match(capsule, /compiled-reference|CREDENTIAL_REFERENCE/u);
  assert.equal(capsule.includes('import("./rc7-rlm-gate-c-broker.mjs")'), false);
  assert.ok(capsule.indexOf("acceptRc7GateCHostHandoff") < capsule.indexOf('import("@deepseek-ai\/cordis")'));
  assert.ok(capsule.indexOf("validateHostCommit") < capsule.indexOf('import("@deepseek-ai\/cordis")'));
  assert.match(capsule, /HOST_HANDOFF_REQUIRED/u);
  assert.match(capsule, /buildRc7GateCProviderWireRequest\(value, semantic\)/u);
  assert.match(capsule, /fetchGuard\.disable\(\)/u);
});

function dispatchForHostHandoff(sealed) {
  return withDigest({
    schema_version: "rc7-gate-c-dispatch-checkpoint-v2",
    activation_sha256: sealed.activation_sha256,
    intent_sha256: sealed.intent.intent_sha256,
    permit_sha256: sealed.permit.permit_sha256,
    dispatch_nonce: sealed.permit.dispatch_nonce,
    run_id: sealed.intent.run_id,
    case_id: sealed.intent.case_id,
    arm: sealed.intent.arm,
    selected_route: sealed.intent.selected_route,
    request_kind: sealed.intent.request_kind,
    child_sequence: sealed.intent.child_sequence,
    semantic_request_sha256: sealed.semantic_request_sha256,
    reservation_key: "3".repeat(64),
    reservation_ordinal: 1,
    state: "consumed-provider-reachable-handoff-started",
  }, "dispatch_sha256");
}

function hostHandoff() {
  const sealed = sealedRequest();
  const dispatch = dispatchForHostHandoff(sealed);
  const brokerResult = {
    sealed,
    dispatch,
    expected_closure: expectedClosure(),
    wire_contract: {
      schema_version: "rc7-gate-c-exact-wire-contract-v1",
      provider_endpoint: "https://chatgpt.com/backend-api/codex/responses",
      refresh_endpoint: "https://auth.openai.com/oauth/token",
      provider: sealed.intent.provider,
      adapter: sealed.intent.adapter,
      adapter_revision: sealed.intent.adapter_revision,
      model: sealed.intent.model,
      configured_snapshot: sealed.intent.configured_snapshot,
      reasoning: sealed.intent.reasoning,
      max_output_plus_reasoning_tokens: sealed.intent.max_output_plus_reasoning_tokens,
      provider_active_timeout_seconds: sealed.intent.provider_active_timeout_seconds,
      automatic_retries: 0,
      generation_https_posts: 1,
      oauth_refresh_https_posts: 1,
      all_other_network: "denied",
    },
    gate_b: {
      schema_version: "rc7-gate-c-broker-derived-gate-b-evidence-v1",
      state: "not-applicable-direct-route",
      selected_route: "rc-direct",
      activation_sha256: dispatch.activation_sha256,
      intent_sha256: dispatch.intent_sha256,
      dispatch_sha256: dispatch.dispatch_sha256,
      container_id: null,
      image_id: null,
      docker_executable_sha256: null,
      outer_seccomp_inspect_sha256: null,
      network: "not-applicable-no-container",
      direct_container_provider_access: "not-applicable-no-container",
      input_mount_sha256: null,
      launcher_parent_intent_sha256: null,
      launcher_parent_dispatch_sha256: null,
      launcher_parent_semantic_request_sha256: null,
      phase_two_tsync_proven: false,
    },
  };
  brokerResult.durable_handoff = withDigest({
    schema_version: "rc7-gate-c-durable-provider-handoff-v1",
    state: "preflight-consumed-provider-reachability-committed",
    activation_sha256: dispatch.activation_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    reservation_key: dispatch.reservation_key,
    handoff_nonce: "4".repeat(64),
    sealed_request_sha256: sealed.sealed_request_sha256,
    gate_b_attestation_sha256: "7".repeat(64),
  }, "durable_handoff_sha256");
  return withDigest({
    schema_version: "rc7-gate-c-host-handoff-v1",
    state: "host-preflight-complete-one-use",
    nonce: "4".repeat(64),
    broker_result: brokerResult,
  }, "handoff_sha256");
}

function fakePipeRead(value) {
  const wire = Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
  return JSON.parse(wire.toString("utf8"));
}

test("host handoff fake pipes bind canonical handoff, pre-credential ack, and exact commit", async () => {
  const handoff = hostHandoff();
  const trust = { stage_manifest_sha256: "5".repeat(64), capsule_sha256: "6".repeat(64) };
  let writtenAck;
  const accepted = await liveCapsuleTest.acceptHostHandoffWithIo({
    read_handoff: async () => fakePipeRead(handoff),
    write_ack: async (ack) => { writtenAck = fakePipeRead(ack); },
    read_commit: async () => fakePipeRead(withDigest({
      schema_version: "rc7-gate-c-host-handoff-commit-v1",
      state: "host-ack-validated-execute-once",
      nonce: handoff.nonce,
      handoff_sha256: handoff.handoff_sha256,
      ack_sha256: writtenAck.ack_sha256,
    }, "commit_sha256")),
  }, trust);
  assert.equal(accepted.ack.stage_manifest_sha256, trust.stage_manifest_sha256);
  assert.equal(accepted.ack.capsule_sha256, trust.capsule_sha256);
  assert.equal(accepted.ack.dispatch_sha256, handoff.broker_result.dispatch.dispatch_sha256);
  assert.equal(accepted.commit.state, "host-ack-validated-execute-once");

  let rejectedAck;
  await assert.rejects(liveCapsuleTest.acceptHostHandoffWithIo({
    read_handoff: async () => fakePipeRead(handoff),
    write_ack: async (ack) => { rejectedAck = fakePipeRead(ack); },
    read_commit: async () => fakePipeRead(withDigest({
      schema_version: "rc7-gate-c-host-handoff-commit-v1",
      state: "host-ack-validated-execute-once",
      nonce: "9".repeat(64),
      handoff_sha256: handoff.handoff_sha256,
      ack_sha256: rejectedAck.ack_sha256,
    }, "commit_sha256")),
  }, trust), { code: "HOST_HANDOFF_COMMIT_MISMATCH" });
});
