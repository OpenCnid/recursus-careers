# RC-6 retained-surface promotion hardening slice card

Status: mutable operational summary; corrected validation-executor local promotion gates passed, exact-head CI and publication pending

Normative contract: [RC-6 specification](SPEC.md)

Session handoff: [RC-6 Codex kickoff prompt](RC6_NEXT_TASK_PROMPT.md)

Historical prerequisite: [accepted RC-4 specification](RC4_SPEC.md)

## Why these documents are separate

`SPEC.md` is the active normative contract for RC-6. This card is the compact execution boundary used to control scope, authority, cost, and the exit decision. `RC6_NEXT_TASK_PROMPT.md` is the copy-ready session handoff. `RC4_SPEC.md` preserves the accepted RC-4 contract without making RC-4 the active milestone.

RC-6 does not reopen RC-4 or rerun the RC-5 comparison.

## Foundation

The user adopted RC-5 `KEEP`. PR #15 merged exact implementation head `287aeb08a83a132d20858bdd4dfd5e77f2ea2a9f` as `70e3058fee51e74a4cd6ee31a7869245d417cff5`.

Retain the demonstrated `oferta` route exactly as identified in the active specification: its RC-5 interface, wire and output contracts, source bindings, adapter and image pins, DSH OAuth boundary, one-shot transport, no-tools policy, zero automatic retries, safe diagnostics, and cleanup behavior.

The historical RC-5 summary hash is `a69a18dcdc1e939577cee66f3de4ad2b3f6884be8efcababbf3bc24f0689a0f4`. RC-6 may cite it but must not copy, mutate, or reinterpret its external evidence.

## Validation-executor decision

Decision `RC6-DEV-VALIDATION-EXECUTOR-V1` records the original fixed-image Docker-exact gate as `not_run / blocked`: retained RC-5 image `sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179` is unavailable on the replacement validation host and was not executed there. RC-5 `KEEP`, code, request semantics, image pin, and historical evidence remain unchanged.

RC-6 remains `in progress`. Corrective amendment `RC6-DEV-VALIDATION-EXECUTOR-V1-A1` passed fresh local validation; exact-head CI and publication remain pending. The lane uses merged PR #19 implementation head `2f13cf4649324a95cadc445f7faf8cdee6714dd8` (`e9260576735bed0412fabb2a1dab41362e9ecab8`) with distinct provider-free mode `rc6_validation_executor_exact_provider_free`, executor `RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1`, image `sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1`, base `sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df`, adapter context `9222f8062771d7b4e7c17bf2e91869fe92207bc198736a08aa2ff52ee1a6cb92`, and selected external, uncommitted recovery archive `F:\OpenCnid\rc6-docker-exact-rebuild-20260827\rc6-validation-executor-f6553348.tar`, 189,639,168 bytes with SHA-256 `6aadd5e980bb95b1da5125bb66dd862f653d21aa148f394b2a54b6e43fda23a7`. The corrected durable run-state implementation is 82,514 bytes with SHA-256 `07cd41269c203a0a1b7162a3570c3a215dce8c0382eeb5bb7571f87bcafc6b1b`; the validation wrapper is 116,709 bytes with SHA-256 `e7ff3ed131c1965ebd51005e7ea91b504c70ee25ae0683d73198706c88a051e3`; its Dockerfile is 4,983 bytes with SHA-256 `20bbef26dc72c7dfa5ff820eb850501a087cdbc7481e2182d9b675c83feb589a`. The validation-only synthetic credential source is 2,569 bytes with SHA-256 `afbcaf09efdcdcb365c45db7e1da1e65bcb2b14c5acd28a262913eebe2cb3a2b`. The exact retained worker, proxy, simulator, adapter, authority, Docker host, and 40-fault identities are registered in [SPEC.md](SPEC.md#31-rc6-dev-validation-executor-v1-registration-and-local-result).

The amendment closes restart-time usage verification for the exact retained completed-result schema and makes fault 26 prove three recomputed-digest usage mutations fail through both inspection and recovery. It also applies the full disposable-root and protected-segment boundary to the independently callable validation wrapper before Docker or generated writes. The earlier `matrix-a` and `matrix-b` captures are invalidated for promotion and retained only as superseded diagnostics; corrected `matrix-c` and `matrix-d` use new external roots.

Two exact no-cache image builds differed: selected `sha256:f65533481fe622cb80e47636e6da61691238f25bb420568e7c8828e2ae6b6ec1` versus independent `sha256:7cd04373c7831ab42940884751b33235c31dc153e0dfa34943c54f0cc5ce1ba3`. The selected archive proves only recoverability and byte identity for this validation lane, not reproducible construction, retained RC-5 image provenance, or execution of the original image.

The validation-only credential shim accepts only its exact synthetic credential document. No dependency was downloaded or installed for it. It cannot validate live credential-provider behavior and is not equivalent to accepted `@deepseek-ai/dsh-credentials-local` or the original RC-5 image.

## Corrected local validation result

Pre-amendment matrix A and B remain external, uncommitted, superseded diagnostics. Corrected matrix C and D retained byte-identical deterministic capture files: 23,477 bytes, file SHA-256 `f0807d59b4771faa92ee26383058e3cae45429424270b67a38c3392b3da09921`, embedded capture SHA-256 `40f56c958cff8413806779cd76a95fcbb1e00caedee29775578a5596f31ebe60`. They remain external and uncommitted.

Both captures classified 7 cases `already_complete`, 29 `fail_closed`, 2 `indeterminate_stopped`, and 2 `safely_resumable`. Per capture: 38 dispatches, 37 simulated requests, zero provider calls, zero retries, 7 artifacts, 9 terminal records, 6 operator steps, and cleanup verified/failed-as-injected/unverified-by-checkpoint for 32/4/4 cases. The exact per-fault mapping is binding in the specification.

Corrected `smoke-04` returned exactly one dispatch, one request, zero provider calls, zero retries, one artifact, one terminal record, verified cleanup, five identical exercise/inspection/recovery observations, and no residual resources in 12,998 ms. Key C/D timings in milliseconds were after-terminal 12,767/12,815; after-seal 12,760/12,721; after-artifact 12,921/12,904; after-dispatch 1,542/1,535; after-simulated-request 12,642/12,397; recovery-race 13,144/13,208; and repeated-inspect-recover 13,493/13,526. Capture C executor median was 10,716 ms; total matrix times were 454,888/456,182 ms.

Local checks passed: corrected focused retained RC-5 plus RC-6 tests 98/98 in 195.955 seconds, prompt-context validation, syntax for 600 `.mjs` modules, and 12 Recursus-only suites with zero failures or warnings after only the RC-6 harness timeout was raised from 120 to 300 seconds. The full local suite remained intentionally skipped.

## Product question

Can the retained route survive a bounded host interruption and resume to one attributable, artifact-verified terminal state without changing request identity, replaying a provider request, weakening the zero-tool policy, or trusting stale or partial state?

## Operational boundary

- Map the exact durable seams before editing.
- Add provider-free interruption, inspection, and recovery behavior around the retained route.
- Stop indeterminate after a durable dispatch without a trusted sealed result; never replay or infer provider completion.
- Publish a sealed result after restart only after artifact, usage, provenance, permission, authority, and cleanup checks pass.
- Make repeated inspection and recovery idempotent and race-safe.
- Represent the zero-tool/no-external-mutation policy independently of adapter syntax.
- Preserve all retained RC-5 request and output semantics.
- Keep generated state below an explicit caller-owned empty disposable root outside the repository.
- After the primary agent studies all binding instructions itself, study and use the `subagent-composition` skill when available and spawn bounded multi-agents in parallel for independent audits, disjoint implementation, and final red-team review. Use the built-in equivalent and report the missing skill when it is unavailable.

The complete state model, fault matrix, command surface, implementation boundary, and verification predicates are binding in [SPEC.md](SPEC.md).

## Authority and budget

- Provider calls: zero.
- Credential-store access: zero.
- External Career Ops mutations: zero.
- New dependencies: zero.
- Active implementation and local verification: at most 90 minutes or 45,000 observable model tokens, whichever comes first.
- Publication: one RC-6 feature branch, intended commits, push, and one pull request may be created; merge requires separate user direction.

Ask before expanding the time, token, dependency, authority, or retained-surface boundary.

## Host isolation

Use Windows PowerShell only under `F:\OpenCnid\recursus-careers` or an isolated `F:\OpenCnid\recursus-careers-worktrees\` worktree. The default WSL2 distribution `hermes` is protected production infrastructure and completely outside the task.

Never run WSL, bare Bash, `wslpath`, `systemctl`, WSL shutdown, or distribution-management commands. Do not run the local full `node test-all.mjs` suite. Use `docker.exe` only through the already-running Docker Desktop `desktop-linux` context when it cannot start or integrate with `hermes`. Stop and report any required command that could cross this boundary.

## Required local gates

Before publication:

1. run the focused RC-6 test and any affected focused RC-5 regression test;
2. produce two independent deterministic provider-free fault-matrix captures;
3. run the registered prompt-context validator;
4. run `node test-all.mjs --only recursus/`;
5. run `node scripts/check-syntax.mjs`;
6. run `git diff --check`; and
7. review status and the exact diff for preservation violations.

Let GitHub CI run the full cross-platform suite.

Injected fault-matrix captures MUST identify themselves as `injected_test_only`; they verify classification and persistence logic but do not satisfy the registered validation-executor gate. That gate may seal only the closed result envelope returned by `RC6-OFERTA-DOCKER-VALIDATION-EXECUTOR-V1` in mode `rc6_validation_executor_exact_provider_free`. It does not satisfy or replace the blocked original fixed-image Docker-exact gate. Retained RC-5 preparation metadata remains test-only projection metadata and is not a claim of live-provider eligibility.

## Exit decision

Recommend `READY_FOR_PROMOTION_REVIEW` only when every binding predicate in [SPEC.md](SPEC.md) passes with no duplicate dispatch, request, artifact, or terminal record and with measured recovery overhead.

Recommend `REBUILD` when retained persistence cannot distinguish safe resume from ambiguous replay or hardening would change RC-5 request semantics.

Recommend `DELETE_RC6_DRAFT` only for the new hardening draft when it adds complexity without credible recovery benefit. It does not reverse the adopted RC-5 `KEEP` decision.

The user owns the decision. None of these outcomes authorizes a provider call, credential access, deployment, release, external mutation, or RC-7.

## Non-claims

Provider-free RC-6 evidence cannot establish provider-side exactly-once behavior, live provider recovery, provider neutrality, production readiness, deployment safety, feature parity, improved hiring outcomes, or universal reliability.

Validation-executor evidence also cannot establish that the retained RC-5 image ran, that the replacement host equals the original RC-5 host, or that the selected validation image is reproducibly buildable.
