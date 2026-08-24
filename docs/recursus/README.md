# Recursus Careers design documentation

This directory defines how Recursus Careers will extend the Career Ops workflow, how those differences will be tested, and which claims the evidence may support.

## Current status

The Career Ops application and execution routes remain unchanged from commit `bde5de661afbb72977a190e543ded24a72c9c86e`. RC-1, the offline [Benchmark Foundation v1](../../evals/recursus/README.md), is accepted through PR #1 with the root [structural verifier](../../verify-recursus-benchmark.mjs). The current RC-2 [v4 reference-capture registration](../../evals/recursus/rc2-claude-code-reference-v4/registration.json) is implemented locally from merged RC-1 revision `d2f2ad66133fa749e3b9b427b0de3dcad68d1295`. Its evidence contains one completed provider-free dry run and twelve actual attempts, exactly three for each registered scenario. All twelve actual attempts have terminal status `completed` and termination reason `none`; provider identity is `not_reported`, and the trusted runner envelope explicitly reported model `claude-sonnet-5`. Complete-set validation passes locally on Windows. Historical v1 through v3 evidence remains sealed. This does not integrate a Recursus execution route. The documents in this directory describe the intended integration and its acceptance criteria. They do not claim that the planned Recursus runtime behavior is already available. The [feature registry](features/REGISTRY.md) is the canonical current-status record.

The primary reference is **Career Ops through the Claude Code CLI**. Career Ops through the OpenAI Codex CLI is an existing compatibility route. The preferred future Recursus Careers configuration uses the Recursus and DSH runtime with the direct `openai-codex` provider adapter. It does not use the Codex CLI runner. The exact model is recorded separately, and the product is not defined by one runner, provider, or model.

## Documentation map

| Area | Purpose | Start here |
| --- | --- | --- |
| Delivery | Orders the implementation milestones and defines the next bounded task | [Roadmap](ROADMAP.md), then [Benchmark Foundation v1 specification](SPEC.md) |
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
- [Benchmark Foundation v1 specification](SPEC.md)
- [Codex kickoff prompt for the next milestone after acceptance](NEXT_TASK_PROMPT.md)
- [Benchmark protocol](benchmarks/PROTOCOL.md)
- [Scenario catalog](benchmarks/SCENARIO_CATALOG.md)
- [Metrics and advancement rules](benchmarks/METRICS_AND_PROMOTION.md)
- [Intended Recursus differences](architecture/INTENDED_DIFFERENCES.md)
- [Compiled prompt and context contract](architecture/PROMPT_CONTEXT_CONTRACT.md)
- [Initial feature registry](features/REGISTRY.md)

## Governing sources

- Current Career Ops runner behavior: [Claude wrapper](../../CLAUDE.md), [Codex guide](../CODEX.md), and [shared Career Ops router](../../.agents/skills/career-ops/SKILL.md)
- Recursus runtime status: [pinned Recursus README](https://github.com/OpenCnid/recursus/blob/63f3a966bbc4aefe03395043cae9fa13b3e207fe/README.md)
- Recursus runtime contract: [pinned Recursus specification](https://github.com/OpenCnid/recursus/blob/63f3a966bbc4aefe03395043cae9fa13b3e207fe/SPEC.md)

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

These pages explain product behavior and evaluation. Binding agent rules still belong in `AGENTS.md`, the selected mode files, or another instruction surface the active harness loads automatically.
