# System workspace

Status: planned.

## Purpose

The workbench is the primary place to understand a repository. The System view
is its default workspace.

It answers two questions together:

1. What is the system?
2. How is each part implemented, and how does data move through it?

The workspace never presents observed code as approved intent.

## Navigation

Proposed views:

| View         | Purpose                                                          |
| ------------ | ---------------------------------------------------------------- |
| System       | Default. Conceptual system with direct implementation drill-down |
| Flows        | Entry points, processing paths, sources, sinks                   |
| Dependencies | Coupling, cycles, incoming and outgoing relationships            |
| Findings     | Deterministic diagnostics and AI-assisted hypotheses             |
| Review       | Existing proposal and approval surfaces                          |
| Technical    | IDs, hashes, provenance, and diagnostics on demand               |

The existing Architecture and Code Map views remain available until the System
view reaches parity.

## Layout

Three synchronized panels:

- **Left**: expandable hierarchy. System, subsystems, components, files,
  symbols.
- **Center**: interactive graph or flow path.
- **Right**: inspector for the selected element.

Selection synchronizes all three. Selecting a component highlights its graph
node, shows its files and symbols, and lists its findings.

## Drill-down

Default expansion:

1. system;
2. subsystems and components;
3. files mapped to the selected component;
4. functions, methods, classes, interfaces, and constants inside a file;
5. calls and data relationships for a selected symbol.

The direct relation between role and implementation is mandatory:

- selecting a component shows responsibility, boundary, owner, and technology;
- the same inspector shows the files and functions that implement it;
- selecting a function shows callers, callees, inputs, outputs, and data access;
- source location is always available.

## Provenance

Every node and edge shows one of:

- specified;
- observed;
- inferred;
- unknown.

Mismatches are visible. A generated component that does not match a curated one
is not silently merged.

## Inspector

Sections:

- Role: responsibility, boundary, owner, technology.
- Implementation: files, symbols, mapping confidence, selector.
- Relations: incoming and outgoing.
- Data: reads, writes, inputs, outputs, sinks.
- Flows: entry points and paths through this element.
- Findings: rule or AI-assisted, severity, status.
- Technical details: IDs, hashes, provenance, diagnostics.

No internal IDs appear by default.

## Coverage

The coverage panel lists:

- mapped elements;
- partially mapped elements;
- unmapped conceptual elements;
- unassigned code;
- stale selectors;
- entry points without sinks.

Clicking an item focuses the related node or filters the graph.

Phase one is read-only. Mapping curation comes later.

## Flows

Flow interaction:

- entry points are marked in the graph;
- **Trace flow** highlights an ordered path;
- **Trace to origin** walks backward from a sink;
- steps show function, file, confidence, and data;
- unknowns and limits reached are visible.

## Graph behavior

- collapsed root by default;
- hybrid expansion;
- labels follow zoom and collision rules;
- radial expansion for many children;
- camera fits the expanded group;
- expanded children never disappear silently.

See [Graph rendering](../architecture/graph-rendering.md).

## States

- loading per lazy expansion;
- empty when no analysis exists;
- partial when analysis is incomplete;
- error with retry;
- stale snapshot warning when the commit changed;
- permission state when the repository is unavailable.

## Write boundary

| Context          | Allowed                              |
| ---------------- | ------------------------------------ |
| Analysis graph   | Read-only                            |
| Findings status  | Human actions, stored as annotations |
| Mapping sidecar  | Display only in phase one            |
| Approved spec    | Read-only                            |
| `spec/spec.lock` | Never written by the workbench       |
| Approval         | CLI-only human action                |

## Accessibility

- keyboard navigation for hierarchy and graph;
- focus management between panels;
- screen-reader labels for controls and selection;
- reduced-motion mode;
- touch target sizing;
- no color-only status.

## Acceptance

- Workbench opens on System.
- System to component to file to function works.
- Component inspector shows role and implementation side by side.
- Function inspector shows calls and data.
- A flow can be traced and highlighted.
- Coverage is visible without technical IDs.
- No approval path exists in the workbench.
