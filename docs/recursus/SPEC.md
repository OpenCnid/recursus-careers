# RC-6 retained-surface promotion hardening specification

Status: active mutable implementation contract; provider-free draft implemented, promotion review pending

Roadmap milestone: [RC-6](ROADMAP.md#rc-6-promotion-hardening-and-durable-completion)

Operational summary: [RC-6 slice card](RC6_SLICE_CARD.md)

Session handoff: [RC-6 Codex kickoff prompt](RC6_NEXT_TASK_PROMPT.md)

Last reviewed: 2026-08-27

## 1. Document role and history

This file is the active normative specification for the next Recursus Careers milestone. The shorter slice card bounds execution, authority, budget, and the exit decision. The kickoff prompt transfers those constraints into a new Codex session.

The accepted RC-4 compiler-boundary contract is preserved separately as [RC4_SPEC.md](RC4_SPEC.md). It remains evidence for what RC-4 implemented and accepted, but it is not an RC-6 worklist. Keeping that historical contract under an explicit milestone filename prevents later work from silently rewriting the basis of accepted RC-4 evidence while allowing the generic `SPEC.md` entrypoint to describe the active milestone.

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
- rebuild or repin the executor image without provider-free proof that a production-container change is required;
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

Use the exact production startup and persistence path with the existing Docker-internal simulator and synthetic credentials only. Add deterministic fault hooks available only to tests or an explicitly provider-free diagnostic command. Cover at least:

1. interruption before reservation;
2. interruption after reservation and before dispatch;
3. interruption after dispatch and before any sealed worker result;
4. interruption after a trusted worker result is sealed and before artifact publication;
5. interruption after artifact publication and before terminal completion;
6. interruption after terminal completion;
7. malformed, truncated, unknown-field, duplicated, reordered, or oversized state;
8. stale plan, request, source, adapter, image, model, permission, or authority identity;
9. artifact omission, byte change, hash mismatch, path escape, media-type drift, or replacement race;
10. cleanup failure, unexpected container or network residue, and credential-lock residue;
11. a second recovery process racing the first;
12. repeated `inspect` and `recover` invocations; and
13. any code path attempting a second dispatch or automatic retry.

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

## 18. Non-claims

RC-6 provider-free evidence does not establish live provider recovery, exactly-once behavior inside a provider, provider neutrality, production readiness, feature parity, deployment safety, improved hiring outcomes, or universal reliability. It can establish only the retained host route's deterministic classification, persistence, recovery, completion-verification, and no-replay behavior under the registered synthetic faults.
