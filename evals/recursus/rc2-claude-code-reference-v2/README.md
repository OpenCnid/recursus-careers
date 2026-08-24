# RC-2 Claude Code reference capture v2

This directory preserves the historical v2 `co-claude-code` registration and append-only evidence. It was superseded by v3 and then by the current [v4 contract](../rc2-claude-code-reference-v4/README.md). It must not receive new attempts. Registration `RC2-CO-CLAUDE-CODE-2026-08-24-V2` binds the accepted RC-1 corpus, exact instruction and harness bytes, native `co-claude-code` route, Claude Code 2.1.223 executable digest, permission profile, environment, budgets, fixed repeat count, and randomized order before provider output.

Historical v2 evidence contains one completed provider-free dry run and zero actual attempts. A historical v1 attempt established that the existing Claude Code OAuth session was expired and could not be refreshed. No v2 provider request was made after that blocker was known. The twelve preregistered v2 attempt cells remain unconsumed permanently; resume only through v4.

The v2 source snapshot predates the later package script switches. Its exact package bytes are retained at `sealed-source/package.json`. To reconstruct historical validation, copy the repository into an isolated temporary directory, replace only that temporary copy's root `package.json` with `evals/recursus/rc2-claude-code-reference-v2/sealed-source/package.json`, and run the v2 validator against the copied evidence. Do not change the current worktree. The current package bytes intentionally belong to v4, so running the historical validator directly in the current worktree reports source drift.

The historical offline commands are:

```text
node prepare-recursus-reference-v2.mjs dry-run-check
node verify-recursus-reference-v2.mjs validate
node verify-recursus-reference-v2.mjs validate --require-complete-set
```

The following historical command is documented for evidence interpretation only. Do not run it:

```text
node capture-recursus-reference-v2.mjs next --runner-executable <absolute-native-path>
```

Every actual attempt starts from a fresh RC-1 seed. The harness adds only the registered Career Ops instructions, byte-identical aliases, and fixed claim-free controls. It captures only bounded synthetic output and content-safe trace facts. The independent validator reconciles source, seed, workspace, invocation, artifact, terminal, deviation, and append-only ledger evidence.

`runner_attested` means only that the capture harness recorded process and exact-byte facts. It does not establish semantic correctness, factuality, safety, application quality, parity, advancement, comparative performance, or a hiring outcome. Hashes establish byte identity only. Provider and model identity are not inferred from the runner name.
