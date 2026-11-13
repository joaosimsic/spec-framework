# 0001 — Compose existing tools

**Status:** accepted; extended by 0012
**Date:** 2026-11-10

> Decision 0012 extends this record with a separate generated implementation
> graph and analysis engine. That engine composes the TypeScript compiler and
> `bun:sqlite`; it does not introduce a new specification language.

## Context

The framework needs architecture validation, requirements traceability, formal verification, contract checks, readable audit output, and human approval. No single tool provides all of these.

Building a new specification language or document platform would duplicate mature parsers, renderers, model checkers, and traceability engines.

## Decision

Compose existing tools and build only the cross-layer glue:

- LikeC4 for architecture;
- StrictDoc for requirements and audit output;
- Quint for formal behavior;
- pluggable contract adapters;
- a small CLI for IDs, coverage, approval, change reports, and bundle assembly.

## Consequences

- Each layer can be replaced without rewriting the others.
- The optional semantic layer composes standard RDF/OWL/SKOS/SHACL tooling rather than a custom engine.
- The framework must maintain adapters and cross-layer checks.
- Tool versions must be pinned and provisioned reproducibly.
- The readable artifact is generated from multiple sources, so bundle assembly is a core capability.

## Alternatives rejected

- **Single custom tool:** too much duplicated functionality and risk.
- **Markdown-only workflow:** no structural verification.
- **Formal-only workflow:** no architecture, requirements, or audit management.
- **One vendor platform:** lock-in and insufficient non-web support.
