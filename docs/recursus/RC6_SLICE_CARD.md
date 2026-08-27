# RC-6 retained-surface promotion hardening slice card

Status: mutable operational summary; implementation not started

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

Use Windows PowerShell only under `D:\OpenCnid\recursus-careers`. The default WSL2 distribution `hermes` is protected production infrastructure and completely outside the task.

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

## Exit decision

Recommend `READY_FOR_PROMOTION_REVIEW` only when every binding predicate in [SPEC.md](SPEC.md) passes with no duplicate dispatch, request, artifact, or terminal record and with measured recovery overhead.

Recommend `REBUILD` when retained persistence cannot distinguish safe resume from ambiguous replay or hardening would change RC-5 request semantics.

Recommend `DELETE_RC6_DRAFT` only for the new hardening draft when it adds complexity without credible recovery benefit. It does not reverse the adopted RC-5 `KEEP` decision.

The user owns the decision. None of these outcomes authorizes a provider call, credential access, deployment, release, external mutation, or RC-7.

## Non-claims

Provider-free RC-6 evidence cannot establish provider-side exactly-once behavior, live provider recovery, provider neutrality, production readiness, deployment safety, feature parity, improved hiring outcomes, or universal reliability.
