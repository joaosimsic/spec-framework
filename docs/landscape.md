# Landscape

## Summary

Existing tools cover parts of repository understanding: architecture as code,
requirements management, code traceability, source analysis, and formal
verification. The generated spec product composes source analysis with a
generated architecture, observed behavior records, contracts, verification
records, flows, diagnostics, and an evidence-bound AI layer.

The differentiator is not a new modeling language. It is the generated,
reproducible spec product and the workbench that consumes it without a curated
model.

## Tool comparison

| Tool                              | Category                       | What it does well                                   | What it does not do                                        |
| --------------------------------- | ------------------------------ | --------------------------------------------------- | ---------------------------------------------------------- |
| LikeC4                            | Architecture as code           | DSL, custom kinds, views, validation, model API     | No repository-derived spec product or observed behavior    |
| Structurizr                       | Architecture as code           | Strict C4 model, views, MCP                         | No generated requirements or flows                         |
| SysML v2                          | Systems modeling               | Parts, ports, requirements, state machines          | Heavy tooling; no built-in analysis of source repositories |
| StrictDoc                         | Requirements and audit         | SDoc, traceability, HTML/PDF                        | No source-derived architecture or flows                    |
| Doorstop                          | Requirements                   | YAML/Markdown items, links, review fingerprints     | No source analysis or generated architecture               |
| OpenFastTrace                     | Requirement tracing            | Requirement-to-code/test tags and coverage          | Tracing only                                               |
| Quint                             | Formal behavior                | Executable models, simulator, model checking        | Not a repository intelligence product                      |
| TLA+ / Alloy                      | Formal methods                 | Model checking and relational constraints           | No generated repository spec                               |
| GitHub Spec Kit / Kiro / OpenSpec | Agent workflows                | Spec → plan → tasks workflows                       | Prose artifacts; no generated repository model             |
| Reqvire                           | Semantic engineering framework | Unified semantic graph, traceability, change impact | Curated model, not generated repository intelligence       |
| CodeQL / Semgrep                  | Static analysis                | Security and code rules                             | Not an architecture, flow, or contract product             |

## Chosen composition

- TypeScript compiler for syntax, types, symbols, references, and calls.
- Package manifests and directory structure for generated architecture.
- The analysis IR for files, symbols, imports, calls, entry points, and data
  access.
- `bun:sqlite` for local snapshots.
- React/Vite for the generated System workbench.
- Optional LikeC4 and StrictDoc exports.
- Configured external checks for verification evidence.
- Optional AI for hypotheses over generated context.

## What changed in 2025–2026

- Architecture-as-code tools became queryable by agents.
- Static analysis APIs became practical from TypeScript and Bun.
- Local model runtimes made evidence-bound AI feasible without a hosted service.
- Generated documentation increased the risk of fluent but ungrounded claims.
- The generated spec product responds by binding every record to evidence and
  by removing approval claims from generated output.

## Open landscape questions

- Which generated hierarchy heuristics generalize across monorepos?
- Which observed contract surfaces are stable enough for comparison?
- How should runtime evidence extend static flows?
- Which optional external checkers are worth integrating first?
