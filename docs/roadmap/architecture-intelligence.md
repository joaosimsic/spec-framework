# Architecture intelligence roadmap

Status: generated spec v2 implemented and validated with behavior-derived conceptual architecture.

## Product question

> Given an unfamiliar software repository, can I understand what the system
> does, how it works, how responsibilities are distributed, and where I should
> look to improve it?

The answer is generated. The workbench reads generated analysis only. Every
generated conceptual element links to files and symbols. Every flow links to
the behavior it produces.

## Locked decisions

| Concern           | Decision                                                          |
| ----------------- | ----------------------------------------------------------------- |
| Product boundary  | Generated spec product; no curated spec inputs in the workbench   |
| Stack             | Bun/TypeScript; React/Vite workbench; `bun:sqlite`                |
| Persistence       | Local SQLite plus generated JSON artifacts                        |
| Inputs            | Source repository plus root `spec-framework.json`                 |
| Outputs           | `spec/generated/spec.gen.json`, snapshots, audit bundle           |
| Approval          | Retired; generated output never claims approval                   |
| AI                | Evidence-bound; hypotheses only; never a verdict                  |
| Languages         | TypeScript/JavaScript first; adapter contract for later languages |
| Graph UX          | Phased force-directed graph with labels                           |
| Workbench landing | Generated System overview                                         |
| Drill-down        | System to subsystem or component to file to function or class     |
| Mapping           | Generated from structure and ownership                            |
| Entry points      | Heuristics plus root configuration overrides                      |
| Flow analysis     | Static call and IO paths; runtime evidence later                  |

## Phase 0 — Product contract

- [x] Write ADR 0012: architecture intelligence direction.
- [x] Write ADR 0013: analysis persistence.
- [x] Write ADR 0014: AI boundary.
- [x] Write ADR 0015: retire legacy Explorer roadmap.
- [x] Write ADR 0016: generated spec product.
- [x] Update vision, problem, and principles.
- [x] Update architecture and workflow documents.
- [x] Complete documentation consistency pass.

Exit criteria: all documents agree on generated-only spec output and no document
claims curated approval or a curated workbench model.

## Phase 1 — Local analysis platform

Status: implemented.

- [x] SQLite persistence and migrations.
- [x] Registered repository roots.
- [x] Bounded analysis jobs.
- [x] SSE progress and cancellation.
- [x] Deterministic snapshots and fingerprints.
- [x] Generated JSON export.

## Phase 2 — Code intelligence

Status: implemented.

- [x] Scanner with ignores, exclusions, symlink containment, and secret-file exclusion.
- [x] Common IR with files, symbols, imports, calls, inheritance, entry points, and data access.
- [x] TypeScript compiler adapter.
- [x] Unresolved calls as findings.
- [x] Deterministic IR validation.

## Phase 3 — Generated architecture and System view

Status: implemented.

- [x] Generated architecture reconstruction.
- [x] Generated System projection.
- [x] Generated graph APIs.
- [x] System view with drill-down.
- [x] Remove curated LikeC4 merge from the projection.
- [x] Generate system -> subsystem hierarchy without a curated model.
- [x] Add generated role evidence without normative responsibility claims.

## Phase 3b — Behavior-derived conceptual architecture

Status: implemented. Decision record [0017](../design-decisions/0017-behavior-derived-architecture.md).

- [x] Build behavior graph from entry points, public surfaces, calls, data access, and external boundaries.
- [x] Generate conceptual components from behavior anchors.
- [x] Cluster behavior-derived components into subsystems.
- [x] Keep files, symbols, and directories out of the conceptual graph.
- [x] Add deterministic role summaries with evidence.
- [x] Add implementation mappings with confidence.
- [x] Keep unassigned implementation explicit.
- [x] Make conceptual identity stable across directory renames.
- [x] Add optional AI responsibility hypotheses separately.
- [x] Update System view to conceptual-first graph with implementation overlay.
- [x] Add bad-directory-name and rename-stability fixtures.
- [x] Revalidate on three external repositories.

## Phase 4 — Functional flows

Status: implemented.

- [x] Entry-point selection.
- [x] Breadth-first traversal through resolved calls.
- [x] Sources, sinks, unknowns, and limits.
- [x] Flow persistence and APIs.
- [x] Flow view and graph highlighting.
- [x] CLI-to-check fixture.

## Phase 5 — Diagnostics

Status: implemented.

- [x] ARC-001 circular dependency.
- [x] ARC-002 high fan-in.
- [x] ARC-003 high fan-out.
- [x] ARC-004 large component.
- [x] ARC-007 unused code.
- [x] ARC-008 dependency direction.
- [x] ARC-011 missing tests.
- [x] ARC-012 unclear ownership.
- [x] Finding model and local annotations.
- [x] Findings workbench view.
- [x] Map ARC-005, ARC-006, ARC-009, ARC-010 to AI hypotheses only.

## Phase 6 — AI interpretation

Status: implemented with fake-provider validation.

- [x] Local and remote provider boundary.
- [x] Graph context and source excerpts.
- [x] Redaction and token budget.
- [x] Output schemas and reference validation.
- [x] AI run persistence.
- [x] Ask and responsibility endpoints.
- [x] Add generated-spec architecture hypotheses.
- [x] Add generated-spec contract and verification interpretation.

## Phase 7 — Generated spec product

Status: implemented.

- [x] Add `GeneratedSpec` contract and writer.
- [x] Generate observed behavior records.
- [x] Generate observed contract records.
- [x] Generate verification records.
- [x] Persist configured check results as derived verification runs.
- [x] Write `spec/generated/spec.gen.json`.
- [x] Move configuration to `spec-framework.json`.
- [x] Generate system/subsystem/component hierarchy.
- [x] Remove mapping and entry-point sidecars.

## Phase 8 — Generated-only workbench

Status: implemented.

- [x] System, Flows, Findings, and Evolution views.
- [x] Remove Architecture, Code Map, Overview, Map, Compose, Rework, and Review views.
- [x] Remove legacy `/api` proposal and curated routes.
- [x] Replace session with generated snapshot metadata.
- [x] Add generated document view.
- [x] Remove proposal terminal sessions.

## Phase 9 — Generated CLI, query, and bundle

Status: implemented.

- [x] Rewrite `spec check` around generated consistency.
- [x] Rewrite `spec query` over `spec.gen.json`.
- [x] Rewrite `spec bundle`.
- [x] Rewrite opencode plugin read-only tools.
- [x] Remove approval, proposal, mapping, and curation modules.
- [x] Remove curated `spec/` sources.
- [x] Replace obsolete tests.

## Phase 10 — Validation and release

Status: complete for validation and generated-product verification.

- [x] Validate generated output on three real repositories.
- [x] Measure analysis and graph load time.
- [x] Harden symlink, path traversal, redaction, and provider configuration.
- [x] Document generated-only operation.
- [x] Run full verification.

## Acceptance criteria

- [x] Register a local Git repository.
- [x] Detect TypeScript files and entry points.
- [x] Generate architecture without a curated model.
- [x] Generate observed behavior and contract records with evidence.
- [x] Generate verification records from tests and checks.
- [x] Build flows with sources, sinks, and unknowns.
- [x] Generate an expandable System graph.
- [x] Navigate from generated architecture to source code.
- [x] Show incoming and outgoing dependencies.
- [x] Detect architectural problems with evidence.
- [x] Annotate deterministic and AI-assisted findings separately.
- [x] Store snapshots per commit.
- [x] Compare snapshots.
- [x] Make uncertainty visible.
- [x] Keep AI findings separate from deterministic findings.
- [x] Ensure no generated record claims approval.

## Verification

```sh
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build:workbench
```

## Risks

| Risk                                         | Mitigation                                                 |
| -------------------------------------------- | ---------------------------------------------------------- |
| Whole-repo analysis is slow                  | compiler program, file hashes, exclusions, background jobs |
| Static call graph overstates behavior        | evidence classes, unknowns, bounded paths                  |
| AI invents references                        | schema validation and existence checks                     |
| Graph becomes unreadable                     | labels, radial expansion, zoom levels, camera fit          |
| Generated requirements imply normative truth | observed/inferred labels, no approval status               |
| Workbench drifts into a second model         | generated-only projection, no curated readers              |

## Related documents

- [Architecture intelligence direction](../design-decisions/0012-architecture-intelligence.md)
- [Generated spec product](../design-decisions/0016-generated-spec-product.md)
- [Analysis persistence](../design-decisions/0013-analysis-persistence.md)
- [AI interpretation boundary](../design-decisions/0014-ai-interpretation-boundary.md)
- [Analysis engine](../architecture/analysis-engine.md)
- [Generated spec model](../architecture/spec-model.md)
- [Architecture graph](../architecture/architecture-graph.md)
- [Functional flows](../architecture/functional-flows.md)
- [Architectural diagnostics](../architecture/architectural-diagnostics.md)
- [AI layer](../architecture/ai-layer.md)
- [Graph rendering](../architecture/graph-rendering.md)
- [System workspace](../workflow/system-workspace.md)
- [Analysis jobs and snapshots](../workflow/analysis-jobs-and-snapshots.md)
- [API contract](../api/architecture-intelligence-api.md)
- [Analysis schemas](../architecture/analysis-schemas.md)
