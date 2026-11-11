# Audit bundle

## Purpose

The audit bundle is the final readable, auditable artifact. It is generated deterministically from the specification sources and evidence. No LLM writes it at render time.

The bundle keeps full internal identity: element IDs, status values, provenance,
confidence, hashes, and diagnostic codes. Interactive surfaces hide those by
default; the audit record does not. Human-readable sections may use names, but
the traceability appendices and manifest preserve identity.

## Implementation status

`spec bundle` implements the first deterministic slice. It runs the full check,
refuses a dirty tree unless `--allow-dirty`, and writes a versioned directory
with `manifest.json`, `graph.json`, `index.html`, `spec.pdf`,
`change-report.md`, `spec.lock` when present, copied sources, and regenerated
evidence records. `graph.json` includes SDoc records, annotated LikeC4 elements,
contract sidecars, and evidence.

The default destination is `spec/audit/audit-<short-commit>`. `--output`
overrides it and `--force` replaces an existing bundle directory only.

The HTML and PDF render the same report model. The PDF is a dependency-free,
deterministic text renderer; native LikeC4 view embedding and StrictDoc/Typst
PDF assembly remain future work. Evidence is stored as JSON records grouped by
method, not as raw native validator logs.

## Outputs

Every bundle produces:

- `spec.pdf` — formal review and sign-off;
- `index.html` — browsable audit surface;
- `manifest.json` — provenance, hashes, tool versions;
- `graph.json` — read-only unified graph export;
- `evidence/` — regenerated evidence records grouped by method;
- `change-report.md` — what changed since the approved baseline;
- `spec.lock` — approved element and evidence hashes, when an approval lock exists.

The bundle is stored as a versioned directory or archive:

```text
audit-a1b2c3d4e5f6/
  spec.pdf
  index.html
  manifest.json
  graph.json
  change-report.md
  spec.lock
  evidence/
    formal/
    test/
    analysis/
    inspection/
    demonstration/
    implementation/
    contracts/
  sources/
    config.json
    toolchain.lock.json
    architecture/
    capabilities/
    requirements/
    semantic/
    verification/
    formal/
    contracts/
    implementation/
```

## Required sections

The bundle graph includes the current SDoc, architecture, formal, contract, and
evidence collectors. Capability, semantic, verification, and native
architecture-view sections gain content as those collectors are implemented.

1. Cover: project, version, commit, date, tool versions, approval status.
2. Scope: what the specification covers and what it does not.
3. Glossary and vocabulary: defined terms, concept schemes, forbidden synonyms.
4. Architecture: rendered views, element catalog, relations, boundaries.
5. Capabilities: hierarchy, context, requirement derivation, coverage.
6. Requirements: EARS statements, rationale, priority, status, acceptance criteria.
7. Ontology and semantic contracts: scope, external sources, SHACL profiles, violations.
8. Behavior: Quint literate sections, invariants, properties, traces, verification results.
9. Contracts: API surfaces, data dictionaries, CLI help, bindings, compatibility reports.
10. Verification plan: objectives, cases, methods, targets, coverage, waivers.
11. Traceability matrix: capability to requirement to component to formalization, contract, code, test.
12. Verification report: model checking, conformance, semantic validation, contract checks, failures.
13. Unknowns and assumptions: owner, blocking status, affected elements.
14. Waivers: scope, owner, reason, expiry.
15. Decisions: ADRs and design rationale.
16. Evidence index: each item with method, input hashes, and tool versions.
17. Approval page: approved element IDs, hashes, approver, timestamp.
18. Change history and impact: capability, architecture, requirement, semantic, formal, and contract changes.

## Manifest

```json
{
  "version": 1,
  "spec_version": "0.1.0",
  "graph_version": 1,
  "project": {
    "name": "spec-framework",
    "adoption": "existing"
  },
  "git": {
    "workspace": "single-repo",
    "commit": "a1b2c3d",
    "dirty": false,
    "preview": false
  },
  "tools": {
    "spec": "0.1.0",
    "likec4": "1.x",
    "strictdoc": "0.30.1",
    "quint": "0.30.0"
  },
  "checks": {
    "errors": 0,
    "warnings": 0,
    "diagnostics": 0
  },
  "sources": {
    "architecture": [
      { "path": "spec/architecture/model.c4", "hash": "sha256:..." }
    ],
    "requirements": [
      { "path": "spec/requirements/core.sdoc", "hash": "sha256:..." }
    ]
  },
  "evidence": {
    "EVD-AUTH-EXPIRY-001": {
      "kind": "model-check",
      "method": "formal",
      "result": "pass",
      "tool": "quint",
      "hash": "sha256:...",
      "input_hash": "sha256:..."
    }
  },
  "approvals": {
    "approved_elements": 12,
    "approved_evidence": 7,
    "pending": 3,
    "approver": "reviewer",
    "approved_at": "2026-11-10T00:00:00.000Z"
  },
  "files": {
    "graph.json": "sha256:...",
    "index.html": "sha256:...",
    "spec.pdf": "sha256:..."
  }
}
```

## Reproducibility

- Bundle generation fails on a dirty git tree unless `--allow-dirty` is passed for local preview.
- Tool versions are pinned.
- Inputs are hashed.
- The first-slice HTML and PDF outputs are deterministic and contain no generation timestamp.
- Outputs are deterministic where the underlying renderer permits; nondeterministic sections are identified.
- CI regenerates the bundle instead of trusting a checked-in artifact.
- Evidence is regenerated from sources, not copied from a previous run.

## Reading path

The bundle is designed for a human reviewer:

1. Read scope, glossary, and vocabulary.
2. Review architecture views and capabilities.
3. Read requirements and acceptance criteria.
4. Inspect semantic constraints and SHACL results.
5. Inspect formal properties and the verification plan.
6. Check contracts, bindings, and compatibility.
7. Read unknowns and waivers.
8. Confirm the approval page.

The reviewer does not need to read raw LikeC4, SDoc, Quint, or adapter output to find gaps. Those sources are included for audit.

## Change report

`spec change` compares the approved baseline with the current proposal:

- added, modified, removed elements;
- affected capabilities, requirements, and components;
- ontology, concept, and semantic-contract changes;
- verification objectives and cases added or changed;
- invalidated evidence;
- new failures;
- approvals that must be renewed;
- diagram diffs;
- contract compatibility and binding changes.

The change report is the primary review surface for proposals.

## Approval page

Each approved element appears with:

- ID and title;
- content hash;
- evidence hashes;
- approver;
- timestamp;
- approval scope.

If any hash no longer matches, the element is shown as unapproved and the bundle cannot be used for formal sign-off.

## Failure behavior

The bundle is not produced, or is produced with a blocking warning, when:

- a required tool is missing;
- a native validator fails;
- a semantic contract violation is blocking;
- a capability has no requirement or verification coverage;
- a linked formal property fails;
- a verification case has no evidence;
- an approved element changed without re-approval;
- a blocking unknown remains;
- a waiver expired;
- the git tree is dirty without explicit override;
- generated files were edited by hand.

## What the bundle is not

- It is not a substitute for the source artifacts.
- It is not a proof of intent.
- It is not a code correctness certificate.
- It is not generated by the agent.
- It is not the Explorer. The Explorer is a read-only navigation aid over the same validated model.
