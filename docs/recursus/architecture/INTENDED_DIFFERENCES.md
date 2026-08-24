# Intended Recursus differences

[Architecture](README.md) | [Prompt contract](PROMPT_CONTEXT_CONTRACT.md) | [Feature registry](../features/REGISTRY.md) | [Benchmarks](../benchmarks/README.md)

## Status rule

Every section below describes a target difference unless it explicitly says otherwise. The current Recursus Careers code is the inherited Career Ops baseline. A component prototype or specification does not make a difference integrated or user-available.

## Summary matrix

| Area | Career Ops reference | Intended Recursus difference | Proof required before availability claim |
| --- | --- | --- | --- |
| Prompt and context | Shared mode files plus runner-specific loading and wrappers | One versioned semantic prompt contract compiled for every provider | 100 percent context-parity tests and provider capture evidence |
| Run state | Files plus workflow-specific batch and web state | One durable project-scoped run graph for every workflow | Restart, replay, concurrency, and projection-rebuild tests |
| Recovery | Batch-specific retry and resume, other runs vary by runner | Supervised execution with explicit lost, paused, blocked, failed, and verified states | Fault injection across processes, children, tools, and restarts |
| Completion | Local scripts and prompt instructions check parts of the workflow | Versioned evidence gates prevent premature completion | Required validators block completion and stale evidence is invalidated |
| RLM | No Career Ops-specific RLM path | Selective persistent computation for deep lab, paper, repository, and large-evidence work | Ablation improves eligible cases without generic or safety regression |
| Memory | Canonical files plus harness-specific behavioral memory | Honcho recall is bounded, source-labeled, advisory, and lower authority than current files | Poisoned, stale, unavailable, and wrong-project memory tests |
| Provider policy | Shared instructions with uneven prompt, tool, permission, and output paths | Provider adapters implement one contract and one capability policy | Multi-provider conformance with exact differences recorded |
| Delegation | Prompt-level delegation and runner-native children | Durable child work nodes with ownership, budgets, evidence, cancellation, and integration responsibility | Conflict, cancellation, restart, malformed result, and bounded fan-out tests |
| Company intelligence | Research is usually tied to one role or report | Reusable, dated company, lab, person, paper, repository, and relationship records | Cross-role reuse improves quality while stale and private data stay contained |
| Observability | Runner-specific logs and partial usage records | Every run records identity, context, model, tools, artifacts, mutations, usage, and verification | Complete manifest validation across all supported routes |

## 1. One compiled prompt and context contract

### Intended behavior

- Career Ops policies, mode instructions, profile sources, task data, output schema, and tool policy compile into a versioned intermediate representation.
- Each block carries source, hash, trust, authority, budget policy, and required status.
- Provider adapters translate structure, not semantics.
- Job descriptions and other external data appear once in a task-data layer.
- `_profile.md` and `_custom.md` cannot disappear silently on one provider path.
- Silent truncation is forbidden. A route either records a declared budget action or fails compilation.

### Not the goal

Byte-identical provider request JSON is not required. Providers use different role and tool-schema formats. Semantic blocks, trust, authority, and output meaning must remain equivalent.

### Required proof

See [Prompt and context contract](PROMPT_CONTEXT_CONTRACT.md). Advancement requires structural parity on every supported adapter and injection-resistance tests with no policy-authority inversion.

## 2. Durable run state, retries, and recovery

### Intended behavior

One append-only, versioned run service owns:

- objective and acceptance criteria;
- plan nodes, dependencies, priority, and next action;
- provider, tool, token, time, and retry budgets;
- approvals, blockers, waivers, and operator decisions;
- child identities, ownership, and cancellation;
- artifact and mutation identities;
- evidence and completion-gate status.

After restart, Recursus rebuilds the same materialized state and resumes at the first incomplete eligible action. External actions distinguish not attempted, in progress, succeeded, failed before success, ambiguous success, and verified success.

### Not the goal

At-least-once retry is not described as exactly-once behavior. Process ID reuse is not reconnection proof. Honcho memory is not run state.

### Required proof

The recovery suite must cover interrupted publication, corrupt event tail, stale locks, concurrent writers, projection rebuild, reused process IDs, ambiguous external success, child orphaning, cancellation, and full runtime restart.

## 3. Evidence-backed completion

### Intended behavior

Each workflow registers a versioned completion contract containing required, optional, and explicitly waivable gates. Every gate records:

- verifier and version;
- input and artifact hashes;
- status, time, and freshness;
- bounded evidence;
- failure class and next corrective action;
- operator identity and reason for any waiver.

The run cannot become complete while a mandatory gate is missing, stale, failed, unavailable, or supported only by prose.

### Required proof

Change an input after a successful validator and prove the old success becomes stale. Restart during verification. Exercise deterministic and flaky failures. Confirm that a model's completion statement cannot bypass the contract.

## 4. Selective RLM

### Intended behavior

RLM is selected for work that benefits from persistent computation or structured exploration, such as:

- comparing many lab publications and research directions;
- building a source-backed company or people map;
- inspecting repositories and commit histories;
- analyzing paper collections or long technical documents;
- deduplicating and joining large job or company datasets;
- running exact calculations or reproducible transformations.

The route decision is visible and budgeted. Results enter run state through bounded evidence or exact local artifacts.

### Limits

RLM is not the planner, run-state provider, or delegation coordinator. Direct Python has operating-system authority and is not a sandbox. Recovery must not replay side-effecting cells blindly.

### Required proof

Compare `rc-rlm` with `rc-direct` on registered RLM-eligible and generic cases. RLM must improve an eligible quality or completion metric, preserve generic quality and safety, and report its added latency, compute, tokens, and failures.

## 5. Honcho as advisory memory

### Intended behavior

Honcho may help recall:

- stable style and process preferences;
- prior interactions and relationship history;
- outcome learnings and repeated workflow corrections;
- source references worth considering again.

Every recalled item carries source, trust, freshness, sensitivity, cost, and selection reason. Current canonical files and explicit current-turn statements always have higher authority.

### Forbidden authority

Honcho cannot establish candidate accomplishments, metrics, authorship, credentials, objective state, plan state, approval state, child state, or completion. Recursus must work correctly when Honcho is disabled, delayed, stale, or unavailable.

### Required proof

Use benign, stale, poisoned, contradictory, and wrong-project recall fixtures. Any unsupported candidate claim sourced from memory is a critical failure.

## 6. Provider-neutral permissions and tool policy

### Intended behavior

Recursus defines provider-independent capability profiles for reading, writing, shell execution, browser use, network access, subagents, RLM, memory, and external mutations. An adapter maps that profile to the active runtime and records any unsupported control.

Provider selection and credentials remain DSH concerns. No adapter may silently change the model, reasoning setting, tools, trust order, or lifecycle semantics.

### Provider-neutrality maturity

- **PN1, provider-neutral contract:** interfaces have no concrete provider assumption.
- **PN2, provider-pluggable implementation:** at least two providers can be configured.
- **PN3, behaviorally provider-neutral:** at least two real providers pass the same conformance and product corpus.

Documentation must name which level has evidence. Current design intent alone supports none of the behavioral claim. The canonical definitions live in [Feature documentation](../features/README.md#provider-neutral).

## 7. Durable delegation and Dovetail

### Intended behavior

Every delegated unit has a stable identity, parent, objective, result schema, dependencies, priority, workspace ownership, context policy, provider and tool budget, time and retry budget, cancellation path, required evidence, and integration owner.

Dovetail may recommend whether and how to delegate. The coordinator enforces ownership, conflicts, budgets, and completion. Dovetail cannot broaden authority or declare a run complete.

### Required proof

Test bounded fan-out, dependency scheduling, shared read-only work, isolated mutable worktrees, write conflicts, cancellation, timeout, parent restart, child replacement, malformed evidence, and deterministic integration order.

## 8. Reusable company and relationship intelligence

### Intended behavior

Research should become a dated, reusable evidence layer across roles:

- company and lab identity;
- research directions and publications;
- public repositories and technical signals;
- people, roles, and affiliation history;
- funding, product, and organization changes;
- job families, requisitions, reposts, and role lineage;
- candidate-specific relevance and unresolved questions.

Facts keep source, capture time, confidence, sensitivity, and invalidation status. Role-specific interpretation remains separate from reusable public facts.

### Required proof

Longitudinal scenarios must show correct reuse, stale-fact rejection, affiliation updates, role-lineage tracking, and privacy separation. Reuse should reduce research cost or improve quality without spreading an old mistake.

## 9. Exact run recording

### Intended behavior

Every attempted run records:

- harness, repository, component, workflow, prompt, parser, and validator versions;
- provider, exact model when reported, reasoning setting, and adapter;
- semantic context block hashes and trust labels;
- tools, permissions, budgets, retries, and manual interventions;
- state events, child lineage, artifacts, mutations, and verification;
- input, cached input, output, and reasoning usage when available;
- latency, reported cost, errors, and protocol deviations.

Unavailable fields are `null` or `not reported`. The UI must not infer an exact model from a selected runner name.

### Required proof

Run-manifest validation must pass for every supported path. Historical results missing runner, model, permission, or workflow identity cannot support controlled comparisons.

## Non-goals

Recursus Careers is not intended to:

- replace the established upstream Career Ops domain model for the sake of novelty;
- mass-submit applications;
- treat model fluency as factual evidence;
- make Honcho memory authoritative;
- use RLM as a security boundary;
- promise identical behavior from every model without testing;
- claim better career outcomes from an offline artifact benchmark;
- hide unsupported or weaker provider paths.
