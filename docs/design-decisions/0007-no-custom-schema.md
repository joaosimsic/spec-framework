# 0007 — No custom specification schema

**Status:** accepted; extended by 0012
**Date:** 2026-11-10

> Decision 0012 adds versioned analysis JSON contracts for the generated
> implementation graph. These are evidence schemas, not a replacement
> specification language. The native LikeC4, StrictDoc, Quint, and contract
> formats remain authoritative for intent.

## Context

An earlier design proposed a custom typed YAML graph for architecture, requirements, behavior, and contracts. That would duplicate existing tools and create a new language to maintain.

## Decision

Do not define a new specification language. Use the native formats of LikeC4, StrictDoc, Quint, and contract adapters. The framework owns only:

- stable ID conventions;
- cross-layer link rules;
- status and provenance conventions;
- approval hashes;
- coverage and consistency checks;
- bundle assembly.

## Consequences

- Less custom code and fewer proprietary concepts.
- Each layer benefits from its tool's ecosystem and validators.
- Cross-layer checks must parse or import native formats.
- The framework's value is the glue and the audit model, not a new syntax.
- The optional semantic layer uses RDF, OWL, SKOS, and SHACL, not a custom schema. See decision 0010.

## Alternatives

- **Custom YAML graph:** full control, high maintenance, weak tooling.
- **Custom DSL:** even higher cost and no ecosystem.
- **Single tool:** not available.
