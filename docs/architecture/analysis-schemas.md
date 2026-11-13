# Analysis schemas

All generated artifacts carry a `version`. Incompatible versions fail closed.

Status: version 2 is the target for behavior-derived architecture. Version 1
remains the implemented generated-spec contract until the migration lands.

## Input configuration

Path: `spec-framework.json`.

```json
{
  "version": 1,
  "project": { "name": "my-project" },
  "analysis": {
    "roots": ["."],
    "exclude": ["dist", "coverage"],
    "entry_points": { "include": [], "exclude": [] },
    "flow_analysis": true
  },
  "diagnostics": {
    "ARC-002": { "threshold": 12 },
    "ARC-003": { "threshold": 12 },
    "ARC-004": { "max_symbols": 40, "max_lines": 800 },
    "ARC-008": {
      "boundaries": [{ "from": "src/adapters/**", "forbid": ["src/workbench/**"] }]
    }
  },
  "checks": [],
  "ai": { "provider": "local" }
}
```

Inputs live outside `spec/`. No secrets in committed configuration.

## Generated spec artifact

Path: `spec/generated/spec.gen.json`.

```json
{
  "version": 2,
  "snapshot": {
    "id": "SNAP-...",
    "project_id": "PROJ-...",
    "commit": "a1b2c3d",
    "dirty": false,
    "analyzer_version": "1",
    "schema_version": 2
  },
  "project": {
    "id": "PROJ-...",
    "name": "my-project",
    "root": ".",
    "language": "typescript"
  },
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

Rules:

- generated output is sorted;
- no absolute paths;
- conceptual elements contain no file or directory nodes;
- implementation elements contain no conceptual labels;
- mappings are explicit and evidence-bound;
- no status is `approved`.

## Conceptual element

```json
{
  "id": "CMP-...",
  "type": "component",
  "label": "HTTP /config",
  "summary": "Handles configuration read and update behavior.",
  "confidence": "observed",
  "status": "observed",
  "provenance": "analysis:anchor",
  "evidence": ["ENTRY-http-GET-/config"],
  "entry_points": ["ENTRY-http-GET-/config"],
  "public_surface": [],
  "data_access": [],
  "tests": [],
  "unknowns": []
}
```

## Mapping

```json
{
  "id": "MAP-...",
  "conceptual_id": "CMP-...",
  "implementation_id": "FILE-src/config.ts",
  "confidence": "observed",
  "provenance": "analysis:behavior-reachability",
  "evidence": ["ENTRY-http-GET-/config"]
}
```

## Detailed analysis artifact

Path: `spec/generated/analysis.gen.json`.

Contains the IR details:

- files and hashes;
- modules, symbols, and references;
- imports, calls, inheritance, and data access;
- entry points;
- flows and steps;
- findings and evidence;
- coverage.

## Flow

```json
{
  "id": "FLOW-ENTRY-cli-bin/spec.ts",
  "entry_point_id": "ENTRY-cli-bin/spec.ts",
  "steps": [],
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
  "id": "FIND-ARC-001-...",
  "rule_id": "ARC-001",
  "family": "deterministic",
  "title": "Circular dependency detected",
  "severity": "warning",
  "status": "open",
  "affected_elements": [],
  "evidence": [],
  "explanation": "",
  "recommendation": "",
  "confidence": 1.0
}
```

Rules:

- `family` is `deterministic` or `ai_assisted`;
- AI findings include provider, model, prompt version, and input hashes;
- finding status is local review metadata;
- every affected element and evidence reference must exist;
- findings are never approval records.

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

`created_at` is metadata only.

## Versioning

- Version 1: directory-based architecture mixed with implementation.
- Version 2: behavior-derived conceptual architecture plus implementation
  mappings.
- Readers reject unknown major versions.
- Workbench refuses to render incompatible snapshots.
