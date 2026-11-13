# Generated spec model

Status: version 1 implemented; version 2 planned for behavior-derived
architecture.

The generated spec is one deterministic artifact produced from one analysis
snapshot.

Canonical path:

```text
spec/generated/spec.gen.json
```

## Version 2 shape

```json
{
  "version": 2,
  "snapshot": {},
  "project": {},
  "architecture": {
    "system": {},
    "subsystems": [],
    "components": [],
    "interfaces": [],
    "data_stores": [],
    "external_systems": [],
    "relationships": [],
    "coverage": {}
  },
  "implementation": {
    "files": [],
    "symbols": []
  },
  "mappings": [],
  "requirements": [],
  "contracts": [],
  "verification": [],
  "flows": [],
  "findings": [],
  "evidence": [],
  "unknowns": []
}
```

## Conceptual architecture

Only behavior-derived elements appear here:

- system;
- subsystem;
- component;
- interface;
- data store;
- external system.

Files and directories are not conceptual elements.

Every conceptual element contains:

```json
{
  "id": "CMP-...",
  "type": "component",
  "label": "Configuration API",
  "summary": "Handles configuration read and update behavior.",
  "confidence": "observed",
  "status": "observed",
  "provenance": "analysis:anchor",
  "evidence": ["ENTRY-http-GET-/config"],
  "entry_points": [],
  "public_surface": [],
  "data_access": [],
  "tests": [],
  "unknowns": []
}
```

## Implementation

Implementation contains source identities:

```json
{
  "files": [{ "id": "FILE-src/config.ts", "path": "src/config.ts" }],
  "symbols": [{ "id": "SYM-src/config.ts#loadConfig", "file_id": "FILE-src/config.ts" }]
}
```

Implementation records never carry conceptual labels.

## Mappings

Mappings join conceptual elements to implementation:

```json
{
  "conceptual_id": "CMP-...",
  "implementation_id": "FILE-src/config.ts",
  "confidence": "observed",
  "evidence": ["ENTRY-http-GET-/config"],
  "provenance": "analysis:behavior-reachability"
}
```

A component can map to many files. A file can map to more than one component,
but the primary owner should be explicit and ambiguous mappings must be marked.

## Identity

| Prefix   | Kind                  | Stable key                             |
| -------- | --------------------- | -------------------------------------- |
| `SYS-`   | system                | project                                |
| `SUB-`   | subsystem             | behavior family                        |
| `CMP-`   | component             | sorted anchor keys                     |
| `IFACE-` | interface             | entry kind and stable key              |
| `DATA-`  | data store            | channel and stable target              |
| `EXT-`   | external system       | package or service                     |
| `FILE-`  | implementation file   | repository-relative path               |
| `SYM-`   | implementation symbol | file and qualified name                |
| `MAP-`   | mapping               | conceptual and implementation identity |
| `REQ-`   | observed behavior     | evidence key                           |
| `CON-`   | observed contract     | surface key                            |
| `VER-`   | verification record   | check or test key                      |
| `FLOW-`  | flow                  | entry point                            |
| `FIND-`  | finding               | rule and affected identity             |
| `EVD-`   | evidence              | input hashes and tool identity         |

Conceptual IDs do not depend on directory paths.

## Status

Conceptual records use:

- `observed`: supported by entry points, public surfaces, or direct behavior;
- `inferred`: derived from call/import reachability or clustering;
- `ambiguous`: multiple plausible owners or clusters;
- `unknown`: insufficient evidence.

There is no approval lifecycle. Generated output is evidence, not normative
intent.

## Relationships

Conceptual relationships:

| Relation           | Meaning                              |
| ------------------ | ------------------------------------ |
| `depends_on`       | Component or subsystem dependency    |
| `calls`            | Cross-component call                 |
| `exposes`          | Component exposes an interface       |
| `reads` / `writes` | Component data access                |
| `uses_external`    | Component uses an external system    |
| `realizes`         | Component realizes observed behavior |

Implementation relationships remain imports, calls, references, inheritance,
data access, and containment.

## Requirements

Generated behavior records link to conceptual components:

```json
{
  "id": "REQ-...",
  "kind": "observed_behavior",
  "title": "Analyze command",
  "component": "CMP-...",
  "entry_point": "ENTRY-cli-analyze",
  "evidence": [],
  "confidence": "observed",
  "status": "observed",
  "unknowns": []
}
```

## Contracts

Contract records link to interfaces and components. They describe observed
public surfaces, not compatibility approval.

## Verification

Verification records link tests and configured checks to behavior records,
interfaces, contracts, and conceptual components.

## Versioning

- Version 2 replaces the mixed conceptual/implementation architecture model.
- Readers reject unsupported major versions.
- The workbench refuses to render incompatible snapshots.
- Version 1 validation remains historical.
