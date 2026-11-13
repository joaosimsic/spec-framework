# 0017 — Behavior-derived conceptual architecture

Status: accepted.

## Context

Decision record [0016](0016-generated-spec-product.md) made the spec product
generated from repository evidence. The first implementation reconstructed the
architecture from directories:

```text
subsystem = first source/package segment
component = parent directory
label = directory path
```

That model is deterministic, but it describes the folder structure, not the
system. Bad directory names produce bad conceptual nodes. A directory becomes a
component merely because it exists, even when no behavior, interface, or data
access supports that boundary.

The product question is about system understanding:

> What does the system do, how is it organized, and where is each responsibility
> implemented?

Directory structure is implementation evidence. It must not define conceptual
identity.

## Decision

Generate the conceptual architecture from behavior and interfaces.

- Conceptual architecture is reconstructed from entry points, public surfaces,
  call and import behavior, data access, external boundaries, and tests.
- Implementation structure is mapped underneath conceptual elements.
- Directories, files, and symbols are provenance and implementation mapping.
- They are never the primary conceptual hierarchy.
- Code with no behavioral evidence remains unassigned implementation. It does
  not become an invented component.
- Directory renames do not change conceptual identity when behavior is unchanged.
- AI may produce responsibility hypotheses from evidence, but deterministic
  behavior remains the baseline.
- AI hypotheses remain separate, cited, and optional.

## Conceptual model

The conceptual graph contains only:

- system;
- subsystem;
- component;
- interface;
- data store;
- external system.

Files, symbols, and directories belong to the implementation model.

Conceptual elements link to implementation through explicit mapping records.

## Behavior anchors

Conceptual elements are seeded by behavior anchors:

- CLI commands and bin entries;
- HTTP route groups;
- exported package and library APIs;
- application main functions;
- event handlers and jobs;
- configured entry points;
- observed data access and external integrations with no reachable entry
  point, represented as explicit data or integration evidence.

A component with no behavioral, interface, data, or external anchor is not
generated.

## Naming

Names are derived from observed anchors and public surfaces:

- route groups;
- command namespaces;
- package names and descriptions;
- exported interface names;
- data channels;
- external systems.

Directory names may increase mapping confidence but cannot name a conceptual
element.

When behavior is too ambiguous, the component is named `Unclassified behavior`
and marked ambiguous. The generator does not invent a purpose.

## Explanations

Every generated component includes:

- deterministic summary;
- behavior evidence;
- entry points and public surface;
- data reads and writes;
- dependencies and dependents;
- test evidence;
- implementation mappings;
- unknown or unassigned behavior;
- optional AI hypothesis, separately labeled.

Summaries contain only statements supported by evidence.

## Workbench

The System view presents conceptual nodes first.

Implementation appears through:

- inspector mappings;
- an implementation overlay;
- source drill-down;
- unassigned implementation reports.

Files and symbols do not appear as conceptual children in the primary graph.

## Consequences

Positive:

- The architecture describes behavior, not repository layout.
- Bad directory names do not create bad conceptual nodes.
- Components can remain stable across implementation moves.
- Traceability is explicit instead of implied by path.
- Unmapped code becomes visible instead of silently becoming architecture.

Negative:

- Reconstruction is more complex than grouping directories.
- Some code will be unassigned.
- Behavior clustering can be ambiguous.
- Conceptual identity changes when entry points or public surfaces change.
- The workbench needs separate conceptual and implementation views.

## Supersedes

The directory-based architecture reconstruction portion of
[0016](0016-generated-spec-product.md). The generated-only product contract
remains in force.

## Rules

- Never generate a conceptual component whose only evidence is a directory.
- Never use a directory name as a component label when behavioral evidence exists.
- Never hide unassigned implementation.
- Never mix file or directory nodes into the conceptual hierarchy.
- Never present a deterministic summary as complete behavior.
- Never let AI rename or approve conceptual identity.
- Directory renames must not rename conceptual elements.
