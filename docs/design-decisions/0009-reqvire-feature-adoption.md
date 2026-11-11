# 0009 — Reqvire feature adoption

**Status:** accepted
**Date:** 2026-11-11

## Context

[Reqvire](https://github.com/reqvire-org/reqvire) is the closest existing project
to this framework. It is a Git-native semantic engineering framework with
ontologies, capabilities, requirements, contracts, verification plans, evidence,
typed change impact, a CLI, an Explorer UI, and MCP access.

Reqvire covers features this framework does not yet model: ontologies, concept
schemes, semantic contracts, capabilities, verification planning, a unified
query surface, an Explorer, and multi-repository workspaces. It also differs
architecturally: it builds one custom Rust semantic model, while this framework
composes LikeC4, StrictDoc, Quint, and contract adapters and adds a hash-locked
approval layer.

The goal is feature completeness without discarding the framework's principles.

## Decision

Adopt Reqvire's capability areas selectively. Model each area in this
framework's terms and compose standard tools where possible. Do not copy
Reqvire's implementation or weaken the framework's approval and formal
verification model.

Adopt in the model documentation now:

- capabilities (`CAP-*`);
- ontologies, concept schemes, concepts, and semantic contracts
  (`ONTO-*`, `VOC-*`, `CONCEPT-*`, `SCON-*`);
- verification objectives and verification cases (`VOBJ-*`, `VER-*`);
- requirement-owned contracts and contract bindings;
- typed change impact across every modeled layer;
- a read-only unified graph query and MCP interface;
- a read-only local Explorer;
- an optional multi-repository workspace model.

Defer implementation:

- multi-repository workspaces and branch contexts to Phase 3;
- model migration and versioning to Phase 3;
- mutation-enabled MCP and Explorer tools until a separate decision accepts the
  trust and approval implications;
- a full ontology authoring UI.

Reject:

- a single custom semantic engine replacing the composed tools;
- workflow-only approval that is not hash-locked;
- an Explorer or MCP mutation path that can approve or edit approved content;
- fetching mutable remote vocabularies during verification;
- replacing LikeC4, StrictDoc, Quint, or contract adapters with a proprietary
  model.

## Feature map

| Reqvire capability                             | This framework's treatment                                                               | Phase |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| Ontologies, OWL/Turtle, external vocabularies  | Optional semantic layer using RDF 1.1, OWL 2, SKOS, and SHACL                            | 2     |
| Concept schemes and curated concepts           | Concept schemes and concepts inside the semantic layer                                   | 2     |
| Semantic contracts and SHACL constraints       | `SCON-*` elements that constrain requirements and contracts                              | 2     |
| Capabilities                                   | `CAP-*` elements in the spec model and LikeC4 mapping                                    | 2     |
| Requirement-owned contracts and bindings       | Contract sections and cross-subgraph bindings                                            | 2     |
| Verification objectives and methods            | `VOBJ-*` and `VER-*` elements over test, formal, analysis, inspection, and demonstration | 2     |
| Typed change impact                            | Cross-layer impact traversal and report                                                  | 2     |
| Unified graph query and MCP                    | Read-only query CLI, MCP resources/tools/prompts, skills                                 | 2     |
| Explorer UI                                    | Read-only local Explorer                                                                 | 2     |
| Multi-repository workspace and branch contexts | Manifest, pins, admission, cross-repo impact                                             | 3     |
| Model migration and lint repair                | Versioned model lifecycle                                                                | 3     |
| Mutation-enabled authoring over MCP/Explorer   | Deferred behind a separate decision                                                      | 3+    |

## Consequences

- The spec model grows by seven element kinds and several relations. The
  question matrix and coverage rules must grow with it.
- The optional semantic layer introduces RDF, OWL, SKOS, and SHACL tooling. It
  must stay inactive unless sources or config activate it.
- The audit bundle must show capabilities, semantic constraints, verification
  methods, and cross-layer impact.
- The agent interface becomes a first-class read-only surface. It must never
  become an approval or mutation path by accident.
- The Explorer is a review aid, not the source of truth or an approval record.
- Documentation for these capabilities does not imply implementation. The
  roadmap and README must state the phase of each capability.
- The framework keeps its differentiators: executable formal models, hash-locked
  approval, non-web-first contracts, and deterministic audit bundles.

## Alternatives

- **Copy Reqvire wholesale:** fast feature list, but discards composition,
  hash-locked approval, and the existing formal layer.
- **Stay narrower:** less work, but leaves capabilities, semantic constraints,
  verification planning, query, and Explorer unmodeled.
- **Adopt only ontology features:** creates a semantic island disconnected from
  capabilities and verification.
- **Build a custom unified model:** duplicates parsers, validators, and
  renderers and contradicts decision 0001.
