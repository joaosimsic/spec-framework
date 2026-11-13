# Tooling

## Core

| Component        | Choice                              | Notes                                                     |
| ---------------- | ----------------------------------- | --------------------------------------------------------- |
| CLI              | TypeScript + Bun                    | Runs source directly and ships a bin entry                |
| Analysis         | TypeScript compiler API             | Files, symbols, calls, imports, entry points, data access |
| Persistence      | `bun:sqlite`                        | Local snapshots and jobs                                  |
| Generated spec   | JSON                                | Canonical `spec/generated/spec.gen.json`                  |
| Workbench        | React/Vite                          | Generated-only review surface                             |
| Graph            | d3-force and canvas/SVG             | System expansion and flow highlighting                    |
| Diagnostics      | TypeScript rules                    | Deterministic findings                                    |
| AI               | Optional OpenAI-compatible provider | Evidence-bound and schema-validated                       |
| Audit            | Generated HTML/PDF/JSON             | No approval lock                                          |
| Optional exports | LikeC4, StrictDoc, JSON Schema      | Generated output only                                     |

## Required commands

```bash
bun install
bun run build:workbench
bun run bin/spec.ts analyze
bun run bin/spec.ts workbench
```

## Optional tools

- Node/Bun test runner for project tests;
- configured build or typecheck commands;
- PDF renderer for the audit bundle;
- local OpenAI-compatible endpoint for AI hypotheses.

LikeC4, StrictDoc, and Quint are no longer required spec inputs. They may be
used as optional renderers or external checkers.

## CI

```bash
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build:workbench
bun run bin/spec.ts analyze
bun run bin/spec.ts check
```

CI should verify:

- generated artifacts reproduce deterministically;
- no generated file is hand-edited;
- no workbench route reads curated spec sources;
- no approval path exists;
- secrets are excluded;
- schema versions are compatible.

## Repository layout

```text
spec-framework.json       committed input configuration
.spec/analysis.sqlite     local disposable snapshot database
spec/generated/           generated output
spec/audit/               generated audit bundle
src/                      implementation
tests/                    tests
```

Generated output is not source.

## Failure policy

- Missing repository root: fail.
- Unreadable source file: finding or warning.
- Compiler program failure: analysis failure.
- Unresolved call: finding or unknown, not a guessed edge.
- Missing optional external checker: unknown, not silent pass.
- Incompatible generated schema: refuse to render.
- AI invalid reference: reject output.
