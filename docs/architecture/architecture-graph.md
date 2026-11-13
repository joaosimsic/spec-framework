# Architecture graph and traceability

Status: version 1 directory reconstruction implemented; behavior-derived
architecture planned.

The architecture graph is generated from one analysis snapshot. It separates the
conceptual system from its implementation.

## Conceptual graph

| Node kind         | Meaning                                                |
| ----------------- | ------------------------------------------------------ |
| `system`          | Generated project boundary                             |
| `subsystem`       | Behavior family                                        |
| `component`       | Behavior unit                                          |
| `interface`       | CLI, HTTP, library, event, or configured entry surface |
| `data_store`      | Observed data boundary                                 |
| `external_system` | External package or service                            |

Conceptual edges:

| Edge               | Meaning                              |
| ------------------ | ------------------------------------ |
| `depends_on`       | Component or subsystem dependency    |
| `calls`            | Cross-component call                 |
| `exposes`          | Component exposes an interface       |
| `reads` / `writes` | Data access                          |
| `uses_external`    | External system dependency           |
| `realizes`         | Component realizes observed behavior |

Every edge carries `confidence`, `provenance`, and `resolution`.

## Implementation graph

Implementation nodes:

- file;
- module;
- class;
- interface;
- function;
- method;
- property;
- constant;
- type alias;
- enum.

Implementation edges:

- contains;
- imports;
- exports;
- calls;
- references;
- inherits;
- implements;
- reads / writes.

Implementation nodes never appear as conceptual architecture children.

## Mapping

Conceptual elements map to implementation:

```text
CMP-Configuration-API
  -> FILE-src/config.ts
  -> SYM-src/config.ts#loadConfig
  -> SYM-src/config.ts#saveConfig
```

Mapping evidence includes:

- entry point reachability;
- public surface reachability;
- direct calls;
- import proximity;
- data access;
- test references;
- package metadata.

Directory similarity is supporting evidence only.

## Identity

- System: `SYS-<project>`.
- Subsystem: behavior-family identity.
- Component: sorted behavior anchors.
- Interface: entry kind and stable key.
- Data store: channel and stable target.
- External system: package or service.
- File: `FILE-<relative-path>`.
- Symbol: `SYM-<relative-path>#<qualified-name>`.
- Mapping: `MAP-<conceptual>-<implementation>`.

Directory renames do not change conceptual identity.

## Reconstruction

The behavior graph starts from:

- entry points;
- exported package surfaces;
- application mains;
- CLI commands;
- HTTP route groups;
- events and jobs;
- configured entry points.

Reached implementation is grouped by behavior. Components with no behavior
anchor are not generated.

Code not reached by any anchor remains unassigned implementation.

## Coverage

Generated coverage reports:

- conceptual components;
- mapped implementation;
- unassigned implementation;
- ambiguous mappings;
- entry points without observed sinks;
- behavior with no implementation;
- unknown boundaries.

Coverage is evidence, not a verdict.

## Snapshots

Each snapshot records:

- Git commit;
- analyzer, schema, rule, prompt, and model versions;
- conceptual and implementation counts;
- findings;
- coverage and unknown counts.

Comparison across commits uses stable conceptual and implementation identities.

## Workbench projection

The System projection reads:

- conceptual architecture;
- behavior summaries;
- implementation mappings;
- flows;
- findings;
- coverage.

The primary graph contains conceptual nodes only. Implementation is exposed
through the inspector, overlay, and source drill-down.

## Invariants

- No conceptual component whose only evidence is a directory.
- No directory name as a conceptual label when behavior evidence exists.
- No file or symbol nodes in the conceptual hierarchy.
- No hidden unassigned implementation.
- No AI hypothesis presented as deterministic architecture.
- No generated output presented as approved intent.
