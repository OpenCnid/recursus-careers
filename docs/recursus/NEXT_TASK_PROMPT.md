# Codex kickoff prompt for RC-2 Claude Code reference capture

Copy the prompt below into a new Codex task after the RC-1 pull request is merged and the roadmap marks RC-1 `accepted`.

```text
Work in this repository:

D:\OpenCnid\recursus-careers

Implement roadmap milestone RC-2, Claude Code reference capture, from the accepted `main` branch.

RC-2 must capture reproducible reference attempts from unchanged Career Ops through its native Claude Code CLI route using the accepted RC-1 synthetic corpus. Keep the scope narrow. Do not build or invoke a Recursus, DSH, RLM, Honcho, Dovetail, or Codex CLI route. Do not score or claim factuality, safety, application quality, feature parity, advancement, or comparative performance.

Acceptance gate before editing:

1. Run `git status --short` and preserve every existing user change.
2. Confirm the current branch is based on the merged RC-1 revision.
3. Confirm `docs/recursus/ROADMAP.md` marks RC-1 `accepted` and RC-2 `next`.
4. Confirm the merged RC-1 pull request has successful Windows and supported-CI checks for the exact accepted revision.
5. Run:
   - `node verify-recursus-benchmark.mjs validate`
   - `node test-all.mjs --only recursus/`
   - `node scripts/check-syntax.mjs`
6. If RC-1 is not accepted or a required check fails for an implementation reason, stop RC-2 execution, gather exact evidence, and repair only the RC-1 acceptance blocker. Do not capture reference runs on an unaccepted foundation.

Read these files completely in this order:

1. `AGENTS.md`
2. root `CODEX.md`
3. `docs/CODEX.md`
4. `docs/recursus/README.md`
5. `docs/recursus/ROADMAP.md`
6. `docs/recursus/SPEC.md`
7. `docs/recursus/benchmarks/README.md`
8. `docs/recursus/benchmarks/PROTOCOL.md`
9. `docs/recursus/benchmarks/SCENARIO_CATALOG.md`
10. `docs/recursus/benchmarks/METRICS_AND_PROMOTION.md`
11. `evals/recursus/README.md`
12. all eight files under `evals/recursus/schemas/`
13. all four scenario manifests under `evals/recursus/career-bench-v1/scenarios/`
14. `verify-recursus-benchmark.mjs`
15. `lib/recursus-benchmark.mjs`
16. `tests/recursus/benchmark-foundation.test.mjs`
17. the Career Ops Claude wrapper and shared routing instructions used by the native Claude Code route
18. relevant test, updater, package, ignore, and evidence-storage conventions

Search for more specific `AGENTS.md`, `CODEX.md`, or equivalent instructions before touching a nested directory. Follow the most specific applicable rules.

Use subagents heavily for bounded read-only reviews with no overlapping writes. The primary agent must personally read and interpret every binding instruction and own shared-file integration. Suggested reviews:

1. Existing Claude Code route and invocation audit.
2. RC-1 corpus, seed, and oracle-boundary audit.
3. RC-2 schema and manifest contract review.
4. Evidence directory, updater ownership, and ignore-rule review.
5. Credential, privacy, and content-safe trace threat review.
6. Terminal-status and false-attestation review.
7. Randomization, repeat count, and append-only attempt ledger review.
8. Windows and supported-CI portability review.
9. Documentation and non-claim review.
10. Final independent red-team review after implementation.

Do not create extra branches or worktrees for subagents. Do not let subagents commit, push, install packages, change credentials, or mutate user-layer data.

Binding RC-2 execution contract:

- Treat the RC-2 section of `docs/recursus/ROADMAP.md` and the benchmark protocol as the task contract.
- Use the accepted `career-bench-v1` bytes and `verify-recursus-benchmark.mjs seed` command. Do not alter RC-1 fixture bytes merely to accommodate a runner.
- Register the `co-claude-code` route and the complete run set before viewing generated outputs.
- Record the exact repository revision, instruction hashes, corpus and schema versions, runner and harness versions, permission profile, OS, timezone, locale, network and browser policy, budgets, provider and model identity when reported, repeat count, and randomized order.
- Never infer provider or model identity from the Claude Code runner name. Use the contract's explicit `not_reported` representation where the route does not report a value.
- Perform one dry run that proves seeding, invocation construction, output capture, normalization, and validation without making a provider request.
- After the dry run passes and an existing authorized Claude Code environment is available, capture exactly three attempts for each of `FACT-01`, `FACT-03`, `SAFE-01`, and `NOSUB-01`. Record the preregistered randomized order.
- Start every attempt from a new isolated seeded workspace with no evaluator-only files, sibling user data, shared state, browser session, memory, cache, report space, or previous artifacts.
- Keep automatic updates disabled. Use no live candidate data. Do not read or copy provider credentials; let the existing Claude Code environment manage its own authentication.
- Permit only the network and provider access required by the native Claude Code reference route. Keep browser use and unrelated network access disabled unless a preregistered scenario explicitly requires them. These four RC-1 scenarios do not require a browser.
- Preserve raw synthetic artifacts and content-safe traces. Never persist credentials, environment secrets, system prompts, private user data, unrelated filesystem contents, or evaluator-only oracle material in an agent-visible workspace or publishable record.
- Retain every attempt append-only. Never replace or overwrite a failed, blocked, unsupported, incomplete, timed-out, or malformed attempt.
- Record terminal state honestly. A provider response, process exit, or self-report is not verified completion by itself.
- Add an RC-2 runner-produced evidence contract and independent validator where required. Do not modify RC-1 to accept `runner_attested`; RC-1 must continue rejecting it unconditionally.
- Reconcile normalized results with manifests, artifact bytes, exact hashes, scenario identity, route identity, terminal status, deviations, and source snapshot.
- Hashes are byte-identity evidence only.
- Do not evaluate generated claims against the oracle in RC-2. Do not calculate safety, quality, CAQ, parity, advancement, superiority, or hiring outcomes.
- Do not invoke Recursus, DSH, RLM, Honcho, Dovetail, OpenAI Codex CLI, a browser, plugins, or external applications unrelated to the explicitly registered Claude Code reference route.
- Add no runtime dependency unless the repository already requires it and the RC-2 design cannot be implemented safely without it. Document any dependency decision before mutation.
- Use `apply_patch` for hand-written changes.
- Do not use em dash characters in new prose.
- Do not commit or push unless the current user explicitly asks for repository publication.

Required implementation outcomes:

1. A versioned RC-2 registration and append-only attempt-ledger contract.
2. A dry-run mode that exercises the complete local capture pipeline without a provider request.
3. A bounded native Claude Code invocation path that does not change Career Ops workflow behavior.
4. Content-safe capture of raw synthetic outputs, normalized results, traces, artifact hashes, and runner-produced manifests.
5. Independent validation of route identity, source snapshot, artifacts, terminal status, deviations, and manifest cross-references.
6. One dry-run record and twelve actual attempt records when the authorized Claude Code environment is available.
7. Focused positive, negative, denial, overwrite, append-only, and false-attestation tests.
8. Package, updater, ignore, and documentation integration according to existing ownership conventions.
9. Documentation that distinguishes captured run facts from any later oracle, human, safety, quality, parity, advancement, or comparative evaluation.

Verification requirements:

- Re-run every RC-1 verification and prove its behavior and corpus bytes remain unchanged.
- Run the RC-2 dry run at least twice and confirm deterministic registration, invocation construction, normalization shape, and content-safe diagnostics.
- Run focused RC-2 tests for malformed output, unsupported and incomplete routes, manifest/result mismatch, stale artifact hashes, wrong scenario or route, missing identity, false runner attestation, overwrite attempts, append-only retention, oracle leakage, credential leakage, path escape, and unexpected external mutation.
- Instrument denial tests so dry-run and validation paths make no provider, browser, unrelated network, telemetry, plugin, or child-process calls. The explicit actual Claude Code capture command is the only route allowed to invoke the registered external runner.
- Confirm every actual attempt uses a fresh seed and that no evaluator-only path, bytes, canary, identifier, or digest enters an agent-visible workspace or publishable runner input.
- Run `node test-all.mjs --only recursus/`.
- Run `node scripts/check-syntax.mjs`.
- Run `git diff --check`.
- Run the full `node test-all.mjs` when dependencies are available.
- Do not install missing dependencies solely to make a blocked check appear green. Report exact blockers.

Before handing back:

1. Ask a final red-team subagent to inspect the completed diff, registration, attempt ledger, and captured evidence against every RC-2 roadmap and protocol requirement.
2. Resolve valid findings within scope and re-run affected checks.
3. Review `git diff` and `git status --short` so only intentional changes remain.
4. Update `docs/recursus/ROADMAP.md`, `docs/recursus/README.md`, the benchmark documentation, and feature registry with exact implementation and evidence status.
5. Leave RC-2 `in progress` if any required attempt, exact identity, review, or CI evidence is missing. Mark it `accepted` only when the exit evidence exists on the exact reviewed commit.
6. Provide a concise handoff listing changed files, exact attempts and terminal states, exact test results, unrun checks and blockers, limitations, non-claims, and RC-3 as the next milestone without starting it.

Expected stopping point:

Stop after the unchanged Career Ops through Claude Code reference route has one dry-run record and the required RC-2 attempt set, or after reporting an exact external-environment blocker that prevents authorized capture. Do not build the Recursus execution bridge. That is RC-3.
```
