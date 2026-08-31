# RC-7 selective RLM research postmortem

Status: final historical learning record; RC-7 remains closed with terminal `STOP`

Date: 2026-08-30

Normative result: [RC-7 specification](RC7_SPEC.md)

Operational record: [RC-7 slice card](RC7_SLICE_CARD.md)

## Executive summary

RC-7 successfully answered whether the current selective-RLM implementation was ready to become a Recursus Careers capability: it was not.

The final v25 experiment sealed all 36 planned primary attempts. The direct route completed all of its rows, while only two of nine RLM treatment rows completed. Three RLM treatments failed on child-response timeouts and four failed when a container exited without a sealed result. Across the registered eligible cases, the RLM arm averaged 29.6296 points below the direct arm and had approximately 2.72 times the median latency.

The experiment also found a shared safety problem. One direct `FACT-01` result asserted an unsupported candidate-derived item. The preregistered scorer classified it as `fabricated-candidate-fact`, which is a critical failure and forced terminal `STOP`. Consequently, RC-7 cannot honestly conclude either that RLM should be kept or that RLM has no value. It establishes that this implementation must not be integrated or promoted.

The decision is to shelve the current RLM integration, preserve its evidence and implementation for study, and keep the product route off. Any future investigation must be separately scoped and should begin with a substantially simpler architecture.

## What was tested

The comparison held the configured provider, model, reasoning setting, semantic prompt, source packs, evaluator, and shared permission identity fixed. The intended component difference was:

- `rc-direct`: one bounded model completion over the registered source pack;
- `rc-rlm`: the same top-level request plus one contained RLM execution, a persistent intermediate program/evidence state, and four brokered recursive child requests.

The six frozen synthetic cases were:

| Class | Cases | Intended signal |
| --- | --- | --- |
| RLM-eligible | `LAB-01`, `PAPER-01`, `REPO-01` | Multi-source relationship traversal, paper evidence mapping and exact calculation, and repository architecture/activity discovery. |
| Generic controls | `FACT-01`, `FACT-03`, `SAFE-01` | Grounded candidate facts, conflict resolution, and injection/action safety without RLM selection. |

No private Career Ops data, application submission, recruiter contact, tracker mutation, purchase, or deployment was part of the experiment.

## What happened

Final v25 outcomes:

| Observation | Result |
| --- | ---: |
| Primary attempts sealed | 36 / 36 |
| Verified primary completions | 29 / 36 |
| RLM treatment completions | 2 / 9 |
| RLM treatment failures | 7 / 9 |
| Recursive child requests | 36 |
| Contained RLM invocations | 9 |
| Generic-case RLM invocations | 0 |
| Automatic retries | 0 |
| Cleanup residue | 0 |
| Critical failures | 1 |

Eligible scores:

| Case | Direct mean | RLM mean | Delta |
| --- | ---: | ---: | ---: |
| `LAB-01` | 27.7778 | 19.4444 | -8.3333 |
| `PAPER-01` | 66.6667 | 0 | -66.6667 |
| `REPO-01` | 16.6667 | 2.7778 | -13.8889 |

The aggregate eligible delta was -29.6296 points, eligible wins were zero, and the bootstrap lower bound was -49.0741. Generic-control deltas were all zero. Median latency was 155,413 ms for control and 422,346 ms for treatment.

One detail argues against an overly broad rejection of the idea: the one successful `LAB-01` RLM treatment scored 58.3333, above the `LAB-01` direct mean. Its other two treatment repeats failed and therefore scored zero. This is weak evidence of possible upside when the mechanism completes, not evidence of a reliable gain.

## RLM-specific treatment path and failure boundaries

The RLM treatment was not merely a longer prompt. It was a distributed execution protocol in which every phase had to succeed before the attempt could return one score-bearing answer:

```text
registered source pack
  -> trusted top-level provider result and bounded Python program
  -> host staging and physical-root binding
  -> networkless contained RLM process
  -> four ordered child proposals through the host broker
  -> four child provider terminals returned to the container
  -> deterministic combination of base and child evidence
  -> schema validation, containment attestation, cleanup, and atomic sealing
```

The direct route stopped after the first provider result and its ordinary validation. The treatment route required that result plus all subsequent phases. Partial child evidence, console output, an exited container, or a file that had not passed the registered schema and identity checks was deliberately not accepted as a result.

The principal RLM roadblocks by phase were:

| Phase | Required behavior | Roadblock observed | Consequence |
| --- | --- | --- | --- |
| Top-level generation | Produce the closed structured base result and bounded RLM program through the pinned DSH/`openai-codex` path. | Historical attempts exposed an unsupported `max_output_tokens` request extension, stream-lifecycle incompatibilities, provider-active timeout assumptions, and serialized-program sizing mistakes. | Several early attempts stopped before a trusted program could be launched. These defects were repaired before v25 and were not the final matrix terminals. |
| Staging and identity binding | Bind the exact worker, image, stage, ledger, results root, and fresh RLM root before provider or container mutation. | Historical attempts found nested stage-identity lookup errors, image-label mismatches, and recovery/root-substitution gaps. | Fail-closed checks prevented ambiguous evidence, but each post-freeze defect consumed an immutable attempt and forced a fresh root. These defects were repaired before v25. |
| Contained execution | Run model-generated Python in the pinned networkless image under the outer Docker restrictions and phase-two syscall policy. | The workflow depended on the generated program, the worker, the exchange protocol, container lifecycle, and broker staying mutually compatible. Program-envelope expansion and embedding data in the code budget caused additional proof-stage failures. | Provider-free conformance eventually proved the exact contained path, but doing so required substantially more protocol machinery than the research hypothesis itself. |
| Child brokerage | Service four ordered child proposals without giving the container credentials or network authority. Each child shared a bounded response deadline and the treatment shared the RLM wall. | In v25, all three `PAPER-01` treatments ended `CHILD_RESPONSE_TIMEOUT`. All 36 child reservations reached a terminal, but a timeout terminal could not supply the required accepted child result. | A single late or unavailable child made the whole treatment unusable. Zero retries preserved the frozen comparison but provided no recovery from transient latency. |
| Combination and sealing | Combine the trusted top-level result and accepted child results, emit the closed artifact, attest containment, clean up, and seal the artifact before process exit. | Two `LAB-01` and two `REPO-01` treatments ended `CONTAINER_EXITED_UNSEALED`. The launcher observed that the container was no longer running before one trusted sealed result existed. | Those four rows retained no score-bearing combined artifact even if partial work had occurred inside the container. The closed terminal does not distinguish a Python error, protocol exit, resource termination, or another pre-seal exit, so the postmortem does not claim a more specific cause. |

The two final failure codes describe trustworthy boundary observations, not complete remote root-cause diagnoses:

- `CHILD_RESPONSE_TIMEOUT` means the broker did not receive an acceptable child result within the remaining registered deadline. It does not prove whether the delay originated in the provider, network, adapter, broker, or request difficulty, nor does it prove remote cancellation or billing timing.
- `CONTAINER_EXITED_UNSEALED` means the container stopped before the launcher could validate and seal exactly one final artifact. It does not by itself prove a crash or identify the internal exit cause. Raw provider prose, reasoning, replay state, and unbound console output were intentionally unavailable as substitute evidence.

This distinction matters when interpreting the score. The seven zeroes primarily measure route-level inability to return a product-usable answer under the registered authority and deadlines. They should not be read as seven demonstrations that recursive reasoning produced intellectually worse intermediate research.

## 1. Problems inherent to recursive research

These are structural risks of the treatment shape, even with a correct implementation:

- **Failure amplification.** One treatment depended on a top-level completion, a contained program, four child completions, deterministic combination, and final publication. Every added dependency created another way for the attempt to fail.
- **Latency multiplication.** Four sequential brokered children made treatment latency structurally higher. The observed median was approximately 2.72 times the direct route.
- **Budget amplification.** The treatment required five model requests instead of one. Containment and no-replay rules correctly limited authority, but could not remove the underlying token and request multiplication.
- **State reconciliation.** Recursive research gains value only if intermediate state, child evidence, and the final synthesis remain consistent. That state creates new integrity and recovery obligations absent from a single completion.
- **Uneven task fit.** `PAPER-01` direct performance was materially stronger while every RLM repeat failed. Recursion is not automatically useful merely because a source pack is long or distributed.

These observations do not prove that all recursive research is counterproductive. They show that recursion needs a much larger and more reliable per-child benefit than RC-7 observed to offset its inherent execution cost.

## 2. Problems caused by this implementation

The current implementation added too many independently fragile boundaries:

- a host launcher and one-shot credential-opaque capsule;
- stream normalization and a strict structured-output reducer;
- physical ledger, results, stage, and RLM-root identities;
- Docker creation, inspection, containment, exchange, and sealing;
- child brokerage and absolute response deadlines;
- deterministic combination and atomic publication.

The historical repair sequence exposed defects at most of those seams: DSH-home forwarding, wrapper schema selection, stream lifecycle compatibility, unsupported request fields, output-accounting acceptance, stage identity, image labels, program/exchange sizing, process acknowledgment, and recovery-root substitution. Those repairs improved the evidence system, but their number is itself a product signal: the implementation surface was too large for the value hypothesis being tested.

These implementation roadblocks fall into four groups:

1. **Provider-path translation.** Career Ops did not invoke a native continuing Codex task. It staged a one-shot worker, forwarded only a credential-opaque DSH home, invoked the DSH `openai-codex` adapter, normalized the provider stream, and reduced it into a stricter RC-7 grammar. Authentication eventually worked, but every translation introduced compatibility assumptions that had to be discovered and repaired.
2. **Generated-program packaging.** The model result, Python code, JSON serialization, exchange files, and combined artifact had separate byte ceilings. Escaping and embedding data caused the serialized envelope to exceed limits even when the underlying Python appeared to fit. The final design had to preload the base result as data rather than consume the code budget.
3. **Containment orchestration.** The container intentionally had neither provider credentials nor external network access. Every recursive request therefore crossed a broker protocol while container identity, image labels, mounts, namespaces, syscall policy, deadlines, and cleanup were independently verified. This successfully bounded authority but made research completion depend on many non-research components.
4. **Immutable evidence and recovery.** Physical roots, attempt stages, handoffs, terminals, and results could not be replayed or silently replaced. This prevented budget reset and evidence rewriting, but it also turned each newly discovered wrapper defect into a permanently consumed attempt. The repeated approval loop was a symptom of freezing before this complete live path was mature.

The final failures were narrower but still decisive:

- all three `PAPER-01` treatment attempts ended `CHILD_RESPONSE_TIMEOUT`;
- two `LAB-01` and two `REPO-01` treatment attempts ended `CONTAINER_EXITED_UNSEALED`;
- all nine treatment rows invoked the contained RLM and all 36 recursive child reservations settled, so the final result was not caused by route selection silently bypassing treatment;
- only two containers produced a trusted combined artifact.

Containment performed better than the research mechanism: there were zero uncontained-OS observations, route violations, recovery failures, or cleanup residues. The problem was not that the sandbox escaped. The problem was that the contained workflow rarely completed.

The observed completion pattern was therefore:

| Eligible case | RLM repeats | Trusted combined artifacts | RLM-specific terminal pattern |
| --- | ---: | ---: | --- |
| `LAB-01` | 3 | 1 | Two `CONTAINER_EXITED_UNSEALED` |
| `PAPER-01` | 3 | 0 | Three `CHILD_RESPONSE_TIMEOUT` |
| `REPO-01` | 3 | 1 | Two `CONTAINER_EXITED_UNSEALED` |

The one strong completed `LAB-01` result suggests that persistent multi-pass investigation may help when it finishes. The completion table shows why that potential could not support integration: benefit was conditional on a treatment path that completed only two times out of nine.

## 3. Problems shared by both routes

The direct `FACT-01` critical failure shows that RLM was not the only defective layer.

The route produced a schema-valid, locator-bearing structured result, but one candidate-derived assertion was not supported by the registered source truth. Structural validity and valid locator syntax were therefore insufficient to ensure semantic support.

This shared problem matters more than the comparative score:

- candidate-fact safety must hold before either route can be productized;
- a valid citation is not proof that the cited source entails the claim;
- common prompts and output grammar need a safer distinction between extracted candidate facts and synthesized research relationships;
- unsupported candidate facts must fail before user-facing generation, independently of whether RLM is enabled.

Other shared nonclaims remain: the provider-reported backend snapshot and native tokenizer were unavailable, OAuth/subscription pricing was not comparable cost evidence, and remote cancellation or billing timing was not proven.

## 4. A simpler alternative

If recursive-style research is revisited, the next candidate should be a host-owned bounded staged-research route rather than model-generated Python inside a recursive container.

A minimal design would use:

1. **Deterministic source partitioning.** The host divides the registered pack into fixed, inspectable sections.
2. **One extraction pass per bounded section.** Each pass returns only the existing closed evidence-item grammar.
3. **A host-owned evidence ledger.** Deterministic code deduplicates signatures, validates source IDs and locators, and records unresolved categories.
4. **At most one bounded gap-fill pass.** The host selects unresolved categories; the model cannot spawn arbitrary recursive work.
5. **Deterministic merge and safety gate.** Candidate-derived assertions require the stricter candidate-fact policy before synthesis or publication.

This retains the useful idea—persistent gap tracking across a large source pack—without arbitrary Python, Docker lifecycle dependence, model-controlled recursion, or four mandatory child calls. It would still need a new preregistration and evidence boundary, but its implementation and failure surface would be substantially smaller.

`LAB-01` is the most defensible first provider-free design target because it had both a low direct mean and one high-scoring completed RLM treatment. `PAPER-01` should not be the first target: direct execution already performed relatively well and the recursive implementation completed zero treatments.

## Process lessons

The repeated approval cycle was avoidable process debt, not a desirable safety property.

The live credential/provider path should have been exercised with one exact representative request before freezing the full execution wrapper. Instead, several post-freeze defects were discovered one request at a time, requiring new immutable roots and approvals because no-replay accounting was already active.

Future live evaluations should:

- prove the real provider path and exact request shape before the benchmark freeze;
- exercise the real subprocess and stream reducer provider-free, not only isolated helpers;
- prove one exact end-to-end treatment before authorizing a matrix;
- freeze only after the live path and recovery path are stable;
- use one bounded approval covering the already-audited execution rather than repeated prose approvals for implementation details;
- open a systemic circuit after repeated shared-path failure, as the final implementation now does.

The governance machinery prevented silent replay, budget reset, credential leakage, and evidence rewriting. That was valuable. But governance cannot compensate for freezing an immature execution path.

## Decision and follow-up

Current decisions:

- RC-7 remains closed with `STOP`.
- The current RLM route remains off, unintegrated, and unpromoted.
- The implementation and external evidence remain preserved for analysis; they are not deleted or replayed.
- No further RC-7 repair or matrix run is recommended.

Recommended future order, only under a new bounded milestone:

1. Fix and provider-free test the shared candidate-fact safety boundary.
2. Prototype the host-owned staged-research ledger without provider or Docker authority.
3. Test whether deterministic extraction plus one bounded gap-fill pass can solve `LAB-01`.
4. Only if that prototype shows a concrete advantage, preregister a smaller live comparison.
5. Reconsider full RLM recursion only if the simpler route cannot answer the measured question.

The non-normative [orchestrator-guided RLM follow-up proposal](ORCHESTRATED_RLM_PROPOSAL.md) develops this order into a candidate three-route experiment: direct execution, persistent orchestration without RLM, and the same orchestrator with RLM available only as a bounded supervised operation. It grants no continuation or execution authority.

## Evidence identities and nonclaims

- V25 freeze: `3c9f50f4360130f08fd5cdfdc6e581432f9669cc527b0a23b06f5ab9e79685ab`
- V25 activation: `860e403ec3343f44f8c97e6ebf930e0ff342b6bc1de42dc3303154474cba6805`
- Results aggregate: `e0d74c7191697938e5071b1f157d6eaa68615baf27ab1ab1ca79c5dd3016cf7e`
- Attempt matrix: `53739bf98b32289af6c7fa99a008881ec03393f2c71a81d030e2014fff61dd19`
- Terminal: `STOP`

This postmortem is explanatory and non-normative. It grants no provider, credential, RLM, Docker, benchmark, purchase, publication, deployment, or external-mutation authority. It makes no universal claim about RLM, no production-sandbox claim, no comparable-cost claim, and no claim about application or hiring outcomes.
