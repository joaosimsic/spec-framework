# Discovery layer

## Purpose

The discovery layer turns an existing repository into a draft specification input. It never approves anything.

Implementation status: `spec map --draft` discovers generic package boundaries, TypeScript subsystems and file imports, and Rust workspace packages, writes a draft LikeC4 model, and reports gaps. `spec map --review` opens or resumes a mapping proposal, prints the area and relation confidence queues, and applies typed area and relation curation actions. `spec map --promote` promotes accepted areas into proposed LikeC4 elements, and `spec approve` hash-locks annotated architecture elements. `spec map --check` reports drift between approved architecture and the current discovery graph. Rustdoc item mapping and contract import are not implemented.

## Commands

| Command                 | Effect                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `spec init --existing`  | Detect project structure, write config, scaffold empty spec |
| `spec map --draft`      | Extract draft architecture and report confidence            |
| `spec map --review`     | Open or resume a mapping review and curate draft areas      |
| `spec map --promote`    | Promote accepted areas into proposed architecture           |
| `spec map --check`      | Compare approved architecture with current code graph       |
| `spec import-contracts` | Extract draft contract definitions                          |
| `spec gap`              | Report missing links, owners, contracts, and evidence       |

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

| Adapter         | Marker                                             |
| --------------- | -------------------------------------------------- |
| LikeC4          | `.c4` or `.likec4` files under `spec/architecture` |
| StrictDoc       | `.sdoc` or `.md` files under `spec/requirements`   |
| Quint           | `.qnt` files under `spec/formal`                   |
| JSON Schema     | `.schema.json` files under `spec/contracts`        |
| CLI             | `.snapshot.json` files under `spec/contracts/cli`  |
| Rust public API | `Cargo.toml` or Rust contract sidecars             |

An adapter can also be required explicitly in `spec/config.json` even when its sources are absent, in which case missing sources fail closed.

## TypeScript discovery

TypeScript discovery maps both subsystems and source files.

Inputs:

- production `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, and
  `.cjs` files under `src`, `bin`, `plugin`, and `scripts`;
- static imports, dynamic imports, and local re-exports.

Outputs:

- subsystem components such as `src/core` and `src/change`;
- file modules such as `src/change/operations.ts`;
- `part_of` links from files to subsystems;
- `depends_on` links between files for resolved local imports;
- aggregated `depends_on` links between subsystems;
- external package usage reported as gaps, not graph nodes.

Tests, docs, examples, generated directories, and dependency trees are excluded.
The graph is draft-only. It does not approve or promote the full repository
architecture.

## Rust discovery

Phase 1 adapter:

- `cargo metadata` for workspace, package, target, and dependency graph;
- rustdoc JSON for public items, signatures, and documentation;
- `cargo public-api` where available for API surface comparison;
- `cargo-semver-checks` evidence for compatibility.

Mapping:

| Rust concept              | Draft spec element                |
| ------------------------- | --------------------------------- |
| workspace                 | `SYS-` or `SYS-` subsystem        |
| package/crate             | `CMP-`                            |
| binary target             | entry point                       |
| library public type/trait | `CON-` language API               |
| workspace dependency      | `depends_on` relation             |
| feature flag              | optional capability, draft        |
| rustdoc documentation     | rationale with `code:` provenance |

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
  "links": [{ "type": "part_of", "to": "SYS-SPEC-FRAMEWORK" }]
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

## Interactive review

`spec map --review` opens or resumes the [workbench](../workflow/workbench.md)
or equivalent terminal review over the same draft graph.

- Confidence and provenance become plain-language review prompts.
- The queue supports `accept`, `reject`, `accept-relation`, `reject-relation`,
  `rename`, `merge`, `split`, `set-owner`, `set-responsibility`,
  `set-boundary`, and `open-question` actions through repeatable
  `--action <json|file>` values.
- Inferred, ambiguous, and unknown relations enter a relation queue. Accepting
  one records human provenance and marks it observed; rejecting one removes it
  from the draft.
- Each action is recorded in `spec/proposals/<slug>.mapping.json` against the
  review snapshot on a same-worktree branch.
- `spec/generated/draft.gen.c4` is regenerated for inspection. The review
  never writes `spec/architecture/model.c4`, `spec/spec.lock`, or approval state.
- Default interaction uses names; technical details reveal IDs and provenance.
- The review never approves. A human approves an explicit scope through the CLI.

A static mapping report remains available as an export. It is not the mapping
workflow.

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
- approved relations vs discovered relations;
- approved content hashes vs the current architecture sources.

Findings are reported as:

- `missing-in-spec`: discovered element inside the approved scope;
- `missing-in-code`: approved element absent from discovery;
- `changed-relation`: approved-endpoint relation differs;
- `changed-approval`: approved architecture content changed.

Contract-drift and code-annotation checks remain future work because contract
import and code annotation mapping are not implemented. Drift does not modify
the approved model.

## Non-goals

- Full semantic call graphs for every language.
- Runtime topology discovery.
- Automatic requirement extraction.
- Automatic capability, ontology, or verification-plan inference.
- Automatic approval.
- Replacing language compilers or build systems.
