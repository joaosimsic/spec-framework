# Architectural diagnostics

Status: implemented.

## Purpose

Diagnostics identify potential architectural problems and make them reviewable
with evidence. They do not redesign the system and do not approve changes.

Two finding families remain distinct:

| Family                 | Source                       | Authority          |
| ---------------------- | ---------------------------- | ------------------ |
| Deterministic rule     | Graph, metrics, reachability | Reproducible check |
| AI-assisted hypothesis | Structured evidence plus AI  | Review candidate   |

Both appear in the findings panel. They never share an evidence class.

## Rule catalog

| ID      | Rule                            | Detection                                  | Family        |
| ------- | ------------------------------- | ------------------------------------------ | ------------- |
| ARC-001 | Circular module dependency      | Dependency graph cycle detection           | Deterministic |
| ARC-002 | High fan-in                     | Incoming edge count over threshold         | Deterministic |
| ARC-003 | High fan-out                    | Outgoing edge count over threshold         | Deterministic |
| ARC-004 | Large component                 | Size, symbol count, complexity metrics     | Deterministic |
| ARC-005 | Multiple responsibilities       | Responsibility classification              | AI-assisted   |
| ARC-006 | Duplicate functionality         | Similarity and semantic comparison         | AI-assisted   |
| ARC-007 | Unused code                     | Reference and reachability analysis        | Deterministic |
| ARC-008 | Dependency direction violation  | Configured boundary rules                  | Deterministic |
| ARC-009 | Excessive abstraction           | Indirection versus variation               | AI-assisted   |
| ARC-010 | Leaky abstraction               | Implementation details crossing boundaries | AI-assisted   |
| ARC-011 | Missing test coverage           | Test-to-code mapping                       | Deterministic |
| ARC-012 | Unclear architectural ownership | Unmapped or ambiguous mapping              | Deterministic |

The threshold rules are context-sensitive. Twenty dependencies are not
automatically a problem; role, size, complexity, and architecture matter.

## Finding model

```json
{
  "rule_id": "ARC-001",
  "title": "Circular dependency detected",
  "family": "deterministic",
  "severity": "warning",
  "affected_elements": ["module.orders", "module.inventory"],
  "evidence": [
    {
      "kind": "edge",
      "reference": "orders -> inventory",
      "file": "src/orders/index.ts",
      "line": 12
    }
  ],
  "explanation": "The two modules depend on each other.",
  "recommendation": "Investigate whether a shared interface or domain abstraction would clarify ownership.",
  "confidence": 1.0,
  "status": "open"
}
```

Statuses:

- `open`;
- `confirmed`;
- `rejected`;
- `needs_investigation`;
- `dismissed`.

Human decisions are persisted as annotations and never erased by re-analysis.

## Configuration

Rules are configured in `spec-framework.json`:

```json
{
  "version": 1,
  "diagnostics": {
    "ARC-002": { "threshold": 12 },
    "ARC-003": { "threshold": 12 },
    "ARC-004": { "max_symbols": 40, "max_lines": 800 },
    "ARC-008": {
      "boundaries": [{ "from": "src/adapters/**", "forbid": ["src/workbench/**"] }]
    }
  }
}
```

Invalid configuration fails closed with a diagnostic. No shell, no environment
expansion, no remote rule execution.

## Evidence

Every finding must reference:

- affected nodes;
- edges or source spans;
- analyzer and rule version;
- snapshot identity.

AI-assisted findings additionally record:

- provider and model;
- prompt version;
- input hashes;
- validated references;
- confidence.

## Human feedback

- Confirm: the finding is real.
- Reject: the finding is not a problem.
- Needs investigation: insufficient information.
- Annotate: add rationale or context.

These decisions become part of the architecture knowledge model and appear in
snapshot comparisons.

## Invariants

- No rule approval authority.
- No AI finding presented as deterministic.
- No finding without evidence.
- No invisible threshold changes.
- Re-analysis never silently deletes human decisions.
