# Codex kickoff prompt for RC-6 retained-surface promotion hardening

Status: active handoff prompt

Copy the complete prompt below into the next Codex session. It authorizes bounded provider-free implementation, local verification, a feature-branch commit, push, and a pull request. It does not authorize a provider call, credential-store access, pull-request merge, deployment, external Career Ops mutation, or work beyond RC-6.

```text
Work in this repository using Windows PowerShell only:

F:\OpenCnid\recursus-careers

Implement roadmap milestone RC-6 exactly as defined by the active normative `docs/recursus/SPEC.md`, using `docs/recursus/RC6_SLICE_CARD.md` as its operational scope, authority, budget, and exit summary. RC-5 is complete and the user adopted `KEEP`. RC-6 must harden only the retained `oferta` surface for bounded restart recovery, exactly-once attribution, artifact-verified completion, and a provider-neutral zero-tool permission policy. Do not redesign the RC-5 request, repeat its usefulness comparison, or expand into RC-7.

Authorization and limits:

- You may create one RC-6 feature branch, implement and test the provider-free hardening slice, commit only intended files, push to `OpenCnid/recursus-careers`, open one pull request against `main`, and wait for required checks on the exact PR head.
- Do not merge the pull request.
- Make zero provider calls. Do not access, inspect, search, copy, hash, decode, mount, validate, or modify any credential store.
- Do not submit, send, contact, browse, mutate a tracker, alter Career Ops user data, deploy, publish a release, or perform any external workflow action.
- Stop active implementation and local verification after 90 minutes or 45,000 model tokens when observable, whichever comes first. Ask before expanding either limit or the retained surface.
- Do not install a dependency.

Critical host isolation:

The default WSL2 distribution named `hermes` hosts a live Codex gateway. Treat it as protected production infrastructure and completely outside this task.

- Work only in Windows PowerShell under `F:\OpenCnid\recursus-careers` or an isolated `F:\OpenCnid\recursus-careers-worktrees\` worktree.
- Never run `wsl`, `wsl.exe`, bare `bash` or `bash.exe`, `wslpath`, `systemctl`, WSL shutdown commands, or distribution-management commands.
- Do not enter, inspect, start, stop, restart, reconfigure, or select any WSL distribution.
- Do not change the default WSL distribution or gateway state.
- Do not run the local full `node test-all.mjs` suite. Its Windows helper can start the default WSL distribution.
- Windows `docker.exe` may be used only through the already-running Docker Desktop `desktop-linux` context and only when it cannot start or integrate with `hermes`.
- If a required step appears to need WSL or could affect the Hermes gateway, stop and report the exact command instead of executing it.

Repository state and preservation:

1. Run `git status --short --branch`, inspect HEAD, remotes, worktrees, and the exact diff before changing anything.
2. The previous session intentionally left the primary workspace detached at RC-5 head `287aeb08a83a132d20858bdd4dfd5e77f2ea2a9f` to preserve unrelated uncommitted web work and `docs/recursus/frontend-capability-map/`. PR #15 merged to `main` as `70e3058fee51e74a4cd6ee31a7869245d417cff5`. Discover the current state rather than assuming it is unchanged.
3. Preserve every unrelated modification and untracked file. Do not stage, stash, clean, reset, rewrite, discard, or absorb the web or frontend-capability-map work into RC-6.
4. Create or select an RC-6 branch only when doing so cannot overwrite those files. If safe branch setup is blocked, stop and report the exact conflict; do not force it.
5. Confirm `origin/main` contains merge commit `70e3058fee51e74a4cd6ee31a7869245d417cff5` and that `docs/recursus/ROADMAP.md` marks RC-5 `kept` and RC-6 `next`.
6. Search for and follow the most specific `AGENTS.md` or equivalent instruction before touching each nested path.

Study these files completely before implementation. The primary agent must personally study and interpret every binding instruction before delegating architectural judgment:

1. `AGENTS.md`
2. root `CODEX.md`
3. `docs/recursus/AGENTS.md`
4. `docs/recursus/README.md`
5. `docs/recursus/ROADMAP.md`, especially RC-5, RC-6, the cross-cutting invariants, and change policy
6. `docs/recursus/SPEC.md`, the active normative RC-6 contract
7. `docs/recursus/RC6_SLICE_CARD.md`, the operational summary
8. `docs/recursus/RC5_SLICE_CARD.md`, especially the final kept interface, live result, authority, and non-claims
9. `docs/recursus/RC4_SPEC.md` only as the immutable accepted RC-4 prerequisite; do not edit it
10. `docs/recursus/architecture/PROMPT_CONTEXT_CONTRACT.md`
11. `docs/recursus/benchmarks/PROTOCOL.md`
12. `docs/recursus/benchmarks/METRICS_AND_PROMOTION.md`
13. `docs/recursus/features/REGISTRY.md`
14. `lib/recursus/rc5-slice.mjs`
15. `lib/recursus/rc5-provider-executor.mjs`
16. `lib/recursus/rc5-provider-worker.mjs`
17. `scripts/recursus/rc5-slice.mjs`
18. `scripts/recursus/rc5-provider-free-payload-probe.cjs`
19. `scripts/recursus/Dockerfile.rc5-bounded-executor`
20. `tests/recursus/rc5-slice.test.mjs`
21. `tests/recursus/rc5-provider-executor.test.mjs`
22. the nested instruction files governing `lib/recursus/`, `scripts/recursus/`, and `tests/recursus/`

Subagent composition and parallel work:

1. Study and apply the `subagent-composition` skill completely if the active environment exposes it. If it is unavailable, report that fact and use the equivalent built-in multi-agent workflow below.
2. After completing the required primary-agent study, spawn bounded subagents in parallel for independent, non-overlapping tasks. Start with read-only audits of the durable seams, interruption and replay threat model, provider-neutral permission policy, fault-matrix coverage and Windows portability, and preservation boundary.
3. Give every subagent an exact question, path scope, expected evidence, write authority, and prohibited actions. Require concrete path and line references, unresolved risks, and a clear pass or blocker conclusion.
4. Delegate implementation only when file ownership is disjoint. Do not assign overlapping writes or let subagents edit shared integration files concurrently.
5. Keep provider calls, credential access, WSL interaction, dependency installation, accepted-evidence mutation, commits, pushes, merges, deployments, and external workflow actions prohibited for subagents. The primary agent owns any separately authorized publication action.
6. The primary agent must independently verify and reconcile all subagent findings, integrate shared files, review the complete diff, and record each subagent's task plus its model or inherited model setting when that metadata is available.
7. Use parallelism within the existing time and token budget; it does not expand scope or authority.

First produce a concise seam map before editing. Map the retained preparation, reservation, dispatch, worker result, artifact, attempt, operator observation, lock, cleanup, and summary records. For each RC-6 checkpoint, identify which bytes are durable before and after a crash. Do not claim recovery for an unobservable seam.

Implementation boundary:

- Prefer new files `lib/recursus/rc6-run-state.mjs`, `scripts/recursus/rc6-run-state.mjs`, and `tests/recursus/rc6-run-state.test.mjs`, plus the minimum existing updater, test registry, feature registry, or documentation changes required by repository checks.
- Wrap the kept RC-5 route where possible. Modify RC-5 implementation only if a missing durable seam cannot be added safely outside it.
- Preserve the exact RC-5 interface, source projection, output policy, direct-adapter revision, provider and model identity, one-shot transport, no-tools policy, automatic-retry count, result schema, artifact bounds, authority checks, and cleanup rules.
- Do not rebuild or repin the executor image unless the seam map and provider-free tests prove a production-container change is necessary.
- Do not modify accepted RC-1 through RC-4 registrations, snapshots, fixtures, schemas, evidence, or implementation bytes. Do not mutate or copy external RC-5 live evidence.
- Keep all generated state below one explicit caller-owned empty disposable output root outside the repository. Fail closed on missing, non-empty, repository-contained, broad, aliased, overlapping, user-layer, or credential paths.

Required recovery semantics:

- Before dispatch: resume only when durable evidence proves no provider-reachable dispatch occurred and all original identities and authority still match.
- After dispatch without a trusted sealed result: mark indeterminate and stop. Never replay the request or infer provider completion.
- After a trusted sealed result: publish after restart without another provider request only when artifact, usage, provenance, permission, authority, and cleanup verification all pass.
- After terminal completion: repeated inspection and recovery must return the same identity without duplicate dispatch, artifact, or terminal state.
- Any stale, partial, malformed, replaced, or mismatched state fails closed with a bounded content-safe diagnostic.

Build a closed provider-neutral permission policy for the retained zero-tool route. It must deny model tools, browsers, plugins, shell, child agents, submission, send, contact, tracker mutation, and other external mutations independently of adapter syntax. Testing one OpenAI Codex adapter does not establish provider neutrality.

Provider-free fault matrix:

- Exercise every checkpoint and mutation required by the RC-6 specification through the exact production persistence/startup path and Docker-internal simulator with synthetic credentials only.
- Assert exact dispatch and simulated-request counts, recovery classification, artifact identity, terminal state, retry count, and cleanup state.
- Prove repeated `inspect` and `recover` calls are idempotent.
- Prove a second concurrent recovery cannot win or duplicate work.
- Keep all fault hooks test-only or explicitly provider-free. No fault command may accept real credentials or a provider-authority flag.

Allowed local verification:

1. Run the focused RC-6 tests directly.
2. Run any focused retained RC-5 regression test affected by the change.
3. Produce two independent provider-free fault-matrix captures and compare deterministic retained bytes.
4. Run `node scripts/recursus/verify-prompt-context-v1.mjs validate`.
5. Run `node test-all.mjs --only recursus/`.
6. Run `node scripts/check-syntax.mjs`.
7. Run `git diff --check` and review the full diff and status.

Do not run the local full suite. Let GitHub CI run full Ubuntu, macOS, and Windows coverage after the PR opens.

Publication and stopping rules:

- Commit only intended RC-6 files, push the RC-6 branch, open one PR, and wait for every required check on the exact head.
- Do not merge the PR.
- Stop and report `REBUILD` if the retained state cannot distinguish safe resume from ambiguous replay, if hardening requires changing RC-5 request semantics, or if a required seam needs WSL, real credentials, or a provider call.
- Recommend `READY_FOR_PROMOTION_REVIEW` only when every card gate passes. This is not production acceptance and does not authorize deployment, provider execution, RC-7, or public claims.

Hand off with:

- branch, commit, PR URL, and exact PR head;
- the durable seam map;
- every fault case and its terminal classification;
- exact dispatch, simulated-request, retry, artifact, and cleanup counts;
- permission-policy identity and known adapter limitations;
- uninterrupted and recovery timing plus operator-step measurements;
- all local and CI results and every skipped check;
- confirmation of zero provider calls, zero credential access, zero external mutation, and zero WSL interaction;
- confirmation that accepted RC-1 through RC-4, historical RC-5 evidence, and unrelated user work were unchanged; and
- the recommendation and remaining non-claims.
```
