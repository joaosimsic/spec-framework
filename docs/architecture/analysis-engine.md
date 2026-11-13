# Analysis engine

Status: planned.

## Purpose

The analysis engine turns a registered repository into a language-neutral
intermediate representation (IR) that downstream layers can trust.

It answers:

- what files and symbols exist;
- how modules and symbols reference each other;
- which calls are statically resolvable;
- where entry points enter the system;
- which data sources and sinks are observable.

It does not answer intent, approval, or complete runtime behavior.

## Pipeline

```mermaid
flowchart LR
    ROOT[Registered repository] --> SCAN[Scanner]
    SCAN --> LANG[Language registry]
    LANG --> ADP[Language adapter]
    ADP --> IR[Common IR]
    IR --> RES[Symbol resolver]
    RES --> DEP[Dependency and call graph]
    DEP --> STORE[SQLite snapshot]
    STORE --> JSON[Generated JSON]
```

## Scanner

The scanner is language-agnostic.

Inputs:

- registered repository root;
- `.gitignore` and explicit exclusions;
- file hashes and metadata.

Rules:

- never traverse outside the registered root;
- resolve or reject symlinks safely;
- exclude `node_modules`, `dist`, `build`, `coverage`, `.spec`, generated output;
- exclude secrets and environment files from analysis and AI context;
- hash file content for incremental analysis;
- record language, size, line count, and modification time.

The scanner never executes repository code.

## Language adapter contract

Every adapter implements the same interface:

```ts
interface LanguageAdapter {
  id: string
  detect(target: string): Promise<boolean>
  discover(target: string, files: ScannedFile[]): Promise<AdapterResult>
  parse(file: ScannedFile): Promise<ParseResult>
  extractSymbols(tree: ParseResult): Promise<SymbolRecord[]>
  extractImports(tree: ParseResult): Promise<ImportRecord[]>
  extractCalls(tree: ParseResult): Promise<CallRecord[]>
  extractInheritance(tree: ParseResult): Promise<InheritanceRecord[]>
  extractInterfaces(tree: ParseResult): Promise<InterfaceRecord[]>
}
```

Adapters return IR only. Language-specific syntax never leaks into the
architecture model.

### Syntax versus semantics

Tree-sitter or regex can identify a call syntactically. Resolving which
implementation is invoked requires type information and symbol indexes.

Every call edge records:

- `resolved`: static target exists;
- `ambiguous`: multiple candidate targets;
- `unresolved`: target cannot be determined;
- `external`: target is outside the repository.

The UI must show this distinction.

## Common IR

An IR element contains:

| Field                     | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `id`                      | Stable identity: language, file, qualified name                            |
| `type`                    | module, class, interface, function, method, property, constant, type, enum |
| `language`                | Adapter identifier                                                         |
| `name`                    | Short name                                                                 |
| `qualified_name`          | Language-qualified name                                                    |
| `file_path`               | Repository-relative path                                                   |
| `start_line` / `end_line` | Source span                                                                |
| `parent_id`               | Containing module or type                                                  |
| `signature`               | Human-readable signature where available                                   |
| `visibility`              | public, protected, private, internal                                       |
| `exported`                | Whether the symbol is exported                                             |
| `references`              | Resolved references                                                        |
| `calls`                   | Resolved, ambiguous, unresolved, external calls                            |
| `imports`                 | Import edges                                                               |
| `inheritance`             | Extends and implements edges                                               |
| `data_access`             | Read, write, source, and sink records                                      |
| `confidence`              | observed, inferred, ambiguous, unknown                                     |
| `provenance`              | Adapter and file location                                                  |

IDs must not depend on line numbers. Line numbers are attributes and may change.

## TypeScript adapter

The first adapter uses the TypeScript compiler API.

- build a program from the nearest `tsconfig.json`;
- fall back to explicit compiler options when no tsconfig exists;
- include production roots such as `src`, `bin`, `plugin`, `scripts`;
- exclude tests, docs, examples, generated output, and dependencies;
- extract modules, classes, interfaces, functions, methods, properties, and
  constants;
- resolve local references with the type checker;
- extract call targets only when statically resolvable;
- detect entry points: `package.json` bin, shebangs, exported library API, HTTP
  route registrations, and CLI dispatch;
- classify data access for filesystem, network, environment, database, queue,
  and standard streams.

## Uncertainty

The engine must make incompleteness visible.

- Unresolved calls are findings, not invented edges.
- Ambiguous references carry confidence.
- Dynamic imports and runtime dispatch are marked unknown.
- External packages become external edges or gaps, not internal symbols.
- Partial analysis never claims full behavioral coverage.

## Determinism

- sort nodes, edges, and findings;
- use repository-relative paths;
- record analyzer and compiler versions;
- hash source inputs;
- avoid timestamps in generated artifacts except analysis metadata;
- bound output size and analysis depth.

## Storage

- SQLite: `.spec/analysis.sqlite`.
- Portable output: `spec/generated/analysis.gen.json`.
- Snapshot key: Git commit plus analyzer version.
- Migrations: versioned under `src/persistence/migrations/`.

Deleting the database is safe. Re-analysis rebuilds it.

## Tests

- adapter detection;
- file scanning and exclusions;
- symlink and path traversal;
- IR identity stability;
- symbol and method extraction;
- import and call resolution;
- entry point detection;
- data access classification;
- deterministic output;
- fixture repositories.

## Non-goals

- analyzing every language in the first release;
- complete runtime reconstruction;
- executing repository code;
- inferring intent or approval;
- replacing compilers or build systems.
