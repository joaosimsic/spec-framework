# 0018 — Verification runs are derived evidence

Status: accepted.

## Context

Decision record [0016](0016-generated-spec-product.md) makes
`spec/generated/spec.gen.json` the canonical generated spec. That spec describes
observed verification targets: test modules and configured checks. It does not
execute repository code and must remain reproducible from repository evidence.

Configured checks are trusted build inputs, but their results depend on the
environment, installed tools, timeouts, and test state. Writing those results
into the canonical spec would break snapshot determinism.

## Decision

Verification execution is a derived artifact, not part of the canonical
generated spec.

- `spec check` runs configured checks and records one verification run.
- A run links to the latest generated snapshot and records the spec hash it was
  checked against.
- Runs are stored in SQLite and written to
  `spec/generated/verification.gen.json`.
- `spec.gen.json` continues to contain verification targets with
  `result: "unknown"`.
- Workbench, query, and bundle read the latest run as a separate object.
- A failed check, missing executable, or timeout produces a failed result.
- No verification run approves a requirement, component, or change.
- AI may explain a verification run later but never changes its result.

## Consequences

Positive:

- Deterministic spec output is preserved.
- Real pass/fail evidence is available without executing code during analysis.
- Check history is queryable per project and snapshot.
- Audit bundles can include the latest verification run.

Negative:

- Readers must combine spec verification targets with run results.
- Verification results are not byte-reproducible.
- A run is evidence for one configured command, not a correctness proof.

## Rules

- Never execute configured checks during analysis.
- Never mutate `spec.gen.json` from `spec check`.
- Never present a check result as approval.
- Never hide failures, timeouts, missing executables, or bounded-output
  truncation.
- Keep canonical target records and derived run results distinct.
