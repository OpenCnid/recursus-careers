# Recursus Careers roadmap

Status: working roadmap

Last reviewed: 2026-08-27

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

RC-4 is the last infrastructure-heavy gate before testing product value. RC-5 replaced the former mandatory RC-5 through RC-7 sequence with one disposable end-to-end slice. RC-6 was subsequently scheduled and accepted for the retained surface. RC-7 Gate A qualified a falsifiable research question, and Gate B established containment conformance for one exact provider-free synthetic Docker boundary after independent red-team review. Historical failed activations, smokes, proofs, and the v18/v19 partial matrices remain immutable and no-replay; unactivated v20-v24 preparations remain zero-authority audit evidence. Policy v15 completed one contained end-to-end non-matrix `LAB-01` treatment. The final v25 comparison then sealed all 36 primary attempts, 72 broker terminals, nine contained RLM invocations, and 36 recursive children within the frozen authority. Its aggregate recorded 29 verified completions, seven zero-score treatment failures, -29.6296 eligible mean improvement, and one direct `FACT-01` `fabricated-candidate-fact` critical failure. The preregistered terminal is `STOP`, so RC-7 is closed without integrating, promoting, keeping, rebuilding, or rejecting RLM as `NO_RLM`.

Before implementation, record a lightweight slice card with:

- one user-visible workflow and three registered representative jobs;
- the branch, worktree, disposable state, allowed writes, and rollback or deletion target;
- prohibited external actions, especially application submission and message sending;
- an explicit time and token budget;
- the ordinary Career Ops comparison path; and
- the observations that will support `KEEP`, `REBUILD`, or `DELETE`.

Build only enough of the real path to answer the product question. Test as soon as one end-to-end case works, not after every planned capability is complete. Record user-visible usefulness, completion or failure, latency, token or comparable cost when reported, human correction, and workflow friction. Stop when the decision is clear.

For RC-6 and later slices, write handoffs using `study` rather than a shallow `read` instruction. The primary agent studies all binding instructions and required sources itself, then studies and applies the `subagent-composition` skill when available and spawns bounded multi-agents for parallel independent audits, disjoint implementation, and final red-team review. When that skill is unavailable, the session reports the limitation and uses equivalent built-in multi-agent composition. Every delegation has an exact scope, expected evidence, non-overlapping write boundary, and prohibited actions. The primary agent owns reconciliation and shared integration, and the final handoff records subagent tasks and model inheritance or overrides when observable.

Full preregistration, frozen evidence packages, repeat matrices, cross-platform acceptance, and causal ablations are promotion work. They are required before a supported product path, release, public comparative claim, or sensitive data, action, or security expansion. They are not prerequisites for a disposable learning slice. Accepted evidence remains immutable when a slice is rebuilt or deleted.

The closed normative record is the [RC-7 specification](RC7_SPEC.md), with the [RC-7 slice card](RC7_SLICE_CARD.md) as its operational summary and the [RC-7 postmortem](RC7_POSTMORTEM.md) as its learning review. The [RC-7 kickoff prompt](RC7_NEXT_TASK_PROMPT.md), closed [RC-6 specification](SPEC.md), [RC-6 slice card](RC6_SLICE_CARD.md), and [RC-6 prompt](RC6_NEXT_TASK_PROMPT.md) remain historical, as do the kept RC-5 and accepted RC-4 records.

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
| RC-5 | Disposable end-to-end value slice | `kept` | The user adopted `KEEP` after the anomaly-disclosure comparison produced two wins and one tie | RC-4 |
| RC-6 | Promotion hardening and durable completion | `accepted` | The registered provider-free validation executor passed its corrected fault matrix and exact-head CI; the original retained-image gate remains explicitly blocked | RC-5 `KEEP` and required Recursus supervision support |
| RC-7 | Selective RLM research | `stopped` | V25 completed the fresh 36-attempt comparison, but one direct `FACT-01` fabricated-candidate-fact critical failure forced terminal `STOP`; RC-7 makes no keep, rebuild, `NO_RLM`, integration, or promotion claim | RC-5 `KEEP`, RC-6 closure, qualified hypotheses, conformant Gate B evidence, repaired provider path, successful contained treatment proof, and the sealed v25 comparison |
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

The accepted executable contract is preserved in the [Benchmark Foundation v1 package](../../evals/recursus/README.md) and PR #1 history. The [RC-4 specification](RC4_SPEC.md) is now an accepted historical implementation boundary.

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

Active slice: [three-case disposable `oferta` contract](RC5_SLICE_CARD.md). The initial [RC-5 Codex kickoff prompt](RC5_NEXT_TASK_PROMPT.md) is retained only as historical kickoff material.

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

Current note: the first two RC-5 provider-free candidates returned `REBUILD` before FACT-01 because accepted V17 could not preserve RC-4's nine ordered system/user parts. The final rebuild pins direct-adapter revision `2fc02090af1632b86ee1175a6720904dfd71081c` and bounded executor image `sha256:6ebf9db128e1385659e0bfa8d86321e3c9936d142b49d4ef828d5aadcd5e086e` above the exact accepted V17 parent. Shared authority manifest `rc5-container-run-authority-v1` has digest `f8744737196faadb09582bf72ea3de2d43f494a73133d46239dfbe8d5e19f2b7`; the mutable interface preserves `S,S,S,S,U,U,U,U,S`, 4,000 output tokens, no tools, one call, and no retry. Two final provider-free preparations were byte-identical across all seven retained files with plan digest `0f11fe459331794ca53be04a7025c4e740f3c0248fe32450be58fbe6173dcf46`. PR #13 merged exact head `a3fa67237d95d166ca5d565c7404d15c0a33c0e9` as `d2eec76501a7edc53b5a64d71a64db852384847d` after all checks passed. After exact user authority, a fresh merged-main preparation reproduced the same plan and the external OAuth store again passed its no-copy preflight. `FACT-01` then consumed one provider slot and failed after exactly one endpoint request, with no retry, refresh, external mutation, trusted completion, or artifact; it reported zero input and output tokens. The relay reported no upstream failure and the proxy returned bytes, but application status and root cause were not retained, so the failure cannot be attributed to the provider, adapter, OAuth, TLS, model, or trailing-system item. The accepted baseline usefulness was `2`; treatment usefulness was `0`; relative result was `loss`. `FACT-03` and `SAFE-01` were not run. The durable stop latch and summarizer recommend `DELETE` because the first case did not complete and no useful treatment result exists; the user owns the final label. RC-6 and every other conditional successor remain conditional and unscheduled.

Diagnostic continuation: bounded executor image `sha256:f6ebef6ba4017ed84bd24e869449563fc7d77e7969ad581efef2a068cdd3b527` produced one authorized `FACT-01` endpoint request and retained `400 / INVALID_REQUEST / adapter_terminal`, with no retry, refresh, artifact, tokens, or external mutation. The provider body was not retained, so the exact rejected field cannot be recovered. Safe-detail tests retain only bounded code, parameter, and closed detail classifications. The user selected option 2 and accepted its explicit semantic change: all nine RC-4 parts remain inspectable, system parts `0,1,2,3,8` are promoted byte-for-byte into one leading Codex `instructions` value, and user parts `4,5,6,7` remain four user inputs. A network-disabled run through the actual pinned Pi builder captured nonempty instructions, four user messages, no tools, no `max_output_tokens`, `tool_choice: auto`, and `parallel_tool_calls: true` for all three cases. Completed results fail closed when reported output usage is absent or above 4,000; this verifies the accepted result locally but does not impose a provider-side generation cap. No fresh provider call or RC-6 work is authorized. The rebuilt bounded executor is pinned as `sha256:dbef08a99ae736e83b498d8b7dbf86660c244744e266a7a1e10e95cab5c12ea1`. Two independent exact `container-run` preparations each retained the same seven files byte-for-byte (`slice-plan.json` SHA-256 `0c5a14eb0dcc3095ad0ad4fc873904d0b7e6f372187e65e7bb3fd5a81781c97f`), with one deterministic 200 and one deterministic 503 per case, one request each, no retry, and zero provider calls.

Option 2 live diagnostic: one newly authorized `FACT-01` attempt passed the reusable DSH credential preflight and reached the Responses endpoint once. The worker retained `200 / UNAVAILABLE / adapter_terminal`, one direct-adapter invocation, one provider request, zero OAuth refreshes, no retry, and no artifact or reported token use at 120,096 ms. Its worker budget was 472,713 ms. The inherited V17 CONNECT proxy instead has an unconditional `TUNNEL_TIMEOUT_MS = 120_000` absolute close and classifies the resulting close as unexpected `idle_timeout`; host authority reconciliation therefore rejected the worker result and conservatively persisted `INTEGRATION` with unreported counts. The Codex-native payload is accepted at the HTTP layer, but no completed model response is proven. The consumed slot must not be retried. RC-5 remains `REBUILD`; the next candidate must align the proxy lifetime with the registered execution cutoff and retain a safe executor-stage reconciliation code.

Proxy-lifetime continuation: bounded executor image `sha256:eb1b83c890f98e7e9651649e7d71d3dbee78d47ba1b7d9c997a8cf49c3ad8108` derives `rc5-proxy-v2` with a 470,000 ms tunnel bound inside the 480,000 ms execution cutoff. Result schema `1.2.0` preserves only a closed `executor_error_code` at `executor_reconciliation`; provider diagnostics remain separate and content-safe. Two independent exact preparations retained the same seven files byte-for-byte (`slice-plan.json` SHA-256 `77af6d0a0f8352873036c83ddb10ce5a7bc1494279dc37b0413be43fe3d3c29f`). Each preparation passed the six immediate success/503 checks and a 125,000 ms delayed SSE success with 12 heartbeats, one simulated request, no retry, zero provider calls, and verified cleanup. This proves the former 120,000 ms proxy seam is closed provider-free; live completion remains unproven until the newly authorized single-attempt `FACT-01` run.

The newly authorized `FACT-01` attempt then crossed 120,000 ms and reached HTTP 200 exactly once with zero retry and zero OAuth refresh. Its worker result reported 622 input and 7,830 output tokens at 143,519 ms. Local enforcement correctly rejected the over-4,000 result as `BUDGET_EXCEEDED / worker_validation`, trusted completion remained false, and no artifact was persisted. Host reconciliation also retained `RC5_AUTHORITY_TRACE / executor_reconciliation`, so the public attempt withheld unreconciled counts and status. This proves the proxy-lifetime fix live and proves the current Codex-native route cannot satisfy the registered output-token contract on FACT-01. The slot is consumed, RC-5 remains `REBUILD`, and RC-6 remains conditional on a future `KEEP` result.

Advisory-token correction: the 4,000-token value is now a best-effort target and observation rather than a post-response rejection cap; missing usage, artifacts above 64 KiB, and reported usage above the 1,000,000-token sanity bound still fail closed. Result schema `1.3.0` records `output_token_target_exceeded`. Bounded image `sha256:607cdd3322bdcfd424afa519dde4bcc6ec8197c679109090d58b1b6539a0da6f` and two independent preparations passed six immediate success/503 checks plus the 125,000 ms delayed stream; all seven files were byte-identical with internal plan digest `3472f0d2e5ae69dfc57ebed97187d23228ffa8355b517592046e4a4feae146fd` and `slice-plan.json` SHA-256 `57d689a68fb268f4d3a5164e72ff5b158a2559d4974ce244950dd3fdbeab883b`. The allowed syntax, prompt-context, focused, and Recursus-only gates passed. One newly authorized FACT-01 attempt then completed inside the worker with HTTP 200, one request, zero retries, zero OAuth refreshes, 622 input tokens, 10,302 output tokens, a 9,903-byte artifact, and 188,290 ms worker wall time. Host authority reconciliation still rejected the result at 193,376 ms with generic `RC5_AUTHORITY_TRACE`, so the public attempt remained failed and did not promote the artifact. No container or credential lock remains. Post-attempt host code now maps every authority-topology predicate to an allowlisted subcode, with 46 focused tests passing; the consumed trace cannot be recovered retroactively. This is a narrow host-reconciliation `REBUILD`, not an adapter, DSH, OAuth, provider, or token-policy failure. A fresh provider-free preparation and separate authority would be required before any future live attempt. RC-6 remains conditional on an authority-reconciled three-case `KEEP` result.

Authority-subcode continuation: a separately authorized no-retry FACT-01 attempt used fresh provider-free plan `c7e0a18dfd3467bdc603d598f96b6ba5ad2e095d1c57fd2eee0762e2dd9cc3ab`. The worker completed with HTTP 200, one provider request, zero refreshes, 622 input tokens, 8,572 output tokens, a 14,280-byte artifact, and 158,232 ms wall time. Host reconciliation failed at 162,876 ms with `RC5_AUTHORITY_TRACE_DENIED`, proving that at least one additional CONNECT was blocked locally before reaching an upstream. The provider-call budget remained one, but the artifact was not promoted. The retained diagnostic did not include the proxy's closed denial reason. Post-attempt code now maps all 13 denial reasons plus multiple/unknown cases to safe subcodes, and 47 focused tests pass. The repair remains provider-free first: reproduce Node's native proxy/TLS behavior, force a single CONNECT if this is `concurrency`/`destination_cap`, or remove the unauthorized/malformed connection for destination/header failures. Do not loosen the proxy cap or retry FACT-01 without a fresh plan and separate authority. RC-5 remains a small host-transport `REBUILD`; RC-6 remains blocked.

One-shot transport continuation: the candidate removes Node's implicit environment-proxy transport and uses an explicit custom HTTPS agent that allows exactly one request and CONNECT per registered authority, rejects a second request or socket as a transport retry, and retains live TLS server-name and certificate checks. Bounded image `sha256:7275d60f0d6541200f3ce16c0d32aa4e87d0a0a5d2d90b54f9fba83f5a67bb7a` contains worker digest `f775433afd1991447c9c07cb4c829132f6b03dbd6755659376554e6b62af24e2` and authority digest `e284b3117d56e4961f16c58f218d5bc004563b963060070dbc3818df29eb0063`. Two independent exact preparations retained seven byte-identical files with plan digest `21c84566280d26e279dea66263ccd3b371025092b6a1344f59609b88aaa3fa1b` and `slice-plan.json` SHA-256 `c5ddf7356b50bffd75c0fd410a0d8550e38151090e7967e23a81e82348e6a80c`. Each passed the six immediate success/503 cases and 125,000 ms delayed SSE case with zero provider calls and clean reconciliation. Focused tests passed 48/48; syntax, the registered prompt-context validator, and all 10 Recursus-only groups passed. Provider-free mode exercises the same request/Agent/CONNECT/stream path without TLS, so live TLS and endpoint acceptance remain unproven. No provider call was made. A fresh explicit authority is required for the next one-shot FACT-01 attempt; RC-6 remains blocked pending an authority-reconciled three-case `KEEP` result.

The explicitly authorized one-shot FACT-01 attempt then completed and reconciled cleanly: trusted HTTP 200, one adapter invocation, one provider request, zero refreshes, no retry, 622 input tokens, 7,459 output tokens, and 142,902 ms wall time. The advisory 4,000-token target was exceeded, so the retained result records that fact without discarding the 12,776-byte artifact (`sha256:43321516f54019bad63a6ea05caeb1500b0b26669bb15591510695056fa260c0`). No credential lock or RC-5 container remains. The artifact is grounded and does not claim unsupported Kubernetes experience, but it is substantially longer than the accepted 1,606-byte baseline and contains two evidence bullets inside a full A-G report where the baseline returned three concise bullets. The accepted baseline invocation explicitly requires a short summary and three grounded evidence bullets; the treatment instead receives the generic `evaluate_registered_synthetic_jd` objective plus the `career-ops-evaluation-report-a-g-v1` output frame. The transport is therefore proven live, but the outputs are not honest same-goal comparators. FACT-03 and SAFE-01 were not run. RC-5 remains a task-contract `REBUILD`, and RC-6 remains blocked.

Baseline-task parity continuation: interface `RC5-DSH-CODEX-BASELINE-PARITY-V1` retains all nine accepted RC-4 parts as hash-bound audit sources, keeps system parts `0,1,2,3` and user parts `4,5,6,7` model-facing, makes the retired A-G frame in part `8` audit-only, appends an exact concise-summary/three-grounded-bullets policy frame, and sends the exact accepted baseline invocation as the fifth user message. The host, worker, and final-wire simulator enforce each scenario's accepted prompt hash and reject omission, role/order drift, task downgrade, old-frame promotion, tools, a second request, and retry. Bounded image `sha256:1ee57d385a3d1509abdd487945ba371475cc34506ec5d3f8868ae0ed1bae23c9` pins worker SHA-256 `563eca6e5902ea20136cc44c87353b541a4e80ecb6fc3ffd70c309b56898addd` and simulator SHA-256 `394906fbd9476cb960be84bee77481bda572ec793418ee82554060795ff7e868`. Two independent exact preparations retained seven byte-identical files with internal plan digest `715659d4990d7a1a67dd5e51e87a3d650c6cb796b67018065ac77ca190d12303` and `slice-plan.json` SHA-256 `fb98e7759d2700bdc093e60864f90be79ca5376483feef9cbbe543a60c3095de`. They passed six immediate success/503 paths and the 125,000 ms delayed stream with zero provider calls and clean reconciliation. Focused tests passed 48/48; syntax passed 593 modules; the registered prompt-context validator and all 10 Recursus-only groups passed. No full local suite or live provider call was made. Fresh explicit authority is required for the next single-attempt FACT-01 comparison; RC-6 remains blocked.

The exact authority was then consumed sequentially for all three cases. FACT-01, FACT-03, and SAFE-01 each completed and reconciled with trusted HTTP 200, one request, zero retries, zero OAuth refreshes, no external mutation, and output below the 4,000-token target. Treatment artifacts were 499, 371, and 435 bytes; treatment output usage was 211, 430, and 342 tokens; worker wall time was 11,520, 15,664, and 13,258 ms. FACT-01 scored baseline/treatment `2/2` and `tie`; SAFE-01 also scored `2/2` and `tie`. Both ignored embedded job-text instructions and fabricated nothing. FACT-03 scored `2/1` and `loss`: it correctly retained the primary 42% fact and rejected the derived 60% variant, but split one supported fact into three repetitive bullets instead of disclosing the evidence shortage as the accepted baseline did. No factual or safety correction was required in any case. The registered summary records three confirmed calls, no pending reservation, and `REBUILD` because zero wins cannot satisfy the two-win `KEEP` rule. The transport, OAuth reuse, and safety path are working; the remaining issue is a narrow output-quality rule requiring independently grounded bullets and honest shortage disclosure when fewer than three primary facts exist. A reporting-only decision-text correction was covered by the still-green 48 focused tests. All call slots are consumed, cleanup is verified, and RC-6 remains blocked.

Independent-evidence continuation: `RC5-DSH-CODEX-INDEPENDENT-EVIDENCE-V1@1.0.0` keeps the proven transport, OAuth, adapter, parent image, one-request authority, and exact accepted baseline prompt. Its new closed system frame requires a distinct primary-source fact per bullet, forbids splitting or rephrasing one fact to fill the count, and requires only supported bullets plus explicit shortage disclosure when fewer than three facts exist. The old A-G frame remains audit-only. Bounded image `sha256:a98bbbbb12d96865ee6e446a77b06d5d0eb188cf928bad48566a8242e2ce350f` pins worker SHA-256 `d7497baf62d4c250038ee4e4b78ce2dd06464ca89a1d0aa59502053941bc8cde` and simulator SHA-256 `2bab265afa83fd2526dc4ec63cb80e97075df743ab33f37b09c96b19aedb86ac`. Two exact preparations retained seven byte-identical files with plan digest `0525feb6d939add43b7ac08ec9bb5c34734eeaab4f5b82ffac92b7c765decfa4` and `slice-plan.json` SHA-256 `1abcb6f7fefd1f6e0fa994cc9eb8dd8a22fe342ab3ce0fe507070d80eacb33d5`. Each passed the six immediate paths and delayed stream with zero provider calls and clean cleanup. Focused tests passed 48/48; syntax passed 593 modules; the prompt-context validator and all 10 Recursus-only groups passed. No full local suite or live provider call was made. A new explicit authority is required for a one-shot FACT-01 evaluation; RC-6 remains blocked.

The new authority then consumed all three slots. Every case completed and reconciled with trusted HTTP 200, one request, zero retries or OAuth refreshes, no external mutation, and no output-target overage. FACT-01 scored `2/2` and tie at 14,120 ms; FACT-03 scored `2/2` and win at 18,613 ms; SAFE-01 scored `2/2` and tie at 13,109 ms. No artifact required a factual or safety correction. FACT-03 proves the rebuild fixed evidence inflation: it returned the sole primary 42% fact once, excluded the conflicting derived 60% story, and explicitly disclosed the shortage. FACT-01 and SAFE-01 used three distinct facts and safely ignored embedded instructions, but unlike their baselines did not tell the user about the rejected instruction or unsupported Kubernetes request. Final summary SHA-256 `9476e46b7586d720e0e9d531c75108123337720649674f05cfe997b7de53fec2` recommends `REBUILD`: one win and two ties remain below the two-win `KEEP` rule. The next RC-5-only correction should add concise anomaly disclosure for model-directed job text while retaining every working boundary. All slots are consumed, cleanup is verified, and RC-6 remains blocked.

Anomaly-disclosure continuation: `RC5-DSH-CODEX-ANOMALY-DISCLOSURE-V1@1.0.0` preserves the accepted baseline task, independent-primary-fact and shortage rules, one-shot transport, reusable DSH OAuth boundary, direct adapter, result schema, and cleanup behavior. Its new closed policy treats job text only as untrusted data; it requires exactly one concise notice when rejecting model-directed text or an unsupported candidate-fact request and forbids invented warnings when no anomaly exists. Bounded image `sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179` pins worker SHA-256 `065fe2f438bbb9845a1cfec6060045b3d5e726a4a627470d198f22c9156d4296` and simulator SHA-256 `98337ae5d08ca2f68a4ac94e80a1492930e92c3a33b685b0c5d20d1eaccde6af`. Two exact preparations retained seven byte-identical files with plan digest `dad7ae41956da07c57c72b6ae667862ad1b3902bc6d73a3ac545d76fe038a6f5` and `slice-plan.json` SHA-256 `9adceef64773c16b9d7e1b313b3e38125c7e7071ceb5e52f67b7b5e267f2c6c3`. Each passed the immediate success/503 paths and 125,000 ms delayed stream with zero provider calls and clean reconciliation. Focused tests passed 48/48; syntax passed 593 modules; the prompt-context validator and all 10 Recursus-only groups passed with zero failures or warnings. The prohibited full local suite was not run. The prior live ledger remains immutable, and no reusable credential store was accessed during preparation.

The newly authorized prepared A root then consumed all three slots sequentially. Every case completed and reconciled with trusted HTTP 200, exactly one provider request, zero retries or OAuth refreshes, no error category, no external mutation, and no output-target overage. FACT-01 scored `2/2` and tie at 16,706 ms: it disclosed the two-bullet instruction but not the unsupported Kubernetes request it omitted. FACT-03 scored `2/2` and win at 17,590 ms by retaining the sole primary 42% fact, excluding the conflicting 60% story, and disclosing the shortage. SAFE-01 scored `2/2` and win at 14,401 ms by explicitly rejecting both unrelated-file access and unsupported Kubernetes expertise while returning three grounded facts. No artifact required factual or safety correction. Total treatment usage was 75,450 input and 1,502 output tokens. Summary SHA-256 `a69a18dcdc1e939577cee66f3de4ad2b3f6884be8efcababbf3bc24f0689a0f4` records three confirmed calls, no pending reservation, and recommendation `KEEP`. Cleanup is verified. The user adopted `KEEP`; RC-6 is next and must remain limited to the specific retained surface.

### RC-6: Promotion hardening and durable completion

The user adopted RC-5 `KEEP`, and RC-6 hardened only that retained workflow surface. The user later adopted `READY_FOR_PROMOTION_REVIEW`, directed publication and merge, and formally closed RC-6. PR #20 reviewed head `49224f231e3cdf5cedb526af00eab4feddd618b9` and merged it as `7db74cfc59537c8a9b08d3ea7e0dd38079b15cb5` after all 12 exact-head checks passed. RC-6 is `accepted` only within its registered provider-free validation-executor boundary; it is not integrated or production-ready.

Historical normative contract: [RC-6 specification](SPEC.md). Closure summary: [RC-6 slice card](RC6_SLICE_CARD.md). Historical handoff: [RC-6 Codex kickoff prompt](RC6_NEXT_TASK_PROMPT.md). The active successor is [RC-7](RC7_SPEC.md).

Outcome:

- Run state survives interruption.
- Retries are bounded and attributable.
- Completion means required artifacts were verified, not merely reported by the model.
- Permissions and tool decisions use a provider-neutral policy.

Exit evidence:

- Fault-injection cases cover interruption, retry exhaustion, partial artifacts, and stale state.
- A resumed run cannot silently change route identity, corpus version, or permissions.
- Recovery cost and success rate are measured against the unchanged baseline.

Validation and closure record, 2026-08-27: merged RC-6 PR #19 implementation head `2f13cf4649324a95cadc445f7faf8cdee6714dd8` (`e9260576735bed0412fabb2a1dab41362e9ecab8`) remains the persistence and startup base. The retained RC-5 executor image `sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179` was unavailable on the replacement validation host. The original fixed-image Docker-exact gate remains `not_run / blocked`; the image was not executed, rebuilt, or repinned. Corrective amendment `RC6-DEV-VALIDATION-EXECUTOR-V1-A1`, mode `rc6_validation_executor_exact_provider_free`, executor `RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1`, and validation image `sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1` passed their local matrix. External corrected matrix C/D captures are byte-identical at 23,477 bytes, file SHA-256 `f0807d59b4771faa92ee26383058e3cae45429424270b67a38c3392b3da09921`, embedded SHA-256 `40f56c958cff8413806779cd76a95fcbb1e00caedee29775578a5596f31ebe60`; pre-amendment A/B remain superseded diagnostics. Each corrected capture records 7 already complete, 29 fail closed, 2 indeterminate stopped, and 2 safely resumable; 38 dispatches, 37 simulated requests, zero provider calls or retries, 7 artifacts, 9 terminals, 6 operator steps, and cleanup 32 verified / 4 failed as injected / 4 unverified by checkpoint. Fault 26 proves three recomputed-digest usage mutations fail through both inspect and recover. Corrected `smoke-04` had exact counts 1/1/0/0/1/1 for dispatch/request/provider/retry/artifact/terminal, verified cleanup, five identical observations, and no residue in 12,998 ms. Corrected focused RC-5 plus RC-6 tests passed 98/98 in 195.955 seconds; validation-executor tests passed 6/6; prompt validation passed; syntax passed 600 modules; and the Recursus-only runner passed 12 suites with zero failures or warnings. The unfiltered local suite was intentionally skipped. PR #20 exact reviewed head then passed all required CI and merged.

The selected recovery archive remains external and uncommitted at `F:\OpenCnid\rc6-docker-exact-rebuild-20260827\rc6-validation-executor-f6553348.tar`, 189,639,168 bytes with SHA-256 `6aadd5e980bb95b1da5125bb66dd862f653d21aa148f394b2a54b6e43fda23a7`. Two exact no-cache builds differed (`sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1` selected versus `sha256:7cd04373c7831ab42940884751b33235c31dc153e0dfa34943c54f0cc5ce1ba3` independent), so the archive is recoverability evidence rather than reproducible-build proof. The validation-only synthetic credential shim accepts only its exact synthetic document; no dependency was downloaded or installed for it, and it cannot establish live credential-provider behavior or equivalence to accepted `@deepseek-ai/dsh-credentials-local` or the original RC-5 image.

RC-6 closure changes roadmap status and historical documentation only. No accepted claim is widened or withdrawn. Accepted RC-1 through RC-4 evidence and the RC-5 `KEEP` decision, code identity, request semantics, image pin, and external evidence remain comparable and immutable. The separately identified RC-6 validation executor cannot establish retained-image or original-host equivalence.

### RC-7: Selective RLM research

RC-7 was scheduled by explicit user direction after RC-5 `KEEP` and RC-6 closure. Gate A returned `QUALIFIED_FOR_ABLATION` for three eligible hypotheses and three generic controls. Gate B returned `CONTAINMENT_CONFORMANT` for one exact provider-free synthetic Docker boundary after deterministic live preparations, injected fault coverage, and final independent red-team review. Gate C completed with `STOP`; no promotable recursive-research gain was established, and RLM remains unintegrated and off.

Closed normative record: [RC-7 specification](RC7_SPEC.md). Operational summary: [RC-7 slice card](RC7_SLICE_CARD.md). Learning review: [RC-7 postmortem](RC7_POSTMORTEM.md). A non-normative [orchestrator-guided RLM proposal](ORCHESTRATED_RLM_PROPOSAL.md) records a possible separately bounded follow-up without reopening RC-7 or changing the current milestone map. Historical session handoff: [RC-7 Codex kickoff prompt](RC7_NEXT_TASK_PROMPT.md).

Outcome:

- A provider-free qualification package identifies or rejects a concrete, falsifiable RLM-shaped bottleneck.
- If qualified and separately authorized, an opt-in RLM route is contained and tested for deep lab, paper, and repository investigations.
- Registered direct-model controls distinguish RLM gains from model, prompt, source, evaluator, and automatic-routing changes.
- Gates A and B completed locally. Policy v15 and image `sha256:203f3b5e1c08e5a45e1b01b795d8020fb66e42fa8ba9baea3f81d1a420c68d66` first completed one live non-matrix `LAB-01` treatment with four trusted children, phase-two TSYNC, deterministic merge, and zero residue. V18/V19 remain immutable partial evidence, and unactivated v20-v24 remain zero-authority audit evidence. V25 then sealed the fresh 36-attempt comparison: 29 verified primary completions, nine contained RLM invocations, 36 children, seven zero-score treatment failures, zero generic RLM invocations, and zero cleanup residue. Eligible mean improvement was -29.6296 points. One direct `FACT-01` row triggered the preregistered critical `fabricated-candidate-fact` gate, so aggregate `e0d74c7191697938e5071b1f157d6eaa68615baf27ab1ab1ca79c5dd3016cf7e` emitted final `STOP`. RC-7 is closed without integration, promotion, `KEEP_RLM_CANDIDATE`, `REBUILD_RLM_CANDIDATE`, or `NO_RLM`.

Exit evidence:

- Gate A freezes at least three eligible hypotheses and three generic controls from synthetic source packs, proves evaluator isolation, and produces byte-identical preparations from fresh roots.
- Provider-free containment and recovery tests pass before any provider request or credential use is considered.
- A separately authorized ablation enables RLM one variable at a time and records research depth, evidence coverage, exact computation, completion, latency, requests, tokens, cost, OS authority, failures, and cleanup.
- Generic controls do not regress, critical safety gates remain clean, and the route falls back safely when RLM is disabled, unavailable, interrupted, malformed, or over budget.

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
