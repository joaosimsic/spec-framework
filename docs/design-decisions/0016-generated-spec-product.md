# 0016 — Generated spec product

Status: accepted. Extended by [0017](0017-behavior-derived-architecture.md): architecture is behavior-derived, not directory-derived.

## Context

The architecture intelligence direction added a deterministic implementation
graph, generated architecture reconstruction, static flows, diagnostics, and an
evidence-bound AI layer. The remaining intent model still depended on
hand-authored LikeC4, StrictDoc, Quint, contract sidecars, proposals, and a
hash-locked approval lock.

That split produced two competing products:

- a curated intent system whose workbench surface validated hand-authored
  architecture, and
- a generated analysis system whose workbench surface described observed code.

The curated model also required hand maintenance. Its hierarchy, wording, and
coverage could drift from the repository even when the generated analysis was
correct.

## Decision

The spec-framework spec product is generated from repository evidence.

- `spec/` contains generated outputs only.
- Committed input configuration moves outside `spec/` to `spec-framework.json`.
- Generated analysis is the only source for query, audit, and workbench output.
- The workbench ingests generated artifacts and snapshots. It does not read
  curated LikeC4, StrictDoc, Quint, contract sidecars, proposals, or
  `spec/spec.lock`.
- Curated intent, proposal branches, mapping curation, and hash-locked human
  approval are retired.
- Generated requirement, contract, architecture, verification, and diagnostic
  records carry evidence, confidence, and provenance.
- Generated records never claim `approved`, `normative`, or complete behavior.
- Unknowns remain explicit.
- The workbench is read-only over generated outputs. Finding annotations remain
  local review metadata and never edit generated artifacts.
- AI remains evidence-bound and never provides a verdict.

The canonical output is `spec/generated/spec.gen.json`. Detailed analysis IR,
optional exports, evidence, and audit artifacts are derived from it.

## Consequences

Positive:

- One product and one generated model.
- Workbench output cannot drift from the analyzed repository.
- No hand-maintained architecture or requirement files.
- No approval state to invalidate or reconcile.
- Generated outputs are reproducible from source, analyzer, rules, and model
  versions.

Negative:

- The product cannot claim human-approved intent.
- Normative requirements and formal behavior are no longer authored through this
  tool.
- Existing curated spec users must migrate by regenerating outputs.
- Generated behavior is observational and may be incomplete.
- The workbench loses proposal, mapping, and approval surfaces.

## Supersedes

- [0002](0002-likec4-architecture.md): LikeC4 is an optional export, not the
  source of truth.
- [0003](0003-strictdoc-audit.md): StrictDoc is an optional export, not an input
  model.
- [0004](0004-quint-formal.md): authored Quint models are retired from the spec
  product.
- [0005](0005-pluggable-contracts.md): contract surfaces are generated
  observations, not curated sidecars.
- [0006](0006-human-approval-hash-lock.md): hash-locked approval is retired.
- [0011](0011-interactive-use-case-modes.md): proposal creation, curation, and
  rework modes are retired from the workbench.
- Parts of [0012](0012-architecture-intelligence.md): intent and implementation
  remain distinct concepts, but the workbench uses generated implementation
  evidence only.
- Parts of [0015](0015-retire-legacy-roadmap-and-explorer.md): the System view
  remains primary, and the legacy Architecture and Code Map views are now
  retired rather than transitional.

## Rules

- Never present generated output as human-approved intent.
- Never hand-edit `spec/generated/`.
- Never add a curated spec reader back to the workbench.
- Never hide confidence or unknowns in generated records.
- Never let AI approve, reject, pass, or fail a check.
