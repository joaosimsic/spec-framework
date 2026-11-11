# Use-case modes

> Status: partially implemented. `spec change` provides the shared proposal
> engine with same-worktree branches, typed cross-source operations, impact
> reports, and before/after graph simulation. `spec refactor` is a thin alias
> that defaults to refactor mode, enables simulation, and warns when no approved
> baseline exists. `spec start` opens a scratch-mode
> proposal for a greenfield repository. `spec map --review` opens or resumes a
> mapping proposal, prints the area and relation confidence queues, and records
> typed area and relation curation actions. Promotion into approved
> architecture, the workbench, and the opencode plugin are not implemented. The
> mode model is accepted in decision record
> [0011](../design-decisions/0011-interactive-use-case-modes.md).

## Principle

One lifecycle, three starting states. The tool must not treat a new project, an
unmapped repository, and an approved system as the same problem.

Planning is interactive. A static report is an output of the workflow, not the
workflow itself.

## Mode matrix

| Case    | Entry command                 | Start state            | Allowed writes | Human gate               | Result                                 |
| ------- | ----------------------------- | ---------------------- | -------------- | ------------------------ | -------------------------------------- |
| Scratch | `spec start "<goal>"`         | empty repository       | drafts only    | approve a feature slice  | approved slice and implementation plan |
| Mapping | `spec map --review`           | code, no approved spec | drafts only    | curate and approve scope | reviewed model and confidence queue    |
| Refac   | `spec refactor "<direction>"` | approved baseline      | proposal only  | approve changed scope    | impact report and refactor plan        |

All modes share the same graph, proposal engine, validation, and audit model.
They differ in entry state, available operations, and guardrails.

## Shared invariants

- The spec graph is built before any mode writes.
- Proposal writes only; approval remains a CLI-only human action.
- One proposal uses one same-worktree branch. Git worktrees are deferred.
- A proposal records its base commit and explicit baseline.
- Internal IDs, codes, file layout, proposal identifiers, and tool invocations
  are hidden from default interaction. See
  [presentation and internal identity](../ux/presentation.md).
- Static reports are exports; the working surface is the terminal, the
  workbench, or the chat workflow.
- No mode may infer approval, ownership, or normative intent from code.
- Every human decision is recorded as a decision, an open question, a waiver
  request, or a draft element before the step is complete.

## Scratch

### Entry

The repository is empty, or the specification is empty. There is no approved
baseline.

### Flow

1. `spec init` scaffolds the full profile.
2. `spec start "<goal>"` enters `scratch` mode. It requires a clean tree, so
   commit the scaffold before starting.
3. The agent interviews the human: users, scope, non-goals, constraints, quality
   attributes, failure expectations, and operational context.
4. Answers become named decisions, open questions, capabilities, and draft
   requirements.
5. The tool proposes a feature slice: capability, components and interfaces,
   requirements with acceptance criteria, verification method, contract, and
   expected evidence.
6. `spec next` shows the next decision or missing check.
7. The human refines the slice in chat or the workbench.
8. `spec check` runs. The human approves the named slice.
9. Implementation proceeds from the approved slice.

### Guardrails

- Do not invent normative answers to fill gaps.
- Do not convert a goal directly into implementation tasks before requirements
  and acceptance criteria exist.
- Do not show `CAP-*`, `REQ-*`, or `AC-*` codes in the interview or review.

### Exit criteria

- One approved feature slice exists.
- Every requirement has an acceptance criterion and a verification path or a
  human-approved waiver.
- Implementation can cite the approved slice without reading internal IDs.
- Drift and evidence checks can run against the implemented slice.

## Mapping

### Entry

The repository exists. There may be partial documentation and no approved
specification, or a specification that covers only part of the system.

### Flow

1. `spec init --existing` detects languages, build systems, manifests, and docs.
2. `spec map --review` enters `mapping` mode and builds a draft graph.
3. The tool shows areas, dependencies, entry points, data stores, external
   dependencies, tests, and unresolved requirement links.
4. Every extracted element carries confidence and provenance:
   - clear from code;
   - inferred from naming or imports;
   - uncertain boundary;
   - needs human input.
5. The human accepts, rejects, renames, merges, splits, owns, and describes the
   elements, and accepts or rejects uncertain relations.
   `spec map --review --action <json|file>` records each decision against the
   proposal snapshot. Unknown intent becomes a named open question.
6. `spec check` runs. The human approves an explicit subset of the model.
7. `spec map --check` reports drift against the approved subset.

### Guardrails

- Mapping describes structure, not behavior or intent.
- Code facts cannot become requirements, capabilities, or ownership claims
  without human confirmation.
- A confidence label is not approval.
- Static mapping reports are exportable, but curation happens interactively.

### Exit criteria

- The area and relation confidence queues are resolved or explicitly left open
  with an owner.
- The approved scope is explicit and does not claim the whole system.
- Drift findings are available for the approved subset.

## Refac

### Entry

An approved baseline exists. If none exists, mapping or incremental adoption
must run first. A draft-only refactor is allowed only with an explicit warning.

### Flow

1. `spec refactor "<direction>"` is a thin alias over the shared change engine.
   Without an approved baseline it warns that the result is a draft-only
   refactor.
2. The engine creates a same-worktree proposal branch, records the baseline,
   and captures the baseline graph snapshot.
3. The human chooses a typed operation: rename, split, merge, extract, move,
   deprecate, replace, or change contract.
4. The CLI simulates before and after states and shows the named impact:
   affected requirements, contracts, checks, evidence, and approvals. The
   workbench simulation remains design.
5. Chat and workbench edits update the same proposal.
6. `spec check` validates the proposal.
7. The human approves the changed named scope in the CLI.
8. Implementation follows the approved change. Evidence is regenerated.
9. `spec map --check` reports remaining drift.

### Guardrails

- IDs are stable and never reused.
- Split and merge create new elements and `replaces` links.
- Deprecation is explicit; approved elements are not deleted.
- Changed approved content loses approval until re-approved.
- Implementation against a proposal without approval is forbidden.

### Exit criteria

- The impact report lists every affected named requirement, contract, check,
  evidence item, and approval.
- Invalidated approvals are re-approved by a human.
- Evidence is regenerated and drift is clear.

## Working surfaces

| Surface         | Role                                                             |
| --------------- | ---------------------------------------------------------------- |
| Terminal        | Fast status, decisions, approval, and technical inspection       |
| Workbench       | Graph navigation, mapping curation, refactor simulation, review  |
| opencode plugin | Conversational planning, explanations, proposal drafting         |
| Audit bundle    | Deterministic snapshot with full identity for audit and sign-off |

The same proposal is visible in all working surfaces. The workbench and plugin
never approve. The audit bundle is never the working surface.

## Non-goals

- Static reports as the only interface.
- Automatic approval in any mode.
- Inferring intent from code.
- Editing approved content in place.
- Hiding uncertainty to make a mode feel complete.

## Related documents

- [Presentation and internal identity](../ux/presentation.md)
- [Workbench](workbench.md)
- [opencode plugin](opencode-plugin.md)
- [Authoring](authoring.md)
- [Brownfield mapping](../brownfield.md)
- [Change management](change-management.md)
