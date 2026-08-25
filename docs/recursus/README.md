# Recursus Careers design documentation

This directory defines how Recursus Careers will extend the Career Ops workflow, how those differences will be tested, and which claims the evidence may support.

## Current status

The Career Ops application and execution routes remain unchanged from commit `bde5de661afbb72977a190e543ded24a72c9c86e`. RC-1, the offline [Benchmark Foundation v1](../../evals/recursus/README.md), is accepted through PR #1 with the root [structural verifier](../../verify-recursus-benchmark.mjs). RC-2 [v4 reference capture](../../evals/recursus/rc2-claude-code-reference-v4/registration.json) is accepted through PR #2 from merged RC-1 revision `d2f2ad66133fa749e3b9b427b0de3dcad68d1295`. Its evidence contains one completed provider-free dry run and twelve actual attempts captured on Windows, exactly three for each registered scenario. Under preregistered deviations `RC2-DEV-CONTENT-ONLY` and `RC2-DEV-HOST-PREFLIGHT`, all twelve actual attempts have terminal status `completed` and termination reason `none`; provider identity is `not_reported`, and the trusted runner envelope explicitly reported model `claude-sonnet-5`. Exact reviewed implementation head `e50e787149e7e15aac373e1bc7981a1fbcd65795` passed the full repository suite on Ubuntu, macOS, and Windows, together with the required security and regression checks. Complete-set validation passes on the capture host. The V4 evidence-root README is a hash-bound preregistration snapshot and retains its pre-attempt status text; the append-only ledger and this overview state the current result. Historical v1 through v3 evidence remains sealed. RC-3 adds a separate evaluation route beside the unchanged product workflow. It is not a Career Ops product integration or feature-parity claim. The [feature registry](features/REGISTRY.md) is the canonical current-status record.

The primary reference is **Career Ops through the Claude Code CLI**. Career Ops through the OpenAI Codex CLI is an existing compatibility route. The preferred future Recursus Careers configuration uses the Recursus and DSH runtime with the direct `openai-codex` provider adapter. It does not use the Codex CLI runner. The exact model is recorded separately, and the product is not defined by one runner, provider, or model.

RC-3 is `accepted` through PR #4. Exact implementation commit `7fe377863dc8b6b5cc584fe5225fb8a6f837b695` passed Ubuntu, macOS, Windows, security, regression, visual, guard, and dependency CI. The active versioned [`recursus-direct-v17` contract](../../evals/recursus/rc3-recursus-direct-v17/README.md) registers Recursus, DSH, the direct `openai-codex` adapter, `gpt-5.6-sol`, configured-catalog snapshot identity, and `xhigh` reasoning for one `FACT-01` attempt. Its offline path starts from the accepted RC-1 seed, constructs the registered bridge input, captures a bounded synthetic artifact, normalizes it, emits a content-safe trace and runner manifest, and independently validates external evidence. Two independent V17 dry checks match exactly. The official external evidence contains one completed dry run and one completed fresh-seed actual attempt with termination reason `none`.

The actual route ran only through the explicit V17 capture command. It used a content-addressed read-only container, a fresh read-only seed, a dedicated writable credential mount managed by the configured runtime, a networkless worker namespace, and a host-owned CONNECT allowlist for `auth.openai.com:443` and `chatgpt.com:443`. The validated manifest records one DSH request, one direct-adapter invocation, one registered application fetch, one trusted terminal event, one 390-byte text artifact, strict successful cleanup checks, no denied or unregistered access, and no unexpected mutation. The configured runtime read and used the OAuth grant; host and runner code did not inspect credential values, and no credential value entered evidence. V1 through V16 remain preserved historical contract records. V1 had no materialized executable source closure to archive. The existing V2 through V15 executable sources and V4 through V15 focused tests were placed in an operator-verified local archive and pruned from the current checkout, so their recorded commands are not runnable here. The [archive record](RC3_ARCHIVE_RECORD.md) qualifies exactly what was verified. V10 and V12 through V15 were rejected after review; V11 stopped before runtime or provider invocation. V16 remains an independently valid historical execution record pinned to the superseded Recursus revision. The selected V17 Recursus revision passed exact post-merge Ubuntu and Windows CI. Separately, Recursus Milestone 1 and current-pin Linux double-build, profile, smoke, and clean-machine acceptance evidence remain incomplete. Exact Careers implementation commit `7fe377863dc8b6b5cc584fe5225fb8a6f837b695` passed the required Windows and supported CI in PR #4, so RC-3 is `accepted`. RC-4 is `accepted` through PR #6. Exact implementation head `f086626ef344b59fa466e13eeeb3eccc1acd97fd` passed the required Ubuntu, macOS, Windows, security, regression, visual, guard, and dependency checks. RC-4 remains a provider-free compiler-boundary result, not product integration or comparative evidence.

## Documentation map

| Area | Purpose | Start here |
| --- | --- | --- |
| Delivery | Defines the fast, bounded delivery loop and the next disposable product slice | [Roadmap](ROADMAP.md), then [RC-5: Disposable end-to-end value slice](ROADMAP.md#rc-5-disposable-end-to-end-value-slice) |
| Benchmarks | Defines the comparison routes, scenarios, metrics, controls, and advancement rules | [Benchmark overview](benchmarks/README.md) |
| Architecture | Defines ownership, runtime boundaries, intended differences, and prompt compilation | [Architecture overview](architecture/README.md) |
| Features | Records feature ownership, maturity, evidence, limitations, and advancement criteria | [Feature documentation](features/README.md) |

## Reading paths

| If you are... | Read... |
| --- | --- |
| A director or product leader | [Current feature registry](features/REGISTRY.md), then [intended differences](architecture/INTENDED_DIFFERENCES.md) |
| A recruiter or hiring leader | [Measured quality and claim limits](benchmarks/METRICS_AND_PROMOTION.md), then the [scenario catalog](benchmarks/SCENARIO_CATALOG.md) |
| An engineer or researcher | [Architecture](architecture/README.md), [prompt contract](architecture/PROMPT_CONTEXT_CONTRACT.md), and [benchmark protocol](benchmarks/PROTOCOL.md) |

Supporting documents:

- [Recursus Careers roadmap](ROADMAP.md)
- [Accepted RC-4 compiled prompt and context parity specification](SPEC.md)
- [Historical Codex kickoff prompt for RC-4](RC4_NEXT_TASK_PROMPT.md)
- [RC-3 source and component selection](RC3_SOURCE_SELECTION.md)
- [Historical Codex kickoff prompt for RC-3](NEXT_TASK_PROMPT.md)
- [Benchmark protocol](benchmarks/PROTOCOL.md)
- [Scenario catalog](benchmarks/SCENARIO_CATALOG.md)
- [Metrics and advancement rules](benchmarks/METRICS_AND_PROMOTION.md)
- [Intended Recursus differences](architecture/INTENDED_DIFFERENCES.md)
- [Compiled prompt and context contract](architecture/PROMPT_CONTEXT_CONTRACT.md)
- [Initial feature registry](features/REGISTRY.md)

## Delivery approach

Starting with RC-5, delivery uses bounded vertical slices. Define the smallest useful user path and its blast radius, build it, test it immediately on three to five representative jobs against ordinary Career Ops, and then choose `KEEP`, `REBUILD`, or `DELETE`. A disposable learning slice needs only enough specification to bound authority, cost, writes, and the decision signal. It does not need release-grade preregistration or a full evidence matrix.

Full freezing, repeat matrices, cross-platform evidence, and formal promotion thresholds return before a successful slice is promoted into a supported path, before a public comparative claim or release, or when work crosses a sensitive data, action, or security boundary. A learning slice may not submit an application, send a message, or perform another external mutation without separate explicit authorization.

## Governing sources

- Current Career Ops runner behavior: [Claude wrapper](../../CLAUDE.md), [Codex guide](../CODEX.md), and [shared Career Ops router](../../.agents/skills/career-ops/SKILL.md)
- RC-3 runtime and component source decision: [RC-3 source selection](RC3_SOURCE_SELECTION.md)
- Recursus runtime status: [pinned Recursus README](https://github.com/OpenCnid/recursus/blob/d6d25dda3951e46fe1b03ec3cecc3f348bfe2346/README.md)
- Recursus runtime contract: [pinned Recursus specification](https://github.com/OpenCnid/recursus/blob/d6d25dda3951e46fe1b03ec3cecc3f348bfe2346/SPEC.md)

## Documentation rules

Every capability is described with three independent fields:

1. **Owner:** Career Ops, Recursus Careers, Recursus runtime, DSH, RLM, Honcho, Dovetail, or a provider adapter.
2. **Implementation:** one value from the canonical [implementation vocabulary](features/README.md#implementation-status).
3. **Evidence:** one value from the canonical [evidence vocabulary](features/README.md#evidence-status).

An implementation label never substitutes for evidence. A component capability is not a Recursus Careers feature until the Career Ops workflow can reach it through a tested path.

## Claim boundary

Until the comparative benchmark protocol is executed, use language such as:

- "designed to improve"
- "intended difference"
- "specified, not integrated"
- "unmeasured against Career Ops on Claude Code"

Do not describe Recursus Careers as better, safer, provider-neutral in behavior, or more efficient without the named evidence required by [Metrics and advancement](benchmarks/METRICS_AND_PROMOTION.md).

RC-1 validates structure and fixture integrity only. No model or harness was executed. Oracle isolation was proven for the seeded file set, not for a future process with broader filesystem authority. No candidate-claim factuality or action safety was evaluated. No comparison with Career Ops through Claude Code or Codex was performed. No result supports a claim that Recursus Careers is better, safer, faster, cheaper, or feature complete.

RC-2 records single-route process and artifact facts only. No output was compared with evaluator-only oracle material. No candidate-claim factuality, action safety, application quality, CAQ, human-review score, feature parity, advancement, comparative performance, or hiring outcome was calculated. Provider or model identity is never inferred from the Claude Code runner name. A provider response, process exit, or model statement is not verified completion. Hashes establish byte identity only. Dry-run determinism covers the local capture pipeline, not provider behavior. Raw Claude stream envelopes are not retained, so the independent validator cannot later reparse terminal, model, or usage observations. `workspace_unchanged` covers only the monitored isolated workspace. Provider-only egress is a configured policy, not packet-level proof, and `provider_request: not_observed` is not proof that no provider request occurred.

RC-3 evidence establishes local execution-route conformance for one pinned `FACT-01` seed and one pinned direct-adapter configuration. It includes deterministic local bridge construction and one independently validated actual runner attestation. It does not compare output with the oracle or another route. No oracle evaluation, human review, scoring, prompt parity, feature parity, factuality, safety, quality, advancement, comparison, application, or hiring outcome is part of RC-3. Hashes establish byte identity only.

These pages explain product behavior and evaluation. Binding agent rules still belong in `AGENTS.md`, the selected mode files, or another instruction surface the active harness loads automatically.
