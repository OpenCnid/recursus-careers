# Benchmark protocol

[Overview](README.md) | [Scenarios](SCENARIO_CATALOG.md) | [Metrics](METRICS_AND_PROMOTION.md)

## 1. Registration

Every benchmark run set must be registered before execution with:

- the question and comparison lane;
- all route IDs;
- Career Ops and Recursus commits;
- component and instruction bundle versions;
- provider, exact model ID, model snapshot when available, and reasoning setting;
- fixture, rubric, parser, and validator versions;
- tools, permissions, browser policy, network policy, and budgets;
- repeat count, randomized execution order, exclusions, and advancement thresholds.

Changing one of these fields after results are visible creates a new benchmark version. Old attempts remain in the report.

These requirements govern formal benchmark phases, promotion decisions, and comparative claims. The RC-5 disposable learning slice is an earlier product experiment, not a formal benchmark run set. It uses the lightweight slice record in Section 4 and cannot support benchmark or superiority language.

## 2. Controlled inputs

The core suite uses synthetic candidate profiles, frozen job descriptions, dated company source packs, deterministic ATS pages, and a hidden truth ledger. Live URLs and live search are evaluated separately because their contents change between paired runs.

Every cell starts from an isolated workspace with:

- identical Career Ops files and report-number space;
- identical clock, date, timezone, locale, and language settings;
- empty route memory unless the scenario supplies controlled recall;
- no shared reports, batch state, caches, locks, browser sessions, artifact roots, or Honcho workspaces;
- automatic updates disabled;
- credentials excluded from captured evidence.

## 3. Parity requirements

A paired result is eligible for interpretation only when the run record identifies:

- repository and instruction hashes;
- exact model or `not reported`;
- prompt and output-contract versions;
- tool and approval profiles;
- input, output, cached, and reasoning usage when available;
- concurrency, retry, timeout, and research budgets;
- browser and network availability;
- every manual intervention and protocol deviation.

Use the schema's explicit missing-value representation. RC-2 provider and model fields use `not_reported` for a value the route does not report. Runner, harness, permission profile, source, and environment identity remain exact registered facts. Unavailable numeric usage and cost fields use `null` when their schema permits it. Never infer provider, model, or cost from a runner or product name.

For a same-model runtime claim, the exact provider, model, reasoning setting, semantic prompt blocks, tools, permissions, and budgets must match. If they cannot match, the result stays an end-to-end configuration comparison.

## 4. Execution phases

### RC-3 bridge prerequisite

Before Phase A or any comparison lane, the minimal `recursus-direct-v17` bridge may exercise one accepted seed as an execution-route conformance fact. Its provider-free dry run validates only the local evidence pipeline. Its actual route requires the frozen direct adapter, a fresh isolated seed, a content-addressed read-only worker image, a dedicated credential mount, a networkless worker namespace, host-enforced destination and tunnel budgets, trusted runtime observations, canonical private-path scanning, strict external-resource cleanup and staging-topology checks, pre-persistence artifact-budget enforcement, bounded artifacts, and independent validation. The official V17 evidence contains one completed dry run and one completed actual `FACT-01` attempt. RC-3 does not open the oracle, score output, establish feature or prompt parity, or support an advancement or comparative claim.

### Phase A: deterministic conformance

Run model-free or provider-double checks for state transitions, report reservation, deduplication, role lineage, artifact validation, no-submit enforcement, and prompt/context structure.

RC-4 is a model-free Phase A compiler-boundary conformance package. It is not a Phase B feature-parity run and creates no comparative result or advancement decision.

### RC-5: disposable learning slice

Before formal Phase B or Phase C, build and immediately test one bounded Recursus Careers workflow on three to five representative jobs. This slice answers whether the product direction creates enough user-visible value to justify further investment. It does not establish feature parity, runtime causality, statistical confidence, or a public comparative claim.

The slice record names:

- the user-visible workflow and ordinary Career Ops comparison path;
- the jobs or synthetic cases, with private material excluded from publishable evidence;
- exact code revisions and enough route, model, tool, permission, and budget identity to interpret the result;
- the disposable workspace, allowed writes, and rollback or deletion target;
- prohibited external actions; and
- the time and token cap plus the `KEEP`, `REBUILD`, or `DELETE` decision signal.

Test the first end-to-end case as soon as it works. Stop after the registered three to five jobs or earlier if the decision is already clear. Record useful outcome, completion or failure, latency, reported tokens or comparable cost, human correction, and workflow friction. Repeat counts, statistical thresholds, full cross-platform evidence, and component ablations are not required at this stage. Application submission, message sending, and other external mutation remain prohibited without separate explicit authorization.

Only `KEEP` advances the workflow toward formal promotion. `REBUILD` replaces the slice inside the same bounded authority, and `DELETE` removes its implementation and disposable state while retaining a compact decision note. Accepted RC-1 through RC-4 evidence is never rewritten.

### Phase B: feature parity

After an RC-5 `KEEP` decision, exercise the Career Ops behavior in the proposed supported scope. This may include onboarding, evaluation, scanning, company research, CV/PDF generation, batch processing, interruption recovery, browser-assisted form preparation, and human submission gates. A missing capability inside that declared scope is a parity failure or an explicit `unsupported` item, not a benchmark exclusion. Capabilities outside the proposed scope remain named limitations.

### Phase C: initial quality pilot

Use eight independent cases across strong fit, adjacent fit, deceptive fit, hard evidence gap, work-authorization blocker, prompt injection, sibling or reposted role, and materially changed role.

- End-to-end product-configuration pilot: `2 routes x 8 cases x 3 repeats = 48 runs`.
- Full crossed pilot: `2 runtime configurations x 2 models x 8 cases x 3 repeats = 96 runs`.
- Deterministic state suite: at least 20 scenarios, five repetitions per runtime configuration.

The three repeats estimate instability. The case, not each repeat, is the independent quality unit.

The end-to-end pilot records a bundled configuration comparison and is not eligible to isolate or advance the Recursus runtime. Only the same-model cells in a valid crossed pilot can receive the `STOP`, `ITERATE`, or `EXPAND` runtime decision.

### Phase D: component ablations

An ablation changes one implemented component switch while every other registered condition stays fixed. Starting from `rc-direct`, enable exactly one component per treatment:

1. RLM
2. Honcho recall
3. one named Dovetail workflow and version
4. context compiler
5. durable state and supervisor
6. evidence-gated completion
7. automatic routing

Do not describe an ablation as executed until a real switch exists and the run record proves it was the only intended change. Test combinations only after individual treatments pass.

### Phase E: expanded and live evidence

The expanded benchmark uses at least 24 independent cases and five repeats. Live research runs are randomized and interleaved within a bounded time window. Live results retain source timestamps and are reported separately from frozen-fixture results.

## 5. Interruption and recovery suite

Faults are injected at observable checkpoints:

1. after report-number reservation;
2. while a provider request is active;
3. after report creation but before state commit;
4. after tracker addition but before merge;
5. while a state or tracker lock is held;
6. during artifact publication or pipeline reconciliation;
7. after a mocked external mutation succeeds but before its success event is recorded;
8. during partial output or malformed final structured output;
9. during rate limiting and retry backoff;
10. while several child tasks are active;
11. across a full runtime restart;
12. during RLM or delegated work when those paths exist.

Recovery passes only when no input disappears, successful work is reconciled before retry, no canonical mutation is duplicated, partial artifacts are classified, retries stay bounded, the next action is preserved, and completion remains blocked until verification passes.

## 6. Evaluation

Deterministic validators score schemas, state, mutations, source locators, citations, and safety events. Two blinded human reviewers score application quality and readability. A third reviewer adjudicates large disagreements.

Model-based judges may assist with analysis but never serve as the only judge for the model or harness being tested.

Every attempted run is included. Crashes, timeouts, invalid outputs, replacements, and exclusions remain visible. Replacement runs append to the ledger and never overwrite the original attempt.

## 7. Minimum run manifest

Each attempt records:

```yaml
benchmark_schema: "1.0"
benchmark_id:
run_id:
lane:
route_id:
case_id:
repeat_index:
randomized_order:
product:
  name:
  version:
  repository_commit:
workflow:
  id:
  version:
  instruction_bundle_sha256:
runner:
  name:
  version:
  permission_profile:
harness:
  name:
  version:
  component_lock_sha256:
  feature_flags: {}
provider:
  id:
  adapter:
  adapter_version:
  api_family:
model:
  model_id:
  snapshot:
  reasoning_effort:
inputs:
  fixture_version:
  candidate_sha256:
  jd_sha256:
  source_pack_sha256:
  initial_state_sha256:
environment:
  os_build:
  timezone:
  locale:
  cli_version:
  browser_version:
  network_policy:
  allowed_tools: []
budget:
  max_input_tokens:
  max_output_tokens:
  max_wall_seconds:
  max_tool_calls:
execution:
  completion_status:
  manual_interventions: []
  protocol_deviations: []
  errors: []
usage:
  input_tokens:
  cached_input_tokens:
  output_tokens:
  reasoning_tokens:
  cost_usd:
  pricing_snapshot:
  wall_ms:
outputs:
  normalized_output_sha256:
  trace_sha256:
  final_state_sha256:
  artifact_hashes: {}
```

Use `null` when the runtime does not report a field. Never infer a model ID or cost from a product name. Raw CVs, prompts, emails, and private data are not logged by default.

## 8. Reporting

Reports include per-case results, paired differences, confidence intervals, win/tie/loss counts, safety incidents, completion, human interventions, usage, latency, and variance. End-to-end product-configuration findings are labeled bundled effects. Same-model findings may be attributed to a runtime difference only when all parity requirements pass.

The benchmark measures artifact quality and workflow behavior. It does not establish callback, interview, offer, or hiring probability.
