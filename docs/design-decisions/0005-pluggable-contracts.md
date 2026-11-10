# 0005 — Pluggable contracts

**Status:** accepted
**Date:** 2026-11-10

## Context

Most projects are not web applications. Boundary contracts include language APIs, data formats, CLIs, wire protocols, and hardware interfaces. A single IDL or HTTP-first format would exclude many projects.

## Decision

Use pluggable contract adapters. The default Phase 1 adapters are JSON Schema, CLI snapshots, and Rust public API.

## Consequences

- Projects enable only the adapters they need.
- Adapter output is typed, documented, and checked for compatibility.
- The framework does not force OpenAPI or TypeSpec.
- Each adapter must provide deterministic evidence and fail closed.
- Support is explicit; unsupported boundaries use manual contracts.

## Alternatives

- **OpenAPI default:** web-only bias.
- **TypeSpec default:** API-centric; poor fit for libraries, CLIs, and files.
- **Protobuf default:** strong for wire data, wrong for in-process APIs and human-facing output.
- **No contract layer:** loses compatibility evidence and boundary typing.
