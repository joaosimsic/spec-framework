# spec-framework

[![ci](https://github.com/joaosimsic/spec-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/joaosimsic/spec-framework/actions/workflows/ci.yml)

**Status: generated spec product.** The product analyzes a local
TypeScript/JavaScript repository and generates an evidence-bound spec:
architecture, observed behavior records, contracts, verification records,
functional flows, findings, snapshots, and an audit bundle. The workbench reads
generated output only.

Decision records [0016](docs/design-decisions/0016-generated-spec-product.md) and
[0017](docs/design-decisions/0017-behavior-derived-architecture.md) define the
product boundary. Curated LikeC4, StrictDoc, Quint, contract
sidecars, proposals, mapping curation, and `spec.lock` approval are retired.
Generated output never claims human-approved intent or complete runtime
behavior.

## What it does

- Scans registered local repository roots without executing code.
- Builds a language-neutral implementation graph: files, symbols, imports,
  calls, inheritance, entry points, and data access.
- Reconstructs a conceptual system from entry points, public surfaces, calls,
  data access, and external boundaries. Directories and files are implementation
  evidence.
- Generates observed behavior and contract records with source evidence.
- Generates verification targets from tests and configured checks, then records real `spec check` outcomes as derived runs.
- Traces bounded static flows from entry points to sources and sinks.
- Runs deterministic architectural diagnostics.
- Separates AI-assisted hypotheses from deterministic findings.
- Interprets observed contracts and failed checks only through explicit
  `spec interpret`.
- Stores analysis snapshots per commit in `.spec/analysis.sqlite`.
- Exports `spec/generated/spec.gen.json`.
- Serves the generated System, flows, findings, verification, interpretations,
  and evolution views in a local workbench.
- Produces a generated audit bundle.

It does not approve specifications, infer normative intent, prove formal
correctness, or reconstruct complete runtime behavior.

## What makes it different

- **Generated, not hand-maintained.** The workbench never reads a curated
  architecture file. Generated analysis is the source.
- **Evidence-bound.** Every node, edge, flow, contract, and finding carries
  provenance and confidence.
- **Uncertainty is visible.** Unresolved calls, missing tests, ambiguous edges,
  and limits are explicit.
- **Read-only analysis.** Analysis does not execute repository code.
- **Local-first.** SQLite and generated portable artifacts; no hosted service.
- **AI without authority.** AI may explain or hypothesize over evidence. It
  never approves, rejects, passes, or fails a check.
- **Non-web first.** CLI, library, file, queue, and network surfaces are
  first-class observations.

## Quick start

```bash
bun install
bun run build:workbench
bun run bin/spec.ts analyze
bun run bin/spec.ts workbench
```

Open the printed local URL. The workbench opens on the generated System view.

## CLI

```text
spec doctor [--fix] [--json]
spec analyze [--analysis-root <path>]... [--json]
spec generate [--json]
spec generated show <section> [--json]
spec projects [list|add <path>|remove <id>] [--json]
spec snapshots [list|show <id>|compare <from> <to>] [--json]
spec export [--json]
spec query [--json]
spec check [--json]
spec interpret [--kind contract|verification|all] [--json]
spec bundle [--output <dir>] [--force] [--json]
spec workbench [--host <host>] [--port <port>] [--allowed-origin <origin>]... [--analysis-root <path>]...
spec version
spec help
```

The retired commands `init`, `map`, `architecture generate`, `start`, `change`,
`refactor`, `next`, and `approve` are removed.

## Generated outputs

```text
.spec/analysis.sqlite
spec/generated/spec.gen.json
spec/generated/analysis.gen.json
spec/generated/verification.gen.json
spec/generated/interpretations.gen.json
spec/generated/architecture.gen.c4
spec/generated/requirements.gen.sdoc
spec/audit/
```

Inputs live in `spec-framework.json` at the repository root. `spec/` is
generated output and is ignored by Git. Do not hand-edit it.

## Configuration

The target root configuration file is `spec-framework.json`:

```json
{
  "version": 1,
  "project": { "name": "my-project" },
  "analysis": {
    "roots": ["."],
    "exclude": ["dist", "coverage"],
    "flow_analysis": true
  },
  "diagnostics": {
    "ARC-002": { "threshold": 12 },
    "ARC-003": { "threshold": 12 }
  },
  "ai": {
    "provider": "local"
  }
}
```

AI provider configuration lives outside the repository, normally at
`$XDG_CONFIG_HOME/spec-framework/ai.json` or `$SPEC_AI_CONFIG`. Remote providers
require explicit opt-in.

## Architecture

```text
Repository
  -> scanner
  -> TypeScript adapter
  -> common analysis IR
  -> generated architecture and observed contracts
  -> static flows
  -> deterministic diagnostics
  -> optional AI hypotheses
  -> SQLite snapshot
  -> spec.gen.json
  -> workbench and audit bundle
```

See:

- [Architecture overview](docs/architecture/overview.md)
- [Analysis engine](docs/architecture/analysis-engine.md)
- [Generated spec model](docs/architecture/spec-model.md)
- [Architecture graph](docs/architecture/architecture-graph.md)
- [Functional flows](docs/architecture/functional-flows.md)
- [Architectural diagnostics](docs/architecture/architectural-diagnostics.md)
- [System workspace](docs/workflow/system-workspace.md)
- [Architecture intelligence API](docs/api/architecture-intelligence-api.md)

## Verification

```bash
bun run format
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build:workbench
```

## Security

- Localhost-only workbench by default.
- Explicit analysis roots and canonical path containment.
- Read-only analysis; repository code is never executed.
- Secret and environment files are excluded from analysis and AI context.
- AI output is schema-validated against snapshot elements, files, and lines.
- No approval endpoint and no `spec.lock` write path.

See [Security](docs/security.md).
