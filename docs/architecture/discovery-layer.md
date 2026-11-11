# Discovery layer

## Purpose

The discovery layer turns an existing repository into a draft specification input. It never approves anything.

## Commands

| Command | Effect |
|---|---|
| `spec init --existing` | Detect project structure, write config, scaffold empty spec |
| `spec map --draft` | Extract draft architecture and report confidence |
| `spec map --check` | Compare approved architecture with current code graph |
| `spec import-contracts` | Extract draft contract definitions |
| `spec gap` | Report missing links, owners, contracts, and evidence |

## Generic discovery

Generic discovery is language-agnostic and always available.

Inputs:

- directory tree;
- package manifests (`package.json`, `Cargo.toml`, `composer.json`, `go.mod`, `pyproject.toml`);
- workspace manifests;
- conventional build files;
- documentation files;
- existing spec files.

Outputs:

- draft components from workspace/package boundaries;
- draft relations from manifest dependencies and directory nesting;
- draft data stores from declared databases or file-format packages when observable;
- confidence and provenance for each element.

Generic discovery does not parse arbitrary source code into a call graph. That would produce false confidence and duplicate language tooling.

## Adapter activation

Native adapters activate automatically from source markers:

| Adapter | Marker |
|---|---|
| LikeC4 | `.c4` or `.likec4` files under `spec/architecture` |
| StrictDoc | `.sdoc` or `.md` files under `spec/requirements` |
| Quint | `.qnt` files under `spec/formal` |
| JSON Schema | `.schema.json` files under `spec/contracts` |
| CLI | `.snapshot.json` files under `spec/contracts/cli` |
| Rust public API | `Cargo.toml` or Rust contract sidecars |

An adapter can also be required explicitly in `spec/config.json` even when its sources are absent, in which case missing sources fail closed.

## Rust discovery

Phase 1 adapter:

- `cargo metadata` for workspace, package, target, and dependency graph;
- rustdoc JSON for public items, signatures, and documentation;
- `cargo public-api` where available for API surface comparison;
- `cargo-semver-checks` evidence for compatibility.

Mapping:

| Rust concept | Draft spec element |
|---|---|
| workspace | `SYS-` or `SYS-` subsystem |
| package/crate | `CMP-` |
| binary target | entry point |
| library public type/trait | `CON-` language API |
| workspace dependency | `depends_on` relation |
| feature flag | optional capability, draft |
| rustdoc documentation | rationale with `code:` provenance |

The adapter does not infer runtime topology, ownership, or requirements.

## Draft output

Draft elements use the same IDs and schema as approved elements, with:

- `status: draft`;
- `provenance: code:<tool>` or `doc:<path>`;
- `confidence: observed | inferred | ambiguous | unknown`;
- no approval hash.

Example fragment:

```json
{
  "id": "CMP-SPEC-CORE",
  "kind": "component",
  "title": "spec core",
  "status": "draft",
  "provenance": "code:cargo metadata#spec-core",
  "confidence": "observed",
  "links": [
    { "type": "part_of", "to": "SYS-SPEC-FRAMEWORK" }
  ]
}
```

## Mapping report

The report lists:

- elements created;
- relations created;
- low-confidence elements;
- components without owners or responsibilities;
- external boundaries without contracts;
- requirement links that do not resolve;
- code elements absent from the approved model;
- approved elements absent from code.

The report is included in the audit bundle until the draft is resolved.

## Human curation

The human must:

- rename components to domain language;
- define responsibilities and boundaries;
- remove accidental implementation boundaries;
- add missing ownership;
- decide ambiguous grouping;
- approve or reject inferred relations;
- record unknowns for behavior that code cannot answer.

## Drift

`spec map --check` compares:

- approved LikeC4 elements vs discovered elements;
- approved dependency relations vs discovered dependencies;
- contract references vs observed public APIs;
- code annotations referencing approved IDs vs actual code.

Findings are reported as:

- `missing-in-spec`;
- `missing-in-code`;
- `changed-contract`;
- `stale-evidence`.

Drift does not modify the approved model.

## Non-goals

- Full semantic call graphs for every language.
- Runtime topology discovery.
- Automatic requirement extraction.
- Automatic approval.
- Replacing language compilers or build systems.
