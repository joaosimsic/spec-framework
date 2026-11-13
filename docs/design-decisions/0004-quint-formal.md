# 0004 — Quint for formal behavior

Status: superseded by [0016](0016-generated-spec-product.md). Authored Quint models are retired from the spec product.
**Status:** accepted
**Date:** 2026-11-10

## Context

Behavior must be executable, reviewable, and model-checkable. The tool should be usable by agents and by humans who are not formal-methods specialists.

## Decision

Use Quint as the default formal behavior layer, with Apalache or TLC for model checking and trace generation for conformance.

## Consequences

- Behavior specs are code-like and reviewable.
- Model checking produces counterexamples that drive repair.
- Quint traces can be replayed against Rust implementations through Quint Connect.
- Non-Rust conformance requires a generic trace adapter.
- Full formal verification covers models and conformance, not arbitrary code proofs.

## Alternatives

- **TLA+:** more mature, but harder syntax and lower LLM success without a repair loop.
- **Alloy:** strong for relational structure, weaker for temporal behavior.
- **Dafny/Verus/Kani:** code-level verification, language-specific and out of default scope.
- **Natural-language state tables:** readable but not machine-checked.
