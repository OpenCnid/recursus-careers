# RC-3 minimal Recursus execution bridge v4

Status: preserved historical and superseded. Registration `RC3-REC-DIRECT-2026-08-24-V4` and route `recursus-direct-v4` cover one accepted `FACT-01` seed and the provider-free local bridge pipeline. The deterministic dry-run timestamp equals the preregistered timestamp. Two independent V4 dry-run checks produced identical deterministic hashes. One official external V4 dry-run record validates as `completed` with zero actual attempts. V4 is not the active RC-3 route.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node prepare-recursus-route-v4.mjs dry-run-check --run-root <new-external-directory>
node prepare-recursus-route-v4.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node verify-recursus-route-v4.mjs validate --evidence-dir <external-evidence-directory>
node verify-recursus-route-v4.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node capture-recursus-route-v4.mjs actual <all-explicit-registered-runtime-options>
```

V4 encodes capability applicability separately for dry and actual attempts. Whole-worker authority enforcement is not required for the provider-free dry pipeline. It is required for actual capture and is `unsupported` at the selected pins. Both the capture entrypoint and the directly imported worker fail closed with `RUNTIME_AUTHORITY_UNSUPPORTED`. The explicit capture command was exercised against validated dry-only evidence and returned that code before profile loading, credential access, seed creation, reservation, or provider access.

The pinned Recursus and DSH surfaces can expose zero model-facing tools and omit browser, plugin, telemetry, updater, RLM, Honcho, and Dovetail composition. They cannot confine the whole Node worker's filesystem reads or enforce adapter-only network egress. Configuration is not relabeled as OS-level enforcement.

Other independent blockers remain: the Recursus checkout has generated source drift, the pinned profile lock rejects the assembled Harness integrity, safe DSH metadata reports the OAuth reference as `configured: false` and `writable: true`, and exact-head upstream CI lacks successful Windows and supported-CI checks. No credential value was inspected.

Provider-free evidence establishes only local bridge construction, capture, normalization, manifest creation, and independent validation for a synthetic stand-in artifact. It does not establish Recursus execution, provider behavior, oracle results, factuality, safety, quality, prompt parity, feature parity, advancement, comparative performance, application quality, or hiring outcomes.
