# Workbench

> Status: implemented. The local React/Vite workbench serves the display graph,
> mapping curation, Compose draft editing, refactor simulation, proposal review,
> and technical details. The rework view applies every typed proposal operation.
> The Compose view adds draft requirements and acceptance criteria, revises or
> retires drafts, and records decisions and open questions; new IDs are derived
> from visible names and never typed by a human. Approval and `spec/spec.lock`
> writes remain CLI-only. Decision record
> [0011](../design-decisions/0011-interactive-use-case-modes.md) fixes the
> interaction model and the write boundary.

## Purpose

The workbench is the local interactive surface for planning, mapping, and
refactoring a specification. It is where a human navigates the graph, resolves
uncertainty, simulates a change, and reviews a proposal.

It is not the Explorer. The Explorer is read-only over a validated model. The
workbench may edit a proposal, but never approved content and never
`spec/spec.lock`.

## Interaction model

- React, Vite, and TypeScript in `src/workbench/web/`.
- A Bun server in `src/workbench/server.ts` serves the built application and the
  API.
- `bun run build:workbench` produces static assets. Generated assets are ignored
  and never hand-edited.
- Localhost binding by default. Non-local access requires explicit
  configuration.
- Terminal equivalents exist for environments without a browser. `spec next`
  shows the current guidance; `spec start`, `spec map --review`,
  `spec change`, and `spec refactor` open guided sessions when stdin and
  stdout are TTYs. `--no-interactive` restores one-shot output, and `--json`,
  `--action`, and `--op` never prompt.

## Write boundary

| Context           | Allowed                                         |
| ----------------- | ----------------------------------------------- |
| Approved baseline | Read-only                                       |
| Proposal branch   | Read and write draft sources through operations |
| `spec/spec.lock`  | Never written by the workbench                  |
| Approval          | Never; human-only CLI action                    |
| Evidence          | Read-only; regeneration is a CLI action         |

Every write is a typed proposal operation. The workbench does not edit arbitrary
files. A proposal records its base commit, baseline, and author.

## Terminal session behavior

- Queues and menus use visible names. Opaque refs and technical identity appear
  only with `--technical`.
- EOF and Ctrl-C exit the session and leave the proposal open.
- Ambiguous names show contextual choices and re-prompt.
- Every write uses the same typed proposal operations as the workbench.
- The session never writes `spec/spec.lock` and has no approval step.

## Views

### Overview

Systems, capabilities, requirements, checks, blockers, approved scope, and open
questions, grouped by human name.

### Map

Code-derived areas, dependencies, entry points, data stores, external
dependencies, and tests. Confidence appears as plain-language labels:

- “Clear from code”
- “Inferred — confirm or correct”
- “Uncertain boundary — choose”
- “Needs human input”

The curation queue supports accept, reject, rename, merge, split, owner,
responsibility, boundary, and open-question actions.

### Compose

The scratch-mode view. Shows the proposed feature slice, missing decisions,
requirements, acceptance criteria, verification path, contracts, and expected
evidence. The editor adds requirement and acceptance-criterion drafts, links an
acceptance criterion to its requirement, revises or retires a draft, and records
decisions and open questions. New identifiers are generated from the visible
name. Other layer links are selected by visible name when matching items exist.

### Rework

The refactor-mode view. Shows before and after states, typed operations,
affected named requirements, contracts, checks, evidence, and approvals. The
editor applies `rename`, `deprecate`, `replace`, `split`, `merge`, `extract`,
`move`, `change-contract`, `record-decision`, and `record-open-question`.
New record and component IDs are generated from visible names; the server
resolves names and refs to identity.

### Review

The proposal review surface. Human summary first, diff second, technical
identity in the details drawer. Lists invalidated approvals and blocking open
questions.

### Technical details

Reveals IDs, status values, confidence, provenance, hashes, diagnostic codes,
source paths, proposal identifiers, and adapter names. Available on every view
and never enabled by default.

## API contract

The API mirrors the CLI JSON contract:

| Endpoint                       | Method | Purpose                            |
| ------------------------------ | ------ | ---------------------------------- |
| `/api/graph`                   | GET    | Display graph, filtered by focus   |
| `/api/context`                 | GET    | Scoped context pack                |
| `/api/impact`                  | GET    | Impact and invalidated evidence    |
| `/api/diff`                    | GET    | Proposal versus baseline           |
| `/api/check`                   | POST   | Run validation and return findings |
| `/api/proposals/:id/ops`       | POST   | Apply typed proposal operations    |
| `/api/proposals/:id/technical` | GET    | Full identity and hashes           |

The API does not expose approval, `spec.lock` writes, or arbitrary filesystem
access. Requests are same-origin and carry a CSRF token.

## Mode behavior

| Mode    | Workbench focus                                            |
| ------- | ---------------------------------------------------------- |
| Scratch | Compose view, decision queue, feature-slice coverage       |
| Mapping | Map view, confidence queue, approved-scope selection       |
| Refac   | Rework view, before/after simulation, impact and approvals |

Switching mode changes the default view and guardrails. It does not create a
second graph or proposal.

## Security

- Bind to localhost by default.
- Require explicit host and origin configuration for non-local access.
- Same-origin and CSRF checks on every mutating request.
- Workspace-relative path resolution only.
- No secrets, approval tokens, or private keys in responses.
- No mutation of approved sources or `spec/spec.lock`.
- Log the model commit, dirty state, tool versions, and proposal ID for every
  response.

## Accessibility

- Every control is keyboard reachable.
- Focus moves predictably when opening a panel, diff, or simulation.
- Status is not conveyed by colour alone.
- Graph summaries have text equivalents.
- Names, not IDs, are the accessible labels.

## Failure behavior

- Invalid model: show findings, not a blank success page.
- Dirty tree: mark the view as local preview and block approval.
- Stale proposal: show the base commit and the mismatch.
- Missing tool: show the affected layer as blocked.
- No proposal: enter read-only mode and offer to create one.
- Approval attempted: reject and point to the CLI.

## Non-goals

- Approving or rejecting elements.
- Editing approved content in place.
- A hosted or multi-user service.
- Replacing the terminal for scripted work.
- Replacing the audit bundle.
- Hiding gaps behind visual polish.
- A second source of truth.

## Acceptance criteria

- A human can complete mapping curation without seeing an internal ID.
- A refactor preview shows named impact and invalidated approvals before any
  code changes.
- Mutating requests fail when they target the approved baseline or `spec.lock`.
- The same proposal is visible from the terminal and the chat workflow.
- “Technical details” reveals the complete identity record.
- Accessibility checks pass for keyboard flow, labels, focus, and status text.
