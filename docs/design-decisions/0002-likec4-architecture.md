# 0002 — LikeC4 for architecture

Status: superseded by [0016](0016-generated-spec-product.md). LikeC4 is an optional export.
**Status:** accepted
**Date:** 2026-11-10

## Context

The architecture layer must support non-web systems, typed relations, custom element kinds, generated views, validation, and agent access.

## Decision

Use LikeC4 as the architecture source.

## Consequences

- Architecture is a validated graph, not hand-drawn diagrams.
- Views are generated from the model.
- Custom kinds cover crates, modules, processes, devices, and protocols.
- The MCP server gives agents structured access.
- The framework must export LikeC4 views into the audit bundle.

## Alternatives

- **Structurizr:** strict C4 model and MCP support, but less flexible for non-web and custom kinds.
- **SysML v2:** standards-based and richer, but heavier tooling and weaker agent integration.
- **Mermaid/D2:** easy rendering, but no validated model or typed graph.
- **Custom graph schema:** duplicates LikeC4 without its viewer or MCP ecosystem.
