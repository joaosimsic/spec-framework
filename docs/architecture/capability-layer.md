# Capability layer

> Status: unscheduled intent-model design. Capability tooling is not
> implemented and is not part of the current architecture intelligence
> direction. See decision [0015](../design-decisions/0015-retire-legacy-roadmap-and-explorer.md).

## Purpose

Capabilities describe what the system can do, independent of how it is built.
They are stable semantic anchors between ontology, requirements, architecture,
and verification.

Capabilities are optional. A project without capability sources still validates,
but it cannot report capability coverage.

## Element kind

| Prefix | Kind       | Purpose                                  |
| ------ | ---------- | ---------------------------------------- |
| `CAP-` | Capability | A coherent operational or system ability |

A capability has the standard element fields:

- stable `CAP-*` ID;
- title;
- status;
- provenance;
- owner;
- rationale;
- typed links.

IDs are stable and never reused.

## Hierarchy

Capabilities support decomposition:

```text
CAP-IDENTITY
  ├─ CAP-AUTHENTICATION
  │   ├─ CAP-SESSION-MANAGEMENT
  │   └─ CAP-CREDENTIAL-REVOCATION
  └─ CAP-AUTHORIZATION
```

Relations:

- `part_of` connects a capability to a system or parent capability;
- `refines` connects a capability to the capability it details;
- `derives_from` connects a requirement to the capability it implements;
- `realizes` connects a component to the capability it supports;
- `targets` connects a verification objective to a capability.

A capability without a parent system or parent capability is an orphan unless it
is explicitly marked as a root.

## Semantic context

A capability can carry optional context sections:

- stakeholder needs;
- product features;
- operational context;
- mission objectives;
- regulatory drivers.

These sections add readable context. They do not create new graph node kinds.
If a context item becomes normative or needs verification, it becomes a
requirement or an explicit unknown.

## Mapping to architecture

LikeC4 can represent capabilities as a custom element kind. The mapping is
documentation-level, not ownership. A capability can span several components;
a component can realize several capabilities.

The framework checks:

- every implementation requirement derives from a capability or is explicitly
  marked as infrastructure;
- every capability has at least one requirement, verification objective, or
  explicit unknown;
- capability decompositions do not contain cycles;
- capability IDs do not collide with component IDs.

## Mapping to requirements

Requirements carry an optional `CAPABILITY` field. A requirement may derive
from more than one capability only when the obligation genuinely spans them.

Rules:

- a requirement derives from at most one primary capability;
- secondary capability links are allowed but must be explicit;
- a capability without a requirement is a coverage gap;
- a requirement without a capability needs a waiver or an infrastructure
  marker.

## Coverage

Capability coverage reports:

- capabilities with no requirements;
- capabilities with no verification objective;
- requirements with no capability link;
- capabilities with no owner;
- capability hierarchies with cycles or missing parents;
- capabilities that exist only in the glossary or prose.

Coverage is reported in the audit bundle and the change report.

## Change impact

Changing a capability affects:

- derived requirements;
- components that realize it;
- verification objectives that target it;
- semantic contracts that constrain it;
- approvals and evidence linked through those elements.

The impact report shows the chain before any implementation change.

## Non-goals

- Replacing requirements with capability prose.
- Mapping every code module to a capability.
- Using capabilities as a second architecture model.
- Treating a capability as verified without linked requirements and evidence.
