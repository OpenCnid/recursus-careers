# RC-3 minimal Recursus execution bridge v8

Status: preserved historical registration. Its external evidence contains one completed dry run and one actual attempt with terminal `failed/process_error`. Authority, route identity, direct-adapter invocation, DSH request, input matching, artifact capture, and trusted terminal observations passed. The worker classified the otherwise successful runtime result as `runtime_event_shape` because V8 omitted the normal DSH `request/context` event. The record validates but is not promoted or retried.

The registration keeps Recursus, DSH, direct adapter, provider, model, runner, harness, product, workflow, and contract identities separate. It fixes Recursus `4444405e8b34124b1518fa2a66d0223e202234e4`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`, provider `openai-codex`, model `gpt-5.6-sol`, snapshot representation `configured_catalog_model_id`, reasoning `xhigh`, and opaque credential reference `OPENAI_CODEX_OAUTH`. The Codex CLI and Claude Code CLI are not transport.

The dry-run and validation commands are offline and child-process free:

```text
node prepare-recursus-route-v8.mjs dry-run-check --run-root <new-external-directory>
node prepare-recursus-route-v8.mjs dry-run --run-root <new-external-directory> --evidence-dir <external-evidence-directory>
node verify-recursus-route-v8.mjs validate --evidence-dir <external-evidence-directory>
node verify-recursus-route-v8.mjs validate --evidence-dir <external-evidence-directory> --require-actual
```

The explicit actual entrypoint is:

```text
node capture-recursus-route-v8.mjs actual <all-explicit-registered-runtime-options>
```

V8 is historical execution and terminal-state evidence only. It establishes no oracle result, factuality, safety, quality, prompt parity, feature parity, advancement, comparison, application quality, or hiring outcome.
