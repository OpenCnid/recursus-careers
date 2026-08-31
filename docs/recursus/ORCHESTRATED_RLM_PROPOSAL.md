# Orchestrator-guided RLM follow-up proposal

Status: proposed, non-normative, and unimplemented

Date: 2026-08-30

Learning source: [RC-7 selective RLM research postmortem](RC7_POSTMORTEM.md)

## Purpose and boundary

This document records a possible successor investigation to RC-7 for a future session. It does not reopen RC-7, schedule or renumber a roadmap milestone, activate the shelved RLM route, authorize a provider or credential, or claim that orchestrated RLM will work.

RC-7 established that the current all-or-nothing RLM treatment was not reliable enough to integrate. Only two of nine treatment rows produced trusted combined artifacts. The useful hypothesis remains narrower: persistent evidence and adaptive gap-directed research may improve difficult cases when a supervising orchestrator controls each step and partial progress survives individual failures.

The proposed change is therefore:

> Make a persistent Codex task the evidence-aware research orchestrator, keep exact state in a host-owned ledger, and expose RLM only as a bounded operation under the orchestrator's supervision.

The RLM becomes a tool used by the research process. It does not own the complete process, spawn a fixed child tree, publish directly, or become the source of truth for research state.

## Question to answer

Does a persistent evidence-aware orchestrator improve completion and research quality on an RLM-shaped bottleneck, and does a bounded RLM operation add measurable value beyond that orchestrator alone?

The second clause is essential. A successful orchestrator-plus-RLM result would not establish RLM value unless it also outperformed the same orchestrator using ordinary bounded research operations.

## Candidate comparison

A later live evaluation should distinguish three routes while holding the provider, configured model, reasoning setting, source pack, task, evaluator, and shared permissions fixed:

| Route | Description | Question isolated |
| --- | --- | --- |
| `direct` | One bounded completion over the registered source pack. | Existing direct baseline. |
| `orchestrated` | Persistent Codex orchestrator, host-owned evidence ledger, and bounded extraction/gap-fill operations without RLM. | Value of orchestration and durable state. |
| `orchestrated-rlm` | The same orchestrator and ledger, with RLM available as one bounded supervised operation at a time. | Incremental value attributable to RLM. |

No comparative run should begin until one exact representative `orchestrated-rlm` treatment completes end to end and its recovery path passes provider-free testing. The first candidate remains the frozen synthetic `LAB-01` question because RC-7 observed both a low direct mean and one strong completed RLM result there. `PAPER-01` is not the first target because its direct route was stronger and none of its RC-7 treatments completed.

## Proposed ownership model

### Persistent Codex orchestrator

The orchestrator owns research judgment:

- restate the bounded research question;
- construct and revise a visible research plan;
- inspect the ledger rather than rely on compacted conversational memory;
- select the next unresolved category;
- choose direct extraction, an RLM operation, fallback, or stop;
- accept, reject, or narrow returned evidence;
- reformulate a failed or unproductive operation within the registered policy;
- decide when the evidence is sufficient for synthesis; and
- produce no user-facing factual claim that has not passed the host evidence gate.

Codex context compaction may help sustain the session, but compacted context is not authoritative storage. Exact sources, claims, decisions, budgets, and completed operations remain in the host ledger.

### Host runtime

The host owns deterministic authority and state:

- source-pack identity and route-visible projection;
- operation IDs, ordering, budgets, timeouts, and circuit breakers;
- append-only evidence and operation checkpoints;
- source-ID and locator validation;
- candidate-fact semantic support checks;
- permission enforcement and external-action denial;
- idempotent recovery and partial-result preservation;
- final deterministic merge eligibility; and
- accounting and cleanup.

OAuth is an authentication concern of the selected Codex client, not a domain contract. Core research state must not depend on credential-store paths, credential bytes, undocumented token formats, or direct inspection of the signed-in session.

### Bounded RLM operation

The RLM receives only:

- one registered research objective or unresolved category;
- the permitted source projection;
- a bounded projection of already accepted evidence and explicit gaps;
- a closed output grammar; and
- the operation's exact resource and request limits.

It may return evidence candidates, computations, contradictions, remaining gaps, and at most the next proposed research action. It may not publish the final answer, mutate the ledger directly, access credentials, contact the network directly, perform an external action, or create an unbounded recursive tree. Any model request crosses the orchestrator/host boundary and is independently recorded and validated.

The first prototype should permit at most one supervised RLM operation at a time. The orchestrator must inspect and checkpoint its result before another operation can be admitted. A fixed four-child requirement is specifically rejected.

## Host-owned evidence ledger

The ledger is the durable interface between orchestration, bounded workers, compaction, interruption, and recovery. Its minimal logical records are:

| Record | Required content |
| --- | --- |
| Source | Stable source ID, byte identity, route visibility, and allowed locator grammar. |
| Evidence candidate | Proposed claim, exact source locator, operation provenance, and candidate-fact versus research-inference classification. |
| Accepted evidence | Deterministic support decision, contradiction state, and acceptance reason. |
| Gap | Unresolved category, importance, attempted operations, and current disposition. |
| Operation | Route, input projection identity, start/terminal state, bounded accounting, and retained failure classification. |
| Decision | Orchestrator choice, evidence considered, allowed next operation, and stop/fallback reason. |
| Final synthesis eligibility | The accepted evidence identities permitted to influence each output claim. |

The ledger must preserve partial progress. A failed worker or timed-out request seals that operation's failure but does not erase earlier accepted evidence or invalidate the entire investigation. Recovery resumes from the last valid checkpoint and must not silently replay a consumed provider operation.

## Proposed research loop

```text
register question and source pack
  -> create deterministic plan and empty ledger
  -> run one bounded extraction operation
  -> validate and checkpoint evidence
  -> identify the highest-value unresolved gap
  -> choose direct gap-fill, bounded RLM, fallback, or stop
  -> validate and checkpoint again
  -> repeat only while policy and value justify another operation
  -> deterministic factuality gate
  -> synthesize from accepted evidence only
```

The orchestrator should stop when the evidence is sufficient, the remaining gap is not worth its cost, a safety gate fails, the budget is exhausted, or a repeated shared-path failure opens the circuit. Missing evidence should be disclosed rather than filled by inference.

## Failure handling

The proposal changes the RC-7 all-or-nothing failure model:

- a child timeout fails one operation rather than the entire research record;
- partial evidence already accepted by the host remains usable;
- an operation can fall back to direct extraction without relabeling it as RLM output;
- any retry must be bounded, receive a fresh operation identity, and remain attributable;
- repeated equivalent failures open a circuit instead of creating an approval/version loop;
- raw console text or provider prose never substitutes for a validated result;
- a container exit cannot erase the host ledger; and
- final synthesis is blocked only when required evidence or a critical safety predicate is missing.

The future specification must decide the exact retry count, retryable terminals, timeouts, and cost ceilings before a live pilot. This proposal does not set or authorize those numbers.

## Safety requirement before RLM evaluation

The shared RC-7 `fabricated-candidate-fact` failure must be corrected before testing comparative value. Structural schema validity and locator syntax are insufficient: every candidate-derived assertion must be semantically entailed by an allowed primary source or omitted.

The provider-free safety slice should cover:

- unsupported candidate facts with valid-looking locators;
- claims that combine two supported fragments into one unsupported assertion;
- research inference mislabeled as a candidate fact;
- stale, contradictory, missing, or evaluator-only sources;
- compaction or recovery omitting a limiting qualifier;
- rejected evidence reappearing in later synthesis; and
- RLM evidence bypassing the same gate applied to direct evidence.

No live comparison should proceed while this shared gate can fail.

## Staged implementation plan for a new session

### Stage 0: Re-establish authority and preservation

- Study the active repository instructions, RC-7 postmortem, benchmark contracts, and this proposal.
- Confirm RC-7 evidence and implementation remain unchanged and off.
- Select a new bounded milestone or disposable slice without assigning RC-7 authority to it.
- Map the exact native Codex, host ledger, optional RLM, source, evaluator, and permission seams before editing.

### Stage 1: Provider-free safety and ledger foundation

- Implement the candidate-fact semantic support gate.
- Implement the append-only host evidence ledger and deterministic state machine.
- Use only frozen synthetic source packs and deterministic fake workers.
- Test interruption and recovery after every checkpoint, duplicate operations, stale state, partial results, circuit opening, and forbidden evidence promotion.

### Stage 2: Provider-free orchestrator contract

- Define the closed actions available to the Codex orchestrator.
- Prove that the model cannot mutate accepted evidence, authorize itself, or bypass budgets.
- Exercise direct extraction, bounded-RLM proposals, rejection, fallback, stop, and synthesis using deterministic fixtures.
- Demonstrate that an RLM failure leaves previously accepted evidence intact.

### Stage 3: One exact end-to-end pilot

- Freeze one representative `LAB-01` treatment only after the real invocation and recovery path are stable.
- Execute the orchestrator, ledger, one bounded RLM operation at a time, validation, synthesis, and cleanup.
- Require one trusted final artifact and complete step-level accounting before considering a comparison.
- Stop after the pilot if reliability, factuality, observability, or authority containment is inadequate.

### Stage 4: Small three-route comparison

- Preregister `direct`, `orchestrated`, and `orchestrated-rlm` with exact parity fields.
- Use enough repetitions to separate orchestration benefit from incremental RLM benefit.
- Score completion, evidence coverage, exactness, factuality, latency, requests, token authority, recoverability, and cleanup.
- Promote nothing unless `orchestrated-rlm` is reliable, clears every safety gate, and improves a named metric enough to justify its incremental complexity over `orchestrated`.

## Advancement questions

Before any implementation is promoted, the evidence must answer:

1. Does the orchestrator preserve and use partial evidence correctly across interruption and compaction?
2. Does it prevent unsupported candidate facts on both direct and RLM-derived paths?
3. Can one failed RLM operation recover or fall back without invalidating the research record?
4. Does orchestration alone solve the measured bottleneck?
5. If not, what incremental quality does RLM add over the identical orchestrator without RLM?
6. Is that gain large and reliable enough to justify additional requests, latency, code execution, and containment?
7. Can an independent reviewer reproduce every accepted claim and route decision from the ledger?

If orchestration alone achieves the useful gain, the smaller `orchestrated` route should be preferred and RLM should remain shelved. If neither orchestrated route improves the measured question safely, stop rather than expanding the mechanism.

## Non-goals and nonclaims

This proposal does not:

- reopen, repair, replay, or reinterpret the RC-7 matrix;
- integrate or promote the existing RLM implementation;
- declare Codex context compaction infinite or an evidence store;
- make Codex OAuth, DSH, Docker, or RLM part of the Career Ops source-of-truth boundary;
- authorize provider calls, credential access, network requests, Docker execution, purchases, submissions, publication, or deployment;
- require rewriting Career Ops or removing its runner-neutral contracts;
- establish a roadmap milestone number or change RC-8 through RC-12; or
- predict that orchestrated RLM will outperform an orchestrator without RLM.

The intended outcome of the next session's first slice is provider-free code and evidence showing that the safer state and recovery model is implementable. Live value testing is a later decision, not an assumption embedded in the architecture.
