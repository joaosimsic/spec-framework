# spec-framework

**Status: Phase 1 skeleton.** The design docs are complete. The core CLI, `spec init`, `spec doctor`, `spec check --structural`, the LikeC4 architecture adapter, the StrictDoc requirements adapter, and the Quint formal adapter (typecheck plus verify) are implemented. Contract adapters, approval lock, mapping, and the audit bundle are next.

`spec-framework` is a spec-driven development framework for humans and coding agents. It makes the specification the primary engineering artifact and keeps it readable, auditable, and mechanically checked.

The framework does not ask an LLM to write a better prose document. It changes the representation:

- architecture is a validated graph, not a diagram pasted into Markdown;
- requirements are structured records with stable IDs, not free paragraphs;
- behavior is an executable formal model, not a description of behavior;
- contracts are typed interfaces, not examples in prose;
- approval is a human action backed by content hashes, not an LLM claim;
- the audit artifact is generated deterministically, not written by the agent.

## Why

Natural-language specifications fail in predictable ways:

- undefined terms and synonyms drift;
- components and relations are omitted or implied;
- edge cases are never enumerated;
- requirements have no verification link;
- implementation drifts from the document;
- an LLM can silently invent certainty;
- reviewers cannot tell what is normative, assumed, or unknown.

Prompting harder does not fix this. The fix is to make gaps visible and block them mechanically.

## Approach

Compose existing, validated tools. Build only the glue.

| Layer | Tool | Responsibility |
|---|---|---|
| Architecture | [LikeC4](https://likec4.dev/) | systems, components, typed relations, views, validation, MCP |
| Requirements and audit | [StrictDoc](https://strictdoc-project.github.io/) | EARS records, traceability, coverage, HTML/PDF audit output |
| Formal behavior | [Quint](https://quint.sh/) | executable state models, invariants, model checking, traces |
| Contracts | adapters | language APIs, data formats, CLIs, wire protocols, hardware interfaces |
| Glue | small CLI | cross-layer IDs, coverage gates, approval lock, audit bundle, change reports |

The framework assumes most projects are not web applications. OpenAPI and HTTP endpoint descriptions are optional adapters, not defaults.

## What makes it different

- **Typed sources, readable output.** Every normative fact lives in a structured source. The readable PDF/HTML audit bundle is generated from those sources.
- **Deterministic verification.** LikeC4 validation, StrictDoc traceability, Quint model checking, and contract checks decide whether the spec is acceptable. LLM self-report is never accepted.
- **Provenance and unknowns.** Every element records where it came from. Missing information becomes an explicit unknown, not an invented answer.
- **Human approval.** Approved content is hash-locked. Any change invalidates approval until a human reviews and re-approves.
- **Agent-safe workflow.** The default agent cannot edit approved specs. It proposes changes; a human approves them.
- **Non-web first.** Contract adapters cover libraries, CLIs, file formats, IPC, and device protocols.

## Intended workflow

```bash
spec init
spec doctor --fix
spec check
spec map --draft
spec change "add session expiry handling"
spec bundle
spec approve REQ-AUTH-001 AC-AUTH-001 CMP-AUTH PROP-AUTH-EXPIRY
```

`spec init` writes the full-stack profile. `spec doctor --fix` reports the provisioning plan for pinned tools. `spec check` runs structural checks first, then native validators, formal verification, and contract checks. Approval is human-only and hash-locked.

Current skeleton:

- `spec init [--existing] [--force]` creates the scaffold.
- `spec doctor [--json]` reports required and optional tools.
- `spec doctor --fix` prints the provisioning plan; automatic provisioning is next.
- `spec check --structural` validates IDs, required fields, EARS shape, links, and status.
- `spec check` additionally runs the configured architecture, requirements, and formal adapters and fails on missing native tools.

Run locally:

```bash
bun install
bun run bin/spec.ts check --structural
bun test
bun run typecheck
```

## What this is not

- Not a new specification language.
- Not a Markdown template collection.
- Not a promise that formal methods verify all code.
- Not a replacement for human design judgment.
- Not an LLM autonomous coding system.

Formal verification covers models plus conformance tests. Code-level proofs are language-specific and out of scope unless added later.

## Documentation

Start here:

- [Vision](docs/vision.md)
- [Problem](docs/problem.md)
- [Principles](docs/principles.md)
- [Bootstrap](docs/bootstrap.md)
- [Adoption](docs/adoption.md)
- [Brownfield mapping](docs/brownfield.md)
- [Architecture overview](docs/architecture/overview.md)
- [Spec model](docs/architecture/spec-model.md)
- [Workflow](docs/workflow/authoring.md)
- [Audit bundle](docs/architecture/audit-bundle.md)
- [Roadmap](docs/roadmap.md)

Full index: [docs/index.md](docs/index.md).

## Repository layout

```
bin/         CLI entry point
src/core/    config, SDoc parsing, structural lint, doctor, init, check, runner
src/adapters/ LikeC4 and future native adapters
tests/       unit and integration tests
docs/        design documents, decisions, and open questions
examples/    illustrative non-web specification examples
spec/        self-hosted specification scaffold
```

Next:

```
src/bundle/     audit PDF/HTML assembly, manifest, hashes
src/approval/   spec.lock, human-only approval
templates/      repo bootstrap, agent config, CI, pinned toolchain
```

## License

MIT. See [LICENSE](LICENSE).
