# 0012 Architecture intelligence direction

Status: accepted.

## Context

The current framework captures intent: architecture, requirements, formal
behavior, contracts, evidence, and approval. The workbench can show a curated
architecture graph and a code-derived repository graph, but it cannot answer how
a conceptual system element is implemented at file and symbol level, how data
moves through the system, or where architectural responsibilities are unclear.

The product direction is to analyze unfamiliar repositories, reconstruct a
functional architecture, trace it to implementation, and surface evidence-backed
architectural problems.

## Decision

Evolve `spec-framework` into an architecture intelligence platform.

- Keep the existing deterministic intent graph and human approval model.
- Add a separate, generated implementation graph.
- Add a mapping layer between conceptual elements and code artifacts.
- Add static functional flows, architectural diagnostics, and an optional
  evidence-bound AI interpretation layer.
- Make the workbench System view the primary surface.
- Stay on Bun/TypeScript, SQLite, and the local workbench for the MVP.
- Support TypeScript/JavaScript first, behind a language adapter contract.

The intent graph remains the source of truth for intent. The implementation
graph is evidence. The mapping graph is curated or generated, never silently
merged into approved intent.

## Consequences

Positive:

- One tool explains both what the system is and how it is implemented.
- Existing approval, evidence, and audit behavior remain intact.
- Code analysis stays deterministic and inspectable.
- AI can explain and hypothesize without gaining approval authority.
- Language support can grow without changing the architecture model.

Negative:

- Two graph models and a mapping layer must stay consistent.
- Static analysis will be incomplete and must show uncertainty.
- SQLite and snapshot history add operational complexity.
- Graph rendering must handle large symbol-level graphs.
- AI introduces security, privacy, and validation requirements.

## Rejected alternatives

- A separate Python/FastAPI/PostgreSQL product: duplicates the workbench and
  fragments the intent model.
- Extending discovery only: cannot answer function-level or data-flow
  questions.
- AI-first repository parsing: non-deterministic and unauditable.
- One merged graph for intent and implementation: erases the boundary between
  approved decisions and observed code.
