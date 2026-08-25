# RC-4 compiled prompt and context parity specification

Status: implementation in progress; acceptance requires the exact reviewed PR head to pass every required check

Roadmap milestone: [RC-4](ROADMAP.md#rc-4-compiled-prompt-and-context-parity)

Last reviewed: 2026-08-25

## 1. Purpose

Implement the smallest provider-free prompt and context compiler that can preserve the Career Ops workflow contract across the accepted Claude Code reference route and the accepted minimal Recursus direct route.

RC-4 turns selected Career Ops instructions, trusted synthetic candidate sources, untrusted task data, invocation facts, tool policy, and output requirements into one versioned canonical intermediate representation. Route adapters then produce inspectable delivery bundles from that representation without invoking a runner, harness, provider, model, browser, plugin, or live service.

The milestone establishes structural parity at the compiler and route-delivery boundary. It does not establish model behavior, provider request parity inside a closed runner, prompt-injection resistance in execution, feature parity, factuality, safety, quality, or comparative performance.

## 2. Normative language

`MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative requirements. A requirement can be relaxed only by changing this specification and recording the reason before implementation evidence is frozen.

## 3. Accepted foundation and preservation boundary

RC-4 begins from accepted RC-1, RC-2, and RC-3 evidence:

- RC-1 Benchmark Foundation v1 is accepted through PR #1.
- RC-2 Claude Code reference capture v4 is accepted through PR #2.
- RC-3 minimal Recursus execution bridge V17 is accepted through PR #4.
- Exact reviewed RC-3 implementation commit `7fe377863dc8b6b5cc584fe5225fb8a6f837b695` passed the required Ubuntu, macOS, Windows, security, regression, visual, guard, and dependency checks.
- PR #4 merged as `04f5f490f3c745e2ab335c91ca2eb3abf31c19c0`.
- V17 pins Recursus `d6d25dda3951e46fe1b03ec3cecc3f348bfe2346`, DSH `e52c224fe00954fb7e8cda19eb2411dceef15989`, and direct adapter `5232102d0cc8bd55d5bf27b6eb203efbf6ada8a9`.

These accepted artifacts are immutable prerequisites, not RC-4 input that may be rewritten:

1. RC-1 corpus, schemas, manifests, and oracle bytes MUST remain unchanged.
2. RC-2 registrations, ledgers, captured evidence, and accepted interpretations MUST remain unchanged.
3. RC-3 V1 through V17 contracts, evidence, ledgers, source snapshots, and accepted interpretations MUST remain unchanged.
4. RC-3 V17 MUST NOT be rerun, promoted into product integration, or relabeled as prompt-parity evidence.
5. The existing Career Ops product workflow MUST remain behaviorally unchanged by RC-4.
6. Recursus Milestone 1 and current-pin Linux double-build, profile, smoke, and clean-machine acceptance evidence remain incomplete and MUST continue to be described that way.

Any local upstream Recursus checkout at revision `4444405e8b34124b1518fa2a66d0223e202234e4` may contain user-owned generated evidence. RC-4 MUST NOT alter, stage, commit, discard, reinterpret, or depend on such a dirty checkout.

## 4. Required outcome

At completion, a local reviewer can, without network access:

1. compile each registered pilot mode and synthetic invocation into a deterministic canonical `CompiledPrompt` document;
2. project the same canonical document into an inspectable Claude Code reference delivery bundle and Recursus direct delivery bundle;
3. decode both bundles back to canonical block references and prove all semantic fields match;
4. identify every permitted route-specific transformation and protocol deviation by a registered rule;
5. prove that task data appears exactly once and only with untrusted data authority;
6. prove that evaluator-only material, user-owned local profile data, credentials, and unrelated files never enter the source closure or compiled output;
7. fail closed on mixed, stale, duplicated, truncated, relabeled, reordered, or unregistered input; and
8. run focused positive and negative tests on Ubuntu, macOS, and Windows.

The successful verifier output MUST include this exact sentence:

> Structural prompt and context parity validated. No runner, provider, model, workflow behavior, factuality, safety, quality, feature-parity, or comparative claim was verified.

## 5. Bounded pilot

### 5.1 Pilot modes

RC-4 covers exactly these four Career Ops mode contracts:

| Mode | Contract surface represented |
| --- | --- |
| `oferta` | A-G offer evaluation, source boundary, scoring instructions, research and output structure |
| `pdf` | Candidate-source use, truthful tailoring rules, template selection, and document output contract |
| `cover` | Candidate-facing writing, JD treatment, bounded research instructions, and human confirmation gates |
| `email` | Candidate-facing writing, report or JD context, attachment guidance, and the draft-only no-send boundary |

The shared router MAY register `auto-pipeline` as an invocation alias for `oferta`, but it MUST NOT pretend that downstream PDF, tracker, browser, or mutation behavior ran. An alias is metadata, not a fifth mode contract.

All other Career Ops modes remain unsupported by RC-4. They MUST NOT be inferred, simulated, or counted toward RC-4 parity.

### 5.2 Compilation targets

RC-4 supports exactly two offline compilation targets:

1. `co-claude-code-reference-v1`: the runner-facing semantic delivery bundle for the accepted Claude Code reference lane.
2. `recursus-direct-v1`: the harness-facing semantic delivery bundle for the accepted Recursus direct lane before provider transport.

These are compiler-boundary targets. RC-4 does not claim visibility into a closed runner's final provider request and does not contact a provider. Any field that cannot be observed at this boundary MUST be recorded as `unverified` or a named deviation, never inferred as `pass`.

### 5.3 Synthetic invocation matrix

Every pilot mode MUST compile at least:

- one ordinary synthetic invocation using only RC-1 agent-visible fixture bytes or new explicitly synthetic non-oracle metadata;
- one untrusted-task variant containing instruction-shaped text;
- one context or budget boundary variant; and
- one missing-required-source or invalid-authority negative case.

`FACT-01`, `FACT-03`, `SAFE-01`, and `NOSUB-01` SHOULD be reused where their declared agent-visible sources fit the mode. Scenario manifests and oracle files are evaluator-only and MUST NOT become compiler inputs.

## 6. Scope

### 6.1 In scope

- A versioned, dependency-free prompt and context compiler.
- Closed JSON Schema Draft 2020-12 contracts for registrations, mode manifests, adapter manifests, compiled prompts, route delivery bundles, and validation results.
- Explicit source closure and exact SHA-256 byte identities.
- Ordered canonical prompt blocks with layer, authority, trust, provenance, budget policy, and required status.
- Deterministic normalization and canonical serialization.
- Explicit tool-capability, language, output-contract, and context-budget metadata.
- Two offline route adapters and their inverse structural decoders.
- Registered adapter transformation and deviation rules.
- Static source-boundary, task-occurrence, and evaluator-only exclusion checks.
- Focused positive, negative, denial, determinism, and cross-platform tests.
- Package, updater, ownership, documentation, and CI integration required by the new distributed files.

### 6.2 Out of scope

RC-4 MUST NOT:

- invoke Claude Code, Codex CLI, Recursus, DSH, a provider adapter transport, a provider SDK, a model, a browser, a plugin, telemetry, OAuth, or any live service;
- read, copy, hash, log, validate, or use credentials or provider environment variables;
- access HTTP, DNS, sockets, or unrelated network services;
- execute V17 or create another provider attempt;
- read user-owned ignored profile files or use real candidate, job, report, tracker, email, or application data;
- open evaluator-only oracle files as compilation sources;
- score a generated result or calculate factuality, safety, quality, CAQ, feature parity, advancement, superiority, or hiring outcomes;
- claim behavioral prompt-injection resistance from static classification and canary tests;
- perform a tool call, external mutation, application, submission, send, contact, or click;
- integrate Recursus into the user-facing Career Ops workflow;
- implement durable state, evidence-gated completion, RLM, Honcho, Dovetail, or automatic routing;
- silently compress, omit, reorder, duplicate, paraphrase, or promote semantic content; or
- install a dependency solely to make verification pass.

## 7. Required deliverables

The implementation SHOULD use this layout. A naming change requires an explicit reason in the implementation handoff.

The originally planned V1 package is preserved as a frozen rejected record after its freeze edit omitted the required provider-isolation field. The user explicitly authorized V2 on 2026-08-25. V2 is the active package below and MUST NOT rewrite any V1 byte.

```text
lib/recursus/prompt-context-v1.mjs
scripts/recursus/verify-prompt-context-v1.mjs
tests/recursus/prompt-context-v1.test.mjs

evals/recursus/rc4-prompt-context-v2/
  README.md
  registration.json
  source-snapshot.json
  schemas/
    registration.schema.json
    mode-manifest.schema.json
    adapter-manifest.schema.json
    compiled-prompt.schema.json
    route-bundle.schema.json
    validation-result.schema.json
  modes/
    oferta.json
    pdf.json
    cover.json
    email.json
  adapters/
    co-claude-code-reference-v1.json
    recursus-direct-v1.json
  fixtures/
    invocations.json
```

The implementation MUST also update:

- `package.json` with one RC-4 verification command, unless an accepted evidence snapshot hash-binds the current `package.json` bytes. When that preservation exception applies, `package.json` MUST remain byte-identical, the direct verifier entrypoint in section 13 is the required command surface, the exception MUST be recorded in the RC-4 package README and handoff, and the bound evidence validator MUST continue to pass;
- `update-system.mjs` so every new distributed root or library file is protected by updater drift checks;
- `evals/recursus/README.md` with the exact RC-4 evidence and non-claim boundary;
- `docs/recursus/ROADMAP.md` and `docs/recursus/features/REGISTRY.md` only when status and evidence genuinely change; and
- applicable ownership files when new nested paths require them.

Do not add a second verifier or schema copy when the registered module can safely serve both CLI and tests.

## 8. Source closure and mode manifests

Each mode manifest MUST declare:

- stable mode ID and semantic version;
- exact workflow and router versions;
- ordered system-owned instruction sources;
- conditional instruction sources and the condition that enables each one;
- permitted synthetic profile and task sources;
- tool capability profile;
- language policy;
- context-budget policy;
- output contract ID, version, parser version, and validator version;
- supported invocation shapes;
- required and optional blocks; and
- explicitly unsupported behavior.

Compilation MUST start from a registered allowlist. Recursive repository discovery, parent-directory lookup, shell expansion, environment-variable path lookup, and implicit user-file discovery are forbidden.

Every source entry MUST include:

- normalized repository-relative POSIX path or registered synthetic mount identity;
- expected byte count and SHA-256 digest;
- source class;
- authority and trust classification;
- visibility classification;
- normalization rule; and
- the block or blocks it is allowed to populate.

A source hash mismatch, undeclared source, missing required source, visibility mismatch, or classification mismatch MUST fail compilation before any route bundle is created.

## 9. Canonical `CompiledPrompt` contract

The canonical representation MUST contain:

- schema, compiler, registration, and source-snapshot versions;
- mode, workflow, router, and invocation IDs and versions;
- fixture identity and synthetic status;
- output contract and validator identities;
- language policy;
- tool capability profile;
- context capacity and budget decisions;
- ordered prompt blocks;
- source-closure digest;
- normalized invariant-system digest;
- task-payload digest;
- profile-context digest;
- deterministic compilation digest; and
- validation status and issues.

Each prompt block MUST contain the fields defined by the architectural [Compiled prompt and context contract](architecture/PROMPT_CONTEXT_CONTRACT.md), including:

- stable ID and version;
- ordinal;
- layer;
- authority;
- trust;
- source identity and source hash;
- normalized content hash;
- required status;
- budget policy and action;
- content or an explicitly registered file-reference delivery record; and
- exact content byte and character counts.

The supported layers are:

- `system.invariant`
- `context.profile`
- `context.memory`
- `data.task`
- `invocation`
- `output.frame`

RC-4 MUST NOT populate `context.memory`. It MUST be absent or an explicitly empty registered block. No memory content may support a candidate fact.

Task data MUST occur exactly once in `data.task`, with authority `data` and trust `external_untrusted`. Candidate profile content MUST remain distinguishable from policy and instructions. System invariant bytes MUST remain identical across profiles and task fixtures for the same mode and source snapshot.

## 10. Canonicalization and budgeting

- Exact file integrity uses SHA-256 over original bytes.
- Canonical JSON uses recursively sorted object keys, preserved array order, UTF-8, LF line endings, and one trailing newline.
- Text normalization MUST be versioned and MUST NOT paraphrase content.
- Unicode normalization, if used, MUST preserve the original source hash and record the normalization form.
- Token estimates MUST name the estimator and version. Estimated counts MUST NOT be reported as provider-observed usage.
- Every fixture MUST fit the smallest registered pilot capacity with all `must_keep` blocks present.
- A route that cannot fit all `must_keep` blocks MUST fail compilation.
- Deterministic compression MAY apply only to blocks registered for it and MUST record original and retained identities.
- Silent truncation or omission is forbidden.

## 11. Route bundles, adapters, and parity

Each adapter manifest MUST declare:

- adapter and target route identity;
- supported canonical contract version;
- role and content-part mapping;
- file-reference behavior;
- tool-schema mapping;
- capacity and parameter mapping;
- inverse decoder version;
- permitted transformation rule IDs; and
- known limitations and protocol deviations.

A route bundle MUST reference exactly one canonical compilation digest. It MUST record the ordered mapping from every canonical block to target fields or content parts.

Allowed transformations are limited to:

- mapping canonical roles to route-supported roles;
- splitting a block into ordered content parts while preserving identity;
- selecting registered inline or file-reference delivery;
- encoding the same tool schemas in target syntax;
- adding non-semantic cache metadata; and
- adding registered model or capacity parameters that do not change Career Ops semantics.

An adapter MUST NOT add, remove, reorder, duplicate, paraphrase, or silently truncate semantic blocks. It MUST NOT promote profile, task, recall, or generated content to system authority. It MUST NOT change source authority, scoring, tool authority, side-effect policy, language policy, or output meaning.

Structural parity passes only when both inverse decoders recover identical:

- ordered block IDs, versions, ordinals, layers, authority, and trust;
- normalized content hashes;
- required status and budget actions;
- mode and workflow versions;
- task occurrence count;
- output contract and language policy;
- tool capability profile; and
- compilation digest.

Provider request bytes hidden inside the Claude Code runner remain unobserved. RC-4 MUST report that limit and MUST NOT elevate compiler-boundary parity into provider-observed parity.

## 12. Isolation, privacy, and denial requirements

RC-4 compilation and validation MUST be offline, child-process free, and mutation free except for an explicit caller-owned empty output directory used by a CLI fixture command.

The implementation MUST prove that compiled sources and outputs exclude:

- every RC-1 evaluator-only path, identifier, digest, and leak canary;
- every RC-2 and RC-3 evidence root and raw artifact;
- `modes/_profile.md`, `modes/_custom.md`, `modes/_brief.md`, `voice-dna.md`, `cv.md`, `config/profile.yml`, reports, trackers, and other user-layer files unless a future version explicitly registers synthetic replacements;
- credentials, credential-shaped values, environment dumps, absolute private paths, and Git metadata; and
- sibling or parent repository content.

Negative tests MUST instrument and deny network, DNS, sockets, provider entrypoints, browsers, plugins, telemetry, child processes, environment-secret reads, and writes outside the explicit output root. A denial result is evidence that the forbidden call was attempted and blocked, not evidence of successful compilation.

## 13. Verifier command contract

Add a command with these behaviors:

```text
node scripts/recursus/verify-prompt-context-v1.mjs validate
node scripts/recursus/verify-prompt-context-v1.mjs compile --mode <mode> --fixture <fixture> --target <target> --output <empty-directory>
node scripts/recursus/verify-prompt-context-v1.mjs compare --mode <mode> --fixture <fixture>
node scripts/recursus/verify-prompt-context-v1.mjs --help
```

`validate` MUST validate the complete frozen registration, source snapshot, schemas, mode manifests, adapter manifests, fixture cross-references, hashes, visibility rules, and source closure.

`compile` MUST resolve and validate the complete read and write plan before writing, refuse a non-empty output directory, write only deterministic synthetic compiler artifacts, and clean up a newly created output directory after a partial failure when safe.

The writer MUST bind the planned physical output-root identity, revalidate that identity and resolved file containment around every create and write, reject deterministic root or ancestor replacement races, and clean up only a created file whose physical path and filesystem identity still match. Node.js provides no portable directory-handle-relative create primitive, so V1 does not claim atomic defense against a hostile external process mutating directory components in the interval between checks.

`compare` MUST compile once, project to both targets, decode both bundles, compare all parity fields, and emit the exact non-claim sentence from section 4 on success.

Supported command failures MUST return nonzero exit codes with stable, content-safe diagnostics. Diagnostics MUST identify logical fields and digest prefixes without printing raw prompt, candidate, JD, or evidence content.

## 14. Required tests

### 14.1 Positive tests

Tests MUST prove:

- all four registered modes compile deterministically;
- both targets decode to the same canonical semantics;
- two clean runs in separate temporary roots produce byte-identical artifacts;
- invariant-system hashes remain stable across candidate and task fixtures;
- task data occurs exactly once and only in `data.task`;
- candidate context stays out of system invariant bytes;
- every allowed transformation is named and reversible;
- output contracts, language policy, tools, and budgets survive both projections; and
- behavior and bytes are consistent on supported CI platforms.

### 14.2 Negative tests

Tests MUST reject at least:

- stale or wrong source hashes;
- a mixed source snapshot or registration version;
- a falsely relabeled profile, task, memory, or oracle block;
- evaluator-only paths, bytes, identifiers, digests, and canaries;
- task duplication, omission, reordering, or promotion to system authority;
- candidate profile content in invariant-system bytes;
- unregistered adapter transformations or protocol deviations;
- semantic paraphrase or changed output meaning;
- hidden block omission or silent truncation;
- a route bundle bound to the wrong compilation digest;
- a decoder that drops or invents a block;
- an unregistered mode, route, tool, output contract, or budget action;
- absolute, traversal, case-colliding, Unicode-confusable, symbolic-link, directory-junction, or realpath-escaping source paths;
- oversized strings, arrays, nesting, source files, or output bundles;
- malformed UTF-8, JSON, schema versions, or unknown fields;
- non-empty or overlapping output directories;
- user-layer, credential-shaped, private-path, or evidence-root leakage;
- network, provider, browser, telemetry, plugin, child-process, or unexpected mutation attempts; and
- diagnostics that expose raw protected content.

Tests MUST include focused regression cases proving mixed, stale, or falsely relabeled evidence fails. Validation MUST fail closed rather than downgrading these cases to warnings.

The V1 child-process-free portability boundary covers symbolic links and directory junctions exposed by Node.js filesystem APIs, plus any resolved-path escape. Other Windows reparse subclasses that Node.js reports as ordinary files or directories are outside this V1 claim and remain unsupported and unverified.

## 15. Freeze and review protocol

RC-4 is provider-free. No provider capture is authorized or required for this milestone.

The implementation package remains mutable until:

1. all static, denial, negative, threat, and portability tests pass;
2. two offline dry runs match exactly;
3. an independent red-team review finds no unresolved acceptance defect; and
4. the primary agent reconciles every valid review finding.

Only then may the RC-4 registration, source snapshot, schemas, manifests, and fixture set be frozen once. A defect found after freezing MUST NOT be repaired by rewriting frozen bytes. It requires a new version and explicit approval before a second frozen RC-4 package is created.

## 16. Verification requirements

Before handoff, run at least:

```text
node verify-recursus-benchmark.mjs validate
node verify-recursus-reference-v4.mjs validate --require-complete-set
node scripts/recursus/verify-recursus-route-v17.mjs validate --evidence-dir <existing-approved-v17-evidence-root> --require-actual
node scripts/recursus/verify-prompt-context-v1.mjs validate
node scripts/recursus/verify-prompt-context-v1.mjs compare --mode oferta --fixture <registered-fixture>
node test-all.mjs --only recursus/
node scripts/check-syntax.mjs
node test-all.mjs
git diff --check
```

The V17 validation is read-only and uses the existing approved external evidence root. It MUST NOT invoke the V17 capture command or create new evidence. If that root is unavailable in CI, run the repository-contained structural V17 tests and report the external validation as an exact local-only prerequisite.

Do not install missing packages solely to make a blocked check green. Report the exact missing prerequisite and run every unaffected check.

## 17. Acceptance criteria

RC-4 may move from `next` to `in progress` when implementation begins on an intentional branch.

RC-4 may move to `accepted` only when all of the following are true:

1. every required deliverable exists and validates;
2. all four pilot modes compile through both offline targets;
3. structural parity is 100 percent for every registered fixture;
4. every permitted difference is explained by a named adapter rule;
5. no hidden candidate fact, user-layer byte, credential material, or evaluator-only content enters a compilation or route bundle;
6. every required positive, negative, denial, determinism, and portability test passes;
7. two pre-freeze offline dry runs match exactly;
8. one independent final red-team review has no unresolved acceptance finding;
9. accepted RC-1, RC-2, and RC-3 bytes and interpretations remain unchanged;
10. the exact reviewed RC-4 commit passes Ubuntu, macOS, Windows, and all repository-required checks; and
11. the roadmap, overview, evaluation README, and feature registry state the exact evidence and limitations without claiming product integration or behavioral provider neutrality.

Local success on an uncommitted tree is not acceptance. A pull request, partial matrix, cancelled platform, or different commit's CI does not satisfy exact-commit evidence.

## 18. Required non-claims

RC-4 evidence supports only this bounded statement:

> For the registered synthetic fixtures, four pilot mode contracts compile into two offline route-delivery bundles whose decoded semantic block identities, authority, trust, order, source hashes, policies, and output contracts match under the registered adapter rules.

It does not support claims of:

- provider-observed prompt equality;
- executed workflow or tool behavior;
- prompt-injection resistance or action safety;
- candidate-claim factuality;
- application or artifact quality;
- full Career Ops feature parity;
- PN2 provider-pluggable or PN3 behaviorally provider-neutral maturity;
- Recursus product integration;
- improved reliability, speed, cost, or quality;
- advancement to a comparative benchmark; or
- callback, interview, offer, or hiring outcomes.

Hashes prove byte identity only. Static authority labels and canary exclusion do not prove model obedience.

## 19. Handoff

The implementation handoff MUST include:

- exact branch and commit;
- pull request URL when publication was authorized;
- frozen registration and source-snapshot identities;
- pilot modes, fixtures, targets, and adapter-rule IDs;
- exact verification commands and results;
- exact CI result for each required platform and check;
- independent review findings and resolutions;
- preserved user-owned and historical evidence status;
- every unrun check or blocker;
- the non-claims in section 18; and
- whether RC-4 remains `in progress` or is eligible for `accepted`.

Do not begin RC-5, merge a pull request, invoke a provider, or mutate user-layer data without separate explicit authority.
