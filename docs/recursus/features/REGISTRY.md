# Feature registry

[Feature documentation](README.md) | [Intended differences](../architecture/INTENDED_DIFFERENCES.md) | [Benchmarks](../benchmarks/README.md)

This registry is the current truth table for Recursus Careers. It changes with implementation and evidence, not with aspiration alone.

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
| Compiled prompt and context contract | `recursus-careers` | implemented | offline compiler boundary retained by the kept RC-5 route | No | required | Broader product and adapter integration | RC-4 V2 passed 100 percent of registered structural assertions across both offline targets on exact reviewed head `f086626ef344b59fa466e13eeeb3eccc1acd97fd`. RC-5 consumed the registered `oferta` bundles through its bounded route, but that does not establish general product integration or provider-observed parity. RC-6 closure did not widen this claim. |
| Disposable end-to-end product slice | `recursus-careers` | implemented and kept | bounded RC-5 evaluation route only; provider-free RC-6 hardening accepted for that retained route | No | bounded product value demonstrated | No supported product path yet | PR #15 head `287aeb08a83a132d20858bdd4dfd5e77f2ea2a9f` merged as `70e3058fee51e74a4cd6ee31a7869245d417cff5`. Three authorized cases completed with trusted HTTP 200, one request each, zero retries, OAuth refreshes, or external mutations, and no factual or safety correction. FACT-01 tied; FACT-03 and SAFE-01 won. Summary SHA-256 `a69a18dcdc1e939577cee66f3de4ad2b3f6884be8efcababbf3bc24f0689a0f4` recommends `KEEP`, which the user adopted. RC-6 later accepted only provider-free retained-surface hardening. Neither decision establishes production readiness or feature availability. |
| Durable project-scoped run graph | `recursus-runtime` | specified | not integrated | No | required | Recursus Milestone 2 | Restart, replay, concurrency, and recovery suite |
| Process, child, timer, and provider supervision | `recursus-runtime` | specified | not integrated | No | required | Recursus Milestone 3 | Explicit reconnect, lost-state, cancellation, and orphan tests |
| Evidence-gated completion | `recursus-runtime` and `recursus-careers` | implemented for the retained RC-6 route | accepted for the registered provider-free RC-6 validation executor; not integrated | No | required | Recursus Milestone 4 and supported-path integration | Corrective amendment `RC6-DEV-VALIDATION-EXECUTOR-V1-A1` produced external matrix C/D as byte-identical 23,477-byte deterministic captures, file SHA-256 `f0807d59b4771faa92ee26383058e3cae45429424270b67a38c3392b3da09921`, embedded SHA-256 `40f56c958cff8413806779cd76a95fcbb1e00caedee29775578a5596f31ebe60`; pre-amendment A/B are superseded. The captures record 7 already complete, 29 fail closed, 2 indeterminate stopped, and 2 safely resumable cases; zero provider calls or retries; three recomputed-digest usage mutations denied through inspect and recover; and exact dispatch, request, artifact, terminal, operator, and cleanup accounting. Focused tests passed 98/98, validation-executor tests 6/6, and 12 Recursus-only suites passed. PR #20 reviewed head `49224f231e3cdf5cedb526af00eab4feddd618b9` passed all 12 required CI checks and merged as `7db74cfc59537c8a9b08d3ea7e0dd38079b15cb5`. Original retained image `sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179` was unavailable and not executed, so its gate remains `not_run / blocked`. Acceptance is scoped to distinct executor `RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1`, mode `rc6_validation_executor_exact_provider_free`, and image `sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1`; it is not live-provider or production evidence. |
| Provider-neutral capability policy | `recursus-careers` and `dsh` | implemented for the retained RC-6 route | accepted as a closed policy representation for the registered provider-free lane; not integrated | No | required | Later adapter conformance and supported-path integration | Closed policy `rc6-oferta-zero-tool-provider-neutral-v1` was retained through the accepted RC-6 lane. No dependency was downloaded or installed for the exact-document synthetic credential shim, which cannot establish live credential-provider behavior or equivalence to accepted `@deepseek-ai/dsh-credentials-local`. The lane exercised only the pinned OpenAI Codex projection; one adapter cannot establish provider-neutral behavior. |
| Exact run manifest and provenance | `recursus-careers` | implemented for RC-3 evaluation route | evaluation route only | No | required | Product run-state integration and broader route coverage | V17 schema-valid manifest for the one registered direct route; every later supported route still requires its own evidence |
| Durable delegated work graph | `recursus-runtime` and `dsh` | specified; DSH child capability exists | not integrated | No | opt-in until accepted | Recursus Milestone 5 | Ownership, conflict, budget, cancellation, and integration tests |
| Selective RLM research path | `rlm` and `recursus-careers` | external RLM component implemented; RC-7 qualification, exact Gate-B containment seam, provider/DSH worker, contained RLM launcher, sealed results pipeline, and exact scorer are implemented locally | not integrated or promoted; RC-7 Gate C is closed with terminal `STOP` after the complete v25 synthetic comparison | No | off after stopped investigation | A future investigation requires a new bounded milestone and preregistration; RC-7 evidence cannot authorize a repair, rerun, supported route, or deployment | Gate A passed 59/59 with `QUALIFIED_FOR_ABLATION`; Gate B passed 69/69 as `CONTAINMENT_CONFORMANT` for its exact frozen boundary. V15 completed one non-matrix contained `LAB-01` treatment. V25 then sealed all 36 top-level attempts and 72 request terminals with 29 verified completions, nine RLM invocations, 36 children, seven zero-score treatment failures, zero generic RLM invocations, zero retries, zero cleanup residue, and exact authority within budget. Aggregate `e0d74c7191697938e5071b1f157d6eaa68615baf27ab1ab1ca79c5dd3016cf7e` recorded -29.6296 eligible mean improvement and one direct `FACT-01` `fabricated-candidate-fact` critical failure, which forced `STOP`. This is neither `NO_RLM` nor evidence for RLM usefulness, product integration, comparable cost, production containment, or hiring impact. |
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

At the closed RC-7 Gate C boundary there is:

- no accepted product integration of the V17 evaluation bridge into Career Ops;
- no supported Recursus Careers product integration; RC-5 produced one bounded learning result that the user kept, but its historical live evidence does not establish production readiness;
- no Claude Code feature-parity result;
- one complete stopped synthetic `rc-direct` versus `rc-rlm` comparison, but no accepted or supported Recursus Careers RLM, Honcho, or Dovetail product integration;
- no same-model runtime comparison;
- no complete Recursus Milestone 1 or current-pin Linux double-build, profile, smoke, and clean-machine acceptance evidence;
- no execution evidence for the retained RC-5 image on the replacement host, no reproducible-build proof for the selected RC-6 validation image, and no validation of live credential-provider behavior or equivalence between the exact-document synthetic substitute and accepted `@deepseek-ai/dsh-credentials-local`;
- no product claim that a Career Ops RLM bottleneck was solved, no product-integrated RLM route, and no authority to treat the v25 `STOP` result as `KEEP_RLM_CANDIDATE`, `REBUILD_RLM_CANDIDATE`, or `NO_RLM`;
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
