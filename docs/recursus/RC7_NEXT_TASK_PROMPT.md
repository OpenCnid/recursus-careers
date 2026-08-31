# Historical Codex kickoff prompt for RC-7 Gate A qualification

Status: historical authority record; Gate A and Gate B are complete locally, Gate C provider-free preparation is complete locally, and this prompt authorizes no Gate C live action

The complete prompt below is retained to preserve the authority that produced Gate A. Do not reuse it as current execution authority. Gate C now has a provider-free frozen preregistration and final-approval seam, but provider, credential, RLM, and benchmark execution still require explicit approval of the exact final digest and numeric ceilings.

```text
Work in this repository using Windows PowerShell only:

F:\OpenCnid\recursus-careers

Implement only Gate A of roadmap milestone RC-7 exactly as defined by the active normative `docs/recursus/RC7_SPEC.md`, using `docs/recursus/RC7_SLICE_CARD.md` as its operational scope, authority, budget, and exit summary. RC-6 is closed and accepted only within its registered provider-free retained-surface boundary. Do not reopen RC-5 or RC-6, execute RLM, call a provider, or proceed to RC-7 Gate B or Gate C.

Goal:

Build the smallest provider-free qualification seam that determines whether a concrete, falsifiable RLM-shaped research bottleneck exists and whether a one-variable `rc-direct` versus `rc-rlm` ablation can be safely preregistered. The initial eligible hypotheses are `LAB-01`, `PAPER-01`, and `REPO-01`; the generic controls are `FACT-01`, `FACT-03`, and `SAFE-01`.

Authority and limits:

- Make zero RLM executions, provider calls, simulated provider requests, credential accesses, network requests, live browsing actions, submissions, sends, contacts, tracker mutations, deployments, releases, or other external mutations.
- Do not access, inspect, search, copy, hash, decode, mount, validate, or modify any real credential store.
- Do not install a dependency.
- Stop active implementation and local verification after 90 minutes or 45,000 observable model tokens, whichever comes first.
- Do not publish, push, open a pull request, or merge without new explicit user direction.
- Do not run the unfiltered local `node test-all.mjs` suite.
- Gate A does not require WSL or Docker. Do not invoke either.

Repository preservation:

1. Run `git status --short --branch`; inspect HEAD, remotes, worktrees, and the exact diff before changing anything.
2. Preserve every unrelated modification and untracked file. Do not stage, stash, clean, reset, rewrite, discard, or absorb unrelated work.
3. Work only on a safe RC-7 branch or isolated worktree that cannot overwrite the primary workspace.
4. Confirm `origin/main` contains RC-6 merge `7db74cfc59537c8a9b08d3ea7e0dd38079b15cb5`.
5. Confirm `docs/recursus/ROADMAP.md` marks RC-6 `accepted` and RC-7 `next`.
6. Search for and follow the most specific `AGENTS.md` or equivalent instruction before touching each nested path.

Primary-agent study before delegation:

1. `AGENTS.md`
2. root `CODEX.md`
3. `docs/recursus/AGENTS.md`
4. `docs/recursus/README.md`
5. `docs/recursus/ROADMAP.md`, including cross-cutting invariants and change policy
6. `docs/recursus/RC7_SPEC.md`
7. `docs/recursus/RC7_SLICE_CARD.md`
8. historical `docs/recursus/SPEC.md` and `docs/recursus/RC6_SLICE_CARD.md`
9. `docs/recursus/RC5_SLICE_CARD.md`
10. `docs/recursus/architecture/README.md`
11. `docs/recursus/architecture/INTENDED_DIFFERENCES.md`, especially Selective RLM
12. `docs/recursus/benchmarks/PROTOCOL.md`
13. `docs/recursus/benchmarks/SCENARIO_CATALOG.md`
14. `docs/recursus/benchmarks/METRICS_AND_PROMOTION.md`
15. `docs/recursus/features/REGISTRY.md`
16. every nested instruction governing any `lib/recursus/`, `scripts/recursus/`, `tests/recursus/`, or fixture path selected after the seam map

The primary agent must personally study and interpret every binding instruction before delegating architectural judgment.

Subagent composition:

1. Study and apply the `subagent-composition` skill completely when exposed. If unavailable, report that fact and use equivalent built-in multi-agent composition.
2. After primary study, begin with parallel read-only audits of: bottleneck falsifiability and case selection; RLM/DSH/OS authority and containment; benchmark parity and scoring; and preservation/Windows portability.
3. Give every subagent an exact question, path scope, expected evidence, write authority, and prohibited actions. Require path and line references, unresolved risks, and a pass/blocker conclusion.
4. Delegate writes only with disjoint file ownership. The primary agent owns shared integration files, reconciliation, and the complete diff.
5. Keep RLM/provider execution, credentials, network/live browsing, dependency installation, accepted-evidence mutation, commits, pushes, merges, deployments, and external mutations prohibited for subagents.
6. Record each subagent task and model or inherited model setting when observable.

First produce a concise qualification seam map before editing. Map the registered scenario inputs, evaluator-only oracle, direct-route capability envelope, proposed RLM mechanism, route decision, permissions, budgets, artifacts, terminal decision, locks, cleanup, and summary. Identify which bytes are visible to the route and which remain evaluator-only. Do not claim a bottleneck for an unmeasured or unfalsifiable seam.

Implementation boundary:

- Prefer new files `lib/recursus/rc7-rlm-qualification.mjs`, `scripts/recursus/rc7-rlm-qualification.mjs`, and `tests/recursus/rc7-rlm-qualification.test.mjs`, plus the minimum registry or documentation update required by checks.
- Use only frozen synthetic repository fixtures. No private Career Ops or candidate data.
- Do not execute or integrate the external RLM component.
- Do not modify RC-5 or RC-6 implementation. If a missing seam appears to require that, stop and report it rather than editing.
- Do not modify accepted RC-1 through RC-4 registrations, schemas, fixtures, snapshots, implementations, or evidence. Do not copy or mutate external RC-5/RC-6 evidence.
- Keep generated state below one explicit caller-owned empty disposable output root outside the repository. Fail closed on missing, non-empty, repository-contained, broad, aliased, overlapping, user-layer, or credential-like paths.

Qualification requirements:

- Implement closed policy `rc7-rlm-qualification-provider-free-v1` independently of adapter syntax.
- For each proposed eligible case, record the direct-route limitation, the RLM mechanism expected to address it, a falsifiable metric, added authority, and a reason deterministic direct tooling is insufficient.
- Freeze at least three eligible cases and three generic controls, or return `REBUILD_QUALIFICATION`/`NO_RLM`.
- Keep eligibility and evaluator truth out of route-visible bytes.
- Record planned top-level and recursive child-request ceilings without making any request.
- Prove a one-variable ablation could keep provider, model, reasoning, prompt, source, evaluator, and shared permission identity fixed while declaring the RLM-only authority difference.
- Treat direct RLM Python as operating-system authority, not a sandbox. Require a verifiable containment plan or fail closed.
- Produce exactly one deterministic qualification package and terminal decision per disposable root.
- Two fresh preparations must produce byte-identical normalized retained bytes.

Provider-free fault coverage:

- unsafe, overlapping, aliased, broad, user-layer, repository, and credential-like paths;
- missing, extra, stale, replaced, malformed, or mismatched case, route, permission, budget, and source identities;
- eligibility or oracle leakage into route-visible input;
- generic-case RLM selection and eligible forced-treatment omission;
- over-budget child-request plans before provider reachability;
- malformed, oversized, or unprovenanced artifacts;
- interruption at each observable preparation and publication checkpoint;
- repeated inspection/recovery idempotence and concurrent recovery exclusion; and
- cleanup and residue accounting.

All fault hooks must be explicitly provider-free and must reject real credentials, provider authority, external URLs, and external mutation.

Local verification:

1. run focused RC-7 qualification tests;
2. run directly affected focused Recursus regressions;
3. produce and compare two fresh deterministic provider-free preparations;
4. run `node scripts/recursus/verify-prompt-context-v1.mjs validate` only if prompt/context bytes change;
5. run `node test-all.mjs --only recursus/` once the focused harness is registered there;
6. run `node scripts/check-syntax.mjs` for JavaScript changes;
7. run `git diff --check`; and
8. review the complete diff and status for scope and preservation.

Decision and stopping rules:

- Return `QUALIFIED_FOR_ABLATION` only when every Gate A predicate passes. This authorizes no later work by itself.
- Return `REBUILD_QUALIFICATION` when a bounded change to cases, metrics, controls, or containment could make the question testable.
- Return `NO_RLM` when no concrete RLM-shaped bottleneck exists, deterministic direct tooling is smaller, added authority cannot be bounded, or a one-variable comparison is infeasible.
- Stop and ask before any RLM execution, provider/network/credential authority, dependency installation, publication, Gate B/C work, or scope expansion.

Handoff with:

- branch and exact commit if one exists;
- the qualification seam map;
- the six cases and source-pack identities;
- every case-level hypothesis and metric;
- permission identity and OS-authority limitations;
- two preparation identities and their deterministic comparison;
- every fault result and exact counts for providers, simulated requests, artifacts, terminals, operator steps, and cleanup;
- all local results and skipped checks;
- confirmation of zero RLM execution, provider calls, credential access, network/live browsing, external mutation, WSL, and Docker use;
- confirmation that accepted/historical evidence and unrelated user work were unchanged; and
- `QUALIFIED_FOR_ABLATION`, `REBUILD_QUALIFICATION`, or `NO_RLM`, plus remaining non-claims.
```
