# Architecture overview

The architecture intelligence direction adds a generated implementation graph,
conceptual-to-code mapping, static functional flows, diagnostics, and a
workbench System view. Intent and approval layers remain unchanged. See the
[Architecture intelligence roadmap](../roadmap/architecture-intelligence.md)
and decision record [0012](../design-decisions/0012-architecture-intelligence.md).

## Three graphs

The platform keeps three graphs distinct:

| Graph                | Source                                                  | Authority                           |
| -------------------- | ------------------------------------------------------- | ----------------------------------- |
| Intent graph         | LikeC4, requirements, capabilities, contracts, approval | Human-approved                      |
| Implementation graph | Scanner, TypeScript adapter, SQLite snapshots           | Generated evidence                  |
| Mapping layer        | Sidecar selectors plus generated suggestions            | Curated or inferred, never approved |

The workbench reads one projection over all three. It never merges them into one
unqualified truth. The implementation graph is evidence; the intent graph is
authority; the mapping layer is the explicit join between them.

## Intent pipeline

```mermaid
flowchart TB
    subgraph Sources
        A[LikeC4 architecture]
        G[Capability model]
        B[StrictDoc requirements]
        C[Quint formal models]
        D[Contract adapters]
        M[Semantic sources]
        W[Verification plan]
        I[Implementation sources]
    end
    subgraph Deterministic checks
        L[spec-lint]
        V[likec4 validate]
        S[strictdoc export/check]
        Q[quint typecheck/verify]
        P[adapter checks]
        Y[semantic validate/SHACL]
        Z[coverage and impact]
        X[compiler/build preflight]
    end
    subgraph Outputs
        E[Evidence]
        K[spec.lock]
        U[Audit bundle PDF+HTML]
        R[Change report]
        J[Read-only graph query]
    end
    A --> V
    B --> S
    C --> Q
    D --> P
    M --> Y
    G --> Z
    W --> Z
    I --> X
    V --> L
    S --> L
    Q --> L
    P --> L
    Y --> L
    X --> L
    L --> Z
    Z --> E
    E --> K
    E --> U
    A --> U
    B --> U
    C --> U
    D --> U
    M --> U
    G --> U
    W --> U
    I --> U
    L --> R
    L --> J
```

## Sources of truth

| Concern                                          | Source                                          | Authority                                 |
| ------------------------------------------------ | ----------------------------------------------- | ----------------------------------------- |
| Systems, components, relations                   | LikeC4 model                                    | Architecture linter and human review      |
| Capabilities and capability hierarchy            | Capability model linked to LikeC4 and StrictDoc | Capability lint and human review          |
| Requirements, acceptance criteria, traceability  | StrictDoc documents                             | StrictDoc validation and spec-lint        |
| Ontologies, concepts, semantic contracts         | RDF/OWL/SKOS/SHACL sources                      | Semantic adapter and SHACL validation     |
| Verification objectives and methods              | Verification plan linked to requirements        | Coverage and evidence checks              |
| Behavior, invariants, temporal properties        | Quint modules                                   | Quint type checker and model checker      |
| Implementation syntax, types, and build state    | Compiler or build tool                          | Compiler preflight adapter                |
| Files, symbols, calls, entry points, data access | TypeScript analysis IR and SQLite snapshots     | Generated evidence; never approved        |
| Conceptual-to-code mapping                       | Mapping sidecar plus generated suggestions      | Curated or inferred; separate approval    |
| Language APIs                                    | Language toolchain output                       | Contract adapter                          |
| Data formats                                     | JSON Schema, CUE, CDDL, or Protobuf             | Contract adapter                          |
| CLI behavior                                     | Help snapshots and contract tests               | Contract adapter                          |
| Wire protocols                                   | Protobuf, CDDL, or protocol schema              | Contract adapter                          |
| Approval                                         | `spec.lock` plus signed tag                     | Human                                     |
| Readable output                                  | Generated audit bundle                          | Deterministic renderer                    |
| Agent access                                     | Read-only `spec query` and opencode plugin      | Stable query contract                     |
| Review surface                                   | System workspace                                | Projection over intent, evidence, mapping |
| Interactive planning                             | Workbench and opencode plugin                   | Proposal branch, never approved content   |

No layer owns the whole truth. Links between layers are stable IDs. The glue ensures the graph is closed: every reference resolves and every required relation exists.

## Interaction surfaces

The graph is consumed through a presentation projection and opaque refs.
Humans see names, summaries, plain-language state, and named open questions.
Tools and audit artifacts keep the full identity. See
[presentation and internal identity](../ux/presentation.md).

| Surface          | Can read                            | Can write                    | Can approve |
| ---------------- | ----------------------------------- | ---------------------------- | ----------- |
| CLI/terminal     | Full graph and analysis projections | Proposals through the engine | Human only  |
| System workspace | Intent, implementation, and mapping | Proposal branch only         | No          |
| opencode plugin  | Scoped context pack                 | Proposals through tools      | No          |
| Audit bundle     | Validated intent model              | Nothing; generated artifact  | No          |

## ID flow

```mermaid
flowchart LR
    CAP[CAP-SESSION-MANAGEMENT] --> REQ[REQ-AUTH-001]
    REQ --> CMP[CMP-AUTH]
    CMP --> IFC[IFC-AUTH-TOKEN]
    REQ --> PROP[PROP-AUTH-EXPIRY]
    PROP --> MOD[MOD-AUTH]
    CON[CON-AUTH-TOKEN] -.->|uses| SCON[SCON-AUTH-TOKEN]
    SCON -.->|constrains| REQ
    REQ --> AC[AC-AUTH-001]
    VOBJ[VOBJ-AUTH] --> VER[VER-AUTH-EXPIRY]
    VER --> PROP
    VER --> AC
    AC --> EVD[EVD-...]
    CMP --> SYS[SYS-APP]
    CMP --> DAT[DAT-SESSION]
    CONCEPT[CONCEPT-SESSION] -.->|maps_to| SCON
```

- Capabilities anchor requirements and verification objectives.
- Requirements reference capabilities, components, contracts, and formal properties.
- Components reference systems and interfaces.
- Interfaces reference contracts.
- Contracts can be constrained by semantic contracts built on ontology terms.
- Formal properties reference Quint modules and evidence.
- Verification objectives group verification cases across capabilities and requirements.
- Verification cases reference methods, targets, properties, contracts, and evidence.
- Acceptance criteria reference evidence.
- Evidence references hashes of inputs and tool versions.

## Pipeline

1. **Collect** sources: LikeC4 export, capability model, StrictDoc JSON export, Quint metadata, semantic graph, verification plan, compiler output, adapter output.
2. **Validate** each source with its native tool, starting with compiler preflight.
3. **Link** entities by ID and check cross-layer rules.
4. **Verify** formal properties, conformance tests, semantic constraints, and planned verification cases; store evidence.
5. **Gate** on unapproved changes, unanswered questions, expired waivers, missing links, uncovered capabilities, and unverified obligations.
6. **Render** the audit bundle, change report, display graph, and proposal views.
7. **Approve** specific element hashes; update `spec.lock`.

## Implementation pipeline

1. **Scan** a registered repository root, respecting `.gitignore`, exclusions,
   and symlink containment.
2. **Analyze** TypeScript files into the common analysis IR: files, symbols,
   imports, references, calls, entry points, and data access.
3. **Persist** deterministic snapshots in local SQLite and export generated JSON.
4. **Reconstruct** architecture and compute mapping coverage from code facts.
5. **Trace** static functional flows from entry points to sources, sinks, and
   outputs.
6. **Diagnose** deterministic architectural rules and separate AI-assisted
   hypotheses.
7. **Project** the System workspace from intent, implementation, and mapping
   without merging their provenance.

Analysis is read-only and never executes repository code.

## Deterministic versus probabilistic

| Deterministic                            | Probabilistic                         |
| ---------------------------------------- | ------------------------------------- |
| LikeC4 validation                        | Requirement drafting                  |
| Capability coverage and hierarchy checks | Capability proposals                  |
| StrictDoc grammar and traceability       | Architecture proposals                |
| Semantic validation and SHACL checks     | Ontology and vocabulary drafting      |
| Quint type checking and model checking   | Formal model drafting                 |
| Verification plan coverage checks        | Verification strategy drafting        |
| Compiler and build preflight             | Source review and requirement mapping |
| Contract adapters                        | Contract drafting                     |
| Scanner, IR, call graph, and flows       | Responsibility hypotheses             |
| Deterministic architectural diagnostics  | Architecture smell hypotheses         |
| ID, coverage, and impact lint            | Rationale text                        |
| Audit bundle rendering                   | Change summaries                      |
| Read-only graph queries                  | Explanation and prioritization        |
| Approval hash checks                     | Interview questions                   |

The probabilistic side accelerates authoring and interpretation. It never
provides a pass verdict.

## Failure behavior

- A missing native tool fails the pipeline; no silent skip.
- A missing semantic tool fails the pipeline only when the semantic layer is active.
- A failing compiler preflight fails the pipeline; it is not a conformance verdict.
- A missing optional adapter is reported as a gap.
- A blocking semantic violation blocks approval of the linked element.
- A failing formal property blocks approval of the linked requirement.
- A verification case without evidence blocks approval of the linked obligation.
- A query, analysis, or System workspace failure does not change validation or
  approval state.
- A failed analysis run never deletes the last successful snapshot or mutates
  approved intent.
- An unapproved content change invalidates prior approval.
- A dirty git tree fails bundle generation unless explicitly allowed for local preview.
- Generated artifacts never overwrite sources.

## Extensibility

New project types are supported by adding contract adapters and, if necessary, element kinds. The optional semantic adapter adds vocabulary and SHACL constraints without changing the core. The core does not encode HTTP, Rust, or any specific architecture style. The default metamodel is a starting point, not a constraint.
