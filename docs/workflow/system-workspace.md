# System workspace

Status: version 1 implemented; behavior-derived conceptual architecture planned.

## Purpose

The workbench is the primary place to understand a repository. It reads
generated analysis only. It never reads curated architecture, requirements,
proposals, or `spec.lock`.

It answers two questions together:

1. What is the generated system?
2. How is each part implemented, and how does data move through it?

## Navigation

Views:

| View                | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| System              | Default. Generated hierarchy with implementation drill-down. |
| Flows               | Entry points, processing paths, sources, sinks.              |
| Findings            | Deterministic diagnostics and AI-assisted hypotheses.        |
| Evolution           | Snapshot comparison.                                         |
| Generated documents | Rendered generated spec sections and technical metadata.     |

The legacy Architecture, Code Map, Overview, Map, Compose, Rework, and Review
views are retired.

## Layout

Three synchronized panels:

- **Left**: conceptual hierarchy from system to subsystem, component,
  interface, data store, and external system.
- **Center**: interactive conceptual graph or flow path.
- **Right**: inspector with deterministic summary, evidence, implementation
  mappings, relations, data, tests, unknowns, and optional AI hypothesis.

Selection synchronizes all panels. Selecting a component highlights its graph
node, shows its files and symbols, and lists its findings.

## Drill-down

Default expansion:

1. system;
2. subsystems grouped by behavior family;
3. components derived from entry points, public surfaces, calls, data access,
   and external boundaries;
4. interfaces, data stores, and external systems;
5. implementation mappings for the selected conceptual element.

Files and symbols are implementation evidence. They appear in the inspector,
implementation overlay, and source drill-down, not as conceptual children.

The inspector shows:

- observed role summary;
- evidence for the component's existence;
- entry points and public surface;
- mapped files and symbols;
- mapping confidence;
- incoming and outgoing relations;
- data reads and writes;
- tests;
- flows;
- unknowns and unassigned code;
- optional AI hypothesis;
- technical identity on demand.

## Provenance

Every node and edge shows one of:

- observed;
- inferred;
- ambiguous;
- unknown.

Generated output never appears as approved or specified intent.

## Coverage

The coverage panel lists:

- mapped conceptual components;
- implementation mapped to components;
- unassigned implementation;
- ambiguous component assignments;
- unresolved imports and calls;
- external systems;
- entry points without observed sinks;
- behavior with no reachable implementation.

Clicking an item focuses the related node or filters the graph.

## Flows

Flow interaction:

- entry points are marked in the graph;
- **Trace flow** highlights an ordered path;
- **Trace to origin** walks backward from a sink;
- steps show function, file, confidence, and data;
- unknowns and limits reached are visible.

## States

- loading per lazy expansion;
- empty when no generated analysis exists;
- partial when analysis is incomplete;
- error with retry;
- stale snapshot warning when the commit changed;
- permission state when the repository is unavailable.

## Write boundary

| Context               | Allowed                        |
| --------------------- | ------------------------------ |
| Generated graph       | Read-only                      |
| Generated spec        | Read-only                      |
| Findings status       | Local annotation in `.spec/`   |
| `spec/generated/`     | Never written by the workbench |
| `spec-framework.json` | Read-only                      |
| Snapshot database     | Analysis jobs only             |

## Accessibility

- keyboard navigation for hierarchy and graph;
- focus management between panels;
- screen-reader labels for controls and selection;
- reduced-motion mode;
- touch target sizing;
- no color-only status.

## Acceptance

- Workbench opens on System.
- System to component to implementation mapping works.
- Component inspector shows observed role, behavior evidence, and implementation mapping.
- Function inspector shows calls and data.
- A flow can be traced and highlighted.
- Coverage distinguishes mapped and unassigned implementation without technical IDs.
- No directory-derived conceptual node exists in the primary graph.
- No curated model or approval path exists in the workbench.
