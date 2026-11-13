# Workbench

Status: implemented with behavior-derived conceptual architecture.

## Purpose

The workbench is a local read-only surface over generated analysis. It is not a
spec authoring or approval tool.

It reads:

- `.spec/analysis.sqlite`;
- `spec/generated/spec.gen.json`;
- `spec/generated/analysis.gen.json`;
- Git metadata for staleness.

Verification runs and AI interpretations are stored in `.spec/analysis.sqlite`
and exported to `spec/generated/verification.gen.json` and
`spec/generated/interpretations.gen.json` for portability. The workbench reads
the stored records; it never executes checks or AI calls.

It does not read:

- `spec/architecture/model.c4`;
- `spec/requirements/`;
- `spec/formal/`;
- `spec/contracts/`;
- `spec/spec.lock`;
- proposal branches.

## Interaction model

- React, Vite, and TypeScript in `src/workbench/web/`.
- A Bun server in `src/workbench/server.ts` serves built assets and the API.
- `bun run build:workbench` produces static assets.
- Localhost binding by default.
- Non-local access requires an explicit allowed origin.
- No mutating proposal or approval route.

## Write boundary

| Context               | Allowed                        |
| --------------------- | ------------------------------ |
| Generated spec        | Read-only                      |
| Generated analysis    | Read-only                      |
| Snapshot database     | Analysis job writes only       |
| Finding annotation    | Local `.spec/` review metadata |
| `spec-framework.json` | Read-only                      |
| `spec/generated/`     | Never written by the workbench |

## Views

### System

Default. Behavior-derived conceptual architecture with drill-down from system
to subsystem/component to interfaces, data stores, external systems, and
implementation mappings. The inspector shows the deterministic role summary,
evidence, implementation, relations, data access, tests, flows, findings, and
confidence.

### Flows

Entry points, ordered steps, branches where visible, sources, sinks, unknowns,
and limits.

### Findings

Deterministic diagnostics separated from AI-assisted hypotheses. Humans can
locally confirm, reject, or mark findings as needing investigation.

### Verification

Latest `spec check` run: overall result, consistency findings, configured
checks, exit codes, durations, bounded output, and hashes. The workbench never
runs checks.

### Interpretations

Latest explicit `spec interpret` run: AI contract and failed-check hypotheses
with file/line evidence, provider, model, prompt version, and confidence.
AI-inferred only; no approval or verdict.

### Evolution

Comparison of two generated snapshots by commit.

### Generated documents

Rendered generated spec sections and technical metadata. No editing.

## API

The workbench uses `/api/v1`. Legacy proposal, mapping, curated architecture,
and repository graph endpoints are retired.

## Terminal equivalents

Terminal interaction for proposals and curation is retired. CLI commands run
analysis, query generated output, compare snapshots, and produce bundles.

## Failure states

- No snapshot: show “Run spec analyze”.
- Stale snapshot: show commit mismatch.
- Incompatible schema: refuse to render.
- Analysis failure: show the job error and last successful snapshot.

## Acceptance

- No curated spec reader is reachable from the workbench.
- No approval or proposal route exists.
- System, Flows, Findings, Verification, Interpretations, Evolution, and
  generated documents work from one snapshot.
- Generated output cannot be edited through the API.
