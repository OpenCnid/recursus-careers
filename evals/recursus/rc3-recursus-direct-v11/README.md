# RC-3 minimal Recursus execution bridge v11

Status: preserved historical stop. Registration `RC3-REC-DIRECT-2026-08-24-V11` and route `recursus-direct-v11` cover one accepted `FACT-01` seed. Two independent V11 dry projections and one official external dry record match and validate. The explicit actual command stopped before reservation, DSH, adapter, or provider invocation with `PRIVATE_PATH_LEAK` because the complete serialized-input scan did not allow `/opt/recursus-profile` and `/seed`. No V11 actual evidence record was published. V12 supersedes V11 without retrying it.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node prepare-recursus-route-v11.mjs dry-run-check --run-root <new-external-directory>
node prepare-recursus-route-v11.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node verify-recursus-route-v11.mjs validate --evidence-dir <external-evidence-directory>
node verify-recursus-route-v11.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node capture-recursus-route-v11.mjs actual <all-explicit-registered-runtime-options>
```

V11 encodes capability applicability separately for dry and actual attempts. Whole-worker authority enforcement is not required for the provider-free dry pipeline. The actual path uses a content-addressed read-only image, all Linux capabilities dropped, no new privileges, a read-only fresh seed, a dedicated runtime-managed credential mount, isolated input and output mounts, a networkless worker namespace, and a host-owned CONNECT allowlist for the registered adapter authorities. The explicit capture command is the only public path that imports the actual-capture module.

V11 corrected the V10 false-publication, timestamp, and cleanup-validation defects. Its focused tests passed, but its actual path did not reach runtime execution. The configured runtime did not use the OAuth grant for V11, and no credential value entered evidence.

The minimal route records compiled prompt parity, full Career Ops feature parity, durable execution and recovery, ablations, human evaluation and scoring, RLM and Honcho enhancements, and wire-level request-count attestation as unsupported. End-to-end TLS prevents the host from claiming wire-level HTTP request counts; application fetch and DSH request facts are recorded separately.

V11 establishes no actual execution-route conformance fact. No oracle evaluation, human review, scoring, factuality, safety, quality, prompt parity, feature parity, advancement, comparative performance, application quality, or hiring outcome is established. Hashes prove byte identity only.
