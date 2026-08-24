# Codex kickoff prompt for RC-3 minimal Recursus execution bridge

Status: staged for the milestone after RC-2 acceptance. The current RC-2 implementation has one validated provider-free dry run and twelve validated actual Claude Code attempts, but RC-2 remains `in progress` until the exact implementation commit passes final review and required CI. Do not start RC-3 while the roadmap still marks RC-2 `in progress`.

Copy the prompt below into a new Codex task only after the RC-2 pull request is merged and the roadmap marks RC-2 `accepted` and RC-3 `next`.

```text
Work in this repository:

D:\OpenCnid\recursus-careers

Implement roadmap milestone RC-3, Minimal Recursus execution bridge, from the accepted `main` branch.

RC-3 must let one accepted `career-bench-v1` seed case run through a minimal Recursus route and return a normalized result plus runner-attested manifest. Keep the scope narrow. Use the direct provider adapter registered for the run. Do not use the Codex CLI as transport. Do not implement compiled prompt parity, full Career Ops feature parity, durable execution, scoring, ablations, or Recursus-only enhancements. Those belong to later milestones. Do not claim factuality, safety, application quality, feature parity, advancement, comparative performance, or hiring outcomes.

Acceptance gate before editing:

1. Run `git status --short` and preserve every existing user change.
2. Confirm the current branch is based on the merged RC-2 revision.
3. Confirm `docs/recursus/ROADMAP.md` marks RC-1 and RC-2 `accepted` and RC-3 `next`.
4. Confirm the merged RC-2 pull request has successful Windows and supported-CI checks for the exact accepted revision.
5. Run:
   - `node verify-recursus-benchmark.mjs validate`
   - `node verify-recursus-reference-v4.mjs validate --require-complete-set`
   - `node test-all.mjs --only recursus/`
   - `node scripts/check-syntax.mjs`
6. If RC-2 is not accepted or a required check fails for an implementation reason, stop RC-3 execution, gather exact evidence, and repair only the RC-2 acceptance blocker. Do not build or invoke a Recursus route on an unaccepted reference foundation.

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
11. `docs/recursus/features/REGISTRY.md`
12. `evals/recursus/README.md`
13. all RC-1 schemas and four accepted scenario manifests
14. `evals/recursus/rc2-claude-code-reference-v4/registration.json`
15. `evals/recursus/rc2-claude-code-reference-v4/source-snapshot.json`
16. all RC-2 v4 schemas and validator code
17. `verify-recursus-benchmark.mjs` and `lib/recursus-benchmark.mjs`
18. the pinned Recursus and DSH source references named by the architecture documents
19. relevant provider-adapter, test, updater, package, ignore, and evidence-storage conventions

Search for more specific `AGENTS.md`, `CODEX.md`, or equivalent instructions before touching a nested directory. Follow the most specific applicable rules.

Use subagents heavily for bounded read-only reviews with no overlapping writes. The primary agent must personally read and interpret every binding instruction and own shared-file integration. Suggested reviews:

1. Accepted RC-1 and RC-2 boundary audit.
2. Pinned Recursus runner and provider-adapter audit.
3. Minimal bridge contract and schema review.
4. Fresh-seed and oracle-isolation threat review.
5. Provider identity, credential, privacy, and trace review.
6. Unsupported-capability and terminal-status review.
7. Windows and supported-CI portability review.
8. Package, updater, ownership, and dependency review.
9. Documentation and non-claim review.
10. Final independent red-team review after implementation.

Do not create extra branches or worktrees for subagents. Do not let subagents commit, push, install packages, change credentials, invoke providers, or mutate user-layer data.

Binding RC-3 implementation contract:

- Treat the RC-3 section of `docs/recursus/ROADMAP.md`, the benchmark protocol, and the accepted RC-1 and RC-2 contracts as binding.
- Reuse the accepted `career-bench-v1` bytes and `verify-recursus-benchmark.mjs seed` command. Do not alter RC-1 fixture bytes or weaken its validator.
- Preserve all RC-2 v4 registration and evidence bytes. Do not rerun, replace, reinterpret, or score the Claude Code reference attempts.
- Add a separate versioned Recursus route contract. Keep route identity, provider identity, model identity, runner identity, and harness identity distinct.
- Use the direct provider adapter selected and registered for the run. Do not invoke the OpenAI Codex CLI, Claude Code CLI, or another CLI as hidden transport.
- Register the route, source snapshot, permission profile, policies, budgets, seed case, and expected evidence shape before viewing generated route output.
- Perform a provider-free dry run that exercises seeding, bridge input construction, output capture, normalization, manifest creation, and independent validation.
- Start each actual attempt from a fresh isolated RC-1 seed. Keep evaluator-only files, sibling user data, prior artifacts, browser state, plugins, caches, memory, and unrelated filesystem data outside the runner authority boundary.
- Let the configured runtime manage existing authorized authentication. Never read, copy, persist, hash, or log credentials or environment secrets.
- Permit only network and provider access required by the registered direct adapter during an explicit actual capture. Dry-run and validation commands remain offline and child-process free.
- Keep browser use, plugins, telemetry, automatic updates, unrelated network access, and unrelated external applications disabled.
- Preserve bounded raw synthetic artifacts, content-safe traces, normalized results, exact hashes, and runner-produced manifests outside the agent-visible workspace.
- Scan the complete seeded workspace, runner input, post-run tree, trace, artifacts, normalized result, and manifest for evaluator-only paths, bytes, canaries, identifiers, and digests.
- Record unsupported capabilities as `unsupported`. Do not silently simulate them, relabel them as completed, or hide them as deviations.
- Derive terminal state from trusted observations and independently validated artifacts. A provider response, process exit, or self-report is not verified completion by itself.
- Treat hashes as byte-identity evidence only.
- Do not evaluate output against the oracle in RC-3. Do not calculate factuality, safety, quality, CAQ, parity, advancement, superiority, or hiring outcomes.
- Keep the existing Career Ops workflow behavior unchanged. The bridge is an evaluation route beside the product workflow, not a product integration claim.
- Add no dependency unless the accepted pinned Recursus route requires it and the design cannot be implemented safely without it. Document and review the exact dependency decision before mutation.
- Use `apply_patch` for hand-written changes.
- Do not use em dash characters in new prose.
- Do not commit or push unless the current user explicitly asks for repository publication.

Required implementation outcomes:

1. A versioned minimal Recursus route registration and source snapshot.
2. A provider-free dry-run path for the complete local bridge pipeline.
3. A bounded direct-adapter invocation path for one accepted seed case.
4. Route-produced normalized result, content-safe trace, exact artifact inventory, and runner-attested manifest.
5. Independent validation of route identity, source snapshot, seed bytes, artifacts, terminal status, deviations, and cross-references.
6. Honest `unsupported` records for required capabilities the minimal bridge cannot provide.
7. Focused positive, negative, denial, overwrite, false-attestation, oracle-leakage, credential-leakage, path-escape, and unexpected-mutation tests.
8. Package, updater, ignore, ownership, and documentation integration according to existing conventions.
9. Documentation that distinguishes bridge execution facts from later prompt parity, feature parity, oracle, human, safety, quality, advancement, and comparative evaluation.

Verification requirements:

- Re-run every RC-1 and RC-2 verification and prove their behavior and evidence bytes remain unchanged.
- Run the RC-3 dry run at least twice and confirm deterministic registration, bridge-input construction, normalization shape, and content-safe diagnostics.
- Instrument denial tests so dry-run and validation paths make no provider, browser, unrelated network, telemetry, plugin, or child-process calls.
- Confirm the explicit actual Recursus capture command is the only path allowed to invoke the registered runtime and direct adapter.
- Confirm every actual route invocation uses a fresh seed and that no evaluator-only material enters the runner workspace or publishable input.
- Run focused RC-3 tests for malformed output, unsupported capabilities, incomplete routes, stale hashes, wrong route or scenario, missing identity, false runner attestation, overwrite attempts, credential leakage, path escape, and unexpected external mutation.
- Run `node test-all.mjs --only recursus/`.
- Run `node scripts/check-syntax.mjs`.
- Run `git diff --check`.
- Run the full `node test-all.mjs` when dependencies are available.
- Do not install missing dependencies solely to make a blocked check appear green. Report exact blockers.

Before handing back:

1. Ask a final red-team subagent to inspect the completed diff and evidence against every RC-3 roadmap and protocol requirement.
2. Resolve valid findings within scope and rerun affected checks.
3. Review `git diff` and `git status --short` so only intentional changes remain.
4. Update the roadmap, Recursus overview, benchmark documentation, evaluation README, and feature registry with exact implementation and evidence status.
5. Leave RC-3 `in progress` if any required route evidence, identity, review, or CI evidence is missing. Mark it `accepted` only when exit evidence exists on the exact reviewed commit.
6. Provide a concise handoff listing changed files, exact run and terminal states, exact test results, unrun checks and blockers, limitations, non-claims, and RC-4 as the next milestone without starting it.

Expected stopping point:

Stop after one accepted seed case can run through the minimal direct-adapter Recursus route and its local evidence validates, or after reporting an exact external-environment blocker. Do not implement compiled prompt parity or feature parity. Those begin in RC-4 and RC-5.
```
