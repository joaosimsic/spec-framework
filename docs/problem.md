# Problem

## The failure mode

LLM-written specifications fail because natural language has no enforcement. The text can look complete while containing undefined terms, missing relations, untested claims, and silent assumptions.

The problem is not that the LLM writes badly. The problem is that prose has no type system, no referential integrity, no coverage check, and no separation between fact, assumption, and decision.

## Failure taxonomy

### 1. Undefined terms

The spec says "the scheduler prioritizes urgent jobs" without defining urgency, ordering, tie-breaking, or starvation behavior.

**Why checklists do not fix it:** a checklist can ask "are terms defined?" but cannot prove that every use resolves to a definition.

**Required mechanism:** a glossary with stable IDs and a linter that rejects undefined references in normative fields.

### 2. Ambiguous requirements

The spec says "the system should respond quickly" or "handle errors gracefully." Both are untestable.

**Required mechanism:** constrained requirement forms with typed parameters. Performance requirements must carry metric, unit, threshold, and measurement method. Error requirements must enumerate error classes and observable outcomes.

### 3. Missing components and relations

The spec describes a cache, a queue, and a worker but never states who writes the cache, who consumes the queue, or what happens on retry.

**Required mechanism:** an architecture graph with typed relations and completeness rules. Orphan components, missing producers, missing consumers, and unowned data are validation failures.

### 4. Unbounded behavior

The spec covers the happy path but not empty input, maximum size, concurrency, partial failure, restart, cancellation, or unauthorized access.

**Required mechanism:** a mandatory edge-case matrix per behavior. Unanswered cells become explicit unknowns or waivers.

### 5. Claims without provenance

The LLM asserts that a dependency "supports transactions" or that a protocol "is idempotent" because it is plausible.

**Required mechanism:** provenance on every element. A claim is human-provided, derived from a named artifact, inferred from a specific source, or an explicit assumption. Assumptions are surfaced in the audit bundle.

### 6. No verification link

A requirement exists, code exists, and tests exist, but nothing connects them.

**Required mechanism:** stable IDs and traceability. Every approved requirement must link to a formal property, contract check, conformance test, or human-approved waiver.

### 7. Drift

The document says one thing; the code does another; no check notices.

**Required mechanism:** generated artifacts, code annotations referencing approved IDs, and change reports. Drift becomes a failing check, not a review surprise.

### 8. False confidence

The LLM writes a complete-sounding document, and the human mistakes fluency for correctness.

**Required mechanism:** the final artifact is generated from typed sources. The human reviews evidence, unknowns, and waivers, not LLM prose.

## Why existing approaches fall short

### Markdown templates and prompt workflows

Spec Kit, Kiro, OpenSpec, and similar tools improve the sequence of work: specify, plan, implement. They do not make the specification typed or verifiable. The output is still prose with optional checklists.

### Documentation generators

Architecture-as-code tools such as LikeC4 and Structurizr validate structure, but they do not own requirements or behavior. Documentation generators render what exists; they do not detect missing normative content.

### Formal methods alone

TLA+, Quint, and Alloy can verify behavior, but they do not manage architecture, requirements, contracts, or human approval. They also do not connect formal properties to product requirements by themselves.

### Requirements management alone

StrictDoc, Doorstop, and OpenFastTrace manage readable requirements and traceability, but they do not formalize behavior or validate architecture.

### One tool to rule them all

No current tool spans architecture, requirements, formal behavior, contracts, audit output, and agent permissions. Attempting to build one from scratch recreates mature parsers, renderers, model checkers, and traceability engines.

## Design requirements

The solution must:

1. Represent normative content in typed, validated sources.
2. Preserve a readable, generated audit artifact.
3. Link requirements, architecture, behavior, contracts, and code by stable IDs.
4. Detect missing definitions, relations, edge cases, and verification.
5. Record provenance, unknowns, assumptions, and waivers explicitly.
6. Keep deterministic verification independent of the LLM.
7. Require human approval for approved content.
8. Support non-web projects as first-class.
9. Avoid inventing a new specification language.
10. Remain replaceable at every layer.
