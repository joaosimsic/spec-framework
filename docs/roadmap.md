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

Status: in progress. Core CLI, `spec init`, `spec doctor`, structural checks, generic and Rust draft discovery via `spec map --draft`, human approval with a hash lock for SDoc requirements and acceptance criteria, the LikeC4 validation adapter, the StrictDoc requirements adapter, the Quint formal adapter (typecheck plus verify), and the JSON Schema, CLI, and Rust public API contract adapters plus the compiler preflight adapter are implemented. Adapters activate automatically from detected sources or language markers, or explicitly from config.

Build one end-to-end path:

- TypeScript/Bun CLI compiled to a single binary;
- `spec init`, `spec init --existing`;
- `spec doctor`, `spec doctor --fix`;
- structural checks over SDoc;
- human approval: `spec approve` hash-locks proposed SDoc requirement and acceptance records; evidence hashes pending;
- LikeC4 adapter: validation; views and MCP pending;
- StrictDoc adapter: validation done; traceability, HTML/PDF pending;
- Quint adapter: typecheck plus Apalache verify wired into `spec check`; evidence bundle pending;
- contract adapters: JSON Schema, CLI snapshots, and Rust public API wired into `spec check` with compatibility evidence;
- compiler preflight adapter: configured build/typecheck commands with deterministic diagnostics; evidence hashing pending;
- generic and Rust discovery and `spec map --draft`;
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

## Phase 2 — Adapters, semantic model, and review surface

- capability model (`CAP-*`) and coverage;
- verification objectives and cases (`VOBJ-*`, `VER-*`);
- optional RDF/OWL/SKOS/SHACL semantic layer and adapter;
- requirement-owned contracts and cross-subgraph bindings;
- TypeScript and PHP discovery;
- TypeScript and PHP public API contracts;
- Protobuf/CDDL contract adapters;
- generic conformance trace replay;
- improved cross-layer change impact analysis;
- read-only unified graph query and MCP server;
- read-only local Explorer;
- agent skills for authoring, audit, and impact;
- CI templates;
- packaging and release binaries;
- macOS support.

Exit criteria:

- a capability flows to requirements, verification cases, evidence, and
  coverage;
- one semantic contract validates requirements and produces hashed evidence;
- the read-only query and MCP interfaces return the same graph;
- the Explorer displays the validated model without editing it;
- change impact crosses capability, semantic, verification, and contract links.

## Phase 3 — Scale

- monorepo and multi-repo workspaces with branch contexts;
- cross-repository change impact;
- versioned migration and model lifecycle;
- multiple approval roles;
- policy profiles;
- richer drift detection;
- formal tool alternatives (TLA+, Alloy) as evidence adapters;
- optional mutation-enabled MCP and Explorer behind a separate decision;
- evaluation on real projects.

## Self-hosting milestones

1. Scaffold spec-framework with its own full profile.
2. Map its modules with generic discovery.
3. Approve its architecture.
4. Generate its own audit bundle.
5. Use the framework for every subsequent change.
6. Use `spec map --check` for drift.

## Risks

| Risk                                        | Mitigation                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tool provisioning friction                  | `spec doctor --fix`, pinned runners, exact fallbacks                                 |
| StrictDoc embedding of LikeC4/Quint         | Phase 1 spike; Typst/Pandoc fallback                                                 |
| Full-stack CI cost                          | cache, parallelize, structural preflight                                             |
| LLM formal quality                          | mandatory checker loop; human review                                                 |
| Compiler preflight mistaken for conformance | explicit scope; separate evidence from formal and contract checks                    |
| Semantic layer toolchain drift              | optional activation; pinned local vocabularies; deterministic adapter                |
| SHACL treated as proof of behavior          | explicit scope; keep semantic, formal, and conformance evidence separate             |
| Explorer or MCP becomes an approval path    | read-only default; separate mutation decision; hash-locked approval remains CLI-only |
| Multi-repo pin drift                        | explicit composition, pins, admission, and recorded baseline                         |
| Non-Rust conformance                        | generic trace adapter; explicit waivers until supported                              |
| Self-hosting exposes gaps                   | intentional; fix before external adoption                                            |

## Non-goals for Phase 1

- Code-level proofs.
- Every language and protocol.
- Hosted service.
- Web UI. The Phase 2 Explorer is a local read-only review surface, not a hosted or editing UI.
- Mutation-enabled MCP or Explorer.
- Multi-repository workspaces before Phase 3.
- Replacing existing build systems.
- Automatic requirement extraction from code.
