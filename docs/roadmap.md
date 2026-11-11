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

Status: in progress. Core CLI, `spec init`, `spec doctor`, structural checks, generic and Rust draft discovery via `spec map --draft`, human approval with a hash lock for SDoc requirements and acceptance criteria, the deterministic `spec bundle` audit output, the LikeC4 validation adapter, the StrictDoc requirements adapter, the Quint formal adapter (typecheck plus verify), and the JSON Schema, CLI, and Rust public API contract adapters plus the compiler preflight adapter are implemented. Adapters activate automatically from detected sources or language markers, or explicitly from config.

Build one end-to-end path:

- TypeScript/Bun CLI compiled to a single binary;
- `spec init`, `spec init --existing`;
- `spec doctor`, `spec doctor --fix`;
- structural checks over SDoc;
- human approval: `spec approve` hash-locks proposed SDoc requirement and acceptance records plus native evidence; approval writes evidence artifacts under `spec/evidence/`;
- LikeC4 adapter: validation with hashed evidence; views and MCP pending;
- StrictDoc adapter: validation with hashed evidence; traceability, HTML/PDF pending;
- Quint adapter: typecheck plus Apalache verify wired into `spec check` with per-module evidence; native view embedding pending;
- contract adapters: JSON Schema, CLI snapshots, and Rust public API wired into `spec check` with compatibility evidence;
- compiler preflight adapter: configured build/typecheck commands with deterministic diagnostics and hashed evidence;
- generic and Rust discovery and `spec map --draft`;
- deterministic audit bundle with HTML, PDF, manifest, graph, sources, evidence, and change report;
- `spec check`, `spec change`, `spec bundle`, `spec approve`;
- agent skill, commands, permissions;
- self-hosting: spec-framework specifies and maps itself.

Exit criteria:

- existing repo initialized without source changes;
- one requirement flows to a Quint property, model check, evidence, approval, and bundle;
- one contract adapter produces compatibility evidence;
- evidence is hashed into `spec.lock` and stored deterministically under `spec/evidence/`;
- audit bundle is reproducible PDF + HTML;
- approval invalidation works;
- default agent cannot edit approved specs;
- self-hosted bundle exists.

## Phase 1.5 — Interactive use-case paths

Status: in progress. The deterministic graph builder and read-only
`spec query` identity and experience views are implemented over SDoc records,
annotated LikeC4 architecture elements, annotated Quint modules and properties,
contract sidecars, and evidence. The presentation projection with opaque refs is
implemented. The proposal engine core, same-worktree proposal branches, and
typed operations `rename`, `deprecate`, `replace`, `split`, `merge`, `extract`,
`move`, and `change-contract` are implemented. Change reports include
deterministic impact analysis over the graph, invalidated evidence, approvals to
renew, and open questions. The `spec refactor` alias is implemented and warns
when no approved baseline exists. Refactor before/after simulation is
implemented from a baseline graph snapshot captured at proposal open; `spec
refactor` enables it by default and `spec change` accepts `--simulate`. Formal
source collection is implemented. The scratch-mode entry `spec start`, the
mapping-review entry `spec map --review`, and area-level and relation-level
interactive mapping curation are implemented, as is named-scope approval that
resolves visible requirement titles to identity; the workbench and plugin
remain. Decision record
[0011](design-decisions/0011-interactive-use-case-modes.md) fixes the model.

- unified spec graph and deterministic graph builder (SDoc, architecture,
  formal, contract, and evidence collectors implemented);
- presentation projection with names, plain-language state, and opaque refs
  (implemented);
- proposal engine with typed operations and same-worktree proposal branches
  (all Phase 1.5 operations implemented);
- typed change impact over the unified SDoc, architecture, formal, and contract
  graph (implemented);
- formal source collector (implemented);
- `spec start` and `spec map --review` (implemented);
- React/Vite workbench for scratch, mapping, and refactor;
- terminal interactive paths for the same modes;
- opencode plugin as both a standalone package and a local self-hosting loader;
- interactive mapping curation over the area and relation confidence queues
  (area and relation decisions implemented);
- refactor before/after simulation and named impact (implemented);
- technical-details surface for IDs, hashes, provenance, and diagnostics;
- named-scope approval that resolves to internal identity (implemented);
- no approval path and no `spec/spec.lock` write from any interactive surface.

Exit criteria:

- one graph powers CLI, workbench, and plugin context;
- a human completes mapping curation without reading an internal ID;
- a refactor preview lists affected named requirements, contracts, checks,
  evidence, and approvals;
- the plugin cannot approve or edit `spec.lock`;
- the audit bundle keeps full identity and hashes.

## Phase 2 — Adapters, semantic model, and verification

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
- optional mutation of approved content or approval over MCP and Explorer behind
  a separate decision;
- evaluation on real projects.

## Self-hosting milestones

1. Scaffold spec-framework with its own full profile.
2. Map its modules with generic discovery.
3. Approve its architecture.
4. Generate its own audit bundle.
5. Use the framework for every subsequent change.
6. Use `spec map --check` for drift.

## Risks

| Risk                                         | Mitigation                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Tool provisioning friction                   | `spec doctor --fix`, pinned runners, exact fallbacks                            |
| StrictDoc embedding of LikeC4/Quint          | Phase 1 spike; Typst/Pandoc fallback                                            |
| Full-stack CI cost                           | cache, parallelize, structural preflight                                        |
| LLM formal quality                           | mandatory checker loop; human review                                            |
| Compiler preflight mistaken for conformance  | explicit scope; separate evidence from formal and contract checks               |
| Semantic layer toolchain drift               | optional activation; pinned local vocabularies; deterministic adapter           |
| SHACL treated as proof of behavior           | explicit scope; keep semantic, formal, and conformance evidence separate        |
| Interactive surface becomes an approval path | proposal-only writes; no approval tool; hash-locked approval remains CLI-only   |
| Internal IDs leak into normal interaction    | experience projection, opaque refs, default-output leak tests                   |
| Chat invents certainty or decisions          | every accepted decision recorded; explicit open questions; no unverified claims |
| Plugin API drift                             | one compatibility adapter; target the installed opencode API first              |
| Multi-repo pin drift                         | explicit composition, pins, admission, and recorded baseline                    |
| Non-Rust conformance                         | generic trace adapter; explicit waivers until supported                         |
| Self-hosting exposes gaps                    | intentional; fix before external adoption                                       |

## Non-goals for Phase 1

- Code-level proofs.
- Every language and protocol.
- Hosted service.
- A hosted or multi-user workbench. The Phase 1.5 workbench is local and
  proposal-only.
- Mutation of approved content or approval over any interactive surface.
- Multi-repository workspaces before Phase 3.
- Replacing existing build systems.
- Automatic requirement extraction from code.
