# Architecture graph and traceability

Status: planned.

## Purpose

The architecture graph joins what the system is intended to be with what the
code actually contains.

Two graphs remain distinct:

| Graph                | Source                                                  | Authority          |
| -------------------- | ------------------------------------------------------- | ------------------ |
| Intent graph         | LikeC4, requirements, capabilities, contracts, approval | Human-approved     |
| Implementation graph | Scanner and analyzers                                   | Generated evidence |

A third mapping layer links them:

| Mapping            | Source                                       | Authority           |
| ------------------ | -------------------------------------------- | ------------------- |
| Conceptual to code | Sidecar selectors plus generated suggestions | Curated or inferred |

The workbench reads one projection over all three. It never merges them into one
unqualified truth.

## Intent graph

Reuse the existing model:

- systems, subsystems, components, interfaces, data stores;
- external actors and external systems;
- typed relationships;
- stable IDs and provenance;
- approved status and hash lock.

Intent elements keep their current identity and approval lifecycle.

## Implementation graph

Node kinds:

| Kind               | Meaning                                                   |
| ------------------ | --------------------------------------------------------- |
| `package`          | Manifest-defined package or workspace member              |
| `directory`        | Source directory                                          |
| `file`             | Source file                                               |
| `function`         | Free function or exported function                        |
| `method`           | Method or accessor                                        |
| `class`            | Class                                                     |
| `interface`        | Interface or protocol                                     |
| `type`             | Type alias or structural type                             |
| `constant`         | Top-level constant                                        |
| `entry_point`      | CLI command, HTTP route, library API, job, event consumer |
| `data_entity`      | Named data type, table, file format, or payload           |
| `data_store`       | Database, file store, queue, cache                        |
| `external_package` | Dependency outside the repository                         |

Edge kinds:

| Edge                  | Meaning                                           |
| --------------------- | ------------------------------------------------- |
| `contains`            | Hierarchy                                         |
| `imports`             | Module import                                     |
| `exports`             | Public surface                                    |
| `calls`               | Resolved, ambiguous, unresolved, or external call |
| `references`          | Symbol reference                                  |
| `inherits`            | Class inheritance                                 |
| `implements`          | Interface implementation                          |
| `reads` / `writes`    | Data access                                       |
| `accepts` / `returns` | Input and output types                            |
| `external_calls`      | Call outside the repository                       |
| `maps_to`             | Conceptual element to implementation node         |

Every edge carries `confidence`, `provenance`, and `resolvedBy`.

## Identity

- File: `FILE-<relative-path>`.
- Symbol: `SYM-<relative-path>#<qualified-name>`.
- Entry point: `ENTRY-<kind>-<stable-key>`.
- Data entity: `DATA-<qualified-name>`.
- Mapping: `MAP-<conceptual-id>-<selector>`.

IDs must not depend on line numbers. A symbol rename creates a new identity and
a drift finding.

## Architecture reconstruction

The architecture builder translates implementation structure into draft
conceptual elements.

Inputs:

- package and directory structure;
- manifest dependencies;
- entry points;
- import graph;
- call graph;
- data access;
- existing curated intent.

Outputs:

- draft subsystems and components;
- responsibilities derived from entry points and public surface;
- dependencies;
- external integrations;
- data stores;
- confidence and provenance.

Rules:

- never approve generated elements;
- never overwrite curated intent;
- never invent ownership or normative responsibility;
- mark ambiguous boundaries;
- preserve both observed and specified versions when they disagree.

## Mapping sidecar

`spec/implementation/mapping.json` is the curated mapping source.

Example:

```json
{
  "version": 1,
  "mappings": [
    {
      "element": "CMP-SPEC-CHANGE",
      "selectors": ["src/change/", "src/change/operations.ts#applyOperation"],
      "confidence": "observed",
      "provenance": "human:maintainer@2026-11-13"
    }
  ]
}
```

Selector grammar:

| Selector                         | Meaning           |
| -------------------------------- | ----------------- |
| `src/change/`                    | Directory subtree |
| `src/change/change.ts`           | Single file       |
| `src/change/change.ts#runChange` | Symbol in file    |
| `glob:src/**/adapter*.ts`        | Glob pattern      |

Generated suggestions come from:

- existing `code=` annotations;
- directory-name matches;
- entry-point ownership;
- import aggregation.

Suggestions are draft-only. They never become approved mappings automatically.

## Coverage

The projection reports:

- mapped conceptual elements;
- partially mapped elements;
- unmapped conceptual elements;
- unassigned code;
- stale selectors;
- entry points without reachable sinks;
- findings that reference missing code.

Coverage is evidence for review, not a verdict.

## Snapshots

Each analysis snapshot records:

- Git commit;
- analyzer version;
- schema version;
- rule version;
- generated element and edge counts;
- findings;
- mapping and coverage results.

Snapshots support comparison across commits. Deleting or renaming a mapped
symbol becomes a drift finding, not an automatic architecture change.

## Workbench projection

The System projection joins:

- intent nodes from curated architecture;
- implementation nodes from analysis;
- mapping edges;
- flows;
- findings;
- coverage.

The projection preserves provenance so the UI can show `specified`, `observed`,
`inferred`, or `unknown` without hiding disagreement.

## Invariants

- Implementation nodes never enter `spec.lock` as approved intent.
- Mapping changes never silently modify approved architecture.
- Generated suggestions are visibly separate from human decisions.
- Every downstream view reads the same graph projection.
- Uncertainty is visible at the element and edge level.
