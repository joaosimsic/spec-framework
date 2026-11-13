# Tooling

## Core

| Component                | Choice                                  | Notes                                          |
| ------------------------ | --------------------------------------- | ---------------------------------------------- |
| CLI                      | TypeScript + Bun                        | Compiled to a single binary for release        |
| Architecture             | LikeC4                                  | Model API, validation, views                   |
| Capabilities             | LikeC4 custom kind plus capability lint | Hierarchy, requirement derivation, coverage    |
| Requirements             | StrictDoc                               | SDoc validation, traceability, HTML/PDF        |
| Semantic                 | RDF/OWL/SKOS/SHACL adapter              | Optional; pinned external vocabularies; SPARQL |
| Verification plan        | Structured verification sources         | Objectives, methods, cases, coverage           |
| Formal                   | Quint                                   | Typecheck, simulator, model checking           |
| Query                    | Read-only graph query                   | Stable JSON and presentation projection        |
| Analysis                 | TypeScript compiler and `bun:sqlite`    | Files, symbols, calls, entry points, snapshots |
| System workspace         | React/Vite workbench                    | Primary human surface; read-only over intent   |
| Model checker            | Apalache (or TLC)                       | Invoked by Quint                               |
| Implementation preflight | project compiler or build tool          | Configured commands; no shell                  |
| Contracts                | adapters                                | JSON Schema, CLI, Rust public API in Phase 1   |
| PDF                      | StrictDoc HTML2PDF                      | Fallback: Typst/Pandoc assembly                |
| Provisioning             | `spec doctor --fix`                     | Project-local Bun and uv runners               |

## Version pinning

- `spec/toolchain.lock.json` records exact versions.
- Semantic RDF/SHACL tools are pinned when the optional layer is active.
- CI does not resolve floating versions.
- The audit manifest records tool versions and command lines.
- Upgrades are explicit changes with re-verification.

## Provisioning preference

1. Project-local tool directory using Bun and uv runners.
2. Nix flake, when available.
3. Pinned container image.
4. Exact instructions printed by `spec doctor`.

No global installation by default.

## Commands

```bash
spec init [--existing]
spec doctor [--fix]
spec check [--structural]
spec map [--draft|--review|--promote|--check]
spec change "<direction>" [--op <json|file>]
spec change --op <json|file>
spec change --status
spec refactor "<direction>" [--op <json|file>]
spec review
spec bundle [--allow-dirty] [--output <dir>] [--force] [--json]
spec approve [--scope <name>]... [ids...] [--technical]
spec query --json
spec semantic validate|graph|query|export
spec migrate [--fix]
spec lint [--fix]
spec enable <adapter>
spec disable <adapter>
```

## CI

Minimum CI steps:

```bash
spec doctor
spec check
spec bundle
```

CI also verifies:

- `spec.lock` matches current content;
- generated artifacts were not hand-edited;
- no plaintext secrets;
- default agent cannot write approved specs;
- no expired waivers or blocking unknowns;
- semantic sources are pinned when the layer is active;
- capability and verification coverage gates pass;
- query, analysis, and the System workspace remain read-only.

## Local development

- `spec check --structural` gives fast feedback without native tools.
- `spec check` will run compiler preflight before the other native checks (planned).
- `spec doctor` explains missing capabilities known to the framework; arbitrary compiler commands fail at check time.
- `spec bundle` writes `spec/audit/audit-<short-commit>` by default; use `--output` for another destination and `--force` to replace an existing bundle directory.
- `spec bundle --allow-dirty` is for local preview only and marks the manifest as a preview.
- The System workspace is a read-only review aid over intent and generated
  implementation evidence.
- `bun run mvp` runs the self-host pilot slice in a temporary worktree. See
  [self-host MVP](mvp.md).
- Full approval requires a clean tree and full checks.

## Repository layout produced by init

```text
spec/
  config.json
  architecture/
  capabilities/
  requirements/
  semantic/
  verification/
  formal/
  contracts/
  implementation/  optional compile.json preflight commands
  evidence/        generated, ignored by default
  questions/
  unknowns/
  waivers/
  proposals/
  generated/         generated analysis and architecture output
  toolchain.lock.json
  spec.lock
.opencode/         project-local agent config
AGENTS.md
```

## Supported platforms

The current baseline targets Linux. macOS and Windows are not scheduled targets.

## Failure policy

- Missing required tool: fail the affected check.
- Missing configured compiler or build executable: fail.
- Compiler preflight failure: fail.
- Native validator failure: fail.
- Semantic validation or blocking SHACL violation: fail.
- Verification objective or case without required evidence: fail.
- Capability without requirement or verification coverage: fail.
- Formal property failure: fail and attach counterexample.
- Contract incompatibility: fail and attach diff.
- Expired waiver: fail.
- Dirty tree during bundle: fail unless explicitly overridden.
- Hand-edited generated artifact: fail.
