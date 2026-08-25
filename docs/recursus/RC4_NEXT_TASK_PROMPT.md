# Codex kickoff prompt for RC-4 compiled prompt and context parity

Status: ready to give to a fresh Codex session. This prompt authorizes implementation, verification, a feature-branch commit, push, and a pull request. It does not authorize a provider invocation, RC-5 work, or pull-request merge.

Copy the complete prompt below into the new session.

```text
Work in this repository:

D:\OpenCnid\recursus-careers

Implement roadmap milestone RC-4, Compiled prompt and context parity, exactly as bounded by `docs/recursus/SPEC.md`. Use multi-agents for parallel, bounded reviews and non-overlapping implementation work. Publish the completed work on a feature branch, open a pull request against `OpenCnid/recursus-careers` main, and wait for all required checks on the exact PR head. Do not merge the pull request. Do not begin RC-5.

The goal is an offline, dependency-free, versioned compiler that turns the four registered Career Ops pilot mode contracts (`oferta`, `pdf`, `cover`, and `email`) into one canonical `CompiledPrompt` representation and two inspectable route-delivery bundles: `co-claude-code-reference-v1` and `recursus-direct-v1`. Decode both bundles and prove structural semantic parity under registered adapter rules.

This is compiler-boundary evidence only. Do not claim provider-observed prompt equality, runner or model behavior, prompt-injection resistance, action safety, factuality, application quality, feature parity, product integration, PN2 or PN3 provider neutrality, comparative performance, advancement, or hiring outcomes.

Mandatory preservation and acceptance gate before editing:

1. Run `git status --short` before any mutation and preserve every existing user change.
2. The previous preparation session may have left these intentional, user-authorized RC-4 documentation changes uncommitted:
   - `docs/recursus/SPEC.md`
   - `docs/recursus/README.md`
   - `docs/recursus/RC4_NEXT_TASK_PROMPT.md`
   Audit and preserve them. Do not overwrite them with the historical RC-1 specification or RC-3 prompt.
3. Preserve all ignored user-layer files, including `modes/_profile.md`, `modes/_custom.md`, `modes/_brief.md`, and `voice-dna.md`. Do not read their contents for RC-4, stage them, copy them, hash them, or use them as fixtures.
4. Preserve the original upstream Recursus checkout at `D:\OpenCnid\recursus`. It is detached at `4444405e8b34124b1518fa2a66d0223e202234e4` and contains user-owned generated evidence:
   - modified `manifests/package-integrity.json`
   - untracked `evaluations/milestone-1-rc3-package-report.json`
   Do not alter, stage, discard, reinterpret, or depend on those files. Do not use that dirty checkout for RC-4 implementation.
5. Confirm the Careers base contains merged RC-3 commit `04f5f490f3c745e2ab335c91ca2eb3abf31c19c0` and that `docs/recursus/ROADMAP.md` marks RC-1, RC-2, and RC-3 `accepted`, with RC-4 `next` or `in progress`.
6. Confirm RC-3 V17 remains pinned to:
   - Recursus `d6d25dda3951e46fe1b03ec3cecc3f348bfe2346`
   - DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`
   - direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`
7. Confirm exact RC-3 implementation commit `7fe377863dc8b6b5cc584fe5225fb8a6f837b695` and the accepted V17 evidence are unchanged. Do not rerun V17 or create another provider attempt.
8. Run `node update-system.mjs check` and report any available update. Do not apply an update unless the current user explicitly authorizes it. RC-4 must pin the exact source bytes it actually compiles.
9. Run `node doctor.mjs --json`. Missing personal onboarding files are not permission to create or inspect them. Browser or plugin warnings do not block this provider-free milestone.
10. Before creating the feature branch, inspect branch, HEAD, worktrees, and remotes. Use a safe branch strategy that carries the intentional RC-4 documentation changes without losing or mixing other work.
11. If the accepted RC-1, RC-2, or RC-3 foundation is missing, changed, or fails for an implementation reason, stop RC-4 implementation and report the exact blocker. Repairing an accepted milestone is a separate task unless the user explicitly expands scope.

Read these files completely in this order. The primary agent must do this personally before delegating architectural judgments:

1. `AGENTS.md`
2. root `CODEX.md`
3. `docs/CODEX.md`
4. `docs/ARCHITECTURE.md`
5. `docs/recursus/AGENTS.md`
6. `docs/recursus/README.md`
7. `docs/recursus/ROADMAP.md`
8. `docs/recursus/SPEC.md`
9. `docs/recursus/architecture/README.md`
10. `docs/recursus/architecture/PROMPT_CONTEXT_CONTRACT.md`
11. `docs/recursus/architecture/INTENDED_DIFFERENCES.md`
12. `docs/recursus/benchmarks/README.md`
13. `docs/recursus/benchmarks/PROTOCOL.md`
14. `docs/recursus/benchmarks/SCENARIO_CATALOG.md`
15. `docs/recursus/benchmarks/METRICS_AND_PROMOTION.md`
16. `docs/recursus/features/README.md`
17. `docs/recursus/features/REGISTRY.md`
18. `evals/recursus/AGENTS.md`
19. `evals/recursus/README.md`
20. all RC-1 schemas, catalog entries, source policies, and the four accepted scenario manifests
21. RC-2 v4 registration, source snapshot, schemas, validator, and evidence overview
22. `evals/recursus/rc3-recursus-direct-v17/README.md`, V17 registration, source snapshot, schemas, and validator entrypoints
23. `lib/AGENTS.md`, `scripts/AGENTS.md`, and `tests/recursus/AGENTS.md`
24. `.agents/skills/career-ops/SKILL.md`
25. `modes/_shared.md`, `modes/_writing.md`, `modes/oferta.md`, `modes/pdf.md`, `modes/cover.md`, and `modes/email.md`
26. `update-system.mjs`, `package.json`, `.github/workflows/ci.yml`, and relevant ignore and ownership files

Search for more specific `AGENTS.md`, `CODEX.md`, or equivalent instructions before touching any nested path. Follow the most specific applicable instruction.

Multi-agent operating model:

1. After the primary agent reads every binding instruction, create a written plan and spawn bounded read-only audit agents in parallel. Use the available concurrency without exceeding it.
2. Give every agent an exact scope, path set, expected evidence, and prohibition on writes unless a later assignment explicitly grants a disjoint write set.
3. Do not let agents commit, push, install packages, invoke providers, access browsers, inspect credentials, read user-layer files, or mutate accepted evidence.
4. Agents share the filesystem. Never assign overlapping writes. The primary agent owns shared integration files, including `package.json`, `update-system.mjs`, roadmap, registry, README files, and the final source snapshot.
5. Require path and line references, concrete threat cases, and unresolved questions in every audit response. The primary agent must independently verify conclusions and reconcile disagreements.

Start with these parallel read-only audits:

1. Foundation audit: prove the accepted RC-1, RC-2, and RC-3 preservation boundary and identify every byte set RC-4 must not change.
2. Career Ops contract audit: map the router, shared rules, mode-specific instructions, conditional sources, output contracts, language policy, tool policy, and unsupported behavior for the four pilot modes.
3. IR and schema audit: threat-model canonicalization, hashes, source closure, JSON schemas, size limits, Unicode, path containment, symlinks, junctions, reparse points, and diagnostic leakage.
4. Route adapter audit: derive the smallest honest Claude Code reference and Recursus direct offline delivery bundles, inverse decoders, permitted transformations, and observable-boundary limitations.
5. Fixture and isolation audit: map only agent-visible synthetic inputs, evaluator-only canaries, user-layer exclusions, task occurrence rules, and injection-shaped static fixtures.
6. Test and portability audit: inspect test discovery, Windows/POSIX behavior, CI matrices, updater registration, package scripts, ownership, and denial instrumentation.
7. Claim-boundary audit: compare the proposed evidence with the roadmap, architecture, protocol, metrics rules, and feature registry to prevent feature, safety, quality, or provider-behavior overclaiming.

After reconciling those audits, the primary agent may delegate implementation only when ownership is disjoint. A safe example is:

- one agent owns only `evals/recursus/rc4-prompt-context-v1/schemas/`;
- one agent owns only the non-schema manifests and synthetic fixtures under that RC-4 directory;
- one agent owns only `lib/recursus/prompt-context-v1.mjs`;
- one agent owns only `scripts/recursus/verify-prompt-context-v1.mjs`;
- one agent owns only `tests/recursus/prompt-context-v1.test.mjs`.

Adjust those assignments when module boundaries make a different split safer. Do not force parallel writes across tightly coupled code. The primary agent must review every resulting diff and owns all shared-file changes.

Binding implementation rules:

- Treat `docs/recursus/SPEC.md` as the binding RC-4 contract.
- Keep RC-4 fully provider-free, browser-free, plugin-free, OAuth-free, telemetry-free, offline, and child-process free except where repository verification itself requires an existing local process command.
- Never call Claude Code, Codex CLI, Recursus, DSH, the direct adapter transport, a provider SDK, or a model.
- Never read credentials, provider environment variables, environment dumps, personal profiles, reports, trackers, browser state, caches, or unrelated repositories.
- Use only registered synthetic, agent-visible bytes. Evaluator-only scenario manifests and oracle material are validator inputs for exclusion checks, never compiler input.
- Keep route, runner, harness, adapter, provider, and model identities separate. Unknown or unobservable facts use an explicit `unverified` or `not_reported` representation.
- Compile the canonical representation once per fixture. Both route bundles must bind to that same compilation digest.
- Make every source, block, authority, trust label, budget decision, output contract, tool profile, and adapter transformation inspectable and hash-bound.
- Task data occurs exactly once in `data.task`, never in system authority.
- Profile data stays separate from policy. `context.memory` remains absent or explicitly empty.
- Do not silently paraphrase, truncate, omit, duplicate, or reorder semantic content.
- Fail closed on stale, mixed, falsely relabeled, or unregistered evidence.
- Keep the reference CLI's closed provider request boundary explicit. Compiler-boundary equality is not provider-observed equality.
- Use `apply_patch` for hand-written edits.
- Do not add a dependency unless the user explicitly approves the exact need. Do not install packages solely to make checks green.
- Do not use em dash characters in new prose.
- Preserve documentation that Recursus Milestone 1 and current-pin Linux double-build, profile, smoke, and clean-machine acceptance evidence remain incomplete.

Version and freeze protocol:

1. Keep the RC-4 package mutable while implementing and testing.
2. Complete static, negative, denial, threat, portability, and deterministic tests before freeze.
3. Run two offline dry runs in separate temporary roots and prove their deterministic artifacts match exactly.
4. Ask an independent red-team agent to inspect the complete candidate diff and generated evidence against every SPEC requirement.
5. Reconcile every valid finding and rerun affected checks.
6. Freeze registration, source snapshot, schemas, manifests, and fixtures exactly once only after the final pre-freeze review passes.
7. If a defect is found after freeze, do not rewrite frozen bytes. Stop and request explicit approval for a new RC-4 version.

Required focused proof:

- All four modes compile through both offline targets.
- Inverse decoding yields identical semantic identities and order.
- Two clean compiles produce byte-identical results.
- System invariant hashes stay stable when synthetic profile or task input changes.
- Task content appears exactly once and only as external untrusted data.
- Profile bytes, evaluator-only content, accepted evidence, credentials, private paths, and user-layer bytes never enter compiled output.
- Every permitted route difference has a named, reversible adapter rule.
- Mixed snapshots, stale hashes, false trust or authority labels, task duplication, hidden omission, silent truncation, wrong compilation binding, decoder invention, path escape, case collision, confusables, malformed data, oversize data, non-empty output, unexpected mutation, and forbidden service calls all fail closed.
- Diagnostics remain content-safe.

Verification and regression requirements:

1. Run `node verify-recursus-benchmark.mjs validate`.
2. Run `node verify-recursus-reference-v4.mjs validate --require-complete-set`.
3. Validate the existing V17 external evidence read-only when the approved root is present. On this Windows host, resolve it from `LOCALAPPDATA` without printing private contents:
   `$evidenceRoot = Join-Path $env:LOCALAPPDATA 'OpenCnid\recursus-rc3\evidence-v17-final'; node scripts/recursus/verify-recursus-route-v17.mjs validate --evidence-dir $evidenceRoot --require-actual`
   Never run the V17 capture command. If the root is unavailable in CI, use repository-contained V17 structural tests and report that limitation exactly.
4. Run the new RC-4 `validate` and `compare` commands for every registered mode and fixture.
5. Run the two required deterministic offline dry runs before freeze.
6. Run focused RC-4 tests directly.
7. Run `node test-all.mjs --only recursus/`.
8. Run `node scripts/check-syntax.mjs`.
9. Run `git diff --check`.
10. Run the full `node test-all.mjs` when existing dependencies are available.
11. Review `git diff`, `git diff --stat`, and `git status --short` so only intentional RC-4 files are staged.

Publication and CI:

1. Create a narrowly named feature branch from the accepted main foundation while preserving the intentional preparation changes.
2. Commit only the audited RC-4 changes. Do not stage ignored user files, original dirty Recursus evidence, or unrelated changes.
3. Push the feature branch and open a pull request against `OpenCnid/recursus-careers` main.
4. Wait for Ubuntu, macOS, Windows, security, regression, visual, guard, dependency, and any other required repository checks on the exact PR head.
5. If CI finds an in-scope defect before freeze, repair it, rerun affected local checks, commit, push, and wait for the new exact head.
6. If CI or review finds a defect after freeze, do not mutate the frozen V1 package. Stop and request approval for a new RC-4 version.
7. Do not mark RC-4 `accepted` until the exact reviewed commit has every required successful check. A cancelled platform, partial matrix, or different commit does not count.
8. Do not merge the pull request. The user must explicitly approve merge in a later instruction.

Final independent review:

Before the final commit, ask a fresh red-team agent to review the complete diff, source closure, schemas, fixtures, negative tests, deterministic outputs, claim language, package/updater coverage, and preservation boundary. Require explicit findings with severity and path references. Resolve all valid in-scope findings, rerun checks, and report any disputed or deferred item honestly.

Expected stopping point and handoff:

Stop when the exact PR head has successful required CI and RC-4 is eligible for `accepted`, or when an exact external or post-freeze blocker requires user authority. Do not merge, invoke a provider, start RC-5, update Career Ops system files, or mutate user data.

Hand off with:

- exact branch, commit, and PR URL;
- RC-4 registration and source-snapshot identities;
- pilot modes, fixtures, targets, and adapter-rule IDs;
- exact local verification results and two-dry-run comparison;
- every exact CI check result for the PR head;
- red-team findings and resolutions;
- preserved ignored-file and dirty upstream checkout status;
- all limitations and non-claims;
- confirmation that V17 was not rerun and no provider, browser, OAuth, plugin, telemetry, or unrelated service was invoked;
- whether RC-4 is `accepted` or still `in progress`; and
- confirmation that the pull request remains unmerged.
```
