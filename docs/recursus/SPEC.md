# RC-6 retained-surface promotion hardening specification

Status: historical closed RC-6 contract; accepted within the registered provider-free retained-surface boundary

Roadmap milestone: [RC-6](ROADMAP.md#rc-6-promotion-hardening-and-durable-completion)

Operational summary: [RC-6 slice card](RC6_SLICE_CARD.md)

Historical session handoff: [RC-6 Codex kickoff prompt](RC6_NEXT_TASK_PROMPT.md)

Active successor: [RC-7 selective RLM research specification](RC7_SPEC.md)

Last reviewed: 2026-08-27

## 1. Document role and history

This file preserves the normative contract under which RC-6 was implemented, validated, reviewed, and closed. It is no longer the active worklist. The active milestone contract is [RC7_SPEC.md](RC7_SPEC.md).

The accepted RC-4 compiler-boundary contract is preserved separately as [RC4_SPEC.md](RC4_SPEC.md). It remains evidence for what RC-4 implemented and accepted, but it is not an RC-6 or RC-7 worklist. `SPEC.md` retains its historical name so links and the reviewed RC-6 contract remain stable.

RC-6 does not reopen RC-4, rerun RC-5, or claim that the retained slice is already a supported product path.

## 2. Normative language

`MUST`, `MUST NOT`, `REQUIRED`, and `SHALL` are binding RC-6 requirements. `SHOULD` and `PREFER` describe the expected implementation unless repository evidence demonstrates a safer or smaller alternative. Any departure must be recorded in the handoff.

## 3. Foundation and retained surface

The user adopted RC-5 `KEEP` after PR #15 merged exact implementation head `287aeb08a83a132d20858bdd4dfd5e77f2ea2a9f` as merge commit `70e3058fee51e74a4cd6ee31a7869245d417cff5`.

RC-6 retains only this demonstrated `oferta` surface:

- interface `RC5-DSH-CODEX-ANOMALY-DISCLOSURE-V1@1.0.0`;
- wire contract `recursus-dsh-codex-anomaly-disclosure-v1`;
- output frame `rc5-independent-evidence-and-anomaly-disclosure-v1`;
- direct-adapter revision `2fc02090af1632b86ee1175a6720904dfd71081c`;
- bounded executor image `sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179`;
- model-facing tools `[]`, automatic retries `0`, and one provider request per authorized case;
- exact accepted RC-4 source bindings and RC-2 baselines; and
- the existing DSH OAuth boundary, explicit one-shot transport, safe diagnostic envelope, and verified cleanup behavior.

The RC-5 live summary has SHA-256 `a69a18dcdc1e939577cee66f3de4ad2b3f6884be8efcababbf3bc24f0689a0f4`. It records trusted HTTP `200` for FACT-01, FACT-03, and SAFE-01; exactly three provider requests; zero retries, OAuth refreshes, or external mutations; one tie; two wins; and no factual or safety correction.

Those external live bytes are immutable historical evidence. RC-6 MUST NOT copy them into the repository, mutate them, reuse their consumed call slots, or reinterpret `KEEP` as production readiness.

### 3.1 RC6-DEV-VALIDATION-EXECUTOR-V1 registration and local result

The original fixed-image Docker-exact gate is `not_run / blocked`: executor image `sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179` is not available on the replacement validation host, and it was not executed there. Image availability is not provider-free proof that the retained production container needs to change. RC-5 `KEEP`, its code and request semantics, the image identity above, and all historical evidence remain unchanged.

RC-6 recorded a validation-only `REBUILD` under this distinct registration. The corrected validation-executor fault matrix passed locally, and the exact reviewed RC-6 head later passed the required CI and merged through PR #20:

- decision ID: `RC6-DEV-VALIDATION-EXECUTOR-V1`;
- evidence mode: `rc6_validation_executor_exact_provider_free`;
- merged RC-6 implementation: PR #19 head `2f13cf4649324a95cadc445f7faf8cdee6714dd8`, merged as `e9260576735bed0412fabb2a1dab41362e9ecab8`;
- corrected durable run-state implementation `lib/recursus/rc6-run-state.mjs`: 82,514 bytes, SHA-256 `07cd41269c203a0a1b7162a3570c3a215dce8c0382eeb5bb7571f87bcafc6b1b`;
- validation wrapper `lib/recursus/rc6-validation-executor.mjs`: 116,709 bytes, SHA-256 `e7ff3ed131c1965ebd51005e7ea91b504c70ee25ae0683d73198706c88a051e3`;
- validation Dockerfile `scripts/recursus/Dockerfile.rc6-validation-executor`: 4,983 bytes, SHA-256 `20bbef26dc72c7dfa5ff820eb850501a087cdbc7481e2182d9b675c83feb589a`;
- validation-only synthetic credential source `lib/recursus/rc6-synthetic-credentials-local.mjs`: 2,569 bytes, SHA-256 `afbcaf09efdcdcb365c45db7e1da1e65bcb2b14c5acd28a262913eebe2cb3a2b`;
- validation executor: `RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1`;
- validation image ID: `sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1`;
- base image ID: `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df`;
- selected external, uncommitted recovery archive: `F:\OpenCnid\rc6-docker-exact-rebuild-20260827\rc6-validation-executor-f6553348.tar`, 189,639,168 bytes, SHA-256 `6aadd5e980bb95b1da5125bb66dd862f653d21aa148f394b2a54b6e43fda23a7`;
- adapter context SHA-256: `9222f8062771d7b4e7c17bf2e91869fe92207bc198736a08aa2ff52ee1a6cb92`;
- retained worker: 75,569 bytes, SHA-256 `065fe2f438bbb9845a1cfec6060045b3d5e726a4a627470d198f22c9156d4296`;
- retained proxy: 9,399 bytes, SHA-256 `d954e9a2c4149dff01c5bb65b3bfece4bfbd3724db9b68ab21deb7f2da3d470d`;
- retained provider-free simulator: 28,540 bytes, SHA-256 `98337ae5d08ca2f68a4ac94e80a1492930e92c3a33b685b0c5d20d1eaccde6af`;
- retained adapter source: 71,526 bytes, SHA-256 `569ab649694658c20b67c904bc9b1e1317ce2d038b0853385c546283f866e6d0`;
- retained container-run authority SHA-256: `e284b3117d56e4961f16c58f218d5bc004563b963060070dbc3818df29eb0063`;
- Docker Desktop `4.69.0 (224084)`, client and server `29.4.0`, context `desktop-linux`; and
- Windows `docker.exe`: 43,100,080 bytes, SHA-256 `805149723eb721d3cbb944c441423c01a4f4fcd6968a81e57bc1781441762a85`.

Two exact no-cache builds did not produce the same image identity: the selected build is `sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1` and the independent build is `sha256:7cd04373c7831ab42940884751b33235c31dc153e0dfa34943c54f0cc5ce1ba3`. The selected archive hash registers a recoverable byte stream for this validation lane; it is not reproducible-build proof, retained RC-5 image provenance, or evidence that the original RC-5 executor ran.

The validation-only synthetic credential shim accepts only the exact synthetic credential document encoded by its registered source, at the exact canonical regular-file boundary it enforces. No dependency was downloaded or installed for this substitution. The shim cannot validate live credential-provider behavior and is not equivalent to accepted `@deepseek-ai/dsh-credentials-local` behavior or to the original RC-5 image. It MUST NOT be used to read, validate, emulate, or make a claim about any live credential store.

Corrective preregistration amendment `RC6-DEV-VALIDATION-EXECUTOR-V1-A1` invalidates the earlier `matrix-a` and `matrix-b` captures for promotion after red-team review found two host-boundary gaps. The amended run-state validates the retained completed-usage schema after restart and fault 26, `automatic-retry-state`, additionally proves three recomputed-digest usage mutations fail through both `inspect` and `recover`. The amended public validation wrapper applies the disposable-root and protected-segment boundary before Docker validation or any generated write. The closed 40-fault order, image, Dockerfile, adapter, shim, authority, and Docker-host identities do not change. Replacement captures MUST use new external roots and the corrected source identities above; no prior capture may be relabeled as amended evidence.

The pre-amendment external `matrix-a` and `matrix-b` captures remain superseded diagnostics and are invalid for promotion. Two fresh external, uncommitted amended captures at `F:\OpenCnid\rc6-docker-exact-rebuild-20260827\matrix-c` and `F:\OpenCnid\rc6-docker-exact-rebuild-20260827\matrix-d` retained byte-identical deterministic `fault-matrix-capture.json` files. Each amended file is 23,477 bytes with SHA-256 `f0807d59b4771faa92ee26383058e3cae45429424270b67a38c3392b3da09921` and embedded `capture_sha256` `40f56c958cff8413806779cd76a95fcbb1e00caedee29775578a5596f31ebe60`.

All 40 registered faults produced the same classification in both captures:

- `safely_resumable` (2): `before-reservation`, `after-reservation`;
- `indeterminate_stopped` (2): `after-dispatch`, `after-simulated-request`;
- `already_complete` (7): `after-seal`, `after-artifact`, `after-terminal`, `recovery-race`, `repeated-inspect-recover`, `second-dispatch`, `automatic-retry-attempt`; and
- `fail_closed` (29): `malformed-state`, `truncated-state`, `unknown-field-state`, `duplicate-key-state`, `reordered-state`, `oversized-state`, `stale-plan`, `stale-request`, `stale-source`, `stale-route`, `stale-provider`, `stale-adapter`, `stale-image`, `stale-model`, `stale-permission`, `stale-authority`, `adapter-projection-drift`, `retained-request-drift`, `automatic-retry-state`, `artifact-omission`, `artifact-byte-drift`, `artifact-hash-mismatch`, `artifact-path-escape`, `artifact-media-type-drift`, `artifact-replacement-race`, `cleanup-failure`, `container-residue`, `network-residue`, `credential-lock-residue`.

Each capture totals 38 dispatches, 37 simulated requests, zero provider calls, zero automatic retries, 7 artifacts, 9 terminal records, and 6 operator steps. Cleanup is `verified` for 32 cases, `failed` as injected for 4, and unverified by the interruption checkpoint for 4. The exact after-terminal smoke produced one dispatch, one simulated request, zero provider calls, zero retries, one artifact, one terminal record, verified cleanup, byte-identical repeated `inspect` and `recover` observations, and no residual resources.

Measured total wall times for corrected capture C/D were: `after-terminal` 12,767/12,815 ms; `after-seal` 12,760/12,721 ms; `after-artifact` 12,921/12,904 ms; `after-dispatch` 1,542/1,535 ms; `after-simulated-request` 12,642/12,397 ms; `recovery-race` 13,144/13,208 ms; and `repeated-inspect-recover` 13,493/13,526 ms. Capture C executor median was 10,716 ms; total matrix wall times were 454,888/456,182 ms. These host timings are observational and excluded from the deterministic capture digest. Corrected `smoke-04` completed in 12,998 ms and retained byte-identical exercise plus two inspect and two recover observations.

Local verification passed: the corrected focused retained RC-5 plus RC-6 tests passed 98/98 in 195.955 seconds; prompt-context validation passed; syntax validation passed 600 `.mjs` modules; and the Recursus-only runner passed 12 suites with zero failures and zero warnings after `test-all.mjs` raised only the RC-6 harness timeout from 120 to 300 seconds. The initial 120-second RC-6 harness timeout is not a product-test failure. The prohibited full local suite was intentionally skipped. These are local promotion gates only; the exact published head has not yet passed CI.

The validation executor MUST wrap the kept RC-5 request semantics and the merged RC-6 production persistence and startup path. It MUST NOT change or relabel the RC-5 interface, wire or output contract, source projection, adapter revision, provider or model identity, one-shot transport meaning, result schema, artifact bounds, permission policy, authority checks, retry count, or cleanup rules. Its distinct executor, image, archive, and host identities MUST remain visible in every capture and summary.

## 4. Product-hardening question

Can the retained RC-5 `oferta` route survive a bounded host interruption and resume to one attributable, artifact-verified terminal state without changing request identity, issuing an unregistered second provider request, weakening the zero-tool permission policy, or trusting stale or partial state?

RC-6 answers a recovery and completion-integrity question. It does not repeat the RC-5 usefulness comparison.

## 5. Scope

RC-6 is limited to:

1. mapping the retained route's durable preparation, reservation, dispatch, worker-result, artifact, attempt, lock, cleanup, operator-observation, and summary seams;
2. deterministic provider-free interruption and recovery classification;
3. exact attribution and artifact-verified completion;
4. idempotent inspection and recovery without replay;
5. a closed, provider-neutral permission policy for the retained zero-tool route; and
6. the minimum documentation, registration, and test integration required by repository checks.

RC-6 MUST NOT:

- change the retained request projection, output semantics, provider identity, model identity, source bindings, or one-shot transport contract;
- make a provider call or access a credential store;
- add model-facing tools or any external mutation capability;
- rebuild or repin the retained RC-5 executor image without provider-free proof that a production-container change is required; the separately identified validation-only image above is not such a rebuild or repin;
- modify accepted RC-1 through RC-4 registrations, snapshots, fixtures, schemas, evidence, or implementation bytes;
- mutate or copy historical RC-5 live evidence;
- broaden into general workflow orchestration, deployment, release, or RC-7; or
- claim production readiness, provider neutrality, or provider-side exactly-once behavior.

## 6. Required outcome

At completion, provider-free evidence MUST show all of the following:

1. Every durable run has one exact plan, request, route, authority, permission, and source identity.
2. Restart handling classifies each checkpoint as safely resumable, already complete, or indeterminate-and-stopped.
3. Recovery never silently replays a dispatched provider request.
4. A trusted sealed worker result may be promoted after restart only after artifact, usage, authority, and cleanup verification pass.
5. A partial, missing, malformed, stale, mismatched, or externally replaced state document cannot be presented as completed.
6. Repeating `inspect` or `recover` is idempotent and cannot create another dispatch, artifact, or terminal result.
7. The retained no-tools/no-external-mutation policy is represented independently of the OpenAI Codex adapter and is checked at the final wire and terminal-result boundaries.
8. Recovery behavior and cost are measured against the unchanged uninterrupted provider-free RC-5 path.

## 7. Recovery state model

RC-6 may refine names after inspecting the actual retained seams, but it MUST preserve these semantic checkpoints:

| Checkpoint | Required restart behavior |
| --- | --- |
| Prepared, no reservation | Revalidate exact identities; recovery may not perform a provider action. |
| Reservation durable, no dispatch | Resume only the same pre-dispatch operation when durable evidence proves no provider-reachable dispatch occurred and the original authority remains valid; otherwise stop. |
| Dispatch durable, no trusted sealed result | Mark the run indeterminate and stop. Never replay or infer whether the provider completed. |
| Trusted worker result sealed, publication incomplete | Revalidate the sealed result, artifact, authority trace, and cleanup; publish without another provider request only when every gate passes. |
| Terminal result complete | Return the same terminal identity and artifact; perform no new write except an explicitly idempotent verification record. |
| Any identity, policy, artifact, or state drift | Fail closed with a bounded content-safe reason and no provider action. |

The implementation MUST first map these checkpoints onto the existing RC-5 reservation, dispatch, worker-result, artifact, attempt, lock, and cleanup files. It MUST NOT invent a recovery guarantee for a checkpoint that the retained implementation does not durably expose.

## 8. Provider and authority boundary

RC-6 implementation and its fault-injection acceptance work are provider-free. This specification authorizes zero provider calls and zero credential-store access.

- Do not copy, inspect, search, hash, decode, mount, or validate the reusable DSH credential store.
- Do not add a provider-call authorization sentence to the kickoff prompt.
- A future live recovery conformance attempt, if justified after provider-free review, requires a specification amendment and fresh exact user authority.
- A provider dispatch is never automatically retryable. A new user-authorized run is not a retry and must receive a new run identity and durable authority record.

## 9. Capability and permission policy

Introduce one closed provider-neutral policy document or in-memory contract for the retained surface. Its minimum semantics are:

- model-facing tools: none;
- browser, plugin, shell, child-agent, submission, send, contact, tracker, and external-mutation capabilities: denied;
- candidate and job sources: read-only registered synthetic inputs;
- task text: untrusted data, never instruction authority;
- generated artifact: Markdown only, bounded to the retained RC-5 limit;
- provider requests: at most one per separately authorized run and zero during RC-6 acceptance;
- automatic provider retries: zero; and
- diagnostics: bounded allowlisted fields only.

The policy MUST be adapter-independent. The OpenAI Codex projection may record adapter-specific limitations, but it MUST NOT define the underlying permission meaning. Testing one adapter does not establish provider neutrality.

## 10. Fault-injection matrix

Use the exact merged RC-6 production startup and persistence path with the preregistered RC-6 validation executor, the existing Docker-internal simulator, and synthetic credentials only. The resulting evidence is exact only for that validation identity, not for the unavailable RC-5 image. Add deterministic fault hooks available only to tests or an explicitly provider-free diagnostic command. The closed public fault order is exactly:

1. `before-reservation`;
2. `after-reservation`;
3. `after-dispatch`;
4. `after-simulated-request`;
5. `after-seal`;
6. `after-artifact`;
7. `after-terminal`;
8. `malformed-state`;
9. `truncated-state`;
10. `unknown-field-state`;
11. `duplicate-key-state`;
12. `reordered-state`;
13. `oversized-state`;
14. `stale-plan`;
15. `stale-request`;
16. `stale-source`;
17. `stale-route`;
18. `stale-provider`;
19. `stale-adapter`;
20. `stale-image`;
21. `stale-model`;
22. `stale-permission`;
23. `stale-authority`;
24. `adapter-projection-drift`;
25. `retained-request-drift`;
26. `automatic-retry-state`;
27. `artifact-omission`;
28. `artifact-byte-drift`;
29. `artifact-hash-mismatch`;
30. `artifact-path-escape`;
31. `artifact-media-type-drift`;
32. `artifact-replacement-race`;
33. `cleanup-failure`;
34. `container-residue`;
35. `network-residue`;
36. `credential-lock-residue`;
37. `recovery-race`;
38. `repeated-inspect-recover`;
39. `second-dispatch`; and
40. `automatic-retry-attempt`.

Each case MUST assert exact dispatch count, simulated HTTP request count, terminal state, artifact identity, cleanup state, and bounded diagnostic reason. Mutation coverage MUST demonstrate that weakening a required predicate fails a test.

## 11. Command surface

Prefer one small RC-6 command surface rather than changing the retained RC-5 user contract broadly:

```text
node scripts/recursus/rc6-run-state.mjs inspect --output-root <existing-provider-free-root>
node scripts/recursus/rc6-run-state.mjs recover --output-root <existing-provider-free-root>
node scripts/recursus/rc6-run-state.mjs exercise --output-root <empty-provider-free-root> --fault <registered-fault>
```

`inspect` and `recover` MUST be networkless and credential-free. `exercise` MUST accept only registered provider-free faults and synthetic credentials. If repository inspection shows that fewer commands are sufficient, reduce this surface and document why. Do not add a provider-execution command to RC-6.

## 12. Implementation boundary

Prefer new RC-6 files:

- `lib/recursus/rc6-run-state.mjs`;
- `scripts/recursus/rc6-run-state.mjs`;
- `tests/recursus/rc6-run-state.test.mjs`;
- the RC-6 specification, slice card, and handoff prompt; and
- only the minimum existing test, updater, registry, or documentation surfaces required by repository checks.

Modify retained RC-5 implementation files only when a missing durable seam cannot be supplied by a wrapper. Any such change MUST preserve the exact RC-5 request projection, provider authority, one-shot transport, result schema, artifact policy, and accepted source bindings.

Generated state belongs only below an explicit caller-owned empty disposable output root outside the repository. Reject repository-contained, missing, non-empty, user-layer, credential, broad, aliased, or overlapping roots.

### 12.1 Agent composition and parallelism

The primary agent MUST study every binding instruction and required source completely before delegating architectural judgment. It MUST NOT outsource interpretation of `AGENTS.md`, this specification, the slice card, or the preservation and authority boundaries.

After that study, use composed multi-agent work for independent tasks:

1. Study and apply the `subagent-composition` skill when the active Codex environment exposes it. If it is unavailable, report that fact and follow the equivalent rules in this section with the built-in multi-agent tools.
2. Spawn bounded subagents in parallel for non-overlapping work such as the durable-seam audit, recovery threat model, permission-policy audit, fault-matrix and portability review, and final red-team review.
3. Give each subagent an exact question, path scope, expected evidence, write authority, and prohibited actions.
4. Prefer read-only audits first. Delegate implementation only across disjoint file ownership, and never assign overlapping writes.
5. Subagents MUST NOT call providers, access credentials, interact with WSL, install dependencies, mutate accepted evidence, commit, push, merge, deploy, or perform external workflow actions unless the current user and active specification explicitly authorize that exact action.
6. The primary agent owns shared-file integration, independently verifies every subagent conclusion, reconciles disagreements, reviews the complete diff, and records which model or inherited model setting each subagent used when that metadata is available.

Parallelism is a means to improve independent coverage and latency. It does not relax the scope, budget, preservation, provider-free, or host-isolation boundaries.

## 13. Budget

- Active implementation and local verification: at most 90 minutes or 45,000 model tokens when observable, whichever comes first.
- Dependencies: none.
- Provider calls: zero.
- Credential-store access: zero.
- External Career Ops mutations: zero.
- Fault cases: one deterministic provider-free run per registered checkpoint plus focused mutation tests.
- CI waiting after publication is outside the implementation-time cap.

Request explicit user approval before exceeding either implementation limit or expanding the retained surface.

## 14. Host-isolation override

The default WSL2 distribution `hermes` hosts protected production infrastructure and remains completely outside RC-6.

- Use Windows PowerShell only under `F:\OpenCnid\recursus-careers` or an isolated `F:\OpenCnid\recursus-careers-worktrees\` worktree.
- Never run `wsl`, `wsl.exe`, bare `bash` or `bash.exe`, `wslpath`, `systemctl`, WSL shutdown, or distribution-management commands.
- Do not inspect, enter, start, stop, restart, reconfigure, or select any WSL distribution.
- Do not change the default WSL distribution or gateway state.
- Do not run the local full `node test-all.mjs` suite because its Windows helper may start the default WSL distribution.
- Windows `docker.exe` may be used only through the already-running Docker Desktop `desktop-linux` context and only when it cannot start or integrate with `hermes`.
- If a required step appears to need WSL or could affect the protected gateway, stop and report the exact command rather than executing it.

## 15. Verification gates

Before publication, run only the allowed local gates:

1. the focused RC-6 test directly;
2. any focused retained RC-5 regression test affected by the change;
3. two independent provider-free fault-matrix captures with byte-identical deterministic artifacts where time and nonce fields are intentionally excluded or normalized;
4. `node scripts/recursus/verify-prompt-context-v1.mjs validate`;
5. `node test-all.mjs --only recursus/`;
6. `node scripts/check-syntax.mjs`;
7. `git diff --check`; and
8. a full status and diff review proving unrelated user work and accepted evidence are untouched.

Injected captures MUST retain evidence mode `injected_test_only`. Promotion-review captures for this amended lane MUST retain `rc6_validation_executor_exact_provider_free`, executor `RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1`, and every registered image, archive, source, adapter, and host identity. They do not satisfy the blocked original fixed-image Docker-exact gate.

Let GitHub CI run the full cross-platform suite. Local success is not acceptance. The exact reviewed PR head must pass Ubuntu, macOS, Windows, security, dependency, regression, visual, and guard checks before merge is eligible.

## 16. Exit decision

Recommend `READY_FOR_PROMOTION_REVIEW` only when:

- every registered interruption reaches the correct resumable, complete, or stopped-indeterminate state;
- no fault or race produces a duplicate dispatch, request, artifact, or terminal record;
- every completed result passes artifact, usage, provenance, permission, authority, and cleanup verification;
- stale and partial state always fails closed;
- recovery is idempotent;
- the unchanged uninterrupted provider-free path still passes; and
- measured recovery overhead and operator steps are recorded.

Recommend `REBUILD` if the retained persistence seams cannot distinguish safe resume from ambiguous replay, or if hardening requires changing the RC-5 request semantics.

Recommend `DELETE_RC6_DRAFT` only for the new hardening draft, not the already adopted RC-5 surface, when it adds complexity without a credible recovery benefit.

The user owns the final RC-6 decision. `READY_FOR_PROMOTION_REVIEW` is not production acceptance and does not authorize release, deployment, external mutation, a provider call, or RC-7.

## 17. Publication and handoff

The RC-6 session may create a feature branch, commit intended files, push, open one pull request against `main`, and wait for required checks on the exact head. It MUST NOT merge without separate user direction.

The handoff MUST report:

- branch, commit, PR, and exact reviewed head when publication is authorized;
- the mapped durable checkpoints and any retained seam that remained unobservable;
- every fault case and its exact terminal classification;
- dispatch, simulated-request, retry, artifact, and cleanup counts;
- permission-policy identity and adapter projection limitations;
- uninterrupted and recovery wall time plus operator-step measurements;
- all local and CI results, skipped checks, and blockers;
- confirmation that provider calls, credential access, external mutation, and WSL interaction were zero;
- confirmation that accepted RC-1 through RC-4, historical RC-5 ledgers, and unrelated user work were unchanged; and
- the recommendation and remaining non-claims.

## 18. Closure record

The user adopted `READY_FOR_PROMOTION_REVIEW` and later explicitly directed RC-6 closure. PR #20 reviewed exact head `49224f231e3cdf5cedb526af00eab4feddd618b9` and merged it into `main` as `7db74cfc59537c8a9b08d3ea7e0dd38079b15cb5`.

All 12 exact-head checks passed: Ubuntu, macOS, Windows, CodeQL for Go, CodeQL for JavaScript/TypeScript, aggregate CodeQL, dependency review, guard, label, welcome, CV visual, and upgrade regression. Local evidence remained the registered corrected provider-free matrix C/D, focused RC-5 plus RC-6 tests 98/98, validation-executor tests 6/6, prompt-context validation, syntax validation for 600 modules, and 12 Recursus-only suites with zero failures or warnings. The unfiltered local suite remained intentionally skipped.

The original retained RC-5 image `sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179` was not recovered or executed on the replacement host, so that Docker-exact gate remains `not_run / blocked`. Closure accepts the separately identified RC-6 provider-free validation executor result and its explicit non-claims; it does not convert the blocked gate into a pass.

RC-6 is therefore `accepted` only for the registered provider-free retained-surface hardening result. It is not production acceptance, deployment authority, live-provider recovery proof, provider-side exactly-once proof, provider-neutral behavior proof, original RC-5 image execution, or reproducible-build proof. RC-7 proceeds under [RC7_SPEC.md](RC7_SPEC.md) and does not reopen these bytes.

## 19. Non-claims

RC-6 provider-free evidence does not establish live provider recovery, exactly-once behavior inside a provider, provider neutrality, production readiness, feature parity, deployment safety, improved hiring outcomes, or universal reliability. It can establish only the retained host route's deterministic classification, persistence, recovery, completion-verification, and no-replay behavior under the registered synthetic faults.

Evidence under `RC6-DEV-VALIDATION-EXECUTOR-V1` additionally does not establish execution of the retained RC-5 image, equivalence to the original RC-5 host, or reproducible image construction. Its image and archive hashes establish byte identity only.
