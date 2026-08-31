import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS,
  RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS,
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
  chargeRc7GateCProviderActiveMilliseconds,
  createRc7GateCStreamState,
  createRc7GateCTreatmentProofStreamState,
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
import { RC7_GATE_C_MAX_OUTPUT_BYTES } from "../../lib/recursus/rc7-rlm-gate-c-output-grammar.mjs";
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
  return Buffer.from(canonicalJsonV1({
    schema_version: RC7_GATE_C_OUTPUT_SCHEMA,
    case_id: caseId,
    completion: "complete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
  }), "utf8");
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
  assert.equal(request.value.max_output_plus_reasoning_tokens, 128_000);
  assert.equal(request.value.timeout_ms, 300_000);
  const child = validateRc7GateCSemanticRequest(buildRc7GateCSemanticRequest({
    system_text: "child system",
    user_text: "child user",
    session_id: "2".repeat(32),
    timeout_ms: RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS,
  }));
  assert.equal(child.value.timeout_ms, 120_000);
  assert.equal(request.value.automatic_retries, 0);
  assert.equal(request.value.transport, "sse");
  assert.deepEqual(request.value.tools, []);
  assert.ok(request.byte_count <= RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES);
  assert.equal(request.sha256, sha256V1(request.bytes));
  assert.throws(() => buildRc7GateCSemanticRequest({ system_text: "x", user_text: "https://example.com/live", session_id: "1".repeat(32) }), /external URL/u);
  assert.throws(() => buildRc7GateCSemanticRequest({ system_text: "x", user_text: "z".repeat(RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES), session_id: "1".repeat(32) }), /byte ceiling/u);
  assert.throws(() => buildRc7GateCSemanticRequest({ system_text: "x", user_text: "y", session_id: "1".repeat(32), timeout_ms: 121_000 }), /closed authority/u);
});

test("provider timing charges never exceed the approved timeout after local abort settlement", () => {
  assert.equal(chargeRc7GateCProviderActiveMilliseconds(1_000, 2_000), 1_000);
  assert.equal(chargeRc7GateCProviderActiveMilliseconds(1_000, 301_001), RC7_GATE_C_PROVIDER_TIMEOUT_MS);
  assert.equal(chargeRc7GateCProviderActiveMilliseconds(1_000, 301_001, RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS), RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS);
  assert.throws(() => chargeRc7GateCProviderActiveMilliseconds(1_000, 2_000, 121_000), /route-specific/u);
  assert.throws(() => chargeRc7GateCProviderActiveMilliseconds(2_000, 1_000), /timing observations/u);
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
  const crossFieldMismatch = structuredClone(value);
  crossFieldMismatch.semantic_request.timeout_ms = RC7_GATE_C_CHILD_PROVIDER_TIMEOUT_MS;
  const changedSemantic = validateRc7GateCSemanticRequest(crossFieldMismatch.semantic_request);
  crossFieldMismatch.semantic_request_sha256 = changedSemantic.sha256;
  crossFieldMismatch.semantic_request_byte_count = changedSemantic.byte_count;
  crossFieldMismatch.intent.semantic_request_sha256 = changedSemantic.sha256;
  crossFieldMismatch.intent.semantic_request_byte_count = changedSemantic.byte_count;
  delete crossFieldMismatch.intent.intent_sha256;
  withDigest(crossFieldMismatch.intent, "intent_sha256");
  crossFieldMismatch.permit.intent_sha256 = crossFieldMismatch.intent.intent_sha256;
  crossFieldMismatch.permit.semantic_request_sha256 = changedSemantic.sha256;
  crossFieldMismatch.permit.semantic_request_byte_count = changedSemantic.byte_count;
  delete crossFieldMismatch.permit.permit_sha256;
  withDigest(crossFieldMismatch.permit, "permit_sha256");
  delete crossFieldMismatch.sealed_request_sha256;
  withDigest(crossFieldMismatch, "sealed_request_sha256");
  assert.throws(() => validateRc7GateCSealedWorkerRequest(crossFieldMismatch, expectedClosure()), /identities do not close/u);
  assert.throws(() => validateRc7GateCSealedWorkerRequest(value, { ...expectedClosure(), worker_package_sha256: "9".repeat(64) }), /mismatched/u);
});

test("provider wire contract closes the native Codex body and rejects the unsupported token-cap extension", () => {
  const request = semantic();
  const body = __test.expectedProviderWireBody(request);
  assert.equal(validateRc7GateCProviderWireRequest(body, request), body);
  assert.equal(Object.hasOwn(body, "max_output_tokens"), false);
  assert.deepEqual(buildRc7GateCProviderWireRequest(body, request), body);
  const widenedAdapterBody = structuredClone(body);
  widenedAdapterBody.input[0].content[0].text += " widened";
  assert.throws(() => buildRc7GateCProviderWireRequest(widenedAdapterBody, request), /native body widened or mismatched/u);
  for (const mutate of [
    (value) => { value.max_output_tokens = 8_192; },
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

test("stream reducer follows the canonical DSH assembler for delta-only, authoritative close, stragglers, and bounded replay metadata", () => {
  const text = routeOutput("FACT-01").toString("utf8");
  let state = createRc7GateCStreamState();
  state = reduceRc7GateCStreamChunk(state, { type: "reasoning-delta", index: 0, text: "partial reasoning" });
  state = reduceRc7GateCStreamChunk(state, { type: "block-end", index: 0, block: { type: "reasoning", text: "authoritative reasoning" } });
  state = reduceRc7GateCStreamChunk(state, { type: "reasoning-delta", index: 0, text: "ignored straggler" });
  state = reduceRc7GateCStreamChunk(state, { type: "text-delta", index: 1, text: "partial" });
  state = reduceRc7GateCStreamChunk(state, { type: "block-end", index: 1, block: { type: "text", text } });
  state = reduceRc7GateCStreamChunk(state, { type: "text-delta", index: 1, text: "ignored straggler" });
  state = reduceRc7GateCStreamChunk(state, { type: "usage", usage: { inputTokens: 100, outputTokens: 200 } });
  state = reduceRc7GateCStreamChunk(state, {
    type: "finish",
    reason: { kind: "stop" },
    replayState: { response: { kind: "pi-ai" }, blocks: [{ type: "reasoning", thinkingSignature: "x".repeat(65_536) }] },
  });
  const finalized = finalizeRc7GateCStream(state, "FACT-01");
  assert.equal(finalized.artifact.output_sha256, sha256V1(routeOutput("FACT-01")));
  assert.doesNotMatch(canonicalJsonV1(finalized.artifact.output), /authoritative reasoning|thinkingSignature|ignored straggler/u);
});

test("stream reducer closes type conflicts, byte ceilings, chunk/index limits, and replay-state boundaries", () => {
  const malformedPhase = (callback, phase) => assert.throws(
    callback,
    (error) => error?.code === "MALFORMED_STREAM" && error.details?.stream_failure_phase === phase,
    phase,
  );

  let startedText = reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "block-start", index: 0, blockType: "text" });
  malformedPhase(() => reduceRc7GateCStreamChunk(startedText, { type: "reasoning-delta", index: 0, text: "conflict" }), "DELTA");
  let deltaText = reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: 0, text: "text" });
  malformedPhase(() => reduceRc7GateCStreamChunk(deltaText, { type: "reasoning-delta", index: 0, text: "conflict" }), "DELTA");
  malformedPhase(() => reduceRc7GateCStreamChunk(startedText, { type: "block-start", index: 0, blockType: "reasoning" }), "BLOCK_START");
  malformedPhase(() => reduceRc7GateCStreamChunk(startedText, { type: "block-end", index: 0, block: { type: "reasoning", text: "conflict" } }), "BLOCK_END");
  assert.doesNotThrow(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: 8, text: "x" }));
  assert.doesNotThrow(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: __test.MAX_STREAM_BLOCK_INDEX, text: "x" }));
  malformedPhase(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: __test.MAX_STREAM_BLOCK_INDEX + 1, text: "x" }), "BLOCK_INDEX");
  const chunkMaxed = createRc7GateCStreamState();
  chunkMaxed.chunk_count = __test.MAX_STREAM_CHUNKS;
  malformedPhase(() => reduceRc7GateCStreamChunk(chunkMaxed, { type: "text-delta", index: 0, text: "x" }), "CHUNK_CEILING");

  assert.doesNotThrow(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: 0, text: "x".repeat(RC7_GATE_C_MAX_OUTPUT_BYTES) }));
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: 0, text: "x".repeat(RC7_GATE_C_MAX_OUTPUT_BYTES + 1) }), (error) => error?.code === "OUTPUT_BUDGET_EXCEEDED");
  assert.doesNotThrow(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "reasoning-delta", index: 0, text: "x".repeat(__test.MAX_REASONING_STREAM_BYTES) }));
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "reasoning-delta", index: 0, text: "x".repeat(__test.MAX_REASONING_STREAM_BYTES + 1) }), (error) => error?.code === "OUTPUT_BUDGET_EXCEEDED");

  const replayStateAt = (byteCount) => {
    const overhead = Buffer.byteLength(canonicalJsonV1({ opaque: "" }), "utf8");
    const value = { opaque: "x".repeat(byteCount - overhead) };
    assert.equal(Buffer.byteLength(canonicalJsonV1(value), "utf8"), byteCount);
    return value;
  };
  const usageSeen = reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } });
  assert.doesNotThrow(() => reduceRc7GateCStreamChunk(usageSeen, { type: "finish", reason: { kind: "stop" }, replayState: replayStateAt(__test.MAX_DISCARDED_REPLAY_STATE_BYTES) }));
  malformedPhase(
    () => reduceRc7GateCStreamChunk(usageSeen, { type: "finish", reason: { kind: "stop" }, replayState: replayStateAt(__test.MAX_DISCARDED_REPLAY_STATE_BYTES + 1) }),
    "REPLAY_CEILING",
  );
});

test("stream reducer rejects tools, bad ordering, mismatch, over-budget usage, duplicate terminals, and non-stop publication", () => {
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "tool-call-delta", index: 0, id: "x", argumentsDelta: "{}" }), /Tool or unknown/u);
  assert.throws(
    () => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "text-delta", index: 0, text: 1 }),
    (error) => error?.code === "MALFORMED_STREAM" && error.details?.stream_failure_phase === "DELTA",
  );
  let state = reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "block-start", index: 0, blockType: "text" });
  state = reduceRc7GateCStreamChunk(state, { type: "text-delta", index: 0, text: "x" });
  assert.throws(() => reduceRc7GateCStreamChunk(state, { type: "block-end", index: 0, block: { type: "reasoning", text: "y" } }), /does not match/u);
  const matrixUsage = reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "usage", usage: { inputTokens: 1, outputTokens: 8_193 } });
  assert.equal(matrixUsage.usage.output_tokens, 8_193);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), {
    type: "usage", usage: { inputTokens: 1, outputTokens: RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS + 1 },
  }), /ceiling/u);
  const proofUsage = reduceRc7GateCStreamChunk(createRc7GateCTreatmentProofStreamState(), { type: "usage", usage: { inputTokens: 1, outputTokens: 8_193 } });
  assert.equal(proofUsage.usage.output_tokens, 8_193);
  assert.equal(proofUsage.output_plus_reasoning_token_ceiling, RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCTreatmentProofStreamState(), {
    type: "usage", usage: { inputTokens: 1, outputTokens: RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS + 1 },
  }), /ceiling/u);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "usage", usage: { inputTokens: 20_000, cacheReadTokens: 12_000, cacheWriteTokens: 769, outputTokens: 1 } }), /Input, cache-read, and cache-write/u);
  assert.throws(() => reduceRc7GateCStreamChunk(createRc7GateCStreamState(), { type: "usage", usage: { inputTokens: 1, outputTokens: 64_000, reasoningTokens: 64_001 } }), /Visible output plus separately reported reasoning/u);
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

test("a numeric provider HTTP status safely refines INTEGRATION without retaining status or provider prose", () => {
  const observations = { provider_posts: 1, refresh_posts: 0, provider_active_milliseconds: 25, automatic_retry_count: 0 };
  const error = new Rc7GateCWorkerError("PROVIDER_TERMINAL_REJECTED", "closed", {
    terminal_kind: "error",
    provider_failure_code: "INTEGRATION",
  });
  for (const [status, expected] of [[400, "INVALID_REQUEST"], [401, "AUTH"], [403, "PERMISSION"], [408, "TIMEOUT"], [429, "RATE_LIMIT"], [503, "UNAVAILABLE"]]) {
    assert.equal(liveCapsuleTest.classifyProviderHttpStatus(status), expected);
    const retained = liveCapsuleTest.closedFailureResultFromValidatedPreflight(error, { value: { authority_profile: "exact-matrix-request-diagnostic" } }, observations, status);
    assert.equal(retained.provider_failure_code, expected);
    assert.equal(retained.integration_failure_phase, null);
    assert.equal(Object.hasOwn(retained, "provider_http_status"), false);
    assert.doesNotMatch(canonicalJsonV1(retained), /provider prose|request[_ -]?id/u);
  }
  const streamFailure = liveCapsuleTest.closedFailureResultFromValidatedPreflight(error, { value: { authority_profile: "exact-matrix-request-diagnostic" } }, observations, 200);
  assert.equal(streamFailure.provider_failure_code, "INTEGRATION");
  assert.equal(streamFailure.integration_failure_phase, "PROVIDER_POST_ADMITTED");
  assert.equal(liveCapsuleTest.classifyProviderHttpStatus(null), null);
});

test("the real guarded-fetch path captures a synthetic status in-process and retains only its closed class", () => {
  const workerUrl = new URL("../../lib/recursus/rc7-rlm-gate-c-worker.mjs", import.meta.url).href;
  const capsuleUrl = new URL("../../lib/recursus/rc7-rlm-gate-c-live-capsule.mjs", import.meta.url).href;
  const code = `
    import { Rc7GateCWorkerError, buildRc7GateCSemanticRequest } from ${JSON.stringify(workerUrl)};
    import { __test } from ${JSON.stringify(capsuleUrl)};
    const semantic = buildRc7GateCSemanticRequest({ system_text: "system", user_text: "user", session_id: "a".repeat(64) });
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: async () => new Response("discarded-provider-body", { status: 401 }) });
    const guard = __test.installSingleUseFetchGuard(semantic);
    const adapterBody = {
      model: semantic.model,
      store: false,
      stream: true,
      instructions: semantic.system_text,
      input: [{ role: "user", content: [{ type: "input_text", text: semantic.user_text }] }],
      text: { verbosity: "low" },
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: semantic.session_id,
      tool_choice: "auto",
      parallel_tool_calls: true,
      reasoning: { effort: semantic.reasoning_effort, summary: "auto" },
    };
    await globalThis.fetch("https://chatgpt.com/backend-api/codex/responses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(adapterBody) });
    const observations = { ...guard.snapshot(), provider_active_milliseconds: 1, automatic_retry_count: 0 };
    const error = new Rc7GateCWorkerError("PROVIDER_TERMINAL_REJECTED", "closed", { terminal_kind: "error", provider_failure_code: "INTEGRATION" });
    const retained = __test.closedFailureResultFromValidatedPreflight(error, { value: { authority_profile: "exact-matrix-request-diagnostic" } }, observations, guard.providerHttpStatus());
    process.stdout.write(JSON.stringify({ internal_status: guard.providerHttpStatus(), retained }));
  `;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  const value = JSON.parse(run.stdout);
  assert.equal(value.internal_status, 401);
  assert.equal(value.retained.provider_failure_code, "AUTH");
  assert.equal(value.retained.integration_failure_phase, null);
  assert.equal(Object.hasOwn(value.retained, "provider_http_status"), false);
  assert.doesNotMatch(JSON.stringify(value.retained), /401|discarded-provider-body/u);
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
  assert.equal(
    liveCapsuleTest.createStreamStateForAcceptedBroker(accepted.handoff.broker).output_plus_reasoning_token_ceiling,
    RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  );

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
