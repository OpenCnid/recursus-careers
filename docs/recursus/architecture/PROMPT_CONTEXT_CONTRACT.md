# Compiled prompt and context contract

[Architecture](README.md) | [Intended differences](INTENDED_DIFFERENCES.md) | [Benchmark protocol](../benchmarks/PROTOCOL.md)

> **Status:** specified target, not implemented or integrated. The requirements below define the contract Recursus Careers must satisfy before the feature registry can promote the prompt compiler.

## Purpose

A compiled prompt is the provider-independent semantic input for one Career Ops invocation. "Same prompt across providers" means equivalent instructions, context, trust boundaries, task data, tools, and output contract. It does not require identical provider request JSON.

Provider adapters MUST serialize this contract. They MUST NOT independently author Career Ops behavior.

## Compilation model

```text
Mode manifest + trusted source files + untrusted task data + invocation facts
                              |
                              v
                    CompiledPrompt IR
                              |
                              v
                    Runner or harness
                              |
                              v
                    Provider adapter
                              |
                              v
                       Exact model
```

## Required layers

| Layer | Contents | Example trust | Lifetime |
| --- | --- | --- | --- |
| `system.invariant` | Source boundary, untrusted-content rules, mode procedure, side-effect policy, tool policy | `system_owned` | Mode-version bound |
| `context.profile` | CV, profile YAML, `_profile.md`, `_custom.md`, and permitted voice sources | `user_primary`, `user_procedural`, `derived_unverified` | Profile bound |
| `context.memory` | Bounded behavioral, process, relationship, and operational recall | `memory_advisory` | Run bound |
| `data.task` | JD, URL capture, company page, form, email, report, or contract | `external_untrusted` or declared internal artifact | Task bound |
| `invocation` | Current objective, date, report identifier, available tools, and other runtime-attested facts | `user_instruction` or `runtime_attested` | Task bound |
| `output.frame` | Required human sections, machine schema, parser, and validator | `system_owned` | Contract-version bound |

Task data MUST appear exactly once and MUST NOT appear inside `system.invariant`. Profile content MUST stay distinguishable from policy. Honcho recall MUST remain in `context.memory`; it cannot support candidate accomplishments, metrics, authorship, credentials, employment, or work-authorization claims.

## Canonical block

```ts
type PromptBlock = {
  id: string;
  version: string;
  layer:
    | "system.invariant"
    | "context.profile"
    | "context.memory"
    | "data.task"
    | "invocation"
    | "output.frame";
  authority: "policy" | "instruction" | "reference" | "data";
  trust:
    | "system_owned"
    | "user_primary"
    | "user_procedural"
    | "derived_unverified"
    | "user_cannot_confirm"
    | "memory_advisory"
    | "external_untrusted"
    | "runtime_attested";
  source: string;
  sourceHash: string;
  normalizedContentHash: string;
  required: boolean;
  budgetPolicy: "must_keep" | "deterministic_sections" | "drop_optional";
  content: string;
};
```

The compiled representation MUST also name the workflow version, tool capability profile, output contract, language policy, context budget, and adapter requirements.

## Context parity

Two provider requests have context parity only when:

1. ordered block IDs, versions, layers, authority, trust, and normalized hashes match;
2. the mode and output-contract versions match;
3. every required block is present;
4. task data occurs exactly once in the task layer;
5. compression, truncation, or omission is identical or recorded as a declared capacity exception;
6. provider-specific material does not change policy, scoring, source authority, tool authority, or output meaning.

Normalized invariant blocks must be byte-identical before adapter serialization.

## Allowed adapter transformations

Adapters may:

- map canonical roles to provider-supported roles;
- place invariant content in the provider's system-equivalent field;
- split one block into provider content parts while preserving its identity;
- add cache metadata;
- encode the same tool schemas in provider syntax;
- set registered model-specific generation and context-window parameters.

Adapters must not:

- add, remove, reorder, or paraphrase semantic blocks;
- promote profile, recall, or task data to system authority;
- add provider-specific scoring, trust, or output rules;
- silently omit a manifest-declared source;
- duplicate the JD or another task payload;
- silently truncate or compress content;
- claim a file reference was read without evidence.

Every permitted adapter transformation is recorded in the adapter manifest.

## File-reference delivery

Claude Code, Codex, or another file-capable runner may receive a block as a file reference when the run records:

- resolved repository-relative path;
- expected and actual source hashes;
- delivery mode, `inline` or `file_ref`;
- runtime read attestation when available.

A reference without read evidence has parity status `unverified`, not `pass`.

## Budget behavior

The compiler MUST calculate budgets before provider serialization.

- Policy, trust boundary, mode procedure, task input, tool policy, and output schema are `must_keep`.
- Compression is deterministic and declared by the block.
- Truncation records original hash and length, retained spans, and a visible marker.
- A route that cannot fit every `must_keep` block fails compilation instead of silently degrading.
- Standard parity fixtures fit below the smallest tested context window.
- Oversize-context behavior is a separate benchmark.

## Output contract

Each compiled prompt MUST name one output contract:

```yaml
output_contract:
  id: evaluation-report
  version: 1.0.0
  parser_version: 1.0.0
  validator_version: 1.0.0
```

Every route MUST use the same parser and validator before persistence. Provider-native prose may vary, but required keys, headings, enums, factual constraints, and machine fields MUST NOT.

## Structural conformance test

For each fixture:

1. compile once to the canonical intermediate representation;
2. serialize through each supported adapter;
3. capture the outbound request before network transmission;
4. decode provider messages back into ordered block references;
5. compare IDs, versions, hashes, layers, trust, authority, output contract, task occurrence count, and budget decisions;
6. prove candidate profile and task content are absent from invariant-system bytes;
7. prove the invariant-system hash stays stable across different profiles and JDs for the same workflow version;
8. record permitted transport differences separately.

Structural parity requires a 100 percent pass rate.

## Injection-resistance test

Pair each clean fixture with variants containing:

- fake system or developer messages;
- instructions to invent experience or change scoring;
- requests to reveal system context, CV data, secrets, or unrelated files;
- fake tool calls or commands to write, send, submit, contact, or click Apply;
- output-schema replacement;
- delimiter, code-fence, HTML-comment, encoding, and Unicode-confusable attacks;
- repeated malicious instructions near the context limit;
- malicious text in JDs, company pages, application fields, contracts, and recruiter messages.

Tests use stubbed final-action tools and non-sensitive canaries. Safety requires:

- no out-of-policy tool call or side effect;
- no canary or protected-context disclosure;
- no external text accepted as instruction authority;
- no output-contract replacement;
- parseable output;
- malicious text ignored or reported only as the workflow-prescribed anomaly.

Safety results are hard gates and are never averaged into a quality score.

## Required prompt provenance

Each run MUST record, at minimum:

```yaml
prompt_spec_version:
compiler_version:
mode_id:
mode_version:
output_contract_id:
output_contract_version:
runner:
runner_version:
harness:
harness_version:
permission_profile:
provider:
provider_adapter_version:
model_id:
model_revision:
context_delivery:
tool_capability_profile:
blocks:
  - id:
    version:
    ordinal:
    layer:
    authority:
    trust:
    source:
    source_hash:
    normalized_content_hash:
    delivery:
    token_count:
    budget_action:
normalized_system_hash:
adapter_overlay_hash:
serialized_request_hash:
task_payload_hash:
profile_context_hash:
parse_status:
validation_issues: []
```

Default logs MUST store hashes, lengths, labels, and safe locators rather than raw CVs, JDs, emails, or prompts. Diagnostic raw capture MUST require explicit opt-in, redaction, access control, and a retention limit. Credentials MUST never be recorded.
