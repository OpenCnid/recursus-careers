# RC-3 minimal Recursus execution bridge v10

Status: preserved historical rejection. Registration `RC3-REC-DIRECT-2026-08-24-V10` and route `recursus-direct-v10` produced structurally valid dry and actual records, but final red-team review rejected V10 as an acceptance basis. Public helpers could mint completed actual attestation offline, timestamp chronology failed open, and Docker cleanup errors could be mistaken for successful absence. V12 supersedes V10. The frozen V10 bytes remain unchanged.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node prepare-recursus-route-v10.mjs dry-run-check --run-root <new-external-directory>
node prepare-recursus-route-v10.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node verify-recursus-route-v10.mjs validate --evidence-dir <external-evidence-directory>
node verify-recursus-route-v10.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node capture-recursus-route-v10.mjs actual <all-explicit-registered-runtime-options>
```

V10 encodes capability applicability separately for dry and actual attempts. Whole-worker authority enforcement is not required for the provider-free dry pipeline. The actual path uses a content-addressed read-only image, all Linux capabilities dropped, no new privileges, a read-only fresh seed, a dedicated runtime-managed credential mount, isolated input and output mounts, a networkless worker namespace, and a host-owned CONNECT allowlist for the registered adapter authorities. The explicit capture command is the only public path that imports the actual-capture module.

The frozen V10 record contains internally consistent execution fields, but its provenance and cleanup observations are insufficient for RC-3 acceptance. The configured runtime read and used the OAuth grant. Host and runner code did not inspect credential values, and no credential value was copied into, hashed for, persisted in, or logged in evidence.

The minimal route records compiled prompt parity, full Career Ops feature parity, durable execution and recovery, ablations, human evaluation and scoring, RLM and Honcho enhancements, and wire-level request-count attestation as unsupported. End-to-end TLS prevents the host from claiming wire-level HTTP request counts; application fetch and DSH request facts are recorded separately.

V10 establishes no accepted actual execution-route conformance fact. No oracle evaluation, human review, scoring, factuality, safety, quality, prompt parity, feature parity, advancement, comparative performance, application quality, or hiring outcome is established. Hashes prove byte identity only.
