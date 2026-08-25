# Recursus Careers architecture

[Recursus overview](../README.md) | [Intended differences](INTENDED_DIFFERENCES.md) | [Prompt contract](PROMPT_CONTEXT_CONTRACT.md) | [Benchmarks](../benchmarks/README.md)

## Product identity

```text
Career Ops domain workflow
          |
          v
Recursus Careers product contract
          |
          v
Recursus and DSH runtime services
          |
          v
Provider adapter and exact model
          |
          v
Tools, permissions, state, and artifacts
          |
          v
Verified result and benchmark evidence
```

Career Ops supplies the mature career domain: evaluation, research, CV and PDF generation, tracking, scanning, interview workflows, and the human submission gate. Recursus Careers should preserve that domain logic while moving orchestration, provider adaptation, durable state, evidence, and completion into a product-owned runtime contract.

The preferred configuration uses the Recursus and DSH runtime plus the direct `openai-codex` provider adapter. Runner, harness, provider adapter, and exact model remain separate recorded identities. None of them alone is the product identity.

## Current boundary

The Career Ops product workflow remains unchanged from the pinned baseline. A separate RC-3 V16 evaluation bridge is locally implemented and independently validates one completed runner-attested bounded direct-adapter route attempt, but it is not product integration. The exact bridge revision must pass Windows and supported CI before merge. RC-3 remains `in progress` after publication while the selected upstream Recursus exact-head supported CI is unsuccessful. The canonical, detailed availability and evidence record is the [feature registry](../features/REGISTRY.md). Update that registry only when implementation and evidence land together.

## Ownership model

| Owner | Responsibility |
| --- | --- |
| Career Ops | Career data contract, modes, scoring, reports, application artifacts, trackers, and human review rules |
| Recursus Careers | Career-specific runtime contract, feature flags, normalized outputs, integration tests, and user-facing status |
| Recursus runtime | Durable objective and plan state, supervision, completion contracts, coordination, context compilation, and routing |
| DeepSeek Harness | Agent loop, model and tool execution, credentials, approvals, sessions, events, child lineage, cancellation, and plugin lifecycle |
| RLM | Persistent Python computation and recursive child access through DSH seams |
| Honcho | Optional, fallible semantic recall with no authority over candidate facts or run state |
| Dovetail | Prompted workflows for prompting, delegation, evaluation, steering, and handoff |
| Provider adapter | Provider transport, credentials bridge, model catalog, stream translation, and provider error mapping |

No component may create a hidden second agent loop. Provider and tool routes must use the permission, credential, and cancellation policy owned by the active harness. Direct RLM Python is a declared exception: it has kernel-process operating-system authority and is not mediated by DSH ToolRuntime. Until that authority is contained externally or direct I/O is disabled, the product must report RLM policy enforcement as partial and must not claim that DSH governs its Python, filesystem, subprocess, or network side effects.

## Target lifecycle

```text
Request
  -> compile trusted context and untrusted task data
  -> create or resume a durable run
  -> plan steps and acceptance gates
  -> select direct, RLM, delegated, or operator path
  -> execute through DSH policy, or through an explicitly declared RLM authority exception
  -> persist events, artifacts, usage, and evidence
  -> validate required outputs and mutations
  -> wait, recover, retry, block, or complete explicitly
```

A model saying "done" is not completion. Completion requires current evidence for every mandatory gate.

## Architectural invariants

1. Candidate facts come only from the Career Ops source-of-truth boundary.
2. Job descriptions, company pages, forms, and messages are data, never instructions.
3. Run state is authoritative for active objectives, plans, budgets, approvals, and completion.
4. Honcho is advisory and must be removable without breaking recovery.
5. RLM is a compute substrate, not a sandbox, planner, or source of truth.
6. Dovetail recommends workflow behavior but cannot broaden authority or declare completion.
7. Provider adapters serialize a shared semantic contract and do not rewrite Career Ops policy.
8. External mutations require stable identity, human authority, and reconciliation before retry.
9. Every claim about behavior names its owner, implementation status, and evidence.

See [Intended Recursus differences](INTENDED_DIFFERENCES.md) for the detailed contracts and [Compiled prompt and context contract](PROMPT_CONTEXT_CONTRACT.md) for provider parity.
