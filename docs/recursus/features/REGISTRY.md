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
| Career Ops through Claude Code CLI | `career-ops` | inherited | Yes | No | accepted RC-2 v4 has one dry run and twelve actual attempts; no Recursus benchmark | All twelve actual attempts completed the capture contract under two preregistered deviations; no oracle or comparative evaluation was run |
| Career Ops through OpenAI Codex CLI | `career-ops` | inherited | Yes | No | no Recursus benchmark | Existing compatibility route, not the preferred Recursus transport |
| Local web UI and TUI | `career-ops` | inherited | Yes | No | unverified | The web UI remains an upstream alpha surface |

## Intended Recursus capabilities

| Feature | Primary owner | Component status | Recursus Careers integration | Available through Recursus Careers | Intended enablement | Blocking milestone or work | Advancement evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Compiled prompt and context contract | `recursus-careers` | implemented | offline compiler boundary only | No | required | RC-5 disposable product slice | RC-4 V2 passed 100 percent of registered structural assertions across both offline targets on exact reviewed head `f086626ef344b59fa466e13eeeb3eccc1acd97fd`; product integration and behavioral evidence remain absent |
| Disposable end-to-end product slice | `recursus-careers` | scaffolded | provider-free ordered-parts transport and bounded executor validated | No | provider-free compatible; live conformance pending | Obtain fresh exact authority, then run FACT-01 once; continue RC-5, not RC-6 | The rebuild continuation pins direct-adapter revision `2fc02090af1632b86ee1175a6720904dfd71081c` above the exact accepted V17 parent and bounded executor image `sha256:9b9c9e77482ce9e474f3dcd18301d16efbf279cb2918ddeb5a794ad6d960c887` above that. Exact worker and one-tunnel proxy sources, immutable image use, durable create-only reservation and dispatch records, a ten-minute host deadline with reserved cleanup headroom, and no public executor-injection path are registered. Two fresh preparations were byte-identical across all 13 files and share plan digest `9af508cf31529f70c49c0086d8e4a5fc33433586c1954d0ebbe4582bf060fc69`. Networkless fake-fetch probes validate each complete nine-item `S,S,S,S,U,U,U,U,S` payload, exact endpoint, 4,000-token cap, absent `instructions` and tools, one request per case, and one-request 503 failure with no retry; no credential mount or provider call occurred. Live trailing-system acceptance and usefulness remain unproven, and no frozen route, treatment observation, benchmark, decision, or superiority claim exists. |
| Durable project-scoped run graph | `recursus-runtime` | specified | not integrated | No | required | Recursus Milestone 2 | Restart, replay, concurrency, and recovery suite |
| Process, child, timer, and provider supervision | `recursus-runtime` | specified | not integrated | No | required | Recursus Milestone 3 | Explicit reconnect, lost-state, cancellation, and orphan tests |
| Evidence-gated completion | `recursus-runtime` and `recursus-careers` | specified | not integrated | No | required | Recursus Milestone 4 plus Career Ops gate definitions | Mandatory gates block premature and stale completion |
| Provider-neutral capability policy | `recursus-careers` and `dsh` | specified | not started | No | required | Career integration and adapter conformance | PN1 contract proof plus every adapter limitation recorded |
| Exact run manifest and provenance | `recursus-careers` | implemented for RC-3 evaluation route | evaluation route only | No | required | Product run-state integration and broader route coverage | V17 schema-valid manifest for the one registered direct route; every later supported route still requires its own evidence |
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
| Benchmark Foundation v1 structural verifier | `recursus-careers` | implemented | not integrated | No | focused structural tests plus Ubuntu, macOS, and Windows CI | Validates schemas, exact fixture bytes, path containment, provenance locator resolution, and seeded-file oracle exclusion only. It executes no model, harness, workflow, or provider and produces no factuality, safety, quality, parity, advancement, or comparative result. |
| Claude Code reference capture v4 | `recursus-careers` | implemented | not integrated | No | accepted through PR #2 after focused RC-2 tests passed Ubuntu, macOS, and Windows CI; one Windows provider-free dry run and twelve Windows actual attempts are validated | Captures single-route synthetic process and artifact facts only. Provider identity is `not_reported`; model `claude-sonnet-5` was explicitly reported by the trusted runner envelope. No oracle or Recursus comparison was run. Historical v1 through v3 evidence remains append-only. |
| Minimal Recursus execution bridge v17 | `recursus-careers` | implemented | evaluation route only | No | two matching provider-free checks, one validated official external dry run, one validated fresh-seed actual attempt, strict schemas, independent validator, immutable nine-file build context, complete HTML5 entity decoding, focused positive, negative, denial, overwrite, attestation, chronology, cleanup, leakage, transformed-content, staging-topology, pre-persistence artifact-budget, false-input-validation, and real mutation tests, and exact implementation CI on Ubuntu, macOS, and Windows | Registers exact Recursus, DSH, adapter, model, runner, harness, authority, policies, budgets, seed, source closure, image, and evidence identity. The actual route used one DSH request and one direct-adapter invocation and returned a normalized result plus runner-attested manifest. V1 through V16 remain historical contract records. V1 had no materialized executable source closure to archive; existing V2 through V15 executable sources and V4 through V15 focused tests are operator-archived and not shipped. V10 and V12 through V15 were rejected after review, V11 stopped before provider invocation, and V16 remains a valid historical route pinned to the predecessor Recursus revision. The selected V17 Recursus revision passed exact Ubuntu and Windows CI; Recursus Milestone 1 and current-pin Linux acceptance evidence remain incomplete. Exact Careers implementation commit `7fe377863dc8b6b5cc584fe5225fb8a6f837b695` passed Ubuntu, macOS, Windows, security, regression, visual, guard, and dependency CI in PR #4, so RC-3 is accepted. This is execution-route conformance, not product integration, prompt or feature parity, quality, safety, advancement, or comparison evidence. |
| RC-4 offline prompt and context compiler v2 | `recursus-careers` | implemented | offline compiler boundary only | No | accepted through PR #6 after exact reviewed head `f086626ef344b59fa466e13eeeb3eccc1acd97fd` passed Ubuntu, macOS, Windows, CodeQL, dependency review, guard, upgrade regression, and visual checks | For registered synthetic fixtures only, compiles four pilot mode contracts to two inspectable offline route-delivery bundles and inverse-decodes their structural semantics. Frozen V1 remains rejected and byte-identical. Structural prompt and context parity validation makes no runner, provider, model, workflow behavior, factuality, safety, quality, feature-parity, or comparative claim. |

## Known absent evidence

At the accepted RC-4 boundary there is:

- no accepted product integration of the V17 evaluation bridge into Career Ops;
- no Recursus Careers product integration or kept RC-5 learning result; the current rebuild continuation is provider-free compatible but has made no provider request;
- no Claude Code feature-parity result;
- no Recursus Careers RLM, Honcho, or Dovetail ablation;
- no same-model runtime comparison;
- no complete Recursus Milestone 1 or current-pin Linux double-build, profile, smoke, and clean-machine acceptance evidence;
- no scoped better, safer, provider-neutral-in-behavior, or more-efficient claim; and
- no evidence about callbacks, interviews, offers, or hiring outcomes.

## Advancement checklist

This checklist applies when a kept slice is promoted to an `integrated` product status. It is not required to build or discard the bounded RC-5 learning slice.

Before changing a row to `integrated`:

1. cite the owning implementation commit;
2. identify the supported user path;
3. link focused and failure-path tests;
4. link at least one complete integration result;
5. record platforms, providers, models, permissions, and limitations;
6. update the relevant benchmark scenarios;
7. confirm documentation, feature flags, install, upgrade, and rollback behavior;
8. retain old evidence when a status changes.
