# RC-2 Claude Code reference capture v4

This directory is the current RC-2 evidence contract. Registration `RC2-CO-CLAUDE-CODE-2026-08-24-V4` binds the accepted RC-1 corpus, exact OpenCnid repository revision, instruction and harness bytes, native `co-claude-code` route, Claude Code 2.1.223 executable digest, permission profile, environment, budgets, fixed repeat count, and randomized order before provider output.

Current evidence contains one completed provider-free dry run and zero actual attempts. A historical v1 attempt established that the existing Claude Code OAuth session was expired and could not be refreshed. V2 and v3 contain only superseded provider-free dry runs. V3 was superseded because its source snapshot paired the OpenCnid merge revision with the upstream Career Ops repository URL. No v2, v3, or v4 provider request was made after the authentication blocker was known. The twelve preregistered v4 attempt cells remain unconsumed and RC-2 remains `in progress`.

The current offline commands are:

```text
node prepare-recursus-reference-v4.mjs dry-run-check
node verify-recursus-reference-v4.mjs validate
node verify-recursus-reference-v4.mjs validate --require-complete-set
```

While the twelve actual v4 cells remain unconsumed, the complete-set command is expected to reject with `ATTEMPT_SET_INCOMPLETE`.

After an authorized Claude Code environment is available, the only command permitted to start the registered external runner is:

```text
node capture-recursus-reference-v4.mjs next --runner-executable <absolute-native-path>
```

Every actual attempt starts from a fresh RC-1 seed. The harness adds only the registered Career Ops instructions, byte-identical aliases, and fixed claim-free controls. It captures only bounded synthetic output and content-safe trace facts. The independent validator reconciles source, seed, workspace, invocation, artifact, terminal, deviation, and append-only ledger evidence.

`runner_attested` means only that the capture harness recorded process and exact-byte facts. It does not establish semantic correctness, factuality, safety, application quality, parity, advancement, comparative performance, or a hiring outcome. Hashes establish byte identity only. Provider and model identity are not inferred from the runner name.
