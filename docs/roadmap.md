# Roadmap

## Phase 0 — Design and repository

Status: complete.

- public repository with extensive design docs;
- decision records;
- glossary and references;
- example non-web specification;
- persistence in the personal project store.

Exit criteria: docs complete, repository public, decisions recorded.

## Phase 1 — Full-stack vertical slice

Status: in progress. Core CLI, `spec init`, `spec doctor`, and structural checks are implemented.

Build one end-to-end path:

- TypeScript/Bun CLI compiled to a single binary;
- `spec init`, `spec init --existing`;
- `spec doctor`, `spec doctor --fix`;
- structural checks over SDoc;
- LikeC4 adapter: validation, views, MCP;
- StrictDoc adapter: validation, traceability, HTML/PDF;
- Quint adapter: typecheck, Apalache verify, evidence;
- contract adapters: JSON Schema, CLI, Rust public API;
- generic and Rust discovery; `spec map --draft`;
- `spec check`, `spec change`, `spec bundle`, `spec approve`;
- agent skill, commands, permissions;
- self-hosting: spec-framework specifies and maps itself.

Exit criteria:

- existing repo initialized without source changes;
- one requirement flows to a Quint property, model check, evidence, approval, and bundle;
- one contract adapter produces compatibility evidence;
- audit bundle is reproducible PDF + HTML;
- approval invalidation works;
- default agent cannot edit approved specs;
- self-hosted bundle exists.

## Phase 2 — Adapters and hardening

- TypeScript and PHP discovery;
- TypeScript and PHP public API contracts;
- Protobuf/CDDL contract adapters;
- generic conformance trace replay;
- improved change impact analysis;
- CI templates;
- packaging and release binaries;
- macOS support.

## Phase 3 — Scale

- monorepo and multi-repo workspaces;
- multiple approval roles;
- policy profiles;
- richer drift detection;
- formal tool alternatives (TLA+, Alloy) as evidence adapters;
- evaluation on real projects;
- versioned migration of framework artifacts.

## Self-hosting milestones

1. Scaffold spec-framework with its own full profile.
2. Map its modules with generic discovery.
3. Approve its architecture.
4. Generate its own audit bundle.
5. Use the framework for every subsequent change.
6. Use `spec map --check` for drift.

## Risks

| Risk | Mitigation |
|---|---|
| Tool provisioning friction | `spec doctor --fix`, pinned runners, exact fallbacks |
| StrictDoc embedding of LikeC4/Quint | Phase 1 spike; Typst/Pandoc fallback |
| Full-stack CI cost | cache, parallelize, structural preflight |
| LLM formal quality | mandatory checker loop; human review |
| Non-Rust conformance | generic trace adapter; explicit waivers until supported |
| Self-hosting exposes gaps | intentional; fix before external adoption |

## Non-goals for Phase 1

- Code-level proofs.
- Every language and protocol.
- Hosted service.
- Web UI.
- Replacing existing build systems.
- Automatic requirement extraction from code.
