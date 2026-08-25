# RC-3 minimal Recursus execution bridge v14

Status: preserved historical and rejected before execution. Proposed registration `RC3-REC-DIRECT-2026-08-25-V14` and route `recursus-direct-v14` cover one accepted `FACT-01` seed. No V14 dry-run or actual evidence was created. Later review found pre-persistence gating, runtime import-window, transformed-content closure, and actual-completion-gate defects.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node prepare-recursus-route-v14.mjs dry-run-check --run-root <new-external-directory>
node prepare-recursus-route-v14.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node verify-recursus-route-v14.mjs validate --evidence-dir <external-evidence-directory>
node verify-recursus-route-v14.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node capture-recursus-route-v14.mjs actual <all-explicit-registered-runtime-options>
```

V14 encodes capability applicability separately for dry and actual attempts. Whole-worker authority enforcement is not required for the provider-free dry pipeline. The actual path uses a content-addressed read-only image, all Linux capabilities dropped, no new privileges, a read-only fresh seed, a dedicated runtime-managed credential mount, isolated input and output mounts, a networkless worker namespace, and a host-owned CONNECT allowlist for the registered adapter authorities. Private entrypoint and publication capabilities confine runtime invocation and actual attestation issuance to the explicit capture command. Public library callers cannot mint completed actual evidence.

The actual path is designed to record DSH, direct-adapter, registered application-fetch, bounded-output, trusted-terminal, workspace, staging, and cleanup observations. Canonical UTC validation requires `registered_at <= reserved_at <= recorded_at`. The configured runtime may read and use the OAuth grant during an explicit actual capture. Host and runner code must not inspect credential values, and no credential value may be copied into, hashed for, persisted in, or logged in evidence.

V14 supersedes but does not rewrite rejected V13. It accepts only canonical registered container paths, scans raw and bounded transformed text for private paths, closes the complete staging-root topology, proves a real post-seed mutation changes terminal derivation, and emits validator identity `RC3-ROUTE-VALIDATION-14`. Proposed focused negatives cover traversal below registered roots, embedded Windows paths, transformed host paths, stale hashes, wrong identities, false attestation, malformed output, unsupported capability, cleanup failure, links, hardlinks, path aliases, overwrite attempts, and unexpected staging entries.

The minimal route records compiled prompt parity, full Career Ops feature parity, durable execution and recovery, ablations, human evaluation and scoring, RLM and Honcho enhancements, and wire-level request-count attestation as unsupported. End-to-end TLS prevents the host from claiming wire-level HTTP request counts; application fetch and DSH request facts are recorded separately.

RC-3 remains `in progress` because the implementation is uncommitted and the exact reviewed revision lacks successful Windows and supported-CI evidence. V14 has no actual record and establishes no execution-route fact. No oracle evaluation, human review, scoring, factuality, safety, quality, prompt parity, feature parity, advancement, comparative performance, application quality, or hiring outcome is established. Hashes prove byte identity only. RC-4 is next and has not started.
