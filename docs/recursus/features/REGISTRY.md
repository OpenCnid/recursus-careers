# Initial feature registry

[Feature documentation](README.md) | [Intended differences](../architecture/INTENDED_DIFFERENCES.md) | [Benchmarks](../benchmarks/README.md)

This registry is the initial truth table for Recursus Careers. It should change with implementation and evidence, not with aspiration alone.

## Inherited Career Ops capabilities

| Feature | Primary owner | Component status | Available in Career Ops | Available through Recursus Careers | Recursus evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Offer evaluation and scoring | `career-ops` | inherited | Yes | No | unverified | Preserve Blocks A through F, Block G legitimacy, the risk summary, machine summary, and source boundary |
| Portal and ATS scanning | `career-ops` | inherited | Yes | No | unverified | Includes deterministic scanners and browser-dependent paths |
| CV, cover, email, and PDF artifacts | `career-ops` | inherited | Yes | No | unverified | Human review remains mandatory |
| Application tracker and integrity scripts | `career-ops` | inherited | Yes | No | unverified | Canonical files and status rules remain authoritative |
| Interview, follow-up, reply, and offer workflows | `career-ops` | inherited | Yes | No | unverified | Do not relabel inherited workflows as Recursus inventions |
| Company and contact research | `career-ops` | inherited | Yes | No | unverified | Recursus target is durable cross-role reuse, not basic research |
| Career Ops through Claude Code CLI | `career-ops` | inherited | Yes | No | canonical reference, no Recursus benchmark | Primary upstream reference route |
| Career Ops through OpenAI Codex CLI | `career-ops` | inherited | Yes | No | no Recursus benchmark | Existing compatibility route, not the preferred Recursus transport |
| Local web UI and TUI | `career-ops` | inherited | Yes | No | unverified | The web UI remains an upstream alpha surface |

## Intended Recursus capabilities

| Feature | Primary owner | Component status | Recursus Careers integration | Available through Recursus Careers | Intended enablement | Blocking milestone or work | Advancement evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Compiled prompt and context contract | `recursus-careers` | specified | not started | No | required | Context compiler and provider adapters | 100 percent structural parity across supported adapters |
| Durable project-scoped run graph | `recursus-runtime` | specified | not integrated | No | required | Recursus Milestone 2 | Restart, replay, concurrency, and recovery suite |
| Process, child, timer, and provider supervision | `recursus-runtime` | specified | not integrated | No | required | Recursus Milestone 3 | Explicit reconnect, lost-state, cancellation, and orphan tests |
| Evidence-gated completion | `recursus-runtime` and `recursus-careers` | specified | not integrated | No | required | Recursus Milestone 4 plus Career Ops gate definitions | Mandatory gates block premature and stale completion |
| Provider-neutral capability policy | `recursus-careers` and `dsh` | specified | not started | No | required | Career integration and adapter conformance | PN1 contract proof plus every adapter limitation recorded |
| Exact run manifest and provenance | `recursus-careers` | specified | not started | No | required | Run-state integration and evidence schema | Schema-valid manifest for every supported route |
| Durable delegated work graph | `recursus-runtime` and `dsh` | specified; DSH child capability exists | not integrated | No | opt-in until accepted | Recursus Milestone 5 | Ownership, conflict, budget, cancellation, and integration tests |
| Selective RLM research path | `rlm` and `recursus-careers` | implemented in external RLM component | not integrated | No | opt-in | Career-specific routing, containment, and artifact contract | Eligible-case ablation passes without safety or generic regression |
| Advisory Honcho memory | `honcho` and `recursus-careers` | implemented in external Honcho component | not integrated | No | off by default | Career-specific context and privacy integration | Benign, stale, poisoned, outage, and wrong-project cases pass |
| Dovetail workflow integration | `dovetail` and `recursus-careers` | implemented in external Dovetail component | not integrated | No | opt-in | Career workflow mapping and coordinator integration | Named skill ablation and actual child-topology evidence |
| Automatic model and route selection | `recursus-runtime` | specified | not integrated | No | off until ablations pass | Recursus Milestone 7 | Fixed-route baselines, routing accuracy, budget, and fallback evidence |
| Reusable company and lab intelligence | `recursus-careers` | planned | not started | No | planned | Career intelligence schema and storage | Longitudinal reuse, freshness, privacy, and quality evidence |
| Reusable relationship intelligence | `recursus-careers` and `honcho` | planned | not started | No | planned | Career relationship schema and advisory-memory boundary | Affiliation change, stale recall, source, and containment tests |
| Operator pause, resume, approval, and evidence UI | `recursus-runtime` and `recursus-careers` | specified | not integrated | No | planned | Recursus Milestone 8 and Career UI integration | Reconnect, accessibility, degraded-state, and authorization tests |

## Evidence infrastructure

| Feature | Primary owner | Component status | Recursus Careers integration | Available through Recursus Careers | Evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- |
| Benchmark Foundation v1 structural verifier | `recursus-careers` | implemented locally | not integrated | No | focused local structural tests | Validates schemas, exact fixture bytes, path containment, provenance locator resolution, and seeded-file oracle exclusion only. It executes no model, harness, workflow, or provider and produces no factuality, safety, quality, parity, advancement, or comparative result. |

## Known absent evidence

At this local RC-1 implementation point there is:

- no Recursus execution integration diff from the pinned Career Ops baseline;
- no demonstrated Career Ops execution through a Recursus profile;
- no Claude Code feature-parity result;
- no Recursus Careers RLM, Honcho, or Dovetail ablation;
- no same-model runtime comparison;
- no scoped better, safer, provider-neutral-in-behavior, or more-efficient claim;
- no evidence about callbacks, interviews, offers, or hiring outcomes.

## Advancement checklist

Before changing a row to `integrated`:

1. cite the owning implementation commit;
2. identify the supported user path;
3. link focused and failure-path tests;
4. link at least one complete integration result;
5. record platforms, providers, models, permissions, and limitations;
6. update the relevant benchmark scenarios;
7. confirm documentation, feature flags, install, upgrade, and rollback behavior;
8. retain old evidence when a status changes.
