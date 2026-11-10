# Tooling

## Core

| Component | Choice | Notes |
|---|---|---|
| CLI | TypeScript + Bun | Compiled to a single binary for release |
| Architecture | LikeC4 | Model API, validation, views, MCP |
| Requirements | StrictDoc | SDoc validation, traceability, HTML/PDF |
| Formal | Quint | Typecheck, simulator, model checking |
| Model checker | Apalache (or TLC) | Invoked by Quint |
| Contracts | adapters | JSON Schema, CLI, Rust public API in Phase 1 |
| PDF | StrictDoc HTML2PDF | Fallback: Typst/Pandoc assembly |
| Provisioning | `spec doctor --fix` | Nix, container, or local runners |

## Version pinning

- `spec/toolchain.lock.json` records exact versions.
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
- no expired waivers or blocking unknowns.

## Local development

- `spec check --structural` gives fast feedback without native tools.
- `spec doctor` explains missing capabilities.
- `spec bundle --allow-dirty` is for local preview only.
- Full approval requires a clean tree and full checks.

## Repository layout produced by init

```text
spec/
  config.yaml
  architecture/
  requirements/
  formal/
  contracts/
  evidence/        generated, ignored by default
  questions/
  unknowns/
  waivers/
  proposals/
  toolchain.lock.json
  spec.lock
.opencode/         project-local agent config
AGENTS.md
```

## Supported platforms

Phase 1 targets Linux. macOS support follows once provisioning is stable. Windows is not a Phase 1 target.

## Failure policy

- Missing required tool: fail the affected check.
- Native validator failure: fail.
- Formal property failure: fail and attach counterexample.
- Contract incompatibility: fail and attach diff.
- Expired waiver: fail.
- Dirty tree during bundle: fail unless explicitly overridden.
- Hand-edited generated artifact: fail.
