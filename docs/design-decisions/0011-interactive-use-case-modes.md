# 0011 — Interactive use-case modes and a human-facing experience layer

Status: superseded by [0016](0016-generated-spec-product.md). Proposal and curation modes are retired.
**Status:** accepted; Explorer reference superseded by 0015
**Date:** 2026-11-11

> Decision 0015 retires the separate read-only Explorer. The workbench System
> workspace is the human navigation surface, and the proposal and approval
> boundaries in this record still apply.

## Context

The framework has one authoring workflow, but real work starts from three
different states:

- **Scratch:** an empty repository where the specification comes first.
- **Mapping:** an existing repository that needs a reviewed architecture before
  changes are safe.
- **Refactor:** an approved baseline that must change without losing
  traceability.

A static mapping report or a generated bundle is not enough for any of these.
Planning is interactive: a human explores the graph, asks questions, resolves
ambiguity, simulates a change, and decides. The tool must support that loop
without weakening deterministic validation or hash-locked approval.

The framework also exposes internal machinery that is necessary but not
user-facing: stable IDs, status values, confidence values, diagnostic codes,
proposal identifiers, and hashes. Presenting those codes as the primary
interface makes the tool harder to use and leaks implementation detail into
architecture conversations.

Decision 0006 fixes human-only hash-locked approval. Decision 0009 adopts a
read-only query and Explorer surface. This record extends those decisions with
interactive use-case modes, a proposal-only workbench, a conversational agent
surface, and a presentation layer.

## Decision

1. Build one unified spec graph before any interactive surface.
2. Support three use-case modes: scratch, mapping, and refactor.
3. Keep proposal writes separate from approval in every mode.
4. Add a local React/Vite workbench that may edit proposals but never approved
   content or `spec/spec.lock`.
5. Add a terminal interactive path for environments without a browser.
6. Ship an opencode plugin both as a standalone package and as a local
   self-hosting loader.
7. Use same-worktree proposal branches. Git worktrees are deferred.
8. Treat `spec refactor` as a thin alias over the shared change engine.
9. Hide internal identity from default human interaction and expose it through
   a technical-details surface.
10. Keep full identity in the audit bundle.

## Mode model

| Mode    | Entry state            | Allowed writes | Human gate               |
| ------- | ---------------------- | -------------- | ------------------------ |
| Scratch | empty repository       | drafts         | approve a feature slice  |
| Mapping | code, no approved spec | drafts         | curate and approve scope |
| Refac   | approved baseline      | proposals      | approve changed scope    |

The modes share the graph, proposal engine, validation, and audit model. They
differ only in entry state, available operations, and guardrails.

## Presentation model

The identity layer remains authoritative. The experience layer is a
deterministic projection:

- names and summaries instead of IDs;
- plain-language state instead of status enums;
- named open questions instead of `UNK-*` codes;
- contextual choices instead of suffix comparison;
- technical details on request;
- full identity in the audit bundle.

The projection is not a second model and cannot approve anything.

## Workbench boundary

The workbench is interactive, not read-only:

- read-only over the approved baseline;
- read-write over a proposal;
- no approval endpoint;
- no write to `spec/spec.lock`;
- localhost by default;
- same-origin and CSRF checks for mutations;
- workspace-relative paths only.

The workbench is the proposal-authoring and System navigation surface. Decision
0015 retires the separate read-only Explorer.

## Agent boundary

The opencode plugin provides tools for status, context, query, impact, proposal,
validation, decisions, and workbench navigation. It has no approval tool.
Permissions deny `spec approve*` and `spec/spec.lock` writes. Spec source edits
go through `spec_propose`.

Chat is not normative. Accepted decisions are recorded in the proposal before a
planning turn ends.

## Consequences

- A unified graph becomes the first implementation milestone.
- The discovery layer gains an interactive review path, not only a draft report.
- Change management gains a mode-aware impact simulation and a thin refactor
  alias.
- The query and agent interface gains a presentation projection and opaque refs.
- The security model gains a local write surface and a conversational surface.
- The roadmap gains a phase between the Phase 1 vertical slice and the Phase 2
  semantic and verification expansion.
- Documentation must state which capabilities are implemented and which are
  design.

## Alternatives

- **Static reports only:** cheaper, but does not support exploration or
  curation, and hides the reasoning work.
- **One read-only Explorer for every use case:** safe, but forces humans to edit
  files by hand and breaks the interactive planning loop.
- **Separate tools per use case:** duplicates the graph, proposal, and approval
  machinery and creates inconsistent identity handling.
- **Expose IDs everywhere:** simpler for tools, but makes the product an
  internal debugger instead of an architecture tool.
- **Git worktrees from day one:** stronger isolation, but more operational
  complexity than the first interactive slice needs.
- **A hosted multi-user service:** out of scope and conflicts with the local,
  auditable model.
