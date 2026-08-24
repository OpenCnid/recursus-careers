# Recursus Careers feature documentation

[Recursus overview](../README.md) | [Architecture](../architecture/README.md) | [Feature registry](REGISTRY.md) | [Benchmarks](../benchmarks/README.md)

## Purpose

This directory records what the product inherits, what Recursus intends to add, what is actually integrated, and what evidence supports each statement.

"New" is not an implementation status. "Inherited" is not a quality judgment. Maturity and ownership are tracked separately.

## Ownership labels

| Label | Meaning |
| --- | --- |
| `career-ops` | Behavior inherited from the pinned Career Ops baseline |
| `recursus-careers` | Career-specific integration or product behavior implemented in this repository |
| `recursus-runtime` | Behavior owned by the separate Recursus runtime |
| `dsh` | Harness service supplied by DeepSeek Harness |
| `rlm` | Persistent-computation capability supplied by DeepSeek RLM |
| `honcho` | Optional semantic-memory capability supplied by DeepSeek Honcho |
| `dovetail` | Prompted workflow capability supplied by DeepSeek Dovetail |
| `provider-adapter` | Provider-specific transport and model integration |

## Implementation status

| Status | Meaning |
| --- | --- |
| `inherited` | Present unchanged in the pinned Career Ops baseline |
| `planned` | Product direction only; no complete contract or path |
| `specified` | Normative behavior and acceptance criteria exist; no complete path is claimed |
| `scaffolded` | Types, configuration, or placeholders exist; the user path is incomplete |
| `implemented` | Owning production code, a documented component entrypoint, and focused tests exist |
| `integrated` | A complete user path works across the pinned real components and has integration evidence |
| `released` | A versioned artifact has installation, upgrade, rollback, and support instructions |
| `deprecated` | Still reachable but scheduled for removal |

Use `field-observed` as a separate note, not an implementation status.

## Recursus Careers integration status

| Status | Meaning |
| --- | --- |
| `not started` | No Career Ops-to-Recursus integration code exists |
| `not integrated` | A component or contract exists elsewhere, but no complete Career Ops path exists |
| `integrated` | A complete pinned Career Ops path has integration evidence |
| `released` | The integrated path is part of a supported Recursus Careers release |

## Evidence status

| Evidence | Meaning |
| --- | --- |
| `unverified` | No cited execution evidence |
| `unit-verified` | Focused owning-component tests pass |
| `synthetic-e2e` | Complete path passes with controlled synthetic inputs |
| `live-provider-verified` | A bounded real-provider test passes |
| `platform-accepted` | The supported platform workflow and failure suite pass at the cited lock |
| `benchmark-supported` | Registered comparative benchmark supports the named scoped claim |
| `field-observed` | Seen on real work, but not controlled comparative proof |

Evidence labels always include commit or component lock, platform, provider and model when relevant, date, evidence location, and limitations. Old evidence receives a `historical` or `stale` modifier after the relevant pin changes.

## Feature-page contract

Each detailed feature page should start with:

```yaml
id:
name:
summary:
owner:
implementation:
evidence:
baseline_commit:
supported_runtimes: []
preferred_runtime:
default_or_opt_in:
inputs: []
outputs: []
canonical_data: []
side_effects: []
human_gate:
permission_envelope:
persistence_and_resume:
privacy_boundary:
implementation_evidence: []
test_evidence: []
known_limitations: []
explicitly_unsupported: []
advancement_criteria: []
```

Then document:

1. user outcome;
2. workflow and ownership;
3. failure behavior and recovery;
4. permissions and side effects;
5. data and privacy boundaries;
6. evidence and benchmark coverage;
7. current limitations and advancement criteria.

Operational instructions remain in the existing Career Ops modes and guides. Feature pages describe the product contract and link to those instructions rather than copying them.

## Claim guardrails

### Implemented

Use `implemented` only when production code exists, the owning component exposes a documented entrypoint, focused tests pass, and limitations are named. Use `integrated` only when a complete Recursus Careers user path exercises the real component seams and has integration evidence. Specification text or adjacent component code is not enough for either label.

### Provider-neutral

Name the exact maturity level:

1. `PN1`, provider-neutral contract;
2. `PN2`, provider-pluggable implementation;
3. `PN3`, behaviorally provider-neutral product.

The third requires at least two independent real providers passing the same conformance and product corpus.

### Safer

Never use an unqualified safer or secure claim. Name the baseline, authority, threat model, controls, bypass tests, and result. RLM Python has host authority and is not a sandbox. Honcho introduces optional remote text egress.

### Better

Better requires the registered comparative protocol, all attempted runs, repeated trials, blinded review, deterministic gates, effect sizes, and uncertainty. Until then say "designed to improve" or "unmeasured against the Claude Code reference."

### More efficient

Name the dimension and denominator: tokens, comparable cost, subscription quota, latency, tool calls, compute, retries, or human correction time. A faster incomplete result is not more efficient.
