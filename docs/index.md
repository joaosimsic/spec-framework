# Documentation index

`spec-framework` is an architecture intelligence platform in active development. The implemented baseline captures intent, approval, evidence, and proposals. The next direction reconstructs implementation, maps intent to code, traces flows, and surfaces architectural problems. Read in this order for the full argument.

## Orientation

| Document                            | Question it answers                            |
| ----------------------------------- | ---------------------------------------------- |
| [Vision](vision.md)                 | What does success look like?                   |
| [Problem](problem.md)               | Why do LLM-written specs fail?                 |
| [Principles](principles.md)         | What rules constrain the design?               |
| [Bootstrap](bootstrap.md)           | How does full-stack setup work?                |
| [Adoption](adoption.md)             | How do I add this to an existing project?      |
| [Brownfield mapping](brownfield.md) | How is current architecture mapped?            |
| [Landscape](landscape.md)           | What already exists, and why not use one tool? |
| [Glossary](glossary.md)             | What do the terms mean?                        |

## Primary direction

| Document                                                                  | Question it answers                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Architecture intelligence roadmap](roadmap/architecture-intelligence.md) | What is planned, in what order, and what gates each phase? |
| [Analysis engine](architecture/analysis-engine.md)                        | How does code become a language-neutral IR?                |
| [Architecture graph](architecture/architecture-graph.md)                  | How are intent, implementation, and mapping joined?        |
| [Functional flows](architecture/functional-flows.md)                      | How are entry points traced to outputs and side effects?   |
| [Architectural diagnostics](architecture/architectural-diagnostics.md)    | How are architectural problems detected and reviewed?      |
| [AI layer](architecture/ai-layer.md)                                      | What may AI interpret, and what must it never decide?      |
| [Graph rendering](architecture/graph-rendering.md)                        | How does the System graph stay readable at scale?          |
| [Analysis schemas](architecture/analysis-schemas.md)                      | What are the versioned JSON contracts?                     |
| [System workspace](workflow/system-workspace.md)                          | What does the primary workbench view show?                 |
| [Analysis jobs and snapshots](workflow/analysis-jobs-and-snapshots.md)    | How do analysis runs and comparisons work?                 |
| [Architecture intelligence API](api/architecture-intelligence-api.md)     | What are the REST and SSE contracts?                       |

## Current intent model

| Document                                                               | Question it answers                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Architecture overview](architecture/overview.md)                      | How do the intent, implementation, and mapping layers fit?        |
| [Spec model](architecture/spec-model.md)                               | What is a spec element, ID, relation, status?                     |
| [Architecture layer](architecture/architecture-layer.md)               | How is architecture captured and reviewed?                        |
| [Capability layer](architecture/capability-layer.md)                   | How are system abilities linked to requirements and verification? |
| [Discovery layer](architecture/discovery-layer.md)                     | How are existing repos mapped into draft specs?                   |
| [Requirements layer](architecture/requirements-layer.md)               | How are requirements structured and traced?                       |
| [Semantic layer](architecture/semantic-layer.md)                       | How are ontologies, concepts, and semantic contracts modeled?     |
| [Verification layer](architecture/verification-layer.md)               | How is verification planned beyond formal checking?               |
| [Formal layer](architecture/formal-layer.md)                           | How is behavior made executable and checked?                      |
| [Contracts layer](architecture/contracts-layer.md)                     | How are non-web interfaces specified?                             |
| [Implementation layer](architecture/implementation-layer.md)           | How is compiler output used as a deterministic preflight?         |
| [Query and agent interface](architecture/query-and-agent-interface.md) | How do agents and tools query the spec graph?                     |
| [Audit bundle](architecture/audit-bundle.md)                           | What does the final readable artifact contain?                    |

## Workflow

| Document                                           | Question it answers                                         |
| -------------------------------------------------- | ----------------------------------------------------------- |
| [Use-case modes](workflow/use-cases.md)            | How do scratch, mapping, and refactor differ?               |
| [Authoring](workflow/authoring.md)                 | How does a change go from direction to approved spec?       |
| [Agent protocol](workflow/agent-protocol.md)       | What may an LLM do, and what may it not do?                 |
| [opencode plugin](workflow/opencode-plugin.md)     | How does conversational planning work?                      |
| [Change management](workflow/change-management.md) | How are changes reviewed and re-verified?                   |
| [Approval](workflow/approval.md)                   | How does human authority work mechanically?                 |
| [Workbench](workflow/workbench.md)                 | What does the interactive System and proposal surface show? |
| [Self-host MVP](mvp.md)                            | How do I test the core loop end to end?                     |

## Depth

| Document                                        | Question it answers                          |
| ----------------------------------------------- | -------------------------------------------- |
| [Formal verification](formal-verification.md)   | What is actually verified, and what is not?  |
| [Non-web projects](non-web.md)                  | How does this work without HTTP APIs?        |
| [Tooling](tooling.md)                           | Which tools and versions are required?       |
| [Security](security.md)                         | What are the trust boundaries and threats?   |
| [Presentation and identity](ux/presentation.md) | What do humans see, and what stays internal? |
| [Evaluation](evaluation.md)                     | How will the framework be judged?            |
| [Roadmap](roadmap.md)                           | What is built, in what order?                |
| [Open questions](open-questions.md)             | What is still undecided?                     |
| [References](references.md)                     | Where do the underlying ideas come from?     |

## Decision records

- [0001 Compose existing tools](design-decisions/0001-compose-existing-tools.md)
- [0002 LikeC4 for architecture](design-decisions/0002-likec4-architecture.md)
- [0003 StrictDoc for requirements and audit](design-decisions/0003-strictdoc-audit.md)
- [0004 Quint for formal behavior](design-decisions/0004-quint-formal.md)
- [0005 Pluggable contracts](design-decisions/0005-pluggable-contracts.md)
- [0006 Human approval with hash lock](design-decisions/0006-human-approval-hash-lock.md)
- [0007 No custom specification schema](design-decisions/0007-no-custom-schema.md)
- [0008 Compiler preflight adapter](design-decisions/0008-compiler-preflight.md)
- [0009 Reqvire feature adoption](design-decisions/0009-reqvire-feature-adoption.md)
- [0010 Optional semantic layer](design-decisions/0010-optional-semantic-layer.md)
- [0011 Interactive use-case modes](design-decisions/0011-interactive-use-case-modes.md)
- [0012 Architecture intelligence direction](design-decisions/0012-architecture-intelligence.md)
- [0013 Analysis persistence and snapshots](design-decisions/0013-analysis-persistence.md)
- [0014 AI interpretation boundary](design-decisions/0014-ai-interpretation-boundary.md)
- [0015 Retire legacy roadmap and Explorer](design-decisions/0015-retire-legacy-roadmap-and-explorer.md)
