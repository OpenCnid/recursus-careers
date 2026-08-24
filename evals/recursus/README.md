# Recursus Benchmark Foundation v1

Status: accepted for roadmap milestone RC-1 through PR #1 after the exact implementation head passed the required Windows and supported-CI checks.

This foundation validates corpus structure and fixture integrity only. It is not a model benchmark result.

## Commands

```text
node verify-recursus-benchmark.mjs validate
node verify-recursus-benchmark.mjs validate --json
node verify-recursus-benchmark.mjs seed --scenario FACT-01 --output <explicit-empty-directory>
node verify-recursus-benchmark.mjs validate-result --input <normalized-result.json>
node verify-recursus-reference-v4.mjs validate
```

The implementation is dependency-free, offline, and local. `validate`, `validate-result`, and `--help` are read-only. `seed` is the only writing operation, and it writes only below the explicit output directory after validating the complete copy plan.

## Layout

```text
evals/recursus/
  schemas/                 strict JSON Schema Draft 2020-12 contracts
  career-bench-v1/
    catalog.json           corpus entry point and exact-byte inventory
    candidates/            fictional candidate source material
    jobs/                  fictional job source material
    scenarios/             evaluator-only scenario controls
    oracle/                evaluator-only source, truth, and action data
    evaluator-fixtures/    route-neutral normalized-result examples
  rc2-claude-code-reference-v4/
    schemas/               strict RC-2 capture evidence contracts
    registration.json      preregistered route and twelve-cell run set
    source-snapshot.json   exact instruction, corpus, and harness identities
    evidence/              immutable dry-run and actual attempt ledger
  rc2-claude-code-reference-v3/
    evidence/              sealed historical provider-free dry run
  rc2-claude-code-reference-v2/
    evidence/              sealed historical provider-free dry run
  rc2-claude-code-reference-v1/
    evidence/              sealed historical dry run and authentication-blocked attempt
  historical-source/
    rc2-claude-code-reference-v3/package.json
                            exact V3 package bytes for isolated historical validation
```

The four seed cases are `FACT-01`, `FACT-03`, `SAFE-01`, and `NOSUB-01`. All names, organizations, facts, and URLs are fictional. URLs use reserved `.test` domains.

## Integrity and serialization

File hashes are SHA-256 over exact committed bytes. They prove byte identity only. They do not prove truth, authorship, freshness, execution, safety, or quality.

Corpus text uses UTF-8 without a byte-order mark and committed LF bytes. Versioned corpus JSON uses `recursus-canonical-json-v1`: object keys are sorted recursively by code point, array order is preserved, UTF-8 is used, insignificant whitespace is omitted, and exactly one LF follows the serialized value.

The catalog does not hash itself. Every other corpus file is cataloged with a byte count, digest, kind, and either `agent_visible` or `evaluator_only` visibility.

## Oracle isolation

Scenario manifests, oracle documents, and evaluator fixtures are evaluator-only. Each contains a unique synthetic leak canary. Seeding copies only scenario mounts that resolve to cataloged `agent_visible` source files.

After copying, the verifier scans the complete seeded tree and the emitted inventory for evaluator-only paths, complete bytes, canaries, oracle-local identifiers, and digests. Shared control identifiers such as `scenario_id` and `source_id` are cross-references, not oracle-local identifiers. The seed inventory is emitted by the command and is not written into the workspace.

## Required non-claims

- The foundation validates structure and fixture integrity only.
- No model or harness was executed.
- Oracle isolation was proven for the seeded file set, not for a future process with broader filesystem authority.
- No candidate-claim factuality or action safety was evaluated.
- No comparison with Career Ops through Claude Code or Codex was performed.
- No result supports a claim that Recursus Careers is better, safer, faster, cheaper, or feature complete.

RC-2 v4 reuses these exact bytes and the same seeding implementation. Its current evidence contains one validated provider-free dry run and twelve validated actual attempts in the preregistered order. Under preregistered deviations `RC2-DEV-CONTENT-ONLY` and `RC2-DEV-HOST-PREFLIGHT`, all twelve actual attempts have terminal status `completed` and termination reason `none`. Provider identity is `not_reported`; model `claude-sonnet-5` was explicitly reported by the trusted runner envelope. The V4 evidence-root README is itself bound by the preregistered source snapshot, so its embedded pre-attempt status remains unchanged; the append-only ledger and current roadmap record the later attempt state. V1 through v3 remain sealed historical evidence. V3 was superseded to correct its implementation-repository identity. To reconstruct V3 validation, copy the repository into an isolated temporary directory, replace only that temporary copy's root `package.json` with `evals/recursus/historical-source/rc2-claude-code-reference-v3/package.json`, and run the V3 validator against the copied V3 evidence. The separate RC-2 validator does not weaken RC-1 or reinterpret structural validation as model, workflow, factuality, safety, quality, parity, advancement, or comparative evidence.
