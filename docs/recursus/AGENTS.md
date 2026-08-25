# Recursus evaluation instructions

This file is binding for Recursus roadmap and evaluation work. The root `AGENTS.md` bytes are part of the accepted RC-2 source snapshot and must remain unchanged while RC-2 validation depends on that snapshot.

This policy applies to Recursus roadmap work regardless of repository path. Existing root-level V16 route entrypoints are frozen artifacts. Do not add future Recursus milestone entrypoints at the repository root. Put future implementation and command surfaces under `lib/recursus/` and `scripts/recursus/`, where the scoped instruction routers require this file. The `tests/recursus/` and `evals/recursus/` instruction files also require this policy.

## Evaluation contract freeze policy

For roadmap milestones or evaluation work that registers immutable contracts or captures provider evidence, use this sequence:

```text
mutable unversioned draft
  -> complete static, denial, negative, threat, and portability tests
  -> two provider-free offline dry runs
  -> pre-freeze red-team approval
  -> freeze once
  -> authority preflight
  -> one actual provider capture
  -> independent validation
  -> final review and handoff
```

- Development happens in one mutable, unversioned draft. Do not create a new route version for ordinary internal fixes.
- Complete red-team, denial, negative, portability, and dry-run review before freezing.
- The default budget is one frozen registration and one provider attempt per milestone.
- If a defect is found after freezing, stop execution and report it. Creating a new frozen version requires explicit user approval.
- A second provider attempt requires explicit user approval.
- Request explicit user approval before work on one milestone execution exceeds two hours.
- Version numbers identify deliberate frozen contracts, not internal bug-fix iterations.
- Keep rejected drafts outside the repository unless they contain uniquely valuable audit evidence that the user has approved for retention.
- A final post-execution review may update unbound documentation, but it must not silently start another implementation cycle.
