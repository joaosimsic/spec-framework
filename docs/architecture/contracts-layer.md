# Contracts layer

## Purpose

The contracts layer types every boundary that crosses a component or trust boundary. It is not HTTP-specific.

A contract is one of:

- a language API;
- a data schema or file format;
- a CLI surface;
- a wire protocol;
- a hardware interface;
- an event schema.

## Adapter interface

Every adapter implements:

```ts
interface ContractAdapter {
  id: string
  discover(): Promise<ContractCandidate[]>
  validate(contract: Contract): Promise<ValidationResult>
  exportDocs(contract: Contract): Promise<DocFragment[]>
  compare?(before: Contract, after: Contract): Promise<CompatibilityResult>
  evidence(): Promise<Evidence>
}
```

Rules:

- adapters activate when their language or sources are detected, or when listed explicitly in `spec/config.json`;
- inactive adapters do not run and do not require their tools;
- adapters never approve contracts;
- adapters record tool versions and input hashes;
- adapters fail closed;
- adapters do not fetch mutable remote schemas at verification time;
- adapter output is deterministic.

## Boundary kinds

| Boundary | Default source | Compatibility check |
|---|---|---|
| Rust public API | rustdoc JSON, `cargo public-api` | `cargo-semver-checks` |
| TypeScript public API | `api-extractor` | API report diff |
| PHP public API | PHPStan, Roave backward-compatibility check | tool report |
| JSON data | JSON Schema | schema diff |
| CUE data | CUE definitions | `cue vet` and diff |
| CBOR/binary data | CDDL | schema diff |
| Protobuf | `.proto` | `buf breaking` |
| CLI | help/exit/stream snapshots | snapshot diff |
| Events | AsyncAPI or schema adapter | schema diff |
| Hardware | manual or SystemRDL/IP-XACT adapter | manual review |

The Phase 1 adapters are JSON Schema, CLI, and Rust public API. Other adapters follow.

## Language APIs

For a Rust library:

- the public API is extracted from rustdoc JSON;
- breaking changes are checked with `cargo-semver-checks`;
- the audit bundle includes the public API report and compatibility verdict;
- in-process contracts do not require an IDL.

Rust contracts live in `spec/contracts/rust/*.contract.json` and declare `id`, `owner`, `consumers`, `compatibility`, `package`, optional `manifest`, and a `baseline` containing one of `version`, `rev`, or `root`. The adapter runs `cargo public-api`, compares the normalized surface against `spec/contracts/.baselines/<name>.rust-public-api.sha256`, and runs `cargo-semver-checks` for non-`none` compatibility.

The language compiler remains the source of truth for types. The framework records the surface and its compatibility evidence.

## Data and file formats

JSON Schema is the default data contract because it is language-neutral and widely supported.

Alternatives:

- CUE for configuration and constraint-heavy data;
- CDDL for CBOR and compact binary formats;
- Protobuf for IPC and strongly typed wire data;
- FlatBuffers for zero-copy formats.

Each format has an adapter. The framework does not convert between formats by default.

## CLI contracts

CLI contracts are often the primary interface for non-web tools. The adapter records:

- command tree;
- flags and arguments;
- defaults;
- exit codes;
- stdout/stderr schemas where applicable;
- machine-readable output schema.

Evidence is generated from snapshots and contract tests.

## Wire protocols

- Protobuf uses `buf` lint and breaking-change checks.
- Event schemas can use AsyncAPI when the event model is HTTP-independent.
- Custom binary protocols use CDDL or a dedicated adapter.
- Protocol behavior is formalized in Quint, not in the schema.

## Hardware interfaces

Phase 1 treats hardware contracts as manual or document-linked. Future adapters may read SystemRDL or IP-XACT. The contract record still carries:

- registers or messages;
- units and ranges;
- timing assumptions;
- error behavior;
- provenance;
- evidence.

## Compatibility policy

Each contract declares:

- versioning scheme;
- compatibility promise (`none`, `backward`, `forward`, `full`);
- deprecation window;
- owner;
- consumers.

A contract without a compatibility policy cannot be approved.

## Example evidence

```json
{
  "contract": "CON-CLI-001",
  "adapter": "cli",
  "tool": "snapshot",
  "input_hash": "sha256:...",
  "result": "compatible",
  "details": {
    "commands_added": [],
    "commands_removed": [],
    "flags_changed": []
  }
}
```

## Non-goals

- Forcing every project through OpenAPI.
- Replacing language type systems with an IDL.
- Generating implementations from contracts.
- Guaranteeing semantic compatibility from syntax alone.
