# Recursus Careers documentation

This directory documents the experimental Recursus execution path for Career Ops: what has been demonstrated, what remains unavailable, and which evidence may support each claim. Recursus Careers and the external Recursus runtime remain separate projects.

## Current status

| Milestone | Status | What it establishes |
| --- | --- | --- |
| RC-0 through RC-4 | `accepted` | Documentation boundaries, an offline benchmark foundation, reference capture, one bounded execution bridge, and an offline prompt/context compiler boundary. |
| RC-5 | `kept` | A bounded three-case `oferta` learning comparison completed with two wins and one tie and no factual or safety correction. This is not production readiness. |
| RC-6 | `accepted` | The registered provider-free validation executor passed its corrected fault matrix and exact-head CI. The original retained-image gate remains explicitly blocked. |
| RC-7 | `stopped` | The complete v25 comparison triggered a terminal safety stop after one direct `FACT-01` fabricated-candidate-fact critical failure. It produced no keep, rebuild, `NO_RLM`, integration, or promotion decision. |
| RC-8 through RC-12 | `conditional` | Possible follow-ups only when a new bounded milestone justifies their authority, cost, and complexity. |

The [feature registry](features/REGISTRY.md) is the canonical availability and evidence record. The [roadmap](ROADMAP.md) tracks sequencing and decisions; it does not establish feature availability.

## Start here

| Area | Purpose | Document |
| --- | --- | --- |
| Latest result | RC-7 closure, evidence limits, and lessons | [RC-7 specification](RC7_SPEC.md) and [postmortem](RC7_POSTMORTEM.md) |
| Future RLM investigation | Inactive orchestrator-guided successor contract and its design rationale | [successor specification](ORCHESTRATED_RLM_SPEC.md) and [proposal](ORCHESTRATED_RLM_PROPOSAL.md) |
| Roadmap | Current status and conditional follow-ups | [ROADMAP.md](ROADMAP.md) |
| Features | Ownership, maturity, evidence, and limitations | [features/REGISTRY.md](features/REGISTRY.md) |
| Architecture | Runtime boundaries and intended differences | [architecture/README.md](architecture/README.md) |
| Benchmarks | Routes, scenarios, metrics, and promotion rules | [benchmarks/README.md](benchmarks/README.md) |

## Preserved evidence and contracts

These documents remain because they contain unique evidence, provenance, or source-bound accepted/stopped contracts:

- [RC-3 source and component selection](RC3_SOURCE_SELECTION.md) and [archive record](RC3_ARCHIVE_RECORD.md)
- [Accepted RC-4 specification](RC4_SPEC.md)
- [Retained RC-5 slice and decision record](RC5_SLICE_CARD.md)
- [Closed RC-6 specification](SPEC.md), [closure card](RC6_SLICE_CARD.md), and source-bound historical handoff
- [Stopped RC-7 specification](RC7_SPEC.md), [slice record](RC7_SLICE_CARD.md), [postmortem](RC7_POSTMORTEM.md), and source-bound Gate A handoff
- [Benchmark Foundation and versioned evidence packages](../../evals/recursus/README.md)

The obsolete RC-3, RC-4, and initial RC-5 kickoff prompts were removed after their work completed or their handoff was superseded. Source-bound RC-6 and RC-7 records remain immutable even when their prose is historical.

## Product and evidence boundary

Career Ops remains the domain source of truth for evaluation, research, CV generation, tracking, scanning, interviews, and the human submission gate. Recursus Careers owns only the integration and evidence surfaces implemented in this repository. Recursus, DSH, RLM, Honcho, Dovetail, provider adapters, runners, and exact models remain separately identified components.

Current evidence supports only the scoped statements recorded in the registry:

- RC-1 validates corpus structure and fixture integrity; it does not execute a model.
- RC-2 records reference-route process and artifacts; it is not an oracle or comparison result.
- RC-3 establishes one pinned execution-route conformance result; it does not establish feature parity or product integration.
- RC-4 establishes registered offline prompt/context structural semantics; it does not establish provider behavior or output quality.
- RC-5 is a bounded product-learning result, not a supported path or universal superiority claim.
- RC-6 establishes only its registered provider-free validation-executor result, not live-provider recovery, production readiness, or provider-neutral behavior.
- RC-7 ended at `STOP`; its evidence grants no repair, rerun, integration, publication, or deployment authority.
- The orchestrator-guided successor specification is an inactive future contract. It does not schedule a milestone or authorize implementation or execution.

Hashes establish byte identity only. A model statement is not runner attestation, and documentation is not implementation or acceptance evidence.

## Governing sources

- Career Ops behavior and safety rules: root [AGENTS.md](../../AGENTS.md) and the active mode files
- Prompt and context contract: [architecture/PROMPT_CONTEXT_CONTRACT.md](architecture/PROMPT_CONTEXT_CONTRACT.md)
- Comparison and advancement rules: [benchmarks/METRICS_AND_PROMOTION.md](benchmarks/METRICS_AND_PROMOTION.md)
- Pinned runtime selection: [RC3_SOURCE_SELECTION.md](RC3_SOURCE_SELECTION.md)

Binding agent rules belong in an `AGENTS.md` or mode file loaded by the active harness. Descriptive pages in this directory must not silently become operating instructions.
