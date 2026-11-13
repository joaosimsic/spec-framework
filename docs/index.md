# Documentation index

`spec-framework` generates an evidence-bound spec from a repository. The
workbench reads generated output only. Curated architecture, requirements,
proposals, and hash-locked approval are retired by decision record
[0016](design-decisions/0016-generated-spec-product.md).

## Orientation

| Document                    | Question it answers                            |
| --------------------------- | ---------------------------------------------- |
| [Vision](vision.md)         | What does success look like?                   |
| [Problem](problem.md)       | Why do hand-maintained specs fail?             |
| [Principles](principles.md) | What rules constrain the design?               |
| [Adoption](adoption.md)     | How do I generate a spec for a repository?     |
| [Landscape](landscape.md)   | What already exists, and why not use one tool? |
| [Glossary](glossary.md)     | What do the terms mean?                        |

## Generated spec product

| Document                                                                  | Question it answers                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Architecture intelligence roadmap](roadmap/architecture-intelligence.md) | What is implemented, in what order, and what gates?   |
| [Architecture overview](architecture/overview.md)                         | How do the generated layers fit together?             |
| [Generated spec model](architecture/spec-model.md)                        | What is a generated spec element, ID, and relation?   |
| [Analysis engine](architecture/analysis-engine.md)                        | How does code become a language-neutral IR?           |
| [Architecture graph](architecture/architecture-graph.md)                  | How is generated architecture linked to code?         |
| [Requirements](architecture/requirements-layer.md)                        | How is observed behavior recorded?                    |
| [Contracts](architecture/contracts-layer.md)                              | How are observed interfaces recorded?                 |
| [Verification](architecture/verification-layer.md)                        | How are tests and checks turned into evidence?        |
| [Implementation layer](architecture/implementation-layer.md)              | How is compiler preflight recorded?                   |
| [Functional flows](architecture/functional-flows.md)                      | How are entry points traced to sources and sinks?     |
| [Architectural diagnostics](architecture/architectural-diagnostics.md)    | How are architectural problems detected?              |
| [AI layer](architecture/ai-layer.md)                                      | What may AI interpret, and what must it never decide? |
| [Graph rendering](architecture/graph-rendering.md)                        | How does the System graph stay readable at scale?     |
| [Analysis schemas](architecture/analysis-schemas.md)                      | What are the versioned JSON contracts?                |
| [Query and agent interface](architecture/query-and-agent-interface.md)    | How do tools query generated output?                  |
| [Audit bundle](architecture/audit-bundle.md)                              | What does the generated audit artifact contain?       |

## Workflow

| Document                                                               | Question it answers                          |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| [System workspace](workflow/system-workspace.md)                       | What does the primary workbench view show?   |
| [Workbench](workflow/workbench.md)                                     | What surfaces remain, and what is read-only? |
| [Analysis jobs and snapshots](workflow/analysis-jobs-and-snapshots.md) | How do analysis runs and comparisons work?   |
| [Agent protocol](workflow/agent-protocol.md)                           | What may an agent do with generated output?  |
| [opencode plugin](workflow/opencode-plugin.md)                         | How does the generated-spec plugin work?     |
| [Architecture intelligence API](api/architecture-intelligence-api.md)  | What are the REST and SSE contracts?         |

## Depth

| Document                                                             | Question it answers                          |
| -------------------------------------------------------------------- | -------------------------------------------- |
| [Non-web projects](non-web.md)                                       | How does this work without HTTP APIs?        |
| [Tooling](tooling.md)                                                | Which tools are required and optional?       |
| [Security](security.md)                                              | What are the trust boundaries and threats?   |
| [Presentation and identity](ux/presentation.md)                      | What do humans see, and what stays internal? |
| [Evaluation](evaluation.md)                                          | How will the framework be judged?            |
| [Generated spec validation](validation/generated-spec-validation.md) | What happened on real repositories?          |
| [Roadmap](roadmap.md)                                                | What is built, in what order?                |
| [Open questions](open-questions.md)                                  | What is still undecided?                     |
| [References](references.md)                                          | Where do the underlying ideas come from?     |

## Decision records

- [0001 Compose existing tools](design-decisions/0001-compose-existing-tools.md)
- [0002 LikeC4 architecture](design-decisions/0002-likec4-architecture.md) — superseded by 0016
- [0003 StrictDoc audit](design-decisions/0003-strictdoc-audit.md) — superseded by 0016
- [0004 Quint formal](design-decisions/0004-quint-formal.md) — superseded by 0016
- [0005 Pluggable contracts](design-decisions/0005-pluggable-contracts.md) — superseded by 0016
- [0006 Human approval with hash lock](design-decisions/0006-human-approval-hash-lock.md) — superseded by 0016
- [0007 No custom specification schema](design-decisions/0007-no-custom-schema.md)
- [0008 Compiler preflight adapter](design-decisions/0008-compiler-preflight.md)
- [0009 Reqvire feature adoption](design-decisions/0009-reqvire-feature-adoption.md)
- [0010 Optional semantic layer](design-decisions/0010-optional-semantic-layer.md) — retired
- [0011 Interactive use-case modes](design-decisions/0011-interactive-use-case-modes.md) — superseded by 0016
- [0012 Architecture intelligence direction](design-decisions/0012-architecture-intelligence.md)
- [0013 Analysis persistence and snapshots](design-decisions/0013-analysis-persistence.md)
- [0014 AI interpretation boundary](design-decisions/0014-ai-interpretation-boundary.md)
- [0015 Retire legacy roadmap and Explorer](design-decisions/0015-retire-legacy-roadmap-and-explorer.md)
- [0016 Generated spec product](design-decisions/0016-generated-spec-product.md)
- [0017 Behavior-derived conceptual architecture](design-decisions/0017-behavior-derived-architecture.md)
