# RC-3 minimal Recursus execution bridge v17

Status: active frozen local execution route. Registration `RC3-REC-DIRECT-2026-08-25-V17` and route `recursus-direct-v17` cover one accepted `FACT-01` seed. V17 requires successful seed and runner-input validation for actual completion and enforces the artifact byte cap before persistence. Two independent provider-free checks match exactly. The official external evidence contains one completed dry run and one completed fresh-seed actual attempt with termination reason `none`. RC-3 remains `in progress` pending exact reviewed-revision CI.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `d6d25dda3951e46fe1b03ec3cecc3f348bfe2346`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node scripts/recursus/prepare-recursus-route-v17.mjs dry-run-check --run-root <new-external-directory>
node scripts/recursus/prepare-recursus-route-v17.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node scripts/recursus/verify-recursus-route-v17.mjs validate --evidence-dir <external-evidence-directory>
node scripts/recursus/verify-recursus-route-v17.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node scripts/recursus/capture-recursus-route-v17.mjs actual <all-explicit-registered-runtime-options>
```

V17 encodes capability applicability separately for dry and actual attempts. Whole-worker authority enforcement is not required for the provider-free dry pipeline. The actual path uses a content-addressed read-only image, all Linux capabilities dropped, no new privileges, a read-only fresh seed, a dedicated runtime-managed credential mount, isolated input and output mounts, a networkless worker namespace, and a host-owned CONNECT allowlist for the registered adapter authorities. Private entrypoint and publication capabilities confine runtime invocation and actual attestation issuance to the explicit capture command. Public library callers cannot mint completed actual evidence.

The actual record contains one DSH request, one direct-adapter invocation, one registered application fetch, one trusted terminal event, and one 390-byte Markdown artifact. Canonical UTC validation requires `registered_at <= reserved_at <= recorded_at`. The configured runtime read and used the OAuth grant only during the explicit actual capture. Host and runner code did not inspect credential values, and no credential value was copied into, hashed for, persisted in, or logged in evidence.

V17 supersedes but does not rewrite rejected V15. It accepts only canonical registered container paths, scans raw and bounded transformed text for private paths, closes the complete staging-root topology, proves a real post-seed mutation changes terminal derivation, requires successful seed and runner-input validation for actual completion, and enforces the artifact byte cap before persistence. Focused negatives cover traversal below registered roots, embedded Windows paths, transformed host paths, stale hashes, wrong identities, false attestation, malformed output, unsupported capability, cleanup failure, links, hardlinks, path aliases, overwrite attempts, over-budget output, and unexpected staging entries.

Opaque-content scanning fails closed after 4,096 candidate decodes or 1,048,576 expanded bytes. An artifact containing enough unrelated opaque-looking identifiers can therefore end incomplete with `CONTENT_ENCODING`; the runner does not relabel that bound as successful output.

The minimal route records compiled prompt parity, full Career Ops feature parity, durable execution and recovery, ablations, human evaluation and scoring, RLM and Honcho enhancements, and wire-level request-count attestation as unsupported. End-to-end TLS prevents the host from claiming wire-level HTTP request counts; application fetch and DSH request facts are recorded separately.

V17 establishes one local execution-route conformance fact for the registered seed and direct adapter. Independent validation passes route identity, source snapshot, artifact integrity, cross-references, terminal consistency, and ledger integrity. RC-3 remains `in progress` because the implementation is uncommitted and the exact reviewed revision lacks successful Windows and supported-CI evidence. No oracle evaluation, human review, scoring, factuality, safety, quality, prompt parity, feature parity, advancement, comparative performance, application quality, or hiring outcome is established. Hashes prove byte identity only. RC-4 is next and has not started.
