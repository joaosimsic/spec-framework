# Roadmap

## Direction — generated spec product

Status: implemented and validated on three real repositories.

Decision record [0016](design-decisions/0016-generated-spec-product.md) makes
the spec product generated from repository evidence. The workbench reads
generated output only. Curated architecture, requirements, proposals, mapping
curation, and hash-locked approval are retired.

The generated product consists of:

- deterministic repository analysis;
- generated architecture and observed behavior records;
- observed contracts and verification records;
- static flows and deterministic diagnostics;
- evidence-bound AI hypotheses;
- SQLite snapshots and `spec/generated/spec.gen.json`;
- a generated-only System workbench;
- a generated audit bundle.

Detailed phase gates live in
[Architecture intelligence roadmap](roadmap/architecture-intelligence.md).

## Implemented baseline

Status: complete for analysis and generated workbench views.

- TypeScript scanner, analysis IR, and compiler-based symbol/call extraction.
- Local SQLite persistence, migrations, projects, jobs, cancellation, and SSE.
- Generated architecture reconstruction and System projection.
- Static functional flows.
- Deterministic diagnostics and AI-assisted finding boundary.
- Evidence-bound AI validation.
- Snapshot comparison and Evolution view.
- System, Flows, Findings, and Evolution workbench views.

## Migration required

Status: complete.

- [x] Move inputs to `spec-framework.json`.
- [x] Generate observed behavior, contract, and verification records.
- [x] Write canonical `spec/generated/spec.gen.json`.
- [x] Remove curated model reads from analysis and workbench.
- [x] Retire legacy workbench views and APIs.
- [x] Rewrite `spec check`, `spec query`, and `spec bundle` to generated output.
- [x] Rewrite the opencode plugin to read-only generated tools.
- [x] Remove curated `spec/` sources and retired modules.
- [x] Replace obsolete tests and documentation.

## Acceptance

- A repository with no hand-authored spec produces complete generated output.
- The workbench starts on System with no curated model present.
- No workbench route reads `spec/architecture`, `spec/requirements`,
  `spec/formal`, `spec/contracts`, or `spec/spec.lock`.
- Generated requirement records are labeled observed or inferred, never
  approved.
- Generated architecture hierarchy is system -> subsystem -> component -> file
  -> symbol.
- `spec check` validates generated consistency without an approval lock.
- `spec query` and `spec bundle` read `spec.gen.json`.
- Snapshot comparison is deterministic.
- Removing AI does not change deterministic output.
