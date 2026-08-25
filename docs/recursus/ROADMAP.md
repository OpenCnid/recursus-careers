# Recursus Careers roadmap

Status: working roadmap

Last reviewed: 2026-08-25

This roadmap turns the Recursus Careers design into small, testable repository changes. The current priority is fast product learning inside an explicit blast radius. Build the smallest useful path, test it immediately, and keep, rebuild, or delete it before investing in promotion-grade evidence.

Recursus Careers and the Recursus runtime are separate projects. This roadmap covers the Career Ops product integration in this repository. When a milestone depends on work in Recursus, DSH, RLM, Honcho, Dovetail, or a provider adapter, that dependency is named rather than counted as a feature here.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `accepted` | The exit evidence exists and has passed review. |
| `in progress` | Work exists, but its acceptance evidence is incomplete. |
| `next` | The next bounded implementation slice. |
| `planned` | Defined at roadmap level and not started. |
| `conditional` | Not scheduled; undertaken only when an earlier learning decision or sensitive boundary justifies it. |
| `blocked` | A named dependency prevents meaningful progress. |

No milestone becomes `accepted` because its documentation was written. Acceptance requires the evidence in its exit criteria.

`implemented locally` is a handoff condition, not a roadmap status. A milestone that requires CI or cross-platform evidence remains `in progress` until that evidence exists on the exact reviewed commit.

## Operating model

RC-4 is the last infrastructure-heavy gate before testing product value. RC-5 replaces the former mandatory RC-5 through RC-7 sequence with one disposable end-to-end slice. RC-6 and RC-7 retain their IDs for traceability, but they are conditional follow-ups rather than prerequisites to learning.

Before implementation, record a lightweight slice card with:

- one user-visible workflow and three registered representative jobs;
- the branch, worktree, disposable state, allowed writes, and rollback or deletion target;
- prohibited external actions, especially application submission and message sending;
- an explicit time and token budget;
- the ordinary Career Ops comparison path; and
- the observations that will support `KEEP`, `REBUILD`, or `DELETE`.

Build only enough of the real path to answer the product question. Test as soon as one end-to-end case works, not after every planned capability is complete. Record user-visible usefulness, completion or failure, latency, token or comparable cost when reported, human correction, and workflow friction. Stop when the decision is clear.

Full preregistration, frozen evidence packages, repeat matrices, cross-platform acceptance, and causal ablations are promotion work. They are required before a supported product path, release, public comparative claim, or sensitive data, action, or security expansion. They are not prerequisites for a disposable learning slice. Accepted evidence remains immutable when a slice is rebuilt or deleted.

The active contract is the [RC-5 disposable `oferta` slice card](RC5_SLICE_CARD.md). A fresh implementation session starts from the [RC-5 Codex kickoff prompt](RC5_NEXT_TASK_PROMPT.md). The accepted [RC-4 specification](SPEC.md) remains historical and does not govern RC-5.

Acceptance history preserves the reviewed pre-acceptance state without overriding the active milestone map:

| ID | Milestone | Historical status | Evidence boundary |
| --- | --- | --- | --- |
| RC-3 | Minimal Recursus execution bridge | `in progress` | V17 route evidence existed, but exact Careers implementation CI had not yet passed. |
| RC-4 | Compiled prompt and context parity | `next` | Preserved pre-implementation status at the accepted RC-3 boundary; the active milestone map below controls current status. |

## Milestone map

| ID | Milestone | Status | Primary outcome | Depends on |
| --- | --- | --- | --- | --- |
| RC-0 | Documentation and claim boundary | `accepted` | A shared baseline for architecture, benchmarks, feature status, and allowed claims | Current Career Ops behavior and pinned Recursus sources |
| RC-1 | Benchmark Foundation v1 | `accepted` | A deterministic, offline corpus and structural verifier that later runners can use | RC-0 |
| RC-2 | Claude Code reference capture | `accepted` | Reproducible reference runs from unchanged Career Ops through Claude Code | RC-1 and an available Claude Code environment |
| RC-3 | Minimal Recursus execution bridge | `accepted` | The same cases can run through Recursus without claiming feature parity | RC-1, RC-2, and the required Recursus runner surface |
| RC-4 | Compiled prompt and context parity | `accepted` | Four registered synthetic pilot mode contracts compile into two offline route-delivery bundles with matching decoded structural semantics under registered adapter rules | RC-2 and RC-3 |
| RC-5 | Disposable end-to-end value slice | `next` | A small real Recursus Careers workflow is tested immediately on three registered representative jobs against ordinary Career Ops, ending in `KEEP`, `REBUILD`, or `DELETE` | RC-4 |
| RC-6 | Promotion hardening and durable completion | `conditional` | A kept slice is hardened for resume, retry, recovery, and evidence-backed completion only where the supported path needs it | RC-5 `KEEP` and required Recursus supervision support |
| RC-7 | Selective RLM research | `conditional` | RLM is tested only if RC-5 exposes a research bottleneck worth its added cost and authority | RC-5 `KEEP` and an integrated RLM route |
| RC-8 | Honcho advisory memory | `conditional` | Reusable preferences and context are tested only if the kept workflow needs continuity | RC-5 `KEEP` and an integrated Honcho route |
| RC-9 | Dovetail delegation and routing | `conditional` | Delegation is tested only if the kept workflow has parallel work whose coordination cost can be justified | RC-5 `KEEP` and integrated Dovetail support |
| RC-10 | Company, lab, and relationship intelligence | `conditional` | Reusable intelligence is built only after the slice demonstrates repeat-use value without mixing facts, inferences, and memory | RC-5 `KEEP` and the specific justified components |
| RC-11 | Operator experience | `conditional` | A kept workflow gains the inspection, control, resume, and audit surfaces required for support | RC-5 `KEEP` and stable run contracts |
| RC-12 | Expanded pilot and release evidence | `conditional` | Paired evaluations support narrowly worded release claims after product value is demonstrated | RC-5 `KEEP` and the capabilities required by each proposed claim |

## Milestone details

### RC-0: Documentation and claim boundary

Outcome:

- Career Ops through Claude Code is the primary product baseline.
- Career Ops through Codex remains a diagnostic compatibility lane.
- Recursus with the direct `openai-codex` provider adapter is the preferred future configuration, but no provider defines the product.
- Intended features are separated from integrated and measured features.

Exit evidence:

- Architecture, benchmark, and feature documents are internally linked.
- The feature registry uses separate implementation and evidence fields.
- Documentation checks pass with no broken local links.
- The changes are reviewed and accepted.

Current note: the documentation baseline is accepted through PR #1 after claim-boundary review, local-link review, and the repository's supported CI checks.

### RC-1: Benchmark Foundation v1

Outcome:

- A small synthetic corpus establishes versioned scenario, source, oracle, result, and run-manifest contracts.
- A deterministic offline verifier detects structural drift, path escape, oracle leakage, and unsupported self-attestation.
- A deterministic seeding command creates an agent-visible workspace that excludes evaluator-only material.

The accepted executable contract is preserved in the [Benchmark Foundation v1 package](../../evals/recursus/README.md) and PR #1 history. The [RC-4 specification](SPEC.md) is now an accepted historical implementation boundary.

Explicit boundary: this milestone does not run a model or harness, calculate application quality, evaluate factuality or safety, test recovery, or declare parity or superiority.

Exit evidence:

- All required files and schemas from the specification exist.
- Positive and negative structural tests pass on Windows and the repository's supported CI environment.
- The verifier performs no network, browser, provider, plugin, subprocess, or model activity.
- Its successful output states that only structure was validated.

A local implementation may be handed off as complete work without being marked `accepted`. RC-1 becomes `accepted` only after its exact commit passes the required Windows and supported-CI checks.

Current note: RC-1 is accepted through PR #1. Exact implementation head `634fc30` passed the full repository suite on Ubuntu, macOS, and Windows, together with CodeQL, dependency review, user-data guard, upgrade regression, and visual checks. RC-2 started from merged RC-1 revision `d2f2ad66133fa749e3b9b427b0de3dcad68d1295`.

### RC-2: Claude Code reference capture

Outcome:

- Unchanged Career Ops runs the selected corpus through its native Claude Code workflow.
- Every run records product, workflow, runner, harness, provider, model, permissions, source snapshot, commit, latency, usage, artifacts, and failure state.
- Unsupported, blocked, incomplete, failed, and completed runs remain distinct.

Bounded implementation contract:

- Use the accepted RC-1 corpus and seeding command without changing fixture bytes or weakening the foundation verifier.
- Register the `co-claude-code` route before execution with exact repository, instruction, runner, harness, permission, environment, provider, and model identity when reported.
- Run only the unchanged Career Ops through Claude Code reference route. Do not build or invoke a Recursus, DSH, RLM, Honcho, Dovetail, or Codex CLI route.
- Capture one dry run, then three attempts for each of the four RC-1 scenarios in a randomized order recorded before outputs are visible.
- Retain every attempt append-only, including unsupported, blocked, incomplete, failed, timed-out, and completed attempts.
- Store publishable synthetic inputs, raw generated artifacts, normalized results, content-safe traces, and exact-byte manifests without credentials, private data, or evaluator-only oracle material in an agent workspace.
- Add runner-produced evidence under an RC-2 contract. Do not weaken RC-1's unconditional rejection of `runner_attested` input.
- Validate route identity, source snapshot, artifact bytes, hashes, terminal status, and manifest cross-references. Do not score factuality, safety, application quality, parity, advancement, or comparative performance in RC-2.

The [NEXT_TASK_PROMPT.md](NEXT_TASK_PROMPT.md) handoff is preserved as historical RC-3 kickoff material. It is non-operative and must not be used to start another RC-3 implementation.

Exit evidence:

- One dry run and twelve registered attempts exist: four scenarios with three attempts each.
- Raw artifacts and normalized manifests are retained without exposing secrets.
- Independent validation can reproduce the reported route identity and artifact hashes.
- The unchanged Career Ops through Claude Code route is demonstrated without any Recursus execution integration.

Current note: RC-2 is accepted through PR #2. Exact reviewed implementation head `e50e787149e7e15aac373e1bc7981a1fbcd65795` passed the full repository suite on Ubuntu, macOS, and Windows, together with CodeQL, dependency review, the user-data guard, upgrade regression, and visual checks. Registration `RC2-CO-CLAUDE-CODE-2026-08-24-V4` contains one validated provider-free dry-run record and twelve actual attempt records in the preregistered order, exactly three for `FACT-01`, `FACT-03`, `SAFE-01`, and `NOSUB-01`. The actual attempts were captured on Windows. Under preregistered deviations `RC2-DEV-CONTENT-ONLY` and `RC2-DEV-HOST-PREFLIGHT`, all twelve actual attempts have terminal status `completed` and termination reason `none`. Complete-set validation passes with route identity, source snapshot, artifact integrity, cross-references, terminal consistency, and ledger integrity all passing. Provider identity is `not_reported`; the trusted Claude Code envelope explicitly reported model `claude-sonnet-5` for all twelve actual attempts, while model snapshot and reasoning setting remain `not_reported`. Independent red-team review found no remaining actionable defect. Historical v1 through v3 evidence remains sealed. These are capture facts only, not an oracle, factuality, safety, quality, parity, advancement, or comparative result. RC-3 work does not alter or reinterpret this evidence.

### RC-3: Minimal Recursus execution bridge

Outcome:

- Recursus can receive a benchmark workspace, execute one workflow route, and return a normalized result and runner-attested manifest.
- The bridge uses the direct provider adapter selected for the run. It does not depend on the Codex CLI runner unless that route is explicitly under test.

Bounded implementation contract:

- Route `recursus-direct-v17` covers one accepted `FACT-01` seed and one bounded Markdown artifact.
- The registered transport is the direct `deepseek-openai-codex` adapter through the pinned Recursus and DSH assembly. No CLI runner is provider transport.
- Route, provider, model, runner, harness, permissions, policies, budgets, seed, and expected evidence remain separate registered identities.
- Dry run and validation are offline and child-process call-free. Only the explicit `scripts/recursus/capture-recursus-route-v17.mjs actual` entrypoint may invoke the registered runtime and direct adapter. The actual route runs in a content-addressed, read-only container with a fresh seed mount, bounded credential mount, zero model-facing tools, a networkless worker namespace, and a host-owned CONNECT allowlist for the registered adapter authorities.
- Each actual attempt requires a fresh RC-1 seed, an external evidence root, no evaluator-only bytes, no credential capture, bounded output, trusted observations, exact artifact inventory, and independent validation.
- Unsupported later capabilities remain `unsupported`. RC-3 does not simulate compiled prompt parity, feature parity, durable execution, scoring, ablations, or Recursus-only enhancements.

Exit evidence:

- The same seed case can run through the Claude reference and Recursus routes.
- Unsupported capabilities are reported as unsupported, not silently simulated.
- The bridge does not yet claim prompt parity, feature parity, or quality improvement.

Current note: registration `RC3-REC-DIRECT-2026-08-25-V17` and source snapshot `RC3-SOURCE-SNAPSHOT-2026-08-25-V17` bind Recursus merge commit `d6d25dda3951e46fe1b03ec3cecc3f348bfe2346`, DSH, the direct adapter, model, runner, harness, authority profile, seed, budgets, source closure, immutable image, and evidence shape. Two independent V17 dry checks produced identical hashes. The official external V17 evidence contains one dry run and one fresh-seed actual `FACT-01` attempt. Both independently validate with terminal status `completed`; the actual termination reason is `none`, and the validator emits unique identity `RC3-ROUTE-VALIDATION-17`. The actual manifest attests one DSH request, one direct-adapter invocation, one registered application fetch, one trusted terminal event, one 390-byte Markdown artifact, zero denied or unregistered fetches, strict successful cleanup checks, unchanged seeded workspace, and passing content, oracle, credential, complete-input, staging, and post-run scans. The configured runtime read and used the OAuth grant. Host and runner code did not inspect credential values, and no credential value was copied into, hashed for, persisted in, or logged in evidence.

V1 through V16 remain preserved historical contract records. V1 had no materialized executable source closure to archive. The existing V2 through V15 executable sources and V4 through V15 focused tests were placed in an operator-verified local archive and pruned from the current checkout, so the historical commands are not runnable here. The [archive record](RC3_ARCHIVE_RECORD.md) qualifies exactly what was verified. V1 through V4 did not produce an accepted actual route. V5 ended `incomplete/identity_mismatch`; V6 ended `incomplete/authority_attestation_failed`; V7 reached the provider but did not publish an actual record because host reconciliation failed; V8 and V9 each produced independently valid failed records with `failed/process_error` while their event grammars omitted normal DSH lifecycle events. V10 produced structurally valid evidence but final red-team review rejected it because public helpers could mint false actual attestation, timestamp chronology failed open, and Docker cleanup errors could be mistaken for absence. V11 corrected those defects but stopped before reservation, DSH, adapter, or provider invocation with `PRIVATE_PATH_LEAK` because its complete-input scan did not allow two registered container paths. V12 produced a completed local actual record, but final red-team review rejected it because registered-container-path redaction could hide path traversal and embedded host paths, opaque decoded paths were not scanned, and its validation identity was stale. V13 was rejected because public projection code could mint actual attestation and its staging and transformed-content closure was incomplete. V14 was rejected before a provider attempt because output could be staged before the content gate, the runtime import window preceded fetch enforcement, transformed-content closure remained incomplete, and `--require-actual` did not require verified completion. V15 corrected those findings and produced locally valid evidence, but final review rejected it because completion did not require trusted seed and runner-input validation and its artifact budget was enforced after persistence. V16 added both missing completion predicates and discarded over-budget artifact bytes before persistence; it remains a valid historical execution record pinned to Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`. V17 preserves that authority boundary while pinning the transition-aware Recursus merge commit whose exact post-merge Ubuntu and Windows CI passed. Recursus Milestone 1 and current-pin Linux double-build, profile, smoke, and clean-machine acceptance evidence remain incomplete. No historical attempt is retried or promoted. Exact Careers implementation commit `7fe377863dc8b6b5cc584fe5225fb8a6f837b695` passed Ubuntu, macOS, Windows, security, regression, visual, guard, and dependency CI in PR #4. The local execution exit evidence and required exact-commit CI exist, so RC-3 is `accepted`. RC-4 is also `accepted` through PR #6 after exact reviewed implementation head `f086626ef344b59fa466e13eeeb3eccc1acd97fd` passed every required check.

### RC-4: Compiled prompt and context parity

Outcome:

- One versioned prompt and context contract compiles to each supported route.
- Inputs, instructions, source boundaries, tool policy, and expected artifacts are inspectable before execution.
- Route-specific adaptations are recorded as named adapter rules and protocol deviations.

Exit evidence:

- Contract tests cover all required Career Ops modes in the pilot.
- Snapshot differences are explained by named adapter rules.
- No route receives hidden candidate facts or evaluator-only oracle content.

Bounded evidence statement: For the registered synthetic fixtures, four pilot mode contracts compile into two offline route-delivery bundles whose decoded semantic block identities, authority, trust, order, source hashes, policies, and output contracts match under the registered adapter rules.

Structural prompt and context parity validated. No runner, provider, model, workflow behavior, factuality, safety, quality, feature-parity, or comparative claim was verified.

Current note: RC-4 V2 registration `RC4-PROMPT-CONTEXT-2026-08-25-V2` is the accepted compiler-boundary contract. PR #6 merged it after exact implementation head `f086626ef344b59fa466e13eeeb3eccc1acd97fd` passed Ubuntu, macOS, Windows, CodeQL, dependency review, guard, upgrade regression, and visual checks. Frozen rejected V1 remains byte-identical. RC-4 did not execute a provider or integrate the compiler into the product workflow.

### RC-5: Disposable end-to-end value slice

Active slice: [three-case disposable `oferta` contract](RC5_SLICE_CARD.md). Next session: [RC-5 Codex kickoff prompt](RC5_NEXT_TASK_PROMPT.md).

Outcome:

- One small but real Recursus Careers workflow reaches a user-visible result for three registered representative jobs.
- The same goals are run through ordinary Career Ops for a practical usefulness, cost, latency, reliability, and friction comparison.
- Implementation and generated state stay inside the registered blast radius and can be discarded without changing canonical Career Ops state.
- The slice ends with `KEEP`, `REBUILD`, or `DELETE`, not an open-ended infrastructure backlog.

Exit evidence:

- The lightweight slice card records the user path, representative jobs, authority, allowed writes, time and token budget, comparison path, and decision signal.
- At least one end-to-end case is tested as soon as it works, followed by no more than the three registered jobs needed for the decision.
- A compact result table records useful outcome, completion or failure, latency, reported tokens or comparable cost, human correction, and friction.
- No application is submitted, no message is sent, and no other external mutation occurs without separate explicit authorization.
- The decision note explains what is kept, rebuilt, or deleted and why. It makes no public superiority or release claim.

### RC-6: Promotion hardening and durable completion

Conditional follow-up: schedule RC-6 only after RC-5 returns `KEEP`, and only for the workflow surface proposed for support. A disposable slice may use simpler bounded recovery if that is enough to answer the product question.

Outcome:

- Run state survives interruption.
- Retries are bounded and attributable.
- Completion means required artifacts were verified, not merely reported by the model.
- Permissions and tool decisions use a provider-neutral policy.

Exit evidence:

- Fault-injection cases cover interruption, retry exhaustion, partial artifacts, and stale state.
- A resumed run cannot silently change route identity, corpus version, or permissions.
- Recovery cost and success rate are measured against the unchanged baseline.

### RC-7: Selective RLM research

Conditional follow-up: schedule RC-7 only after RC-5 returns `KEEP` and identifies a research bottleneck. RLM is not required merely because the component exists.

Outcome:

- RLM is available for deep company, repository, paper, and research-lab investigations.
- A router decides when recursive research is justified by uncertainty and task value.
- Direct-model controls distinguish RLM gains from model gains.

Exit evidence:

- RLM is enabled one variable at a time in paired runs.
- Research depth, evidence coverage, latency, token use, and cost are recorded.
- The route falls back safely when RLM is unavailable or over budget.

### RC-8: Honcho advisory memory

Outcome:

- Memory can retain user preferences, prior decisions, and reusable context.
- Every recalled item has provenance and confidence.
- Memory is advisory and never becomes evidence for a candidate fact.

Exit evidence:

- Tests cover stale, conflicting, absent, and poisoned memory.
- Candidate claims still require candidate-source evidence.
- Users can inspect and correct influential memory.

### RC-9: Dovetail delegation and routing

Outcome:

- Research and artifact work can be divided among bounded workers.
- Each worker receives the minimum context and permissions required.
- Synthesis preserves source provenance and dissent rather than averaging it away.

Exit evidence:

- Delegated and single-agent controls use the same model where possible.
- Ownership, budgets, artifacts, and failure states are recorded per worker.
- Delegation must improve a named metric enough to justify its coordination cost.

### RC-10: Company, lab, and relationship intelligence

Outcome:

- Verified company and lab research can be reused across multiple roles.
- People, organizations, roles, sources, claims, inferences, and memory remain separate data types.
- Freshness and contradiction handling are explicit.

Exit evidence:

- Reuse never turns an inference or memory item into a fact.
- Source refresh rules identify stale or changed claims.
- Application artifacts can show which company-specific evidence influenced them.

### RC-11: Operator experience

Outcome:

- A user can preview the route, permissions, compiled context, budget, and intended writes.
- A user can inspect progress, stop work, resume work, review evidence, and understand failures.
- Destructive or external actions require the configured approval path.

Exit evidence:

- Core operations are usable without reading internal logs.
- Status labels match the underlying run state.
- Accessibility, failure recovery, and audit views pass their acceptance checks.

### RC-12: Expanded pilot and release evidence

Outcome:

- The pilot expands from seed scenarios to the full catalog and relevant real-world snapshots.
- Paired analysis reports quality, factuality, evidence, stability, recovery, completion, time, token, and compute results.
- Claims are limited to the routes, models, versions, permissions, and workloads actually tested.

Exit evidence:

- Advancement rules in [Metrics and advancement](benchmarks/METRICS_AND_PROMOTION.md) are satisfied for each promoted claim.
- Negative results and protocol deviations remain visible.
- Release notes link to reproducible evidence bundles.

## Cross-cutting invariants

These rules apply to every milestone:

1. Never use evaluator-only oracle data as agent input.
2. Never infer a model, provider, runner, permission, or execution result that was not recorded.
3. Never treat hashes as proof of truth, authorship, execution, or freshness. They prove byte identity only.
4. Never turn Honcho memory, model output, or company inference into a candidate fact.
5. Never label unsupported, blocked, failed, or incomplete work as completed.
6. Never treat model self-report as runner attestation.
7. Never perform an external submission as part of a benchmark.
8. Never combine quality and efficiency into a favorable headline when a hard safety or factuality gate failed.
9. Preserve enough result data to explain each learning decision. Formal benchmarks must preserve enough raw evidence for an independent reviewer to reproduce every reported metric.
10. Prefer the smallest end-to-end combination that answers the product question. Isolate components later when promotion or a causal claim requires it.

## Ordering rationale

RC-1 through RC-4 established stable inputs, route identity, source isolation, honest failure states, and a provider-free compiler boundary. That foundation is sufficient to attempt a bounded real workflow. The next dependency is product value, not more speculative infrastructure. Durable execution, RLM, memory, delegation, operator experience, and formal comparisons are promoted only when RC-5 shows that the workflow is worth keeping and identifies which capability is needed next.

## Change policy

A roadmap change must state:

- which milestone changed;
- why the dependency order changed;
- which specification or benchmark document is affected;
- whether existing evidence remains comparable; and
- whether a previously allowed claim must be withdrawn.

When implementation begins, update this roadmap and the [feature registry](features/REGISTRY.md) independently. Roadmap progress does not establish feature availability.

Quick iteration may replace or delete an unpromoted slice without creating a new milestone ceremony. Record the decision and preserve accepted historical evidence. Any change that broadens authority, publishes a comparative claim, or promotes a supported path must use the full change and evidence policy.
