# RC-2 Claude Code reference capture v1

This directory preserves the historical v1 `co-claude-code` registration and append-only evidence. It was superseded by later registrations and then by the current [v4 contract](../rc2-claude-code-reference-v4/README.md). It must not receive new attempts.

Historical evidence status: registration `RC2-CO-CLAUDE-CODE-2026-08-24-V1` has one completed provider-free dry run and one retained actual `FACT-01` repeat 1 attempt. V1 labeled that attempt `failed/process_error`; later review established that the captured text represents authentication unavailability. The evidence was not rewritten. Provider identity is `not_reported`; the runner explicitly reported model string `claude-opus-5[1m]`. Eleven v1 cells were not started and will remain unstarted.

The v1 source snapshot predates the package script switch to v2. The exact package bytes named by the v1 snapshot are retained at `sealed-source/package.json`, with the same SHA-256 digest recorded in `source-snapshot.json`.

To reconstruct historical validation, copy the repository into an isolated temporary directory, replace only that temporary copy's root `package.json` with `evals/recursus/rc2-claude-code-reference-v1/sealed-source/package.json`, and run the v1 validator against the copied evidence. Do not change the current worktree. The current package bytes intentionally belong to v4, so running the historical validator directly in the current worktree reports source drift.

The offline preparation and validation paths do not start a child process or access a provider, browser, network, plugin, telemetry, credential, or user-data surface. The following historical command is documented for evidence interpretation only. Do not run it:

```text
node capture-recursus-reference.mjs next --evidence-dir evals/recursus/rc2-claude-code-reference-v1 --runner-executable <absolute-native-path>
```

The registration and official dry run are created with:

```text
node prepare-recursus-reference.mjs register --evidence-dir evals/recursus/rc2-claude-code-reference-v1 --registered-at <UTC-time> --repository-revision <revision> --runner-version <version> --runner-binary-sha256 <sha256>
node prepare-recursus-reference.mjs dry-run --evidence-dir evals/recursus/rc2-claude-code-reference-v1
node prepare-recursus-reference.mjs dry-run-check --evidence-dir evals/recursus/rc2-claude-code-reference-v1
node verify-recursus-reference.mjs validate
```

Every attempt uses a fresh RC-1 seed. The harness adds only the preregistered Career Ops instruction bundle, byte-identical source aliases, and fixed claim-free controls. Evaluator-only oracle material remains outside the workspace. Raw generated Markdown is retained only after the content-safe boundary rejects credential-shaped content, private paths, and every RC-1 evaluator-only path, byte sequence, canary, identifier, and digest.

`runner_attested` in this RC-2 contract means only that the capture harness recorded process and exact-byte facts. It does not establish semantic correctness, factuality, safety, quality, parity, advancement, or comparative performance. Hashes establish byte identity only. These unsigned local records are internally reproducible, not tamper-proof against replacement of the complete bundle.
