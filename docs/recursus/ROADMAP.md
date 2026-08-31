# Recursus Careers roadmap

Status: working roadmap

Last reviewed: 2026-08-31

This roadmap tracks product decisions and bounded future work. Detailed contracts, execution journals, and immutable evidence live in the linked specifications, slice records, postmortems, and evaluation packages; they are not duplicated here.

Recursus Careers and the Recursus runtime are separate projects. This roadmap covers only Career Ops integration in this repository and names external runtime dependencies where they matter.

## Current focus

RC-0 through RC-4 are accepted, RC-5 was kept, and RC-6 is accepted within its registered provider-free validation-executor boundary. RC-7 is stopped: its complete v25 comparison contained one direct `FACT-01` fabricated-candidate-fact critical failure, which forced the terminal safety decision. No later milestone is active.

- Latest closed contract: [RC7_SPEC.md](RC7_SPEC.md)
- RC-7 learning review: [RC7_POSTMORTEM.md](RC7_POSTMORTEM.md)
- Non-normative future proposal: [ORCHESTRATED_RLM_PROPOSAL.md](ORCHESTRATED_RLM_PROPOSAL.md)
- Inactive successor contract: [ORCHESTRATED_RLM_SPEC.md](ORCHESTRATED_RLM_SPEC.md)
- Current capability truth table: [features/REGISTRY.md](features/REGISTRY.md)

The proposal and inactive successor contract do not reopen RC-7, schedule a milestone, or authorize implementation. Any future work requires a new bounded milestone and authority.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `accepted` | Required exit evidence exists and passed review within the stated boundary. |
| `kept` | A bounded learning slice was useful enough to retain; this is not production acceptance. |
| `in progress` | Implementation exists, but required acceptance evidence is incomplete. |
| `next` | The next bounded implementation slice. |
| `planned` | Defined but not started. |
| `conditional` | Undertaken only when an earlier result or dependency justifies it. |
| `stopped` | Work reached a terminal stop condition and grants no continuation authority. |
| `blocked` | A named dependency prevents meaningful progress. |

Documentation alone never establishes implementation, acceptance, or feature availability. The feature registry changes independently when implementation and evidence land.

## Acceptance-history snapshot

The following rows preserve the reviewed pre-acceptance state required by the V16 and V17 historical contracts. They do not override the current milestone map.

| ID | Milestone | Historical status | Evidence boundary |
| --- | --- | --- | --- |
| RC-3 | Minimal Recursus execution bridge | `in progress` | V17 route evidence existed, but exact Careers implementation CI had not yet passed. |
| RC-4 | Compiled prompt and context parity | `next` | Preserved at the accepted RC-3 boundary, before RC-4 implementation. |

## Milestone map

| ID | Milestone | Status | Outcome or decision | Evidence / contract |
| --- | --- | --- | --- | --- |
| RC-0 | Documentation and claim boundary | `accepted` | Architecture, benchmarks, feature status, and allowed claims were separated. | [Recursus overview](README.md) |
| RC-1 | Benchmark Foundation v1 | `accepted` | Deterministic offline corpus and structural verifier. | [Benchmark package](../../evals/recursus/README.md) |
| RC-2 | Claude Code reference capture | `accepted` | Reproducible reference-route run records from unchanged Career Ops. | [RC-2 v4 registration](../../evals/recursus/rc2-claude-code-reference-v4/registration.json) |
| RC-3 | Minimal Recursus execution bridge | `accepted` | One bounded direct-adapter route produced independently validated evidence without a parity claim. | [RC-3 V17 record](../../evals/recursus/rc3-recursus-direct-v17/README.md) |
| RC-4 | Compiled prompt and context parity | `accepted` | Four pilot contracts compiled to two offline route bundles with matching registered semantics. | [Accepted specification](RC4_SPEC.md) |
| RC-5 | Disposable end-to-end value slice | `kept` | Three one-request comparisons produced two wins and one tie; the user adopted `KEEP`. | [RC-5 decision record](RC5_SLICE_CARD.md) |
| RC-6 | Promotion hardening and durable completion | `accepted` | The corrected provider-free validation executor passed its fault matrix and exact-head CI; the original retained-image gate remains blocked. | [Closed specification](SPEC.md) |
| RC-7 | Selective RLM research | `stopped` | V25 completed the comparison, but one critical candidate-fact fabrication forced terminal `STOP`. | [Postmortem](RC7_POSTMORTEM.md) |
| RC-8 | Honcho advisory memory | `conditional` | Test continuity only if a future bounded workflow needs durable preferences or context. | Not scheduled |
| RC-9 | Dovetail delegation and routing | `conditional` | Test delegation only for work whose coordination cost can be justified. | Not scheduled |
| RC-10 | Company, lab, and relationship intelligence | `conditional` | Reuse verified intelligence without collapsing facts, inferences, and memory. | Not scheduled |
| RC-11 | Operator experience | `conditional` | Add inspection, approval, pause, resume, and audit surfaces to a stable path. | Not scheduled |
| RC-12 | Expanded pilot and release evidence | `conditional` | Support narrowly scoped release claims with registered comparative evidence. | Not scheduled |

## RC-4: Compiled prompt and context parity

RC-4 is accepted historical compiler-boundary work. Its immutable contract and limits are preserved in [RC4_SPEC.md](RC4_SPEC.md); it is not an active implementation worklist.

## RC-6: Promotion hardening and durable completion

RC-6 is accepted only for the registered provider-free validation-executor result documented by [SPEC.md](SPEC.md) and [RC6_SLICE_CARD.md](RC6_SLICE_CARD.md). It does not establish live-provider recovery, provider-side exactly-once behavior, production readiness, provider-neutral behavior, or execution of the original retained image. Its source-bound contract and handoff remain immutable historical inputs.

## RC-7: Selective RLM research

RC-7 completed its registered comparison and stopped. The [specification](RC7_SPEC.md), [slice record](RC7_SLICE_CARD.md), and [postmortem](RC7_POSTMORTEM.md) preserve the exact boundary and result. The terminal `STOP` is neither `KEEP_RLM_CANDIDATE`, `REBUILD_RLM_CANDIDATE`, nor `NO_RLM`; it grants no repair, rerun, integration, publication, or deployment authority.

The [orchestrator-guided RLM proposal](ORCHESTRATED_RLM_PROPOSAL.md) remains the non-normative design rationale. The [inactive successor specification](ORCHESTRATED_RLM_SPEC.md) defines requirements for a separately authorized future slice; neither document changes or continues RC-7.

## Conditional work

RC-8 through RC-12 are options, not a queue. Start one only when a new bounded milestone identifies a concrete need and can measure whether the added authority, cost, or complexity is worthwhile. Promotion-grade freezing, repeat matrices, cross-platform acceptance, and causal ablations return before a supported path, public comparative claim, or sensitive authority expansion.

## Cross-cutting invariants

1. Evaluator-only oracle data never becomes agent input.
2. Candidate facts still come only from the Career Ops source-of-truth boundary.
3. Job descriptions and other external content remain untrusted data, never instructions.
4. Hashes establish byte identity only, not truth, authorship, execution, or freshness.
5. Model self-report is not runner attestation or verified completion.
6. Unsupported, blocked, failed, incomplete, and stopped work must remain distinguishable.
7. Benchmarks never submit applications, send messages, or perform another external mutation.
8. Safety and factuality failures cannot be hidden inside a favorable aggregate result.
9. Preserve enough evidence to explain each decision without copying full execution journals into this roadmap.

## Change policy

A material roadmap change records the affected milestone, why ordering changed, which contract or benchmark changed, whether existing evidence remains comparable, and whether an allowed claim must be withdrawn. Updating this roadmap does not change feature availability; update the [feature registry](features/REGISTRY.md) only when its implementation and evidence statements change.
