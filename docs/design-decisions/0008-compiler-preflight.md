# 0008 — Compiler preflight adapter

**Status:** accepted; extended by 0012
**Date:** 2026-11-11

> Decision 0012 adds a separate analysis engine for AST parsing, symbols, call
> graphs, entry points, and data access. This adapter remains a narrow build and
> typecheck gate and does not become conformance evidence.

## Context

A source review that relies only on LLM judgement is probabilistic. The same source can produce different findings across runs, models, and prompts. It cannot be replayed from a clean checkout with a stable verdict.

The language toolchain supplies a narrower but deterministic signal. A compiler or type checker can report syntax errors, type errors, unresolved imports, build failures, and warnings. Public API extractors can derive a symbol surface from the same compiler facts.

Compiler output does not answer whether the implementation satisfies requirements, whether the architecture matches the approved model, or whether the behavior is correct. It only proves that the implementation is well-formed for a specific toolchain and command.

The framework therefore needs a separate preflight layer, not a replacement for contracts, formal verification, or human review.

## Decision

Add a dedicated compiler preflight adapter. It is not a contract adapter and not a formal verifier.

- Commands live in `spec/implementation/compile.json`.
- The adapter id is `compiler` and is enabled through `adapters.implementation` in `spec/config.json`.
- Commands are explicit argument arrays. The adapter does not use a shell.
- The adapter runs in the native `spec check` phase, before the other native adapters.
- `spec check --structural` skips the adapter.
- Non-zero exits, missing executables, malformed configuration, and command failures are errors.
- The adapter records deterministic inputs and outputs: command, working directory, timeout, exit code, and a bounded output tail.
- LLM source review remains advisory if added later. It never supplies a pass verdict.

## Consequences

Positive:

- broken source is rejected before semantic or LLM review;
- compile and typecheck results are repeatable under a pinned toolchain;
- the compiler remains the source of truth for types;
- contract adapters can consume compiler-derived surfaces without reimplementing type rules;
- the preflight is cheap to run and easy to remove;
- the configuration is language-neutral because it names commands, not languages.

Negative:

- arbitrary build commands add a trusted-code execution surface;
- tool provisioning is project-specific and outside `spec doctor` in the first slice;
- compiler output is noisy and needs bounded presentation;
- a green preflight can create false confidence if treated as conformance evidence;
- large builds need explicit timeouts and may be slow for fast feedback loops.

Neutral:

- the adapter does not parse syntax trees, build call graphs, or infer architecture;
- auto-detection of package scripts is deferred;
- evidence hashing is deferred until the evidence bundle exists.

## Alternatives

- **Reuse CLI contract snapshots.** Zero new code, but mislabels build checks as contracts and runs after the other layers. Rejected.
- **Compiler as contract adapter.** Conflates preflight with boundary compatibility and creates duplicate compatibility policy. Rejected.
- **Full compiler API parsing.** High maintenance, duplicates existing tooling, and still cannot judge requirements. Rejected.
- **LLM-only source review.** Cheap to prototype, but not deterministic, replayable, or auditable. Rejected as the only gate.
- **No compiler integration.** Avoids provisioning cost, but discards the cheapest deterministic signal available. Rejected.

## Follow-up

Implementation landed in `src/adapters/compiler.ts`; configuration lives at `spec/implementation/compile.json`. See the [implementation layer](../architecture/implementation-layer.md) docs.
