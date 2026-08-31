# Orchestrator-guided RLM successor specification

Status: draft normative contract for a separately authorized future slice; inactive and unimplemented

Successor milestone: unassigned; this document does not renumber or replace RC-8 through RC-12

Learning source: [RC-7 selective RLM research postmortem](RC7_POSTMORTEM.md)

Design source: [orchestrator-guided RLM follow-up proposal](ORCHESTRATED_RLM_PROPOSAL.md)

Historical predecessor: [closed RC-7 specification](RC7_SPEC.md)

Last reviewed: 2026-08-31

## 1. Document role

This specification defines a candidate successor to the stopped RC-7 investigation. It is normative only for work that explicitly claims conformance to this successor. Writing or merging this document does not schedule a roadmap milestone, reopen RC-7, activate the existing RLM implementation, or authorize implementation or execution.

RC-7 remains closed with terminal `STOP`. Its implementation and evidence remain immutable historical material. The current RLM route stays off, unintegrated, and unpromoted.

`MUST`, `MUST NOT`, `REQUIRED`, and `SHALL` are binding requirements for a conforming successor. `SHOULD` and `PREFER` describe the expected design unless repository evidence establishes a smaller or safer alternative before the affected contract is frozen.

The successor starts with provider-free safety and state work. Provider, credential, network, live RLM, Docker, benchmark, publication, deployment, purchase, submission, send, contact, and other external-mutation authority always require a later explicit boundary. This document grants none of them.

## 2. Product question

The successor asks two separate questions:

1. Does a persistent, evidence-aware Codex orchestrator with host-owned durable state improve verified completion and research quality on a concrete research bottleneck relative to one bounded direct completion?
2. Holding that orchestrator and its ledger fixed, does exposing RLM as one bounded supervised operation add measurable value beyond ordinary orchestrated extraction and gap filling?

The second comparison is mandatory. An `orchestrated-rlm` result cannot establish RLM value unless it outperforms the same `orchestrated` route without RLM.

The initial research target is frozen synthetic `LAB-01`. RC-7 observed both low direct performance and one strong completed RLM result there. `PAPER-01` MUST NOT be the first live target because its RC-7 direct route was stronger and none of its RLM treatments completed. `REPO-01` remains a later candidate.

## 3. Architectural correction

The successor MUST reverse the RC-7 ownership model:

```text
persistent Codex orchestrator proposes the next bounded action
  -> host validates authority, identity, budget, and state
  -> one bounded operation executes
  -> host validates and checkpoints evidence
  -> orchestrator inspects the validated projection
  -> orchestrator proposes direct gap-fill, bounded RLM, synthesis, fallback, or stop
```

The orchestrator owns research judgment. The host owns truth, authority, state, admission, and completion. RLM is an optional operation under both; it is not the planner, state store, delegation coordinator, publisher, or final source of truth.

Codex context and compaction MAY help maintain a long-running task, but neither is authoritative storage. After interruption, compaction, or handoff, the orchestrator MUST reconstruct its working view from the independently validated host projection. Conversation memory, summaries, provider replay state, and model self-report MUST NOT authorize an operation or establish evidence.

## 4. Ownership boundaries

### 4.1 Persistent Codex orchestrator

The first prototype uses a persistent Codex task as the configured research orchestrator. The underlying contract MUST remain independent of Codex-specific prompt, UI, credential, or transport syntax.

The orchestrator MAY:

- restate the bounded question;
- propose and revise a visible research plan;
- inspect accepted evidence, rejected-evidence summaries, open gaps, budgets, and terminal operation records;
- propose one next registered operation;
- narrow an objective after an unproductive operation;
- propose fallback or stop;
- propose final synthesis from accepted evidence only; and
- explain uncertainty and missing evidence.

The orchestrator MUST NOT:

- append to or rewrite the durable ledger directly;
- accept its own evidence or grant itself authority;
- mint an operation, provider reservation, RLM permit, retry, or budget;
- read evaluator-only truth, hidden signatures, route-control metadata, or another route's output;
- turn conversation memory, RLM state, or rejected evidence into a fact;
- publish a user-facing factual claim that the host evidence gate has not admitted; or
- perform an external mutation.

### 4.2 Host runtime

The host is the sole owner of:

- question, case, source-pack, route, permission, budget, evaluator, and code identities;
- route-visible source projection and evaluator isolation;
- append-only ledger ordering and physical-root binding;
- operation admission, reservation, dispatch, terminal state, and circuit state;
- evidence classification, source-locator resolution, and support decisions;
- candidate-fact safety;
- interruption classification, no-replay recovery, and partial-result preservation;
- synthesis eligibility and artifact publication;
- accounting, residue inspection, and cleanup; and
- exactly one terminal decision per run root.

OAuth and provider selection remain authentication and transport concerns of the selected DSH/provider path. The research contract MUST NOT depend on a credential-store path, credential bytes, undocumented token formats, or direct inspection of a signed-in session.

### 4.3 Bounded RLM operation

An RLM operation receives only:

- one registered unresolved objective or gap;
- the permitted source projection for that operation;
- a bounded projection of already accepted evidence and explicit gaps;
- the closed operation grammar; and
- exact resource, time, request, artifact, and authority limits.

It MAY return evidence candidates, exact computations, contradictions, unresolved gaps, and at most one proposed next action. It MUST NOT publish the final answer, mutate the ledger, access credentials, contact the network directly, perform an external action, or create an autonomous child tree.

At most one RLM operation may be active at a time. Recursive depth is one. The orchestrator MUST inspect a validated terminal and a new host checkpoint before another RLM operation can be admitted. A fixed four-child requirement is prohibited.

If a future RLM operation executes Python or another general-purpose program, that program has operating-system authority. Prompt instructions are not containment. Its exact runtime MUST pass a new provider-free containment contract before live use. The initial foundation executes no RLM and no model-generated program.

## 5. Closed orchestrator action grammar

The host MUST accept only these action kinds from the orchestrator:

| Action | Meaning | Host decision |
| --- | --- | --- |
| `REQUEST_DIRECT_EXTRACTION` | Extract evidence from one registered source partition. | Admit only when source, objective, budget, and operation identity match. |
| `REQUEST_DIRECT_GAP_FILL` | Investigate one already registered open gap without RLM. | Admit only after at least one checkpoint identifies the gap. |
| `REQUEST_RLM_OPERATION` | Use RLM for one registered unresolved objective. | Deny unless the active stage, route, eligibility, containment, and budget explicitly permit it. |
| `RECORD_GAP` | Propose a missing, contradictory, or insufficient evidence category. | Host validates and assigns the durable gap identity. |
| `PROPOSE_SYNTHESIS` | Request synthesis from a closed set of accepted evidence identities. | Admit only when mandatory safety and completion predicates pass. |
| `STOP` | End because evidence is sufficient, value is exhausted, safety failed, the circuit opened, or budget ended. | Host seals the reason and final state. |

Unknown actions, extra fields, duplicate keys, stale checkpoints, omitted identities, free-form authority, and action text that embeds another action MUST fail closed.

An orchestrator action is a proposal. It becomes executable only after the host emits a distinct admitted operation record.

## 6. Route definitions and causal comparisons

The later comparison uses three routes:

| Route | Fixed behavior | Question isolated |
| --- | --- | --- |
| `direct` | One bounded completion over the registered source pack. | Existing direct baseline. |
| `orchestrated` | Persistent orchestrator, host ledger, bounded direct extraction, and bounded direct gap filling; RLM unavailable. | Value of orchestration and durable state. |
| `orchestrated-rlm` | The same orchestrator, ledger, operations, and policy, with bounded RLM available for eligible gaps. | Incremental value attributable to RLM. |

Provider, configured model, reasoning setting, semantic task, source bytes, evaluator, output grammar, and shared permission identity MUST remain fixed across comparable cells. Declared request, latency, compute, containment, and RLM authority are visible treatment differences, not hidden parity.

Generic controls MUST NOT invoke RLM. Making RLM available while the frozen route decision selects ordinary orchestration is the control behavior. Eligibility and route-control bytes MUST remain outside model-visible input.

The initial learning comparison, if later authorized, SHOULD use `LAB-01`, `FACT-01`, and `SAFE-01`, three routes, and three repeats: 27 primary runs. It is a bounded learning comparison, not promotion evidence. A later formal claim requires the larger registered eligible/control corpus and the benchmark protocol's promotion rules.

## 7. Route-visible, host-only, and evaluator-only bytes

### Route-visible

- bounded research question;
- permitted source bytes with stable source IDs and locators;
- accepted-evidence projection needed for the next operation;
- explicit unresolved gaps and contradiction summaries;
- operation-local budgets and output grammar; and
- closed capability and denial descriptions.

### Host-only

- physical paths and filesystem identities;
- ledger chain and locks;
- approval, permit, reservation, circuit, accounting, and recovery records;
- credential references and runtime selection metadata;
- containment inspection and cleanup observations; and
- route eligibility and operation admission decisions.

### Evaluator-only

- oracle truth and expected signatures;
- scoring weights, thresholds, canaries, and hidden support registries;
- expected gap, contradiction, computation, and relationship identities;
- alternate-route outputs and scores; and
- any adjudication material.

No route-visible artifact may contain evaluator-only bytes, preferred answers, expected combinations, route labels for blinded review, or a signal that reveals which facts earn credit.

## 8. Candidate-fact and evidence safety gate

The RC-7 direct-route `fabricated-candidate-fact` failure MUST be corrected before any live successor pilot.

Every evidence candidate has exactly one class:

- `candidate_fact`;
- `target_fact`;
- `research_relationship`;
- `research_inference`;
- `exact_computation`;
- `contradiction`; or
- `gap`.

A citation or syntactically valid locator is not proof of entailment. A `candidate_fact` may be accepted only when the complete assertion is supported by an allowed primary candidate source. Two separately supported fragments MUST NOT be combined into a stronger unsupported assertion.

For frozen synthetic fixtures, the provider-free gate MUST use evaluator-only canonical claim identities and exact source spans or structured field values. The route receives neither those identities nor the acceptance answer. For later non-fixture use, candidate claims remain extractive and source-span-bound until a separately validated semantic verifier exists. A model-only entailment judgment is insufficient.

`research_inference` MUST be labeled as inference and MUST NOT become a candidate fact through repetition, compaction, recovery, RLM output, or synthesis. Rejected evidence identities remain durably denied and MUST be excluded from every later projection and synthesis.

The same gate applies to direct, orchestrated, and RLM-derived evidence. RLM receives no bypass, lower threshold, or alternate truth source.

The provider-free safety suite MUST cover:

- unsupported candidate facts with valid-looking locators;
- two supported fragments combined into an unsupported assertion;
- research inference mislabeled as candidate fact;
- stale, contradictory, missing, replaced, or evaluator-only sources;
- limiting qualifiers omitted after compaction or recovery;
- rejected evidence reappearing in a later action or synthesis;
- valid source ID with an unresolved or out-of-bounds locator;
- RLM-origin evidence attempting to bypass the common gate; and
- model self-report presented as host acceptance.

Any accepted unsupported candidate metric, authorship, credential, employment, work authorization, or personal-experience claim is a critical failure and stops the successor.

## 9. Host-owned append-only ledger

The ledger is the durable interface between orchestration, bounded operations, compaction, interruption, and recovery. It MUST use canonical serialization, monotonically increasing sequence numbers, a previous-entry digest, an entry digest, exact schema validation, and atomic append behavior.

The closed record kinds are:

| Record | Required meaning |
| --- | --- |
| `RUN_REGISTERED` | Immutable question, route, source, permission, budget, evaluator, and code identities. |
| `PLAN_RECORDED` | Visible bounded plan and initial gaps. |
| `ACTION_PROPOSED` | Exact orchestrator proposal and checkpoint identity. |
| `OPERATION_ADMITTED` | Host authority, input projection, limits, and unique operation identity. |
| `OPERATION_DISPATCHED` | Durable provider- or worker-reachable boundary, when applicable. |
| `OPERATION_TERMINAL` | One closed success, failure, timeout, rejection, cancellation, or indeterminate classification. |
| `EVIDENCE_PROPOSED` | Candidate class, claim, locator, operation provenance, and bounded content. |
| `EVIDENCE_ACCEPTED` | Deterministic support decision, contradiction state, and acceptance reason. |
| `EVIDENCE_REJECTED` | Closed rejection reason and identity barred from later synthesis. |
| `GAP_RECORDED` | Importance, attempted operations, and open, resolved, deferred, or abandoned disposition. |
| `DECISION_RECORDED` | Evidence considered, chosen next action, fallback, circuit, or stop reason. |
| `SYNTHESIS_ELIGIBLE` | Exact accepted evidence identities permitted to influence output claims. |
| `ARTIFACT_PUBLISHED` | Validated result identity and bounded artifact inventory. |
| `RUN_TERMINAL` | Exactly one final decision and complete accounting. |

Ledger entries are immutable. Corrections append a superseding record and preserve the original. Model output, console text, temporary files, or an exited process cannot replace a missing ledger terminal.

## 10. State machine and recovery

The run state is derived from validated ledger entries and has these semantic states:

```text
prepared -> active -> operation-admitted -> operation-dispatched
  -> operation-terminal -> checkpointed -> synthesis-eligible
  -> complete

Any state may move to stopped.
A dispatched operation without a trusted terminal moves to indeterminate.
```

Recovery rules:

| Checkpoint | Required behavior |
| --- | --- |
| Prepared, no admitted operation | Revalidate identities; no provider or worker action. |
| Operation admitted, not dispatched | Cancel or resume only when durable evidence proves no provider- or worker-reachable dispatch occurred. |
| Dispatched, no trusted terminal | Seal the operation indeterminate and do not replay it. Preserve prior accepted evidence. |
| Trusted terminal, evidence not checkpointed | Revalidate the sealed result and continue validation without another provider or worker request. |
| Evidence checkpointed | Resume from the validated projection and open gaps. |
| Synthesis eligible, publication incomplete | Revalidate the eligibility set and publish without rerunning research. |
| Complete or stopped | Return the same terminal identity and accounting. |
| Identity, ledger, source, permission, budget, or physical-root drift | Fail closed without operation execution. |

A failed or timed-out operation does not erase prior accepted evidence. Final synthesis is blocked only when a required evidence or critical safety predicate is absent, not merely because a nonessential operation failed.

Repeated `inspect` and `recover` calls MUST be idempotent. Concurrent recovery MUST have one winner and no duplicate append, dispatch, artifact, or terminal.

## 11. Retry and circuit policy

Provider-free Stages 1 and 2 have zero retries because they execute deterministic fake workers only.

No live retry policy is authorized by this document. A later live freeze MUST name zero or one replacement, the exact retryable closed terminals, the backoff, the operation and total ceilings, and the no-replay evidence. Adapter-level automatic retries remain zero.

A replacement, if later authorized, MUST receive a fresh operation identity, reservation, nonce, and accounting entry. It is never a replay or relabeling of the consumed operation.

Two consecutive equivalent failures for the same operation class, route, and source partition MUST open the circuit before another equivalent operation is admitted. The circuit MAY permit deterministic fallback or `STOP`; it MUST NOT permit another equivalent provider request. Authentication, permission, invalid-request, malformed-output, identity, accounting, containment, evaluator-leakage, candidate-fact, and cleanup failures open the circuit immediately.

## 12. Artifact package

Each disposable root contains exactly one run package with these bounded logical artifacts:

- `registration.json`;
- `source-manifest.json`;
- `plan.json`;
- `ledger.jsonl`;
- `checkpoint.json`;
- `operations/<operation-id>/input.json`;
- `operations/<operation-id>/terminal.json`;
- `operations/<operation-id>/evidence.json` when present;
- `synthesis-eligibility.json` when reached;
- `result.json` when published;
- `accounting.json`;
- `terminal.json`; and
- `summary.json`.

Every artifact MUST have a schema, media type, byte ceiling, producer identity, provenance, content digest, and independent validation rule. Unregistered files, oversized artifacts, duplicate keys, unknown fields, unresolved locators, path escape, alternate streams, symlinks, junctions, hard-link substitution, sparse-file abuse, and post-validation replacement fail closed.

Normalized provider-free captures MUST exclude observation-only time, process ID, nonce, temporary path, and physical filesystem identity while retaining their required semantic classifications. Two fresh preparations from distinct safe roots MUST produce byte-identical normalized retained bytes.

## 13. Disposable-root and preservation contract

Generated state MUST stay below one explicit caller-owned empty disposable root outside the repository and outside every user layer or credential location. The implementation MUST reject roots that are:

- missing or non-empty;
- repository-contained or overlapping another registered root;
- broad, drive-root, home-root, profile-root, temp-root parent, or workspace-root paths;
- user-layer, credential-like, browser-profile, DSH-home, Codex-home, or secret-like paths;
- aliased through case, `..`, short names, symlinks, junctions, hard links, mount points, or another physical identity; or
- replaced after validation.

Accepted RC-1 through RC-6 evidence, RC-7 registrations, implementations, ledgers, results, roots, and external evidence are immutable. The successor MAY cite their recorded conclusions but MUST NOT mutate, copy external evidence into this repository, reuse authority, recreate physical roots, replay attempts, or relabel terminals.

RC-5 and RC-6 implementation MUST NOT be modified for the provider-free foundation. RC-7 implementation MUST remain unchanged and off. If the required successor seam cannot be built beside those historical surfaces, stop and report the missing seam before editing them.

## 14. Staged delivery

### Stage 0: documentation and seam map

- Confirm RC-7 remains closed and off.
- Map persistent Codex, host ledger, source, evaluator, DSH/provider, optional RLM, containment, artifact, permission, and cleanup seams.
- Identify exact route-visible, host-only, and evaluator-only bytes.
- Create a separate slice card with branch, worktree, authority, time/token budget, disposable roots, rollback target, and exit decision.

Stage 0 is documentation-only unless the user separately authorizes implementation.

### Stage 1: provider-free safety and ledger foundation

- Implement the common candidate-fact support gate.
- Implement the append-only ledger, state derivation, checkpoints, physical-root validation, inspection, and recovery.
- Use only frozen synthetic sources and deterministic fake workers.
- Exercise `LAB-01`, `FACT-01`, `FACT-03`, and `SAFE-01` safety and state fixtures.
- Produce two fresh byte-identical normalized packages.

Stage 1 executes zero provider requests, zero RLM, zero model-generated code, zero credentials, zero network, zero live browsing, zero Docker, zero WSL, and zero external mutation.

### Stage 2: provider-free orchestrator contract

- Implement the closed action grammar and host admission boundary.
- Use a deterministic fake orchestrator to exercise direct extraction, gap fill, RLM proposal, rejection, fallback, circuit opening, synthesis, and stop.
- Prove that the orchestrator cannot mutate accepted evidence, authorize itself, expand budgets, access hidden truth, or bypass safety.
- Prove that one failed fake RLM operation leaves earlier accepted evidence intact and permits only the registered fallback.

Stage 2 remains provider-free and does not prove the real Codex or RLM path.

### Stage 3: one separately authorized live `LAB-01` pilot

Before freeze, prove the actual logged-in DSH/`openai-codex` invocation and result-reduction path with the exact representative request shape. Do not freeze an unproven wrapper. Complete static, denial, negative, portability, subprocess, recovery, and containment tests first, then freeze once.

The pilot may start only after a fresh user-approved activation binds the exact provider, configured model, reasoning, prompt, source, orchestrator, operation grammar, DSH/adapter revision, RLM component, containment, tokenizer or conservative accounting rule, request ceilings, token ceilings, timeouts, retries, pricing source, cost ceiling, physical roots, evaluator, and code revision.

The pilot executes one non-matrix `orchestrated-rlm` treatment. It MUST produce one trusted final artifact, complete operation-level accounting, verified candidate-fact safety, a valid recovery observation, and zero residue. Failure stops before a comparison.

### Stage 4: separately authorized three-route learning comparison

- Preregister `direct`, `orchestrated`, and `orchestrated-rlm` with exact parity fields.
- Freeze the run order, repetitions, scorer, source packs, route decisions, request and cost ceilings, retry policy, circuit behavior, and stopping rules before outputs exist.
- Measure orchestration benefit separately from incremental RLM benefit.
- Include every failure, timeout, replacement, and stopped run.
- Promote nothing unless all critical gates pass and the incremental RLM result justifies its additional complexity over `orchestrated`.

Stage 4 is not authorized by completion of Stages 1 through 3.

## 15. Provider-free fault matrix

Stages 1 and 2 MUST cover at least:

1. unsafe, missing, non-empty, broad, repository, user-layer, credential-like, overlapping, and aliased roots;
2. root replacement after validation and concurrent root acquisition;
3. missing, extra, stale, reordered, duplicated, malformed, and digest-broken ledger entries;
4. wrong run, source, route, permission, budget, evaluator, operation, checkpoint, or code identity;
5. source-byte replacement and unresolved, escaped, or mismatched locators;
6. evaluator, canary, expected-signature, eligibility, or alternate-route leakage;
7. unknown orchestrator actions, extra fields, duplicate keys, stale checkpoints, and action smuggling;
8. self-authorization, budget expansion, unauthorized RLM selection, and concurrent operation admission;
9. generic-case RLM selection and eligible forced-pilot RLM omission;
10. unsupported candidate facts, fragment combination, inference relabeling, and qualifier loss;
11. rejected evidence reappearing after compaction, recovery, fallback, or synthesis;
12. malformed, oversized, unprovenanced, conflicting, or replaced operation artifacts;
13. interruption before admission, after admission, after dispatch, after terminal, during evidence validation, after checkpoint, during synthesis eligibility, during publication, and after terminal completion;
14. dispatched-without-terminal no-replay classification;
15. fake RLM timeout, malformed result, unsafe result, over-budget result, and unavailable result with prior evidence preserved;
16. first-failure and repeated-failure circuit behavior;
17. repeated inspect/recover idempotence and concurrent recovery exclusion;
18. cleanup failure, residue detection, and exact accounting; and
19. mutation tests proving that weakening every critical predicate fails a test.

Fault hooks MUST be impossible to use with provider authority, real credentials, external URLs, live RLM, Docker, or external mutation.

## 16. Initial implementation boundary

Prefer new files:

- `lib/recursus/orchestrated-research.mjs`;
- `scripts/recursus/orchestrated-research.mjs`;
- `tests/recursus/orchestrated-research.test.mjs`; and
- new synthetic fixtures below a successor-specific `tests/recursus/fixtures/` directory.

Do not add a root entrypoint. Do not integrate with Career Ops modes, the tracker, user data, browser workflows, provider adapters, DSH credentials, or the existing RC-7 executor during Stages 1 and 2.

The provider-free command surface SHOULD be limited to:

```text
node scripts/recursus/orchestrated-research.mjs prepare --output-root <empty-external-root>
node scripts/recursus/orchestrated-research.mjs exercise --output-root <empty-external-root> --fault <registered-fault>
node scripts/recursus/orchestrated-research.mjs inspect --output-root <existing-external-root>
node scripts/recursus/orchestrated-research.mjs recover --output-root <existing-external-root>
```

These commands MUST have no live-provider, credential, network, Docker, RLM, or external-mutation flag.

## 17. Stage 1 and Stage 2 authority and budget

When a later user explicitly starts Stage 1 or Stage 2 under this specification:

- active implementation and local verification: at most 90 minutes or 45,000 observable model tokens per stage, whichever comes first;
- provider requests: zero;
- credential-store access: zero;
- RLM executions: zero;
- network and live browsing: zero;
- Docker and WSL: zero;
- dependency installation: zero;
- private or live Career Ops data: zero;
- submissions, sends, contacts, tracker changes, deployments, releases, purchases, and external mutations: zero; and
- publication, push, pull request, and merge: separately authorized.

Use Windows PowerShell only. Do not run the unfiltered local `node test-all.mjs` suite.

## 18. Verification gates

Before Stage 1 or Stage 2 can be recommended as conformant:

1. run the focused successor tests;
2. run directly affected focused Recursus regressions;
3. produce and compare two fresh provider-free preparations;
4. run the registered prompt/context validator only when prompt or context bytes change;
5. register and run `node test-all.mjs --only recursus/`;
6. run `node scripts/check-syntax.mjs` for JavaScript changes;
7. run `git diff --check`;
8. review the complete diff and status; and
9. independently confirm that historical evidence, accepted surfaces, and unrelated user work are unchanged.

The first implementation session MUST study all binding repository instructions, this specification, the proposal, the RC-7 postmortem, the architecture contract, benchmark protocol, metrics, scenario catalog, and every nested instruction for selected code, test, script, and fixture paths before editing them.

If the environment exposes the `subagent-composition` skill and the user authorizes multi-agent work, study and apply it. Otherwise use no delegation unless the user explicitly requests it. Any delegated task requires an exact question, path scope, evidence expectation, write boundary, and prohibited actions; the primary agent retains architectural judgment and owns reconciliation and the complete diff.

## 19. Decisions and stopping rules

Stage 1 and Stage 2 emit exactly one:

- `FOUNDATION_CONFORMANT`: every provider-free predicate passes, deterministic packages match, safety gates hold, recovery is idempotent, and no prohibited authority was reached;
- `REBUILD_FOUNDATION`: one bounded correction to the ledger, grammar, fixtures, or safety gate could make the foundation conformant; or
- `ABANDON_SUCCESSOR`: durable evidence cannot be made authoritative, candidate-fact safety cannot be enforced, partial progress cannot survive failures without replay, or the smaller orchestrated route already makes RLM irrelevant.

Stage 3 emits exactly one `PILOT_COMPLETE`, `PILOT_REBUILD`, or `PILOT_STOP` under its later frozen contract.

Stage 4 MUST freeze exact deterministic thresholds before outputs exist. Its possible learning decisions are:

- `KEEP_ORCHESTRATED_RLM_CANDIDATE` only when there are zero critical failures, every registered `LAB-01` RLM treatment completes, `orchestrated-rlm` improves a named preregistered metric over `orchestrated`, controls do not regress, and added authority and efficiency remain within the frozen ceiling;
- `KEEP_ORCHESTRATED_ONLY` when orchestration demonstrates useful value but RLM adds insufficient or unreliable incremental value;
- `REBUILD_SUCCESSOR` when there is no critical failure and one bounded falsifiable correction could answer the same question; or
- `STOP_SUCCESSOR` for any critical failure, unbounded authority, evidence corruption, unsafe candidate claim, or absence of credible value.

No decision integrates a product route, authorizes deployment, or establishes a public comparative claim.

## 20. Handoff requirements

Each stage handoff MUST report:

- branch, commit, pull request, and exact reviewed head when they exist;
- the seam map and byte-visibility map;
- route, source, permission, evaluator, budget, and code identities;
- every ledger state and operation transition exercised;
- accepted, rejected, contradictory, and unresolved evidence counts by class;
- circuit, retry, recovery, artifact, terminal, operator-step, and cleanup counts;
- two preparation identities and their deterministic comparison;
- every focused, filtered, syntax, diff, and CI result plus skipped checks;
- exact provider, credential, network, RLM, Docker, WSL, external-mutation, and purchase counts;
- confirmation that RC-1 through RC-7 evidence and unrelated user work were unchanged;
- the stage decision and remaining nonclaims; and
- the exact new authority required for any later stage.

## 21. Nonclaims

This specification does not establish that orchestration works, RLM works, Codex compaction is an evidence store, RLM is required, Python is safely contained, OAuth is provider-neutral, the existing RC-7 route is repaired, a live provider path is authorized, or a Career Ops feature is integrated.

Provider-free conformance can establish only the successor's synthetic ledger, safety, state, recovery, admission, circuit, artifact, and cleanup behavior. A successful one-case pilot would apply only to its exact frozen identity and would not establish comparative value. A successful 27-run learning comparison would not establish production readiness, general RLM value, provider neutrality, improved applications, or improved hiring outcomes.
