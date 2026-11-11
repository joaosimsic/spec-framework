# spec-framework

**Status: Phase 1 skeleton plus the first Phase 1.5 slice.** The design docs are complete. The core CLI, `spec init`, `spec doctor`, `spec check --structural`, `spec map --draft`, a read-only `spec query`, human approval with a hash lock, the LikeC4 architecture adapter, the StrictDoc requirements adapter, the Quint formal adapter (typecheck plus verify), and the JSON Schema, CLI, and Rust public API contract adapters plus the compiler preflight adapter are implemented. Adapters activate from detected sources or explicit config. Evidence hashing and the audit bundle are next.

Phase 2 and Phase 3 capabilities — capabilities, verification planning, the optional semantic layer, MCP, the read-only Explorer, workspaces, and model migration — are documented design specs, not implemented features. See the [roadmap](docs/roadmap.md).

The first interactive slice is implemented: `spec query` emits the deterministic identity graph for SDoc requirement and acceptance records. The rest of the interactive use-case model — scratch, mapping, refactor, the presentation layer with opaque refs, the React/Vite workbench, and the opencode plugin — is documented design, not implemented. See [use-case modes](docs/workflow/use-cases.md), [presentation and identity](docs/ux/presentation.md), [workbench](docs/workflow/workbench.md), and the [opencode plugin](docs/workflow/opencode-plugin.md).

`spec-framework` is a spec-driven development framework for humans and coding agents. It makes the specification the primary engineering artifact and keeps it readable, auditable, and mechanically checked.

The framework does not ask an LLM to write a better prose document. It changes the representation:

- architecture is a validated graph, not a diagram pasted into Markdown;
- capabilities anchor requirements and verification, not a prose feature list;
- requirements are structured records with stable IDs, not free paragraphs;
- vocabulary and constraints use optional RDF/OWL/SKOS/SHACL, not an invented schema;
- verification is planned across formal, test, analysis, inspection, and demonstration methods;
- behavior is an executable formal model, not a description of behavior;
- contracts are typed interfaces, not examples in prose;
- approval is a human action backed by content hashes, not an LLM claim;
- the audit artifact is generated deterministically, not written by the agent;
- the graph is queryable read-only by agents and the Explorer, not editable by default.

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

| Layer                  | Tool                                              | Responsibility                                                               |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Architecture           | [LikeC4](https://likec4.dev/)                     | systems, components, typed relations, views, validation, MCP                 |
| Capabilities           | capability model                                  | ability hierarchy, requirement derivation, verification coverage             |
| Requirements and audit | [StrictDoc](https://strictdoc-project.github.io/) | EARS records, traceability, coverage, HTML/PDF audit output                  |
| Semantic constraints   | optional RDF/OWL/SKOS/SHACL adapter               | shared vocabulary, concept schemes, SHACL contracts, SPARQL                  |
| Verification planning  | verification model                                | objectives, methods, cases, evidence, coverage                               |
| Formal behavior        | [Quint](https://quint.sh/)                        | executable state models, invariants, model checking, traces                  |
| Contracts              | adapters                                          | language APIs, data formats, CLIs, wire protocols, hardware interfaces       |
| Glue                   | small CLI                                         | cross-layer IDs, coverage gates, approval lock, audit bundle, change reports |
| Review and query       | read-only CLI, MCP, Explorer                      | graph queries, impact, coverage, traceability, local review                  |

The framework assumes most projects are not web applications. OpenAPI and HTTP endpoint descriptions are optional adapters, not defaults.

## What makes it different

- **Typed sources, readable output.** Every normative fact lives in a structured source. The readable PDF/HTML audit bundle is generated from those sources.
- **Deterministic verification.** LikeC4 validation, capability and verification coverage, StrictDoc traceability, semantic/SHACL checks, Quint model checking, and contract checks decide whether the spec is acceptable. LLM self-report is never accepted.
- **Provenance and unknowns.** Every element records where it came from. Missing information becomes an explicit unknown, not an invented answer.
- **Human approval.** Approved content is hash-locked. Any change invalidates approval until a human reviews and re-approves.
- **Agent-safe workflow.** The default agent cannot edit approved specs. It proposes changes; a human approves them. Query, MCP, and Explorer are read-only.
- **Optional semantics, not a new language.** Ontologies, concepts, and SHACL contracts use standard RDF formats.
- **Non-web first.** Contract adapters cover libraries, CLIs, file formats, IPC, and device protocols.

## Intended workflow

```bash
spec init
spec doctor --fix
spec check
spec map --draft
spec query --json
spec change "add session expiry handling"
spec bundle
spec approve REQ-AUTH-001 AC-AUTH-001
```

`spec init` writes the full-stack profile. `spec doctor --fix` reports the provisioning plan for pinned tools. `spec check` runs structural checks first, then native validators, formal verification, and contract checks. Approval is human-only and hash-locked.

Current skeleton:

- `spec init [--existing] [--force]` creates the scaffold.
- `spec doctor [--json]` reports required and optional tools.
- `spec doctor --fix` prints the provisioning plan; automatic provisioning is next.
- `spec check --structural` validates IDs, required fields, EARS shape, links, and status.
- `spec check` runs every active architecture, requirements, formal, contract, and implementation compiler adapter. An architecture, requirements, formal, or contract adapter activates when its sources or language are detected, or when it is listed explicitly in `spec/config.json`. The compiler adapter activates when `spec/implementation/compile.json` exists or `adapters.implementation` is set. Active adapters fail on missing native tools.
- `spec map --draft` discovers generic package and Rust workspace boundaries, writes `spec/architecture/draft.gen.c4`, and reports missing owners, low-confidence elements, external dependencies, and unresolved requirement links. It never modifies `spec/architecture/model.c4`.
- `spec query [--id <id>] [--kind <kind>] [--status <status>] [--json] [--allow-dirty]` emits the read-only unified graph over SDoc requirement and acceptance records. JSON is the identity contract; default output uses titles and plain-language state. It refuses a dirty tree unless `--allow-dirty` is passed and never writes sources or `spec/spec.lock`.
- `spec approve <ids...>` runs checks, requires interactive human confirmation and a clean tree (or `--allow-dirty`), hashes proposed SDoc requirement and acceptance records into `spec/spec.lock`, and sets their status to `Approved`.
- `spec check` also rejects a stale lock, an approved status without a lock entry, a missing locked element, and an approved requirement whose acceptance criteria are unlocked.

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
- [Capability layer](docs/architecture/capability-layer.md)
- [Requirements layer](docs/architecture/requirements-layer.md)
- [Semantic layer](docs/architecture/semantic-layer.md)
- [Verification layer](docs/architecture/verification-layer.md)
- [Query and agent interface](docs/architecture/query-and-agent-interface.md)
- [Workspace and branches](docs/architecture/workspace-and-branches.md)
- [Use-case modes](docs/workflow/use-cases.md)
- [Workflow](docs/workflow/authoring.md)
- [Workbench](docs/workflow/workbench.md)
- [opencode plugin](docs/workflow/opencode-plugin.md)
- [Explorer](docs/workflow/explorer.md)
- [Presentation and identity](docs/ux/presentation.md)
- [Model lifecycle](docs/workflow/model-lifecycle.md)
- [Audit bundle](docs/architecture/audit-bundle.md)
- [Roadmap](docs/roadmap.md)

Full index: [docs/index.md](docs/index.md).

## Repository layout

```
bin/         CLI entry point
src/core/    config, SDoc parsing, structural lint, doctor, init, check, adapter selection, runner
src/model/   unified spec graph, deterministic builder, and SDoc element collector
src/query/   read-only graph query and git workspace metadata
src/approval/ spec.lock hashing, human approval, and lock verification
src/adapters/ LikeC4, StrictDoc, Quint, JSON Schema, CLI, Rust, and compiler adapters
tests/       unit and integration tests
docs/        design documents, decisions, and open questions
examples/    illustrative non-web specification examples
spec/        self-hosted specification scaffold
             architecture/, capabilities/, requirements/, semantic/,
             verification/, formal/, contracts/
```

Next:

```
src/model/      display projection and opaque refs
src/change/     typed proposal operations, same-worktree branches, impact
src/bundle/     audit PDF/HTML assembly, manifest, hashes
src/evidence/   evidence artifact hashing and regeneration
src/semantic/   optional RDF/OWL/SKOS/SHACL adapter
src/query/      MCP interface and impact/coverage queries
src/explorer/   read-only local review surface
src/workbench/  React/Vite proposal workbench and local API
src/workspace/  multi-repo composition and branch contexts
plugin/opencode/ conversational planning plugin, published and local loader
templates/      repo bootstrap, agent config, CI, pinned toolchain
```

## License

MIT. See [LICENSE](LICENSE).
