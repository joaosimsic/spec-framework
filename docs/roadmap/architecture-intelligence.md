# Architecture intelligence roadmap

Status: planned. Phase 0 documentation is complete; implementation has not
started.

## Product question

> Given an unfamiliar software repository, can I understand what the system does,
> how it works, how its responsibilities are distributed, and where I should look
> to improve it?

The workbench is the primary surface. The first answer is the system, not the
file tree. Every conceptual element must lead directly to the files and symbols
that implement it, and every flow must lead back to the behavior it produces.

## Locked decisions

| Concern           | Decision                                                             |
| ----------------- | -------------------------------------------------------------------- |
| Product boundary  | Evolve `spec-framework`; no second product or service                |
| Stack             | Bun/TypeScript; React/Vite workbench; `bun:sqlite`                   |
| Persistence       | Local SQLite plus generated JSON artifacts                           |
| Roadmap scope     | Full platform MVP                                                    |
| AI                | AI-assisted core, evidence-bound, never a pass verdict               |
| Languages         | TypeScript/JavaScript first; adapter contract for later languages    |
| Graph UX          | Phased Obsidian-style graph                                          |
| Workbench landing | System overview                                                      |
| Drill-down        | System to subsystem or component to file to function or class        |
| Mapping           | Sidecar plus generated suggestions; read-only in the workbench first |
| Entry points      | Heuristics plus explicit configuration override                      |
| Flow analysis     | Static call and IO paths; runtime evidence later                     |

## Current baseline

Already implemented and reusable:

- deterministic spec graph and display projection;
- Bun CLI and local workbench server;
- React/Vite workbench with force-directed canvas;
- architecture view with mapped files and top-level symbols;
- repository graph at subsystem and file level;
- TypeScript import discovery;
- proposal engine and hash-locked approval;
- evidence collection and audit bundle.

Planned and not implemented:

- common analysis IR;
- SQLite persistence and analysis jobs;
- symbol-level call graph and data access;
- generated architecture reconstruction and coverage;
- static functional flows;
- architectural diagnostics;
- AI interpretation layer;
- label engine, radial expansion, and Web Worker graph runtime;
- snapshot comparison.

## Non-goals

- Automatic code refactoring.
- Automatic architecture redesign.
- Complete runtime behavior reconstruction.
- Guaranteed semantic understanding of every language.
- Automatic production-ready documentation.
- Continuous production monitoring.
- Collaborative editing or enterprise permissions.
- AI pass or fail authority.
- Non-TypeScript language analyzers in the first release.

## Milestone mapping

| Product milestone            | Roadmap phases |
| ---------------------------- | -------------- |
| 1. Foundation                | 0, 1           |
| 2. Code intelligence         | 2              |
| 3. Architecture explorer     | 3, 7           |
| 4. Functional understanding  | 4              |
| 5. Architecture intelligence | 5, 6           |
| 6. Validation and refinement | 8, 9           |

## Phase 0 — Product contract and documentation

Goal: lock the product boundary, persistence model, AI boundary, and schema
contracts before code.

- [x] Write ADR 0012: architecture intelligence direction.
- [x] Write ADR 0013: local persistence and analysis snapshots.
- [x] Write ADR 0014: AI interpretation boundary.
- [x] Write ADR 0015: retire the legacy roadmap and Explorer.
- [x] Write the analysis engine architecture.
- [x] Write the architecture graph and traceability model.
- [x] Write the functional flow model.
- [x] Write the architectural diagnostics catalog.
- [x] Write the AI layer contract.
- [x] Write the graph rendering contract.
- [x] Write the System workspace contract.
- [x] Write the analysis job and snapshot contract.
- [x] Write the REST and SSE API contract.
- [x] Write the JSON schema contract.
- [x] Add the new documents to `docs/index.md`.
- [x] Add a summary and link to `docs/roadmap.md`.
- [x] Add a planned-direction note to `README.md`.
- [x] Review `docs/architecture/discovery-layer.md` non-goals.
- [x] Review `docs/architecture/implementation-layer.md` scope.
- [x] Review `docs/workflow/workbench.md` view contract.
- [x] Review `docs/security.md` trust boundaries.
- [x] Remove Explorer and old Phase 2/3 references from front-door docs.
- [x] Complete the documentation consistency pass across the remaining docs.

Exit criteria: all documents agree on one product direction, one persistence
model, one graph model, one AI boundary, and one primary human surface. The
System workspace is that surface.

## Phase 1 — Local platform foundation

Goal: register repositories, run analysis jobs, persist snapshots, stream
progress, and export deterministic artifacts.

### Persistence

- [ ] Add `src/persistence/db.ts`.
- [ ] Add a versioned migration runner.
- [ ] Add `schema_migrations`.
- [ ] Add `projects`.
- [ ] Add `analysis_runs`.
- [ ] Add `analysis_snapshots`.
- [ ] Add `code_artifacts`.
- [ ] Add `arch_elements`.
- [ ] Add `relationships`.
- [ ] Add `entry_points`.
- [ ] Add `flows`.
- [ ] Add `flow_steps`.
- [ ] Add `findings`.
- [ ] Add `finding_evidence`.
- [ ] Add `annotations`.
- [ ] Add `ai_runs`.
- [ ] Add `jobs`.
- [ ] Add indexes for project, snapshot, element type, relationship endpoints, flow, and finding status.
- [ ] Add repository modules per table.
- [ ] Add snapshot creation keyed by Git commit.
- [ ] Store analyzer, rule, prompt, and model versions.
- [ ] Add JSON export to `spec/generated/analysis.gen.json`.
- [ ] Add migration and repository tests.

### Projects and jobs

- [ ] Register explicit local repository roots.
- [ ] Reject paths outside registered roots.
- [ ] Add job lifecycle: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- [ ] Add in-process job runner with bounded concurrency.
- [ ] Add progress events.
- [ ] Add job cancellation.
- [ ] Add SSE progress stream.
- [ ] Add deterministic snapshot fingerprint.
- [ ] Add job and SSE tests.

### API foundation

- [ ] Add `/api/v1/projects`.
- [ ] Add `GET /api/v1/projects/:id`.
- [ ] Add `DELETE /api/v1/projects/:id`.
- [ ] Add `POST /api/v1/projects/:id/analyze`.
- [ ] Add `GET /api/v1/projects/:id/analysis`.
- [ ] Add `GET /api/v1/jobs/:id`.
- [ ] Add `GET /api/v1/jobs/:id/events`.
- [ ] Add request validation.
- [ ] Add error schema.
- [ ] Preserve localhost-only default binding.
- [ ] Add API security tests.

Exit criteria: register a local repository, start analysis, stream progress, and
persist a snapshot.

## Phase 2 — Code intelligence and IR

Goal: turn a TypeScript repository into a language-neutral intermediate
representation with symbols, dependencies, calls, entry points, and data access.

### Scanner

- [ ] Add `src/analysis/scanner.ts`.
- [ ] Discover files from the registered root.
- [ ] Respect `.gitignore`.
- [ ] Respect explicit exclusions.
- [ ] Exclude `node_modules`, `dist`, `coverage`, generated output, and `.spec`.
- [ ] Detect symlinks and prevent traversal outside the root.
- [ ] Hash file contents.
- [ ] Record language, size, line count, and modification time.
- [ ] Add scanner fixtures and tests.

### IR contract

- [ ] Add `src/analysis/ir.ts`.
- [ ] Define element identity: language, file, qualified name.
- [ ] Define element types: module, class, interface, function, method, property, constant, type alias, enum.
- [ ] Add file path, start line, end line, parent ID.
- [ ] Add signature, visibility, export state.
- [ ] Add imports, exports, references, calls.
- [ ] Add inheritance and interface implementation.
- [ ] Add data access records: read, write, source, sink.
- [ ] Add confidence and provenance.
- [ ] Add IR version constant.
- [ ] Add schema validation.
- [ ] Add `tests/analysis-ir.test.ts`.

### TypeScript adapter

- [ ] Add `src/analysis/adapters/typescript/`.
- [ ] Implement adapter detection.
- [ ] Build a TypeScript program from `tsconfig.json`.
- [ ] Add fallback compiler options when no tsconfig exists.
- [ ] Extract files and modules.
- [ ] Extract top-level, exported, and internal symbols.
- [ ] Extract class methods, properties, constructors, and accessors.
- [ ] Extract signatures and visibility.
- [ ] Extract imports and re-exports.
- [ ] Extract inheritance and interface implementation.
- [ ] Resolve local references through the type checker.
- [ ] Build call edges for statically resolvable calls.
- [ ] Mark unresolved calls as findings, never guessed edges.
- [ ] Detect filesystem, network, environment, database, queue, and standard-stream access.
- [ ] Detect entry points: `bin`, shebang, exported library API, HTTP routes, CLI dispatch.
- [ ] Load `spec/implementation/entrypoints.json`.
- [ ] Apply include and exclude overrides.
- [ ] Persist IR to SQLite and generated JSON.
- [ ] Add `tests/analysis-typescript.test.ts`.
- [ ] Add fixture repository tests.

Exit criteria: the whole repository produces deterministic IR with symbols,
dependencies, entry points, calls, and data access.

## Phase 3 — Architecture reconstruction and System view

Goal: translate implementation evidence into a conceptual architecture, link it
to code, and make it explorable from the workbench.

### Generated architecture

- [ ] Add `src/implementation/architecture-builder.ts`.
- [ ] Group packages and directories into subsystems and components.
- [ ] Attach entry points to components.
- [ ] Attach data stores and external integrations.
- [ ] Compute cohesion and coupling metrics.
- [ ] Mark observed, inferred, ambiguous, and unknown elements.
- [ ] Merge generated architecture with curated LikeC4 intent.
- [ ] Keep intent provenance separate from observed provenance.
- [ ] Write `spec/generated/architecture.gen.json`.
- [ ] Add builder tests.

### Traceability and coverage

- [ ] Add `src/implementation/mapping.ts`.
- [ ] Load and validate `spec/implementation/mapping.json`.
- [ ] Support selectors: directory, file, symbol, glob.
- [ ] Suggest mappings from `code=` metadata.
- [ ] Suggest mappings from directory names.
- [ ] Suggest mappings from import aggregation.
- [ ] Resolve conceptual elements to files and symbols.
- [ ] Compute mapped, partial, unmapped, unassigned, and stale.
- [ ] Detect selector drift.
- [ ] Add mapping tests.

### System graph API

- [ ] Add System node, edge, coverage, and detail types.
- [ ] Add `src/workbench/system-projection.ts`.
- [ ] Add `src/workbench/system-display.ts`.
- [ ] Add `GET /api/v1/projects/:id/architecture`.
- [ ] Add `GET /api/v1/projects/:id/elements`.
- [ ] Add `GET /api/v1/elements/:id`.
- [ ] Add `GET /api/v1/elements/:id/children`.
- [ ] Add `GET /api/v1/elements/:id/relationships`.
- [ ] Add `GET /api/v1/elements/:id/implementation`.
- [ ] Add `GET /api/v1/projects/:id/graph`.
- [ ] Add filtering, depth, and pagination.
- [ ] Add projection and API tests.

### System view

- [ ] Make System the default workbench view.
- [ ] Land on system overview.
- [ ] Drill down: system to subsystem or component to file to function or class.
- [ ] Show responsibility, boundary, owner, and technology in the inspector.
- [ ] Show implemented-by files and symbols directly.
- [ ] Show mapping confidence and provenance.
- [ ] Show incoming and outgoing relations.
- [ ] Add an Unassigned code group.
- [ ] Add coverage panel and focus actions.
- [ ] Add search across names, roles, paths, and symbols.
- [ ] Add loading, empty, partial, and error states.
- [ ] Add keyboard and screen-reader support.
- [ ] Add universe and projection tests.

Exit criteria: the user lands on the system, expands a component to files and
functions, and sees role linked to implementation.

## Phase 4 — Functional flows

Goal: reconstruct how input enters the system, where it is transformed, and
where it leaves as output, persistence, or side effects.

- [ ] Add `src/flows/entry-points.ts`.
- [ ] Add `src/flows/analyzer.ts`.
- [ ] Define flows: entry, steps, branches, transformations, sinks, returns, events, errors, unknowns.
- [ ] Traverse from each entry point through resolvable calls.
- [ ] Enforce maximum depth and path count.
- [ ] Deduplicate paths deterministically.
- [ ] Collect input and output data where resolvable.
- [ ] Classify sinks: file, network, database, environment, queue, standard stream, external.
- [ ] Add evidence classes: static, runtime, test, AI-inferred, human-verified.
- [ ] Persist flows and steps.
- [ ] Add flow list and detail APIs.
- [ ] Add trace-from-input and trace-to-origin.
- [ ] Add the workbench Flow view.
- [ ] Highlight flow paths in the System graph.
- [ ] Show partial paths and unknowns.
- [ ] Add the `bin/spec.ts` to `src/cli.ts` to `runCheck` fixture.
- [ ] Add flow tests.

Exit criteria: input-to-output and output-to-origin traces are visible with
evidence labels.

## Phase 5 — Architectural diagnostics

Goal: report deterministic architecture problems and clearly separate them from
AI-assisted hypotheses.

- [ ] Add `src/diagnostics/engine.ts`.
- [ ] Add configurable rule settings.
- [ ] Implement ARC-001 circular module dependency.
- [ ] Implement ARC-002 high fan-in.
- [ ] Implement ARC-003 high fan-out.
- [ ] Implement ARC-004 large component.
- [ ] Implement ARC-005 multiple responsibilities as AI-assisted.
- [ ] Implement ARC-006 duplicate functionality as AI-assisted.
- [ ] Implement ARC-007 unused code.
- [ ] Implement ARC-008 dependency direction violation.
- [ ] Implement ARC-009 excessive abstraction as AI-assisted.
- [ ] Implement ARC-010 leaky abstraction as AI-assisted.
- [ ] Implement ARC-011 missing test coverage.
- [ ] Implement ARC-012 unclear architectural ownership.
- [ ] Add thresholds and per-project overrides.
- [ ] Add finding model: rule, category, severity, confidence, evidence, status.
- [ ] Add finding list, detail, and status APIs.
- [ ] Add findings panel to the workbench.
- [ ] Add confirm, reject, and needs-investigation actions.
- [ ] Persist human decisions as annotations.
- [ ] Add one fixture per rule.
- [ ] Add diagnostics tests.

Exit criteria: deterministic findings and AI-assisted hypotheses never share the
same evidence class.

## Phase 6 — AI interpretation layer

Goal: use AI for explanation and hypothesis generation over structured evidence,
never for verdicts.

- [ ] Add `src/ai/provider.ts`.
- [ ] Support a local provider.
- [ ] Support a remote provider behind explicit opt-in.
- [ ] Add provider configuration outside the repository.
- [ ] Add graph-based context retrieval.
- [ ] Add relevant source excerpt retrieval.
- [ ] Add token budgeting and deterministic ordering.
- [ ] Redact secrets, credentials, and environment files.
- [ ] Treat repository text as untrusted input.
- [ ] Add component responsibility schema.
- [ ] Add functional flow hypothesis schema.
- [ ] Add architecture diagnosis schema.
- [ ] Validate output with JSON Schema.
- [ ] Verify every referenced element, path, and symbol exists.
- [ ] Record provider, model, prompt version, and input hashes.
- [ ] Persist AI runs and outputs.
- [ ] Add human feedback statuses.
- [ ] Add `POST /api/v1/projects/:id/ask`.
- [ ] Add `POST /api/v1/projects/:id/analyze/responsibilities`.
- [ ] Add `POST /api/v1/projects/:id/analyze/architecture`.
- [ ] Add fake-provider validation tests.

Exit criteria: AI answers cite real elements and locations, and invalid
references are rejected.

## Phase 7 — Obsidian-style graph UX

Goal: make a large architecture graph readable and navigable without losing the
organic force-directed feel.

### Expansion and layout

- [ ] Keep React, d3-force, and canvas.
- [ ] Add hierarchical, network, and hybrid expansion.
- [ ] Add radial placement for parents with many children.
- [ ] Add collision detection and spacing expansion.
- [ ] Add camera fit after expansion.
- [ ] Preserve node positions and velocities.
- [ ] Pause physics when stable.
- [ ] Add animated transitions.

### Labels

- [ ] Measure labels as geometric objects.
- [ ] Add label priorities: selected, hovered, root, nearby, distant.
- [ ] Add collision avoidance for labels, nodes, and viewport edges.
- [ ] Keep label placement separate from physics.
- [ ] Add zoom levels: nodes only, important labels, all labels.
- [ ] Add Automatic, All, and Selected label modes.

### Performance

- [ ] Add a spatial index for hit testing and collision.
- [ ] Move physics to a Web Worker.
- [ ] Keep React out of animation-frame rendering.
- [ ] Render only visible nodes and edges.
- [ ] Cache text measurements.
- [ ] Add synthetic fixtures for 100, 500, 2000, and 5000 nodes.
- [ ] Add performance tests.
- [ ] Add label-engine and radial-layout tests.

### Interaction and accessibility

- [ ] Add contextual menu.
- [ ] Add search, filtering, and trace to origin.
- [ ] Add reduced-motion support.
- [ ] Add keyboard navigation.
- [ ] Add screen-reader labels.
- [ ] Add touch target sizing.

Exit criteria: expanded children stay visible and readable, and the graph remains
interactive at target sizes.

## Phase 8 — Snapshots, comparison, and validation

Goal: make architecture evolution observable and validate the product on real
repositories.

- [ ] Add snapshot comparison for elements.
- [ ] Add snapshot comparison for relationships.
- [ ] Add flow comparison.
- [ ] Add finding comparison.
- [ ] Add architecture evolution view.
- [ ] Add annotations and human corrections.
- [ ] Add snapshot comparison in the workbench.
- [ ] Add reproducibility checks: commit, analyzer, rules, prompts, model.
- [ ] Validate on three real repositories.
- [ ] Measure analysis time and graph load time.
- [ ] Harden symlink and path traversal handling.
- [ ] Harden AI redaction and remote-provider configuration.
- [ ] Add comparison and validation fixtures.

Exit criteria: the tool helps understand three unfamiliar repositories without
extensive manual modeling.

## Phase 9 — Release

Goal: make the local tool usable and honest about its limits.

- [ ] Package the local tool.
- [ ] Document localhost-only default.
- [ ] Document provider configuration and secrets.
- [ ] Document registered roots and read-only analysis.
- [ ] Add project registration, analysis, snapshot, and export commands.
- [ ] Update README and docs index.
- [ ] Run full verification.

## Acceptance criteria

- [ ] Register a local Git repository.
- [ ] Detect TypeScript files and entry points.
- [ ] Extract modules, classes, functions, imports, calls, and data access.
- [ ] Build a dependency graph.
- [ ] Produce functional flows with inputs, outputs, and side effects where static.
- [ ] Generate an expandable architecture map.
- [ ] Navigate from architecture to source code.
- [ ] Show incoming and outgoing dependencies.
- [ ] Generate responsibility descriptions with evidence.
- [ ] Detect circular dependencies and selected architectural smells.
- [ ] Validate, reject, or annotate findings.
- [ ] Store analysis snapshots per Git commit.
- [ ] Compare snapshots.
- [ ] Make uncertainty visible.
- [ ] Keep AI findings separate from deterministic rule violations.
- [ ] Preserve human-approved intent in `spec.lock`.

## Verification

```sh
bun test tests/analysis-ir.test.ts tests/analysis-typescript.test.ts
bun test tests/persistence-migrations.test.ts tests/analysis-jobs.test.ts
bun test tests/implementation-mapping.test.ts tests/flows.test.ts
bun test tests/diagnostics.test.ts tests/ai-validation.test.ts
bun test tests/workbench-system.test.ts tests/workbench-graph-rendering.test.ts
bun run typecheck
bun run lint
bun run format:check
bun test
bun run build:workbench
```

## Risks

| Risk                                  | Mitigation                                                             |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Whole-repo analysis is slow           | tsconfig program, incremental file hashes, exclusions, background jobs |
| Static call graph overstates behavior | evidence classes, unknowns, bounded paths, no runtime claims           |
| AI invents references                 | schema validation and existence checks                                 |
| Graph becomes unreadable              | label engine, radial expansion, zoom levels, camera fit                |
| Mapping churn invalidates intent      | sidecar selectors, generated suggestions, separate approval            |
| Workbench becomes a second model      | one projection over intent, implementation, and mapping                |
| SQLite becomes a bottleneck           | snapshot tables, indexes, JSON export, later Postgres migration        |
| Local repository access leaks         | registered roots, read-only access, path checks, localhost binding     |

## Related documents

- [Architecture intelligence direction](../design-decisions/0012-architecture-intelligence.md)
- [Analysis persistence](../design-decisions/0013-analysis-persistence.md)
- [AI interpretation boundary](../design-decisions/0014-ai-interpretation-boundary.md)
- [Analysis engine](../architecture/analysis-engine.md)
- [Architecture graph](../architecture/architecture-graph.md)
- [Functional flows](../architecture/functional-flows.md)
- [Architectural diagnostics](../architecture/architectural-diagnostics.md)
- [AI layer](../architecture/ai-layer.md)
- [Graph rendering](../architecture/graph-rendering.md)
- [System workspace](../workflow/system-workspace.md)
- [Analysis jobs and snapshots](../workflow/analysis-jobs-and-snapshots.md)
- [API contract](../api/architecture-intelligence-api.md)
- [Analysis schemas](../architecture/analysis-schemas.md)
