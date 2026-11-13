# Principles

## 1. Generated output, not hand-authored specs

The spec product is generated from repository evidence. `spec/` is output.
Input configuration lives outside it. Hand-editing generated output is a defect.

## 2. Architecture describes behavior

Conceptual architecture is reconstructed from entry points, public surfaces,
calls, data access, and external boundaries. Directories, files, and symbols
are implementation evidence. They never define conceptual identity.

## 3. One generated model

Architecture, requirements-as-observed-behavior, contracts, verification,
flows, findings, and evidence come from one analysis snapshot. The workbench
reads one projection.

## 4. Evidence over prose

Every generated element, edge, flow, contract, and finding cites source
locations or a configured check. Prose explains evidence; it does not replace it.

## 5. Confidence is mandatory

Generated records are `observed`, `inferred`, `ambiguous`, or `unknown`.
Incomplete analysis never claims completeness.

## 6. Unknowns stay visible

Dynamic dispatch, unresolved calls, missing tests, unreadable files, and
unavailable tools become explicit unknowns or findings. They are not hidden.

## 7. The workbench is generated-only

The workbench does not read curated LikeC4, StrictDoc, Quint, contract sidecars,
proposals, or `spec.lock`. It reads generated snapshots and artifacts.

## 8. Read-only analysis

Analysis never executes repository code. It respects registered roots,
`.gitignore`, exclusions, symlink containment, and secret-file exclusion.

## 9. Deterministic tools decide mechanical facts

The scanner, TypeScript compiler, graph builder, flow analyzer, diagnostics,
schema validation, and configured checks are reproducible. AI is not a verdict.

## 10. AI is evidence-bound

AI may explain, summarize, and hypothesize over structured evidence. It never
approves, rejects, passes, or fails a check. Every reference is validated.

## 11. Non-web is the default assumption

Contracts include language APIs, data formats, CLIs, wire protocols, and
hardware interfaces. HTTP routes are one observed entry-point kind, not the
product center.

## 12. Compose; do not reinvent

Use the TypeScript compiler, `bun:sqlite`, package metadata, and configured
build/test tools. Build the analysis IR, generated spec contract, flow model,
diagnostics, and workbench projection.

## 13. Reproducibility

The same commit, analyzer version, rules, prompt version, and model version
produce the same generated output. Timestamps are metadata only.

## 14. Local-first

The database is disposable local state. Generated artifacts are portable JSON
and optional exports. No hosted service is required.

## 15. Security boundaries are explicit

Localhost binding, registered roots, path containment, secret redaction, and
read-only analysis are product requirements.

## 16. Delete superseded surfaces

Curated intent, proposal branches, mapping curation, approval locks, and the
legacy Architecture and Code Map views are retired. Do not maintain two
architectures.
