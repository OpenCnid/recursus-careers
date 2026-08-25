# Recursus Careers benchmark overview

[Recursus overview](../README.md) | [Protocol](PROTOCOL.md) | [Scenarios](SCENARIO_CATALOG.md) | [Metrics](METRICS_AND_PROMOTION.md)

> **Status:** RC-1 foundation, accepted RC-2 v4 reference evidence, and an in-progress RC-3 V17 bridge with one validated provider-free dry run and one validated actual Recursus route attempt. No Recursus Careers comparison has been executed.

The model-free [Benchmark Foundation v1](../../../evals/recursus/README.md) is accepted for RC-1. It validates corpus structure and fixture integrity only and is not a benchmark result.

## RC-2 reference-capture status

The accepted versioned [RC-2 v4 registration](../../../evals/recursus/rc2-claude-code-reference-v4/registration.json) binds route `co-claude-code`, the exact accepted corpus, OpenCnid repository revision, instruction and harness hashes, Claude Code 2.1.223, the read-only permission profile, environment policies, budgets, repeat count, randomized order, and deviations before provider output. Its ledger contains one completed provider-free dry run and twelve actual attempts captured on Windows, exactly three for each registered scenario. Under preregistered deviations `RC2-DEV-CONTENT-ONLY` and `RC2-DEV-HOST-PREFLIGHT`, all twelve actual attempts have terminal status `completed` and termination reason `none`. Complete-set validation passes on the capture host, and the focused RC-2 tests passed the full Ubuntu, macOS, and Windows CI matrix on exact reviewed implementation head `e50e787149e7e15aac373e1bc7981a1fbcd65795`. Provider identity is `not_reported`; the trusted runner envelope explicitly reported model `claude-sonnet-5` in all twelve actual attempts. The V4 evidence-root README is a hash-bound preregistration snapshot and retains its pre-attempt status text; the append-only ledger and this benchmark overview state the current result. A preserved historical [v1 record](../../../evals/recursus/rc2-claude-code-reference-v1/README.md) records the earlier expired OAuth session. Historical [v2 evidence](../../../evals/recursus/rc2-claude-code-reference-v2/README.md) and v3 evidence contain only provider-free dry runs. V3 was superseded because its source snapshot paired the OpenCnid merge revision with the upstream Career Ops repository URL. All historical records remain sealed.

These records are at most L1 run facts. They do not compare output with an oracle or another route. They do not establish factuality, safety, application quality, feature parity, advancement, comparative performance, or hiring outcomes. RC-2 is accepted through PR #2.

## RC-3 bridge status

The versioned [`recursus-direct-v17` registration](../../../evals/recursus/rc3-recursus-direct-v17/registration.json) binds the exact Recursus, DSH, adapter, runner, harness, model, reasoning, permission, policy, budget, seed, authority, immutable image, source closure, and evidence identities for one `FACT-01` attempt. The configured model is `gpt-5.6-sol`, its snapshot representation is `configured_catalog_model_id`, and reasoning is `xhigh`. The route selects the direct `deepseek-openai-codex` adapter. OpenAI Codex CLI and Claude Code CLI are not transport for this route.

The offline pipeline validates seeding, bridge-input construction, bounded synthetic output capture, normalization shape, content-safe tracing, exact artifact inventory, runner-manifest construction, oracle, credential, decoded private-path, Markdown and HTML text, complete-input and staging scanning, and cross-references. Two independent V17 dry checks have identical deterministic hashes. The official external evidence validates one dry run and one fresh-seed actual attempt as `completed`; the actual termination reason is `none`. The actual runner attests one DSH request, one direct-adapter invocation, one registered application fetch, one trusted terminal event, one 390-byte text artifact, no denied or unregistered access, reconciled host authority observations, strict successful cleanup checks, and no unexpected seed mutation. V1 through V16 remain preserved historical contract records and are not promoted. V1 had no materialized executable source closure to archive. Existing V2 through V15 executable sources and V4 through V15 focused tests are operator-archived and absent from the current checkout. V10 and V12 through V15 were rejected after review; V11 stopped before runtime or provider invocation; V16 remains a valid historical route pinned to the predecessor Recursus revision. The selected V17 Recursus revision passed exact Ubuntu and Windows CI, while Recursus Milestone 1 and current-pin Linux acceptance evidence remain incomplete. Exact Careers implementation commit `7fe377863dc8b6b5cc584fe5225fb8a6f837b695` passed the required Windows and supported CI in PR #4, so RC-3 is `accepted`.

The dry run is not a provider double for output quality. The actual record is an L1 execution-route conformance fact only. RC-3 performs no oracle evaluation, scoring, human review, factuality or safety judgment, prompt or feature parity analysis, advancement decision, comparison, application-quality review, or hiring-outcome analysis.

## Purpose

The benchmark separates four questions that are easy to confuse:

1. Which complete product stack performs better for a user?
2. Does Recursus preserve the mature Career Ops behavior?
3. Does the Recursus runtime improve results when the model is held constant?
4. What does RLM, Honcho, or Dovetail contribute on its own?

No single comparison answers all four. In these documents, **advancement** means moving a route or feature to broader testing. An **ablation** toggles one component while holding all other registered conditions fixed.

## Reference hierarchy

| Route ID | Product and workflow | Runner or harness | Provider and model | Permission identity | Role in the benchmark |
| --- | --- | --- | --- | --- | --- |
| `co-claude-code` | Pinned Career Ops | Claude Code CLI | Exact values recorded per run | Exact CLI and project configuration recorded | Primary upstream reference |
| `co-codex-cli` | The same Career Ops snapshot | OpenAI Codex CLI | Exact values recorded when reported | Exact CLI and project configuration recorded | Existing compatibility route |
| `rc-direct` | Recursus Careers, direct route | Recursus plus DSH | One fixed exact provider and model | Registered Recursus capability profile | Minimal Recursus treatment with RLM and Honcho disabled |
| `rc-rlm` | Recursus Careers, selective RLM | Recursus plus DSH | Same as `rc-direct` | Same as `rc-direct`, plus declared RLM authority | RLM ablation treatment |
| `rc-honcho` | Recursus Careers, controlled recall | Recursus plus DSH | Same as `rc-direct` | Same as `rc-direct` | Memory ablation treatment |
| `rc-dovetail` | Recursus Careers, named Dovetail workflow | Recursus plus DSH | Same as `rc-direct` | Same as `rc-direct` | Workflow ablation treatment |
| `rc-auto` | Recursus Careers, automatic eligible routing | Recursus plus DSH | Preferred direct `openai-codex` adapter and exact model recorded | Registered full-treatment profile | Preferred product treatment after individual ablations pass |

The machine result value is `unsupported`; human-facing reports display "not supported." Missing model or permission identity is `not reported`. Neither label counts as a pass.

## Benchmark lanes

| Lane | Baseline | Treatment | Supported conclusion |
| --- | --- | --- | --- |
| Feature parity | `co-claude-code` | `rc-direct` | Whether Recursus covers the required Career Ops workflow surface |
| End-to-end product configuration | `co-claude-code` | `rc-auto` with the direct `openai-codex` adapter | Which bundled configuration performs better under the stated conditions |
| Codex compatibility route | `co-codex-cli` | `rc-direct` with the same exact model where possible | A closer provider/model control that still includes runner, harness, and transport differences |
| Same-model runtime comparison | Career Ops through a named runner and exact model | Recursus through DSH with the same exact model, semantic prompt, tools, permissions, and budget | Runtime effect, separate from model choice, only when every control matches |
| Model-only | Exact model A in one named runner or harness | Exact model B in that same runner or harness | Within-runner model effect |
| Ablation | `rc-direct` or the full accepted Recursus route | One component enabled or disabled | Contribution of RLM, Honcho, Dovetail, routing, or recovery |
| Longitudinal | The applicable accepted routes | The other route | Recall, stale-state handling, role changes, and relationship continuity |
| Live research | Accepted native routes | The other route | Real-world retrieval behavior, with time and source drift declared |

The end-to-end product-configuration lane cannot establish that Recursus or Codex alone caused a difference.

## Required benchmark order

1. Pass deterministic safety and data-integrity gates.
2. Match the declared Career Ops through Claude Code feature-parity surface.
3. Run the end-to-end product-configuration comparison.
4. Run a same-model runtime comparison where an exact shared model route exists.
5. Enable RLM, Honcho, and Dovetail one at a time.
6. Run the automatic route only after individual components have evidence.
7. Publish only the claims allowed by the resulting evidence level.

## What is measured

The primary axes are:

- candidate-claim factuality;
- evidence, provenance, and citation coverage;
- source freshness and stale-input detection;
- research depth and relevance for companies, labs, papers, repositories, and people;
- company-specific application quality;
- score and recommendation stability across repeated runs;
- recovery from interrupted work;
- verified artifact completion and pipeline integrity;
- prohibited side effects and private-data leakage;
- wall time, tokens, compute, retries, tool calls, cost, and human correction time.

Quality, safety, reliability, and efficiency are reported separately. They are not collapsed into one unexplained score.

## Evidence levels for comparison claims

| Level | Minimum evidence | Allowed wording |
| --- | --- | --- |
| L1, run fact | One pinned configuration and complete run record | "Route A completed 7 of 8 cases in run set X." |
| L2, controlled benchmark | Frozen fixtures, fixed rubric, matched controls, and all attempts reported | "Route A scored higher on benchmark X under these conditions." |
| L3, replicated scoped finding | Repeated runs across the stated cases and platforms with uncertainty reported | "Route A had a higher verified completion rate across this corpus." |
| L4, controlled within-runner model finding | Exact models in the same runner with matched prompts, tools, permissions, and budgets | "Within runner X, model A outperformed model B on the stated task population." |

Only a valid same-model runtime pilot can support an `EXPAND` decision under the registered thresholds. An end-to-end product pilot records a scoped bundled-configuration result but cannot isolate or promote the Recursus runtime. No pilot can establish universal superiority or improved hiring outcomes.
