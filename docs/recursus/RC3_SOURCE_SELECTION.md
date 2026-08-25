# RC-3 source selection

Status: selected, locally materialized, and exercised by the V16 route on 2026-08-25. Exact reviewed-revision CI evidence remains pending.

This decision pins the current `main` revision of the Recursus assembly and inherits the immutable component revisions recorded by that assembly. The pin is immutable even if an upstream default branch moves later.

## Assembly anchor

| Field | Selection |
| --- | --- |
| Repository | `https://github.com/OpenCnid/recursus` |
| Revision | `4444405e8b34124b1518fa2a66d0223e202234e4` |
| Repository version | `0.0.0-foundation` |
| Selection basis | Current `main` head observed on 2026-08-24; no tag or release exists |
| Component lock | `manifests/components.json`, `manifests/assembly.json`, and `manifests/profile-lock.yaml` at the pinned revision |
| Assembly package entrypoint | `@opencnid/recursus-assembly` export `.` to `lib/index.js` |
| Profile lifecycle entrypoint | `scripts/manage-profile.mjs` |
| Fixed upstream smoke entrypoint | `scripts/run-assembled-smoke.mjs`; this is not the RC-3 benchmark route |

Recursus owns the assembly, immutable component locks, package acquisition, profile lifecycle, and assembled smoke. It does not vendor the DSH, direct adapter, or Honcho source into its Git tree. Those implementations remain in their owning repositories and retain separate identities.

Operationally, this is one Recursus source decision. The pinned assembly acquires and combines DSH, the `openai-codex` OAuth adapter, Honcho, and its other locked components into a distribution and profile. RC-3 does not select moving DSH or adapter heads separately. Their immutable repository revisions and entrypoints below are inherited from the selected Recursus component lock so that component identity remains auditable.

## DSH runtime selection

The DSH selection is inherited from the pinned Recursus component lock. Its source repository is separate, while its built packages live inside the assembled Recursus distribution and installed profile.

| Field | Selection |
| --- | --- |
| Repository | `https://github.com/OpenCnid/deepseek-harness` |
| Revision | `e52c224fe00954fb7e8cda19eb2411dceef15989` |
| Version | `dsh-v0.1.0-rc.7` |
| Launcher package | `@deepseek-ai/dsh` |
| Launcher entrypoint | `dsh` to `apps/cli/lib/bin.js` |
| Profile boot entrypoint | `apps/cli/src/profile-boot.ts`, export `runProfile(options)` |
| One-shot package | `@deepseek-ai/dsh-headless` |
| One-shot runtime entrypoint | `packages/bundle/headless/lib/index.js`, plugin export `apply(ctx, config)` |
| One-shot startup entrypoint | `packages/bundle/headless/lib/startup.js` |
| Bundle patch | `packages/bundle/headless/cordis.patch.yml` |

The DSH launcher is the local Recursus runtime front door, not provider transport. The selected provider transport remains the direct adapter below. The stock headless route exposes final assistant text, diagnostics, and an exit code. Those observations are not sufficient by themselves for the RC-3 normalized result or runner attestation.

## Direct provider adapter selection

The adapter selection is inherited from the pinned Recursus component lock. Its OAuth and direct-provider implementation is installed as a Recursus profile component, while its source repository and revision retain a separate identity.

| Field | Selection |
| --- | --- |
| Route identity | `deepseek-openai-codex` |
| Provider identity | `openai-codex` |
| Repository | `https://github.com/OpenCnid/deepseek-openai-codex` |
| Revision | `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9` |
| Version | `0.1.0` |
| Package | `deepseek-openai-codex` |
| Package entrypoint | export `.` to `lib/index.js` |
| Cordis plugin entrypoint | `src/index.ts`, export `apply(ctx, entry)` |
| Adapter entrypoint | `src/adapter.ts`, class `OpenAICodexAdapter` |
| Registration patch | `cordis.patch.yml` |
| Credential reference | `OPENAI_CODEX_OAUTH` |
| Direct transport dependency | `@earendil-works/pi-ai@0.84.2` |
| Transport | Direct OpenAI Codex Responses SSE path |

The adapter registers `openai-codex` through DSH `ctx.llm`, resolves authorization through DSH `ctx.credentials`, and invokes Pi's direct provider path. The Codex CLI and Codex App Server are not part of this transport. RC-3 must pass only the opaque credential reference to the configured runtime and must never read, copy, persist, hash, or log credential values.

Route identity, provider identity, exact model identity, runner identity, and harness identity remain distinct. The exact model and reasoning selection belong in the preregistered RC-3 route record, not in this source decision.

## Model selection

The operator selected the following exact RC-3 model configuration on 2026-08-24:

| Field | Selection |
| --- | --- |
| Configured model ID | `gpt-5.6-sol` |
| Configured reasoning setting | `xhigh` |
| Snapshot | `gpt-5.6-sol` |
| Snapshot representation | `configured_catalog_model_id` |
| Provider-reported identity | Record separately when available; otherwise retain `not_reported` |

The configured model, adapter-resolved model, and provider-reported model must remain separate evidence fields. Before any provider request, the bridge must resolve the exact configured ID through the adapter and require advertised `xhigh` support. Missing support is `unsupported`; the bridge must not downgrade reasoning. The pinned adapter does not expose a provider response snapshot through its DSH stream mapping, so provider-reported identity remains `not_reported` unless a later trusted surface supplies it. None of these fields establishes output quality or semantic completion.

## Dependency and acquisition decision

RC-3 adds no Recursus, DSH, adapter, Pi, schema, or package-manager dependency to the `recursus-careers` root package. The selected Recursus repository is acquired into a separate local checkout at its exact immutable revision. Its own frozen lockfile and `pnpm@11.19.0` build and profile lifecycle remain authoritative. Component source stays in its owning repository, and the adapter is not vendored or redistributed.

RC-3 adds no root dependency or root package alias. The accepted RC-2 source snapshot binds the exact root `package.json` bytes, so RC-3 keeps its active V16 preparation, preflight, capture, and validation commands as explicit versioned entrypoints shipped through `SYSTEM_PATHS`. V1 through V15 contract records remain in the repository. V1 had no materialized executable source closure to archive. The existing V2 through V15 executable entrypoints, libraries, and freeze scripts plus V4 through V15 focused tests were placed in an operator-verified local archive and pruned from the current checkout. No updater tombstones claim ownership over unpublished development paths. Accepted RC-2 registration and evidence bytes are unchanged and are not reinterpreted.

The actual route may use only an exact-pin Recursus profile that passes local profile verification. Offline preparation, dry-run, and validation remain compatible with the Career Ops root Node requirement and must not import runtime packages. Only the explicit actual-capture entrypoint may load the verified external profile.

## Other assembled components

The pinned Recursus assembly also selects Honcho at `OpenCnid/deepseek-honcho@83627329867a562959cf992d0ce56d78a273971a`, RLM, and Dovetail. They are outside the minimal RC-3 route and must remain disabled or unmounted. Their presence in the assembly lock is not a feature claim.

## Whole-worker authority decision

The selected Recursus and DSH revisions do not themselves provide the whole-worker authority boundary required by RC-3. V16 therefore registers a separate runner authority layer without changing the selected component revisions. The exact profile and worker scripts are embedded in a content-addressed Linux image. The worker runs as `65532:65532` with a read-only image root, all Linux capabilities dropped, no new privileges, a PID limit, a read-only fresh seed, isolated input and output mounts, and only the dedicated credential directory writable.

The worker has no network routes. A separate relay and host-owned CONNECT proxy admit only the registered `auth.openai.com:443` and `chatgpt.com:443` authorities with bounded sequential tunnel counts and aggregate bytes. TLS remains end to end, so wire-level HTTP request counting is explicitly unsupported. Browser, plugins, telemetry, automatic updates, unrelated applications, RLM, Honcho, and Dovetail are not composed. The actual command reconciles image identity, mounts, proxy events, relay events, cleanup, worker observations, artifacts, and workspace scans before it can attest completion.

## Local assembly and execution gate

The host now uses Node `24.19.0` for RC-3 and exact `pnpm@11.19.0` through Corepack. The selected Recursus revision assembled all 244 locked packages. The initial assembly command emitted distribution-manifest SHA-256 `2f2b3f122801038f5e32ff9f3d6f9f7bab971c1059cee2c26dbd331c1be31ccd`. The frozen installed package profile inherited by V16 separately binds distribution-manifest SHA-256 `7dc4a35510947b34a60fed168810bdb2d54ef842a271127f3e9b9753c17e8fb1`; the source snapshot does not treat the initial assembly output as the frozen installed materialization. Local format, lint, type, and test checks passed with 35 tests passed and 2 integration tests skipped. Recursus verification still rejects stale upstream acceptance evidence.

The first local profile installation exposed an exact Harness archive-integrity mismatch. The selected V16 materialization does not rewrite the immutable component revisions and does not claim reproducible package ordering. Its source snapshot records the exact profile lock, inventory, assembly manifest, distribution manifest, parent image, nine-file runner context, and worker image digests. The registration honestly lists reproducible package build as unsupported.

After the account holder completed the official OAuth flow, a credential-safe preflight confirmed that the dedicated DSH credential service could resolve the opaque `OPENAI_CODEX_OAUTH` reference. The V16 preflight invoked neither provider nor adapter and did not expose a credential value to host or runner code. The later explicit V16 actual capture used the runtime-managed reference successfully. The configured runtime necessarily read and used the grant, but no credential value was copied into, hashed for, persisted in, or logged in evidence.

The selected Recursus revision is an unreleased, in-progress source snapshot. Its exact-head GitHub Actions run `32611231461` is not successful: Ubuntu verification rejected stale acceptance evidence that still named the previous DSH revision, and the Windows job was cancelled. Local build and component tests show that the selected sources can assemble, but they do not replace the required exact-revision CI. The independently validated V16 route evidence is a separate local execution fact.

The exact Recursus checkout contains generated drift after local assembly: `manifests/package-integrity.json` is modified and `evaluations/milestone-1-rc3-package-report.json` is untracked. The V16 route does not load that mutable checkout. It binds and verifies the frozen image materialization instead. Those checkout files were not removed or rewritten during RC-3 work.

V1 through V15 are preserved historical contract records, not runnable implementations in the current checkout. V10 was rejected by final red-team review for false-attestation, chronology, and cleanup-validation defects. V11 stopped before reservation, DSH, adapter, or provider invocation when its complete-input scan rejected registered container paths. V12 produced a completed actual record but was rejected after red-team review found a private-path scanner bypass and stale validation identity. V13 and V14 were rejected after later reviews found attestation, staging, runtime-enforcement, completion-gating, and transformed-content defects. V15 produced locally valid evidence but was rejected after final review found missing trusted-input completion predicates and post-persistence artifact-budget enforcement. V16 is the active route registration. Two independent V16 dry checks match exactly, and its official external evidence contains one completed dry run plus one completed fresh-seed actual attempt. RC-3 remains `in progress` until the exact reviewed repository revision has the required Windows and supported-CI evidence. The selected upstream Recursus exact-head CI run remains unsuccessful and is not relabeled as passing. No factuality, safety, quality, parity, advancement, comparative performance, application quality, or hiring outcome follows from this source selection or execution-route record.
