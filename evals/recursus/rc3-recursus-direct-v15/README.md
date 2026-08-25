# RC-3 minimal Recursus execution bridge v15

Status: preserved historical and rejected after final review. Registration `RC3-REC-DIRECT-2026-08-25-V15` and route `recursus-direct-v15` cover one accepted `FACT-01` seed. Two independent provider-free checks matched exactly. One official external dry run and one fresh-seed actual attempt independently validate under the frozen V15 contract as `completed`; the actual termination reason is `none`. Final review found that actual completion did not require successful seed and runner-input validation observations and that the worker enforced the artifact byte cap only after persistence. V15 is not promoted.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node prepare-recursus-route-v15.mjs dry-run-check --run-root <new-external-directory>
node prepare-recursus-route-v15.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node verify-recursus-route-v15.mjs validate --evidence-dir <external-evidence-directory>
node verify-recursus-route-v15.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node capture-recursus-route-v15.mjs actual <all-explicit-registered-runtime-options>
```

V15 encodes capability applicability separately for dry and actual attempts. Whole-worker authority enforcement is not required for the provider-free dry pipeline. The actual path uses a content-addressed read-only image, all Linux capabilities dropped, no new privileges, a read-only fresh seed, a dedicated runtime-managed credential mount, isolated input and output mounts, a networkless worker namespace, and a host-owned CONNECT allowlist for the registered adapter authorities. Private entrypoint and publication capabilities confine runtime invocation and actual attestation issuance to the explicit capture command. Public library callers cannot mint completed actual evidence.

The actual path records DSH, direct-adapter, registered application-fetch, bounded-output, trusted-terminal, workspace, staging, and cleanup observations. Canonical UTC validation requires `registered_at <= reserved_at <= recorded_at`. The configured runtime read and used the OAuth grant during the explicit actual capture. Host and runner code did not inspect credential values, and no credential value was copied into, hashed for, persisted in, or logged in evidence.

V15 supersedes but does not rewrite rejected V14. It accepts only canonical registered container paths, scans raw and bounded transformed text for private paths, closes the complete staging-root topology, proves a real post-seed mutation changes terminal derivation, and emits validator identity `RC3-ROUTE-VALIDATION-15`. Focused negatives cover traversal below registered roots, embedded Windows paths, transformed host paths, stale hashes, wrong identities, false attestation, malformed output, unsupported capability, cleanup failure, links, hardlinks, path aliases, overwrite attempts, and unexpected staging entries.

Opaque-content scanning fails closed after 4,096 candidate decodes or 1,048,576 expanded bytes. An artifact containing enough unrelated opaque-looking identifiers can therefore end incomplete with `CONTENT_ENCODING`; the runner does not relabel that bound as successful output.

The minimal route records compiled prompt parity, full Career Ops feature parity, durable execution and recovery, ablations, human evaluation and scoring, RLM and Honcho enhancements, and wire-level request-count attestation as unsupported. End-to-end TLS prevents the host from claiming wire-level HTTP request counts; application fetch and DSH request facts are recorded separately.

The actual manifest records one DSH request, one direct-adapter invocation, one registered application fetch, one trusted terminal event, one 413-byte Markdown artifact, zero denied or unregistered fetches, unchanged seeded workspace, and strict successful absence checks for three containers, one network, and one volume. The normalized result and runner-attested manifest cross-reference the exact external evidence bytes. Registration SHA-256 is `0d2bb2e0212642105a6a8385a05a60a57850249762a1b0f5b46f36e2f6a6c76a`; source-snapshot SHA-256 is `61454b6902b554fd4e83dc407f309f4aec3de66ed001c769180b0ad55cc265cd`.

RC-3 remains `in progress` because the implementation is uncommitted and the exact reviewed revision lacks successful Windows and supported-CI evidence. The actual record validates under the frozen historical V15 contract, but the final-review defects prevent its promotion as a trusted RC-3 route-conformance fact. No oracle evaluation, human review, scoring, factuality, safety, quality, prompt parity, feature parity, advancement, comparative performance, application quality, or hiring outcome is established. Hashes prove byte identity only. RC-4 is next and has not started.
