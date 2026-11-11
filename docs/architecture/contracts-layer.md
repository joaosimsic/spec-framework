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

| Boundary              | Default source                              | Compatibility check   |
| --------------------- | ------------------------------------------- | --------------------- |
| Rust public API       | rustdoc JSON, `cargo public-api`            | `cargo-semver-checks` |
| TypeScript public API | `api-extractor`                             | API report diff       |
| PHP public API        | PHPStan, Roave backward-compatibility check | tool report           |
| JSON data             | JSON Schema                                 | schema diff           |
| CUE data              | CUE definitions                             | `cue vet` and diff    |
| CBOR/binary data      | CDDL                                        | schema diff           |
| Protobuf              | `.proto`                                    | `buf breaking`        |
| CLI                   | help/exit/stream snapshots                  | snapshot diff         |
| Events                | AsyncAPI or schema adapter                  | schema diff           |
| Hardware              | manual or SystemRDL/IP-XACT adapter         | manual review         |

The Phase 1 adapters are JSON Schema, CLI, and Rust public API. Other adapters follow.

## Requirement-owned contracts

A requirement can own structured contract sections:

- source contracts;
- specifications;
- behavioral contracts;
- state models;
- input/output contracts;
- constraints.

These sections make the obligation precise while remaining in the requirement's
native source. The defining requirement owns the contract. Another requirement
can reuse it through a `Contract Bindings` section; binding adds obligation
context but does not transfer ownership.

The framework checks:

- every binding resolves to a contract owned by an existing requirement;
- the bound contract is compatible with the consuming requirement;
- a bound contract's change invalidates the consumer's compatibility evidence;
- a requirement-owned contract without an owner or compatibility policy cannot
  be approved.

## Semantic contracts

A semantic contract (`SCON-*`) is an ontology-plane SHACL profile. It is
different from a requirement-owned contract:

- `CON-*` describes an implementation-facing boundary;
- `SCON-*` constrains vocabulary, shape, or data through ontology terms;
- `CON-*` can be constrained by `SCON-*`;
- `SCON-*` does not replace a contract adapter or compatibility evidence.

A semantic contract declares the terms it uses, the obligations it constrains,
its severity, and its owner. SHACL validation produces semantic evidence. A
blocking violation blocks approval of linked requirements or contracts.

See [semantic layer](semantic-layer.md) and
[decision 0010](../design-decisions/0010-optional-semantic-layer.md).

## Language APIs

For a Rust library:

- the public API is extracted from rustdoc JSON;
- breaking changes are checked with `cargo-semver-checks`;
- the audit bundle includes the public API report and compatibility verdict;
- in-process contracts do not require an IDL.

Rust contracts live in `spec/contracts/rust/*.contract.json` and declare `id`, `owner`, `consumers`, `compatibility`, `package`, optional `manifest`, and a `baseline` containing one of `version`, `rev`, or `root`. The adapter runs `cargo public-api`, compares the normalized surface against `spec/contracts/.baselines/<name>.rust-public-api.sha256`, and runs `cargo-semver-checks` for non-`none` compatibility.

The language compiler remains the source of truth for types. The framework records the surface and its compatibility evidence.

## Compiler overlap

The compiler preflight adapter is separate from the contracts layer. Preflight answers whether the implementation builds and typechecks under a configured command. It does not extract a public surface, declare a compatibility policy, or approve a contract.

Contract adapters consume compiler-derived artifacts where possible:

- rustdoc JSON and `cargo public-api` for Rust;
- compiler or API-extractor reports for TypeScript;
- tool reports for PHP.

A green compiler preflight is never compatibility evidence. A public API change can compile cleanly and still break consumers.

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

## Evidence and invalidation

Contract evidence records:

- contract ID and adapter;
- input and baseline hashes;
- tool versions;
- compatibility verdict;
- semantic validation result when `SCON-*` applies.

Changing the contract, its consumers, its baseline, or a linked semantic
contract invalidates compatibility evidence. An incompatible contract blocks
approval of every requirement that uses or binds it.

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
- Treating a SHACL profile as a full implementation contract.
- Letting a contract binding transfer ownership away from the defining requirement.
