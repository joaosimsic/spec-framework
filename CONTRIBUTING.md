# Contributing

This repository is design-first. Changes to the model or workflow must update the relevant document and, where a real tradeoff exists, add or amend a decision record.

## Rules

- Do not present unverified behavior as fact. Mark unknowns explicitly.
- Keep normative statements in structured fields once implementation exists.
- Prefer composition of validated tools over new formats.
- Every document must state its scope and its non-goals.
- Link decisions to alternatives and consequences.
- Use conventional commits.

## Commit style

```
docs: add audit bundle lifecycle
docs(adr): choose StrictDoc for audit output
feat(core): add cross-layer ID lint rule
fix(lint): reject expired waivers
```

## Documentation style

- Short sections. Concrete examples. Mermaid diagrams where structure matters.
- Define terms in [docs/glossary.md](docs/glossary.md) before using them normatively.
- Do not add marketing language.
- Do not claim formal verification of code unless a verifier proves it.

## Review checklist

- Does the change alter the spec model, approval model, or verification scope?
- Are affected documents and ADRs updated together?
- Is the human approval path still explicit?
- Can an LLM bypass a gate by editing a generated artifact?
- Are non-web projects still first-class?
