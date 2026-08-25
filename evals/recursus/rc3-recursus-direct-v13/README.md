# RC-3 minimal Recursus execution bridge v13

Status: preserved historical and rejected after review. Registration `RC3-REC-DIRECT-2026-08-24-V13` and route `recursus-direct-v13` cover one accepted `FACT-01` seed. The deterministic dry-run timestamp equals the preregistered timestamp. Two independent V13 dry projections produced identical hashes. The official external evidence contains one dry run and one fresh-seed actual attempt. Both independently validate under the V13 contract as `completed`; the actual termination reason is `none`. Later review found false-attestation, staging, and transformed-content closure defects, so this record is not promoted.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node prepare-recursus-route-v13.mjs dry-run-check --run-root <new-external-directory>
node prepare-recursus-route-v13.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node verify-recursus-route-v13.mjs validate --evidence-dir <external-evidence-directory>
node verify-recursus-route-v13.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node capture-recursus-route-v13.mjs actual <all-explicit-registered-runtime-options>
```

V13 encodes capability applicability separately for dry and actual attempts. Whole-worker authority enforcement is not required for the provider-free dry pipeline. The actual path uses a content-addressed read-only image, all Linux capabilities dropped, no new privileges, a read-only fresh seed, a dedicated runtime-managed credential mount, isolated input and output mounts, a networkless worker namespace, and a host-owned CONNECT allowlist for the registered adapter authorities. Private entrypoint and publication capabilities confine runtime invocation and actual attestation issuance to the explicit capture command. Public library callers cannot mint completed actual evidence.

The actual manifest records one DSH request, one direct-adapter invocation, one registered application fetch, one bounded text block, one discarded reasoning block, two reconciled response tunnels, zero denied tunnels, zero unregistered fetches, a successful trusted terminal event, an unchanged seeded workspace, and strict successful absence checks for three containers, one network, and one volume. Canonical UTC validation proves `registered_at <= reserved_at <= recorded_at`. The bounded 398-byte artifact, normalized result, artifact inventory, worker observation, authority observation, trace, and runner manifest validate with exact cross-references. The configured runtime read and used the OAuth grant. Host and runner code did not inspect credential values, and no credential value was copied into, hashed for, persisted in, or logged in evidence.

V13 supersedes but does not rewrite V12. It accepts only canonical registered container paths, scans raw, JSON-decoded, percent-decoded, and bounded opaque-decoded text for private paths, closes the complete staging-root topology, proves a real post-seed mutation changes terminal derivation, and emits validator identity `RC3-ROUTE-VALIDATION-13`. Focused negatives cover traversal below registered roots, embedded Windows paths, base64-encoded host paths, stale hashes, wrong identities, false attestation, malformed output, unsupported capability, cleanup failure, links, hardlinks, path aliases, overwrite attempts, and unexpected staging entries.

The minimal route records compiled prompt parity, full Career Ops feature parity, durable execution and recovery, ablations, human evaluation and scoring, RLM and Honcho enhancements, and wire-level request-count attestation as unsupported. End-to-end TLS prevents the host from claiming wire-level HTTP request counts; application fetch and DSH request facts are recorded separately.

RC-3 remains `in progress` because the implementation is uncommitted and the exact reviewed revision lacks successful Windows and supported-CI evidence. The actual record validates under the frozen historical V13 contract, but the final-review defects prevent its promotion as a trusted RC-3 route-conformance fact. No oracle evaluation, human review, scoring, factuality, safety, quality, prompt parity, feature parity, advancement, comparative performance, application quality, or hiring outcome is established. Hashes prove byte identity only. RC-4 is next and has not started.
