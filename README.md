# spec-framework

**Status: Phase 1 skeleton plus the first Phase 1.5 slices.** The design docs are complete. The core CLI, `spec init`, `spec doctor`, `spec check --structural`, `spec map --draft`, `spec map --review`, `spec start`, a read-only `spec query`, a same-worktree `spec change` proposal engine, the local `spec workbench`, human approval with a hash lock and named-scope selection, the LikeC4 architecture adapter, the StrictDoc requirements adapter, the Quint formal adapter (typecheck plus verify), and the JSON Schema, CLI, and Rust public API contract adapters plus the compiler preflight adapter are implemented. Adapters activate from detected sources or explicit config. Native adapters emit deterministic evidence, `spec approve` hashes it into `spec.lock`, and artifacts live under `spec/evidence`. `spec bundle` writes a deterministic audit directory with HTML, PDF, manifest, graph, sources, evidence, change report, and the approval lock.

Phase 2 and Phase 3 capabilities — capabilities, verification planning, the optional semantic layer, MCP, the read-only Explorer, workspaces, and model migration — are documented design specs, not implemented features. See the [roadmap](docs/roadmap.md).

The first interactive slices are implemented: `spec query` emits the deterministic identity graph for SDoc records, architecture elements, formal modules and properties, contract sidecars, and stored evidence, and the presentation projection exposes names, plain-language state, blockers, open questions, opaque refs, contextual name resolution, and technical details. `spec change` creates same-worktree proposal branches and applies typed operations (`rename`, `deprecate`, `replace`, `split`, `merge`, `extract`, `move`, `change-contract`, `record-decision`, `record-open-question`). Its change report includes deterministic impact analysis across requirements, architecture, formal sources, contracts, evidence, and approvals. `spec start` opens a scratch-mode proposal from a goal without writing approved content or `spec/spec.lock`. `spec map --review` opens or resumes a mapping proposal, prints the area and relation confidence queues, and applies typed area and relation curation actions without writing approved sources or `spec/spec.lock`. `spec map --promote` writes accepted areas into proposed LikeC4 elements, `spec approve` hash-locks annotated architecture elements, and `spec map --check` reports drift against the approved subset. `spec refactor` is a thin alias that defaults to refactor mode and warns when no approved baseline exists. `spec approve --scope "<name>"` resolves a visible requirement or architecture name to its identity and includes acceptance criteria for requirements; positional IDs remain for automation and `--technical` reveals them. Change reports can include a deterministic before/after graph simulation from a baseline snapshot captured when the proposal opens; `spec refactor` enables it by default and `spec change` accepts `--simulate`. The React/Vite workbench serves the display graph, mapping curation, scratch context, refactor simulation, proposal review, and technical details; approval and `spec/spec.lock` writes remain CLI-only. The opencode plugin is implemented as a standalone package plus a local self-hosting loader; it exposes status, context, query, impact, proposal, validation, decision, next, diff, and workbench tools with no approval path. See [use-case modes](docs/workflow/use-cases.md), [presentation and identity](docs/ux/presentation.md), [workbench](docs/workflow/workbench.md), and the [opencode plugin](docs/workflow/opencode-plugin.md).

`spec doctor --fix` installs pinned LikeC4, Quint, and StrictDoc into `.spec/tools` with Bun and uv. Apalache and Java remain explicit manual prerequisites. Unpinned tools are never resolved automatically.

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
spec approve --scope "Session expiry"
spec approve REQ-AUTH-001 AC-AUTH-001
```

`spec init` writes the full-stack profile. `spec doctor --fix` installs pinned project-local tools where a safe package-manager recipe exists and prints exact instructions for the rest. `spec check` runs structural checks first, then native validators, formal verification, and contract checks. Approval is human-only and hash-locked.

Current skeleton:

- `spec init [--existing] [--force]` creates the scaffold.
- `spec doctor [--json]` reports required and optional tools.
- `spec doctor --fix` installs pinned LikeC4, Quint, and StrictDoc under `.spec/tools` using Bun and uv. It never installs globally, runs a shell, or resolves floating versions. Apalache and Java remain manual and are reported with exact instructions.
- `spec check --structural` validates IDs, required fields, EARS shape, links, and status.
- `spec check` runs every active architecture, requirements, formal, contract, and implementation compiler adapter. An architecture, requirements, formal, or contract adapter activates when its sources or language are detected, or when it is listed explicitly in `spec/config.json`. The compiler adapter activates when `spec/implementation/compile.json` exists or `adapters.implementation` is set. Active adapters fail on missing native tools.
- `spec map --draft` discovers generic package and Rust workspace boundaries, writes `spec/architecture/draft.gen.c4`, and reports missing owners, low-confidence elements, external dependencies, and unresolved requirement links. It never modifies `spec/architecture/model.c4`.
- `spec map --review [--action <json|file>]... [--technical] [--json]` requires a clean tree to open a same-worktree mapping proposal, then resumes it for curation. `--action` applies `accept`, `reject`, `accept-relation`, `reject-relation`, `rename`, `merge`, `split`, `set-owner`, `set-responsibility`, `set-boundary`, and `open-question` decisions by visible name or technical ID. Inferred, ambiguous, and unknown relations appear in a relation queue; `accept-relation` records human provenance and `reject-relation` removes the relation. It stores the review snapshot in `spec/proposals/<slug>.mapping.json`, regenerates `spec/architecture/draft.gen.c4`, and never writes `spec/architecture/model.c4`, `spec/spec.lock`, or approval state. Default output uses names, not internal IDs; `--technical` reveals identity and provenance; JSON is the identity contract.
- `spec start "<goal>" [--json] [--technical]` opens a scratch-mode proposal on a clean greenfield repository. It requires `spec init`, refuses an approved baseline or an existing-project scaffold, records the proposal baseline, and prints the first interview prompts. It never writes `spec/spec.lock`, approves anything, or invents requirements.
- `spec query [--id <id>] [--kind <kind>] [--status <status>] [--view <identity|experience>] [--technical] [--json] [--allow-dirty]` emits the read-only unified graph over SDoc records, annotated LikeC4 elements, annotated Quint modules and properties, contract sidecars, and stored evidence artifacts. JSON is the identity contract; `--view experience --json` is the display model with opaque refs; default output uses titles and plain-language state; `--technical` reveals identity, provenance, links, and diagnostics. It refuses a dirty tree unless `--allow-dirty` is passed and never writes sources or `spec/spec.lock`.
- `spec change "<direction>" [--mode <scratch|mapping|refactor>] [--op <json|file>]... [--technical] [--json]` requires a clean tree, creates a same-worktree branch `spec/<slug>`, records the base commit, baseline lock hash, author, and typed operations, and reports the change. `rename`, `deprecate`, `replace`, `split`, and `merge` edit SDoc records; `extract` and `move` edit requirements and LikeC4 containment; `change-contract` edits contract sidecars; `record-decision` and `record-open-question` append linked decision records under `spec/requirements/decisions.sdoc`. The report traces changed links in both directions, lists affected elements, invalidated evidence, approvals to renew, and open questions. `spec change --op <json|file>` adds operations to the active proposal. `spec change --status [--json]` inspects it. It never writes `spec/spec.lock` or approves anything.
- `spec refactor "<direction>" [--op <json|file>]... [--technical] [--json]` is a thin alias for `spec change --mode refactor`. It warns when no approved baseline exists and never writes `spec/spec.lock` or approves anything.
- `spec bundle [--allow-dirty] [--output <dir>] [--force] [--json]` runs the full check, refuses a dirty tree unless `--allow-dirty` is passed, and writes `manifest.json`, `graph.json`, `index.html`, `spec.pdf`, `change-report.md`, the approval lock when present, copied sources, and regenerated evidence. The default destination is `spec/audit/audit-<short-commit>`; `--force` replaces only an existing bundle directory. It never writes `spec/spec.lock` or approves anything.
- `spec approve [--scope <name>]... [ids...] [--technical]` runs checks, requires interactive human confirmation and a clean tree (or `--allow-dirty`), hashes proposed SDoc requirement and acceptance records and native evidence into `spec/spec.lock`, writes evidence artifacts under `spec/evidence/`, and sets their status to `Approved`. Named scopes resolve titles case-insensitively, reject ambiguous names with contextual choices, and expand a requirement to its acceptance criteria. Default output uses names; `--technical` shows IDs.
- `spec check` also rejects a stale content or evidence lock, an approved status without a lock entry, a missing locked element, and an approved requirement whose acceptance criteria are unlocked. Structural-only checks skip evidence regeneration.

Run locally:

```bash
bun install
bun run bin/spec.ts check --structural
bun run lint
bun run format:check
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
src/model/   unified spec graph, deterministic builder, SDoc/architecture/formal/contract collectors, display projection, impact analysis
src/query/   read-only graph query and git workspace metadata
src/change/  proposal branches, typed cross-source operations, impact analysis, and change reports
src/bundle/  deterministic audit HTML, PDF, manifest, sources, and evidence
src/approval/ spec.lock hashing, human approval, and lock verification
src/evidence/ deterministic evidence records, hashing, collection, and artifact storage
src/adapters/ LikeC4, StrictDoc, Quint, JSON Schema, CLI, Rust, and compiler adapters
src/plugin/  opencode-facing service, display formatting, guards, and workbench registry
plugin/opencode/ opencode plugin package and local self-hosting loader
tests/       unit and integration tests
docs/        design documents, decisions, and open questions
examples/    illustrative non-web specification examples
spec/        self-hosted specification scaffold
             architecture/, capabilities/, requirements/, semantic/,
             verification/, formal/, contracts/
```

Next:

```
src/change/     cross-source operation previews and simulation refinements
src/bundle/     native view embedding and richer report sections
src/evidence/   evidence regeneration from a clean environment
src/semantic/   optional RDF/OWL/SKOS/SHACL adapter
src/query/      MCP interface and coverage queries
src/explorer/   read-only local review surface
src/workbench/  React/Vite proposal workbench and local API
src/workspace/  multi-repo composition and branch contexts
templates/      repo bootstrap, agent config, CI, pinned toolchain
```

## License

MIT. See [LICENSE](LICENSE).
