# Behavior-derived conceptual architecture

Status: planned. Replaces directory-based reconstruction from the first
generated-spec implementation.

The conceptual architecture describes what the system does. It does not describe
the folder structure.

## Conceptual graph

Node kinds:

| Kind              | Meaning                                                |
| ----------------- | ------------------------------------------------------ |
| `system`          | Product boundary                                       |
| `subsystem`       | Coherent behavior family                               |
| `component`       | Behavior unit with a public or operational role        |
| `interface`       | CLI, HTTP, library, event, or configured entry surface |
| `data_store`      | Observed persistent or transferred data boundary       |
| `external_system` | External package or service boundary                   |

Files, symbols, directories, and packages do not appear as conceptual nodes.

## Implementation graph

The implementation graph contains:

- files;
- modules;
- classes, interfaces, functions, methods, properties, constants, and enums;
- imports, calls, references, inheritance, and data access.

Implementation identities are repository-relative and stable.

## Mapping

Every conceptual element links to implementation:

```json
{
  "conceptual_id": "CMP-...",
  "implementation_id": "FILE-src/foo/bar.ts",
  "confidence": "observed",
  "evidence": ["ENTRY-http-GET-/config"]
}
```

Directory paths appear in mapping evidence and source locations, never as the
reason a conceptual element exists.

## Behavior anchors

Components are seeded from:

- CLI commands and bin entries;
- HTTP route groups;
- exported package and library APIs;
- application main functions;
- event handlers and jobs;
- configured entry points;
- data access or external integrations that have observable behavior.

Behavior anchors are traversed through resolved calls and imports. Reached
implementation receives a mapping to the anchor group.

Code not reachable from an anchor remains unassigned implementation.

## Component discovery

1. Build the behavior graph from anchors.
2. Group anchors by stable behavior:
   - route prefix;
   - command namespace;
   - package public surface;
   - event or job family.
3. Assign reached implementation to the strongest anchor group.
4. Merge groups with high implementation overlap.
5. Keep unresolved mapping explicit.
6. Never create a component from a directory alone.

## Subsystem clustering

Components are clustered by behavior:

- interface kind;
- data channels;
- shared external systems;
- call and import coupling;
- shared test evidence;
- runtime boundary.

Package boundaries may increase confidence. They do not define the cluster by
themselves.

## Naming

Labels come from observed evidence:

| Evidence               | Example label           |
| ---------------------- | ----------------------- |
| HTTP route prefix      | `Configuration API`     |
| CLI namespace          | `Analyze command`       |
| Package export surface | `@scope/package API`    |
| Event or job family    | `Snapshot jobs`         |
| Data channel           | `Snapshot storage`      |
| External package       | `Git integration`       |
| Ambiguous cluster      | `Unclassified behavior` |

Directory names are not conceptual labels.

## Summaries

Every conceptual element gets a deterministic evidence summary:

```text
Handles HTTP routes GET /config and DELETE /config.
Reads environment configuration and writes JSON configuration.
Calls configuration loading and validation code.
Depends on the server runtime.
Covered by two test modules.
```

Rules:

- every sentence cites evidence;
- no invented ownership;
- no normative responsibility claim;
- incomplete behavior is marked unknown;
- AI hypotheses are stored separately.

## Stability

Conceptual IDs are derived from anchor keys and behavior families, not paths.

```text
CMP-<hash(sorted anchor keys)>
SUB-<hash(behavior family)>
IFACE-<entry kind and stable key>
DATA-<channel and stable target>
EXT-<package name>
```

Renaming `src/foo` to `src/bar` changes mappings, not conceptual identity.

## Coverage

Coverage reports:

- mapped conceptual components;
- implementation mapped to components;
- unassigned implementation;
- behavior with no reachable implementation;
- ambiguous component assignments;
- entry points without observed sinks;
- unknown or external boundaries.

Coverage is evidence for review, not a verdict.

## Workbench

The System graph shows conceptual nodes first:

```text
System -> Subsystem -> Component -> Interface / Data / External
```

Implementation appears through:

- inspector mappings;
- an implementation overlay;
- source drill-down;
- an unassigned implementation panel.

Files and symbols are never conceptual children in the primary graph.

## LikeC4 export

LikeC4 may be generated as an optional conceptual export. It is never an input
and never determines conceptual identity.
