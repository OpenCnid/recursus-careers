# Codex kickoff prompt for RC-5 disposable `oferta` slice

Status: ready to give to a fresh Codex session

This prompt authorizes implementation, local verification, a feature-branch commit, push, a pull request, and waiting for exact-head checks. It does not authorize a provider invocation or pull-request merge. To run the three treatment cases in the same session, append the exact provider-authorization sentence from [RC5_SLICE_CARD.md](RC5_SLICE_CARD.md#provider-authority) when starting the session.

Copy the complete prompt below into the new session.

```text
Work in this repository:

D:\OpenCnid\recursus-careers

Implement roadmap milestone RC-5 as the single disposable `oferta` slice defined by `docs/recursus/RC5_SLICE_CARD.md`. This is a fast product-learning task, not another release-grade evidence milestone. Build the smallest real path, test the first end-to-end case immediately when authorized, and finish with a recommended `KEEP`, `REBUILD`, or `DELETE` decision.

You are authorized to create a feature branch, implement and test the slice, commit it, push it to `OpenCnid/recursus-careers`, open a pull request against `main`, and wait for required checks on the exact PR head. Do not merge the pull request. Do not invoke a provider unless the current user explicitly gives the exact three-call authorization from the slice card. Do not spawn subagents or create an audit swarm.

Time and token boundary:

- Stop active implementation and local test work after 90 minutes or 45,000 model tokens when observable, whichever comes first. Waiting for CI after the pull request opens is outside the 90-minute implementation cap.
- Do not install a dependency.
- Do not start RC-6 or any RLM, Honcho, Dovetail, UI, generalized orchestration, formal benchmark, or release work.

Before editing:

1. Run `git status --short --branch`, inspect HEAD and remotes, and preserve every existing user change.
2. Confirm `main` contains accepted RC-4 PR #6 head `f086626ef344b59fa466e13eeeb3eccc1acd97fd` and that the roadmap marks RC-4 `accepted` and RC-5 `next`.
3. Do not read, hash, copy, stage, or alter ignored user-layer files such as `cv.md`, `config/profile.yml`, `modes/_profile.md`, `modes/_custom.md`, reports, trackers, browser state, or credentials.
4. Do not use or alter `D:\OpenCnid\recursus`. Use only repository-contained accepted synthetic sources and immutable runtime material, plus an explicit disposable output root.
5. Search for and follow the most specific `AGENTS.md` or equivalent instruction before touching each nested path.

Read these files completely before implementation:

1. `AGENTS.md`
2. root `CODEX.md`
3. `docs/recursus/AGENTS.md`
4. `docs/recursus/README.md`
5. the RC-5 section of `docs/recursus/ROADMAP.md`
6. `docs/recursus/RC5_SLICE_CARD.md`
7. `docs/recursus/architecture/PROMPT_CONTEXT_CONTRACT.md`
8. `docs/recursus/benchmarks/PROTOCOL.md`
9. `docs/recursus/benchmarks/METRICS_AND_PROMOTION.md`
10. `docs/recursus/features/REGISTRY.md`
11. the `FACT-01`, `FACT-03`, and `SAFE-01` scenario manifests and their agent-visible candidate and job sources under `evals/recursus/career-bench-v1/`
12. the R01 normalized result, runner manifest, and Markdown artifact for those three cases under `evals/recursus/rc2-claude-code-reference-v4/evidence/attempts/`
13. `evals/recursus/rc3-recursus-direct-v17/README.md` and the current V17 library and command entrypoints
14. `evals/recursus/rc4-prompt-context-v2/README.md`, its registration and fixture manifest, `lib/recursus/prompt-context-v1.mjs`, and `scripts/recursus/verify-prompt-context-v1.mjs`
15. the nested instruction files governing `lib/recursus/`, `scripts/recursus/`, and `tests/recursus/`

Implementation boundary:

- Put mutable code in `lib/recursus/rc5-slice.mjs`, `scripts/recursus/rc5-slice.mjs`, and `tests/recursus/rc5-slice.test.mjs`, plus only the minimum existing registries required by repository checks.
- Do not modify accepted RC-1 through RC-4 registrations, source snapshots, fixtures, evidence, or implementation bytes.
- Do not create a versioned or frozen RC-5 evidence package.
- Use the accepted RC-4 compiler to compile `oferta-ordinary`, `oferta-budget`, and `oferta-injection` exactly once per case.
- The treatment request must be derived from the resulting `recursus-direct-v1` delivery bundle. Reject any path that constructs a hidden alternative prompt or promotes job data to instructions.
- Reuse the accepted RC-2 R01 artifacts as the baseline. Make zero new baseline provider calls.
- Start with the accepted RC-3 V17 locks: Recursus `d6d25dda3951e46fe1b03ec3cecc3f348bfe2346`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, model `gpt-5.6-sol`, and `xhigh` reasoning. Reuse immutable V17 runtime material without modifying or rerunning the V17 evidence route. If it cannot accept the RC-4 bundle, stop with `REBUILD` instead of substituting another route.
- Record exact runtime, adapter, provider, model, authority, timeout, usage, and failure facts when reported. Do not infer missing values.
- Give the model no tools. Do not browse, submit, send, fill, mutate Career Ops state, or perform any external action beyond an explicitly authorized provider request.
- Keep all generated files below one explicit caller-owned empty disposable output root outside the repository. Fail closed on a repository-contained, non-empty, user-layer, missing, or overly broad root.
- Never expose credential values to host code, logs, hashes, artifacts, or model input.
- Make each case one call with no automatic retry or concurrency.

Keep the command surface small:

1. A provider-free `prepare` command validates the three cases and baseline references, compiles and inspects the RC-4 treatment bundles, proves no accepted bytes changed, and writes a bounded slice plan below the disposable root.
2. An actual `run` command executes exactly one named case only after explicit provider authority and writes its bounded result below that same root.
3. A provider-free `summarize` command creates the compact side-by-side observation table and recommended decision from the available attempts without inventing missing measurements.

Test the denial paths that matter to the blast radius: wrong case or baseline identity, missing or changed accepted input, hidden-prompt bypass, task promotion, model-facing tools, output-root escape, non-empty root, accepted-artifact mutation, credential-shaped output, external mutation, a fourth call, retry, timeout, oversized output, and incomplete result presented as completed.

Verification before any provider call:

1. Run the new focused test directly.
2. Run one provider-free `prepare` in a fresh disposable root and inspect its plan.
3. Run `node scripts/recursus/verify-prompt-context-v1.mjs validate` read-only.
4. Run `node test-all.mjs --only recursus/`.
5. Run `node scripts/check-syntax.mjs`.
6. Run `git diff --check` and review the full diff and status.

If provider authority was not supplied, stop here and report the exact ready command. Do not treat the missing authority as a blocker to committing the implementation.

If provider authority was supplied:

1. Run `FACT-01` once and inspect it immediately against the accepted R01 baseline.
2. Stop with `REBUILD` or `DELETE` if the path is broken, unsafe, clearly useless, or exceeds a cap.
3. Otherwise run `FACT-03` once, then `SAFE-01` once.
4. A failed or timed-out request consumes that case's call budget. Do not retry.
5. Run the provider-free summarizer and produce the slice card's observation table.
6. Recommend `KEEP`, `REBUILD`, or `DELETE` using the registered rule. The user owns the final label.

Before publication, run the full `node test-all.mjs` once when existing dependencies are available. Commit only the intended RC-5 files, push the feature branch, open the pull request, and wait for Ubuntu, macOS, Windows, security, regression, visual, guard, dependency, and other required checks on the exact head. Repair only in-scope pre-merge defects within the same mutable slice and remaining budget.

Hand off with:

- branch, commit, PR URL, and exact PR head;
- files and command surface added;
- local and CI verification results;
- whether provider authority was supplied;
- exact provider-call count and per-case status;
- the compact observation table and recommended `KEEP`, `REBUILD`, or `DELETE` label when actual runs occurred;
- remaining limitations and non-claims;
- confirmation that no accepted RC-1 through RC-4 bytes, ignored user data, external Career Ops state, or dirty upstream checkout was changed; and
- confirmation that the pull request remains unmerged.
```
