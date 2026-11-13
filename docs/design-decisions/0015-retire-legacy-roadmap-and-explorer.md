# 0015 — Retire the legacy roadmap and Explorer

Status: accepted.

## Context

Decision 0012 makes architecture intelligence the product direction. The
workbench System view is the primary surface: it joins curated intent with
observed implementation, flows, diagnostics, and coverage.

The documentation still carried the older Phase 2 and Phase 3 roadmap, a
separate read-only Explorer, and MCP and workspace commitments that were never
implemented. Those commitments competed with the new direction and presented
retired surfaces as future work.

This repository is in active development. The current architecture is a working
design, not a compatibility contract.

## Decision

Retire the legacy direction immediately.

- Retire the read-only Explorer. The System workspace is the human navigation
  surface; a separate Explorer is not planned.
- Remove the Phase 2 and Phase 3 roadmap commitments. They are not the next
  direction and are not deferred commitments.
- Remove `spec serve` and `spec mcp` from the planned command surface. The
  implemented read-only `spec query` and the opencode plugin remain.
- Remove the multi-repository workspace and model-migration roadmap
  commitments. Their design documents are deleted.
- Keep the implemented intent graph, proposal engine, evidence model, and
  hash-locked human approval as the baseline that architecture intelligence
  extends.
- Keep capability, semantic, and verification design documents only as
  unscheduled intent-model design. They are not roadmap commitments.
- Do not reintroduce a retired surface without a new decision record.

## Consequences

- Front-door documentation leads with architecture intelligence, not the old
  Phase 1 skeleton and Phase 2/3 plan.
- The workbench System view is the primary surface. Architecture and Code Map
  are transitional views until the System view reaches parity.
- The analysis engine owns TypeScript symbol, call, entry-point, and data-access
  analysis. Generic discovery remains manifest-level, and compiler preflight
  remains a build gate.
- Retired design documents and dead links are removed in the same change.
- Accepted decision records keep their history. Superseding notes point to this
  record.

## Rejected alternatives

- **Keep the old roadmap as parallel future work:** preserves contradictory
  priorities and keeps the new direction subordinate.
- **Keep the Explorer as a secondary surface:** duplicates the System workspace
  and splits human navigation across two models.
- **Defer the cleanup until implementation starts:** leaves the documentation
  claiming a direction the project no longer follows.
