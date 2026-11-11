# Audit bundle

## Purpose

The audit bundle is the final readable, auditable artifact. It is generated deterministically from the specification sources and evidence. No LLM writes it at render time.

## Outputs

Every bundle produces:

- `spec.pdf` — formal review and sign-off;
- `index.html` — browsable audit surface;
- `manifest.json` — provenance, hashes, tool versions;
- `graph.json` — read-only unified graph export;
- `evidence/` — model-checking logs, traces, contract reports, test results;
- `change-report.md` — what changed since the approved baseline;
- `spec.lock` — approved element and evidence hashes.

The bundle is stored as a versioned directory or archive:

```text
audit-2026.11.10-a1b2c3d/
  spec.pdf
  index.html
  manifest.json
  graph.json
  change-report.md
  spec.lock
  evidence/
    likec4/
    strictdoc/
    semantic/
    verification/
    quint/
    contracts/
    conformance/
  sources/
    architecture/
    capabilities/
    requirements/
    semantic/
    verification/
    formal/
    contracts/
```

## Required sections

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
  "spec_version": "0.1.0",
  "git": {
    "commit": "a1b2c3d",
    "dirty": false
  },
  "tools": {
    "spec": "0.1.0",
    "likec4": "1.x",
    "strictdoc": "0.30.1",
    "semantic": "optional",
    "quint": "0.30.0",
    "apalache": "0.44.x"
  },
  "sources": {
    "architecture": ["sha256:..."],
    "capabilities": ["sha256:..."],
    "requirements": ["sha256:..."],
    "semantic": ["sha256:..."],
    "verification": ["sha256:..."],
    "formal": ["sha256:..."],
    "contracts": ["sha256:..."]
  },
  "evidence": {
    "EVD-AUTH-EXPIRY-001": {
      "kind": "model-check",
      "method": "formal",
      "result": "pass",
      "input_hash": "sha256:..."
    }
  },
  "approvals": {
    "approved_elements": 12,
    "approved_capabilities": 2,
    "approved_verification_cases": 5,
    "approved_evidence": 7,
    "pending": 3
  }
}
```

## Reproducibility

- Bundle generation fails on a dirty git tree unless `--allow-dirty` is passed for local preview.
- Tool versions are pinned.
- Inputs are hashed.
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
