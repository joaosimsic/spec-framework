# Analysis schemas

Status: planned.

All analysis artifacts carry a `version`. Incompatible versions fail closed with
a diagnostic.

## Mapping sidecar

Path: `spec/implementation/mapping.json`.

```json
{
  "version": 1,
  "mappings": [
    {
      "element": "CMP-SPEC-CHANGE",
      "selectors": ["src/change/"],
      "confidence": "observed",
      "provenance": "human:maintainer@2026-11-13"
    }
  ]
}
```

Rules:

- `element` must resolve to an intent element.
- `selectors` must be non-empty.
- selectors must resolve or be reported as stale.
- confidence is `observed`, `inferred`, `ambiguous`, or `unknown`.
- provenance is required.

## Entry points

Path: `spec/implementation/entrypoints.json`.

```json
{
  "version": 1,
  "include": [{ "kind": "cli", "path": "bin/spec.ts" }],
  "exclude": [{ "path": "scripts/experimental.ts" }]
}
```

Rules:

- include and exclude are optional arrays.
- path is repository-relative.
- kind is informational.
- explicit exclude wins over heuristics.

## Generated analysis artifact

Path: `spec/generated/analysis.gen.json`.

```json
{
  "version": 1,
  "snapshot": {
    "id": "SNAP-...",
    "commit": "a1b2c3d",
    "dirty": false,
    "analyzer": "typescript",
    "analyzer_version": "1",
    "schema_version": 1
  },
  "nodes": [],
  "edges": [],
  "flows": [],
  "findings": [],
  "coverage": {
    "mapped": [],
    "partial": [],
    "unmapped": [],
    "unassigned": [],
    "stale": []
  }
}
```

Nodes and edges use the implementation graph contract from
[Architecture graph](architecture-graph.md). Output is sorted and contains no
absolute paths.

## Flow

```json
{
  "id": "FLOW-...",
  "entry_point": {
    "id": "ENTRY-CLI-bin/spec.ts",
    "kind": "cli",
    "label": "spec CLI"
  },
  "steps": [
    {
      "node_id": "SYM-src/cli.ts#main",
      "file": "src/cli.ts",
      "line": 1240,
      "resolution": "resolved",
      "confidence": "observed"
    }
  ],
  "sources": [],
  "sinks": [],
  "returns": [],
  "errors": [],
  "evidence": "static",
  "confidence": "inferred",
  "unknowns": [],
  "limits_reached": []
}
```

## Finding

```json
{
  "id": "FIND-...",
  "rule_id": "ARC-001",
  "family": "deterministic",
  "title": "Circular dependency detected",
  "severity": "warning",
  "status": "open",
  "affected_elements": ["module.orders", "module.inventory"],
  "evidence": [],
  "explanation": "",
  "recommendation": "",
  "confidence": 1.0
}
```

Rules:

- `family` is `deterministic` or `ai_assisted`.
- AI findings include provider, model, prompt version, and input hashes.
- `status` is `open`, `confirmed`, `rejected`, `needs_investigation`, or
  `dismissed`.
- every affected element and evidence reference must exist.

## Snapshot summary

```json
{
  "id": "SNAP-...",
  "project_id": "PROJ-...",
  "commit": "a1b2c3d",
  "analyzer_version": "1",
  "rule_version": "1",
  "node_count": 0,
  "edge_count": 0,
  "flow_count": 0,
  "finding_count": 0,
  "created_at": "2026-11-13T00:00:00Z"
}
```

`created_at` is metadata only. It is not part of deterministic comparison.

## API envelopes

Success:

```json
{
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "error": {
    "code": "ANALYSIS-NOT-FOUND",
    "message": "analysis snapshot unavailable",
    "details": {}
  }
}
```

Errors never include stack traces, secrets, or absolute paths.

## Versioning

- Additive fields increment no version.
- Removed or changed semantics increment the version.
- Readers reject unknown major versions.
- Generated artifacts record the schema version used to write them.
- The workbench refuses to render an incompatible snapshot with a clear state.
