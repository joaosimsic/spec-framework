# Tooling

## Core

| Component                | Choice                                  | Notes                                          |
| ------------------------ | --------------------------------------- | ---------------------------------------------- |
| CLI                      | TypeScript + Bun                        | Compiled to a single binary for release        |
| Architecture             | LikeC4                                  | Model API, validation, views, MCP              |
| Capabilities             | LikeC4 custom kind plus capability lint | Hierarchy, requirement derivation, coverage    |
| Requirements             | StrictDoc                               | SDoc validation, traceability, HTML/PDF        |
| Semantic                 | RDF/OWL/SKOS/SHACL adapter              | Optional; pinned external vocabularies; SPARQL |
| Verification plan        | Structured verification sources         | Objectives, methods, cases, coverage           |
| Formal                   | Quint                                   | Typecheck, simulator, model checking           |
| Query and MCP            | Read-only graph query and MCP server    | Stable JSON, resources, tools, prompts         |
| Explorer                 | Local read-only UI                      | Review aid, not source of truth                |
| Model checker            | Apalache (or TLC)                       | Invoked by Quint                               |
| Implementation preflight | project compiler or build tool          | Configured commands; no shell; planned         |
| Contracts                | adapters                                | JSON Schema, CLI, Rust public API in Phase 1   |
| PDF                      | StrictDoc HTML2PDF                      | Fallback: Typst/Pandoc assembly                |
| Provisioning             | `spec doctor --fix`                     | Nix, container, or local runners               |

## Version pinning

- `spec/toolchain.lock.json` records exact versions.
- Semantic RDF/SHACL tools are pinned when the optional layer is active.
- CI does not resolve floating versions.
- The audit manifest records tool versions and command lines.
- Upgrades are explicit changes with re-verification.

## Provisioning preference

1. Nix flake, when available.
2. Pinned container image.
3. Project-local tool directory using Bun/Python/Java runners.
4. Exact instructions printed by `spec doctor`.

No global installation by default.

## Commands

```bash
spec init [--existing]
spec doctor [--fix]
spec check [--structural]
spec map [--draft|--check]
spec change "<direction>"
spec review
spec bundle
spec approve <ids...>
spec query --json
spec semantic validate|graph|query|export
spec serve
spec mcp
spec workspace status|add|remove|sync|freeze
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
- query, MCP, and Explorer remain read-only.

## Local development

- `spec check --structural` gives fast feedback without native tools.
- `spec check` will run compiler preflight before the other native checks (planned).
- `spec doctor` explains missing capabilities known to the framework; arbitrary compiler commands fail at check time.
- `spec bundle --allow-dirty` is for local preview only.
- `spec serve` and `spec mcp` are read-only review aids.
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
  workspace.toml     optional multi-repo composition
  toolchain.lock.json
  spec.lock
.opencode/         project-local agent config
AGENTS.md
```

## Supported platforms

Phase 1 targets Linux. macOS support follows once provisioning is stable. Windows is not a Phase 1 target.

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
