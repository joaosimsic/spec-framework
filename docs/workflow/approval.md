# Approval

## Principle

Approval is a human action over a specific, hashed state of the specification and its evidence. It is not a status an agent can set.

## Statuses

| Status | Meaning |
|---|---|
| `draft` | Incomplete; not reviewed |
| `proposed` | Complete enough for review; not approved |
| `approved` | Human-approved and hash-locked |
| `deprecated` | Retired; retained for audit |

Only `approved` elements may be implemented or counted as verified.

## Spec lock

`spec.lock` is a deterministic record of approved content and evidence:

```json
{
  "version": 1,
  "approved_at": "2026-11-10T12:00:00Z",
  "approver": "joao",
  "elements": {
    "REQ-AUTH-001": {
      "content_hash": "sha256:...",
      "evidence": ["EVD-AUTH-EXPIRY-001"]
    },
    "CMP-AUTH": {
      "content_hash": "sha256:...",
      "evidence": []
    }
  },
  "evidence": {
    "EVD-AUTH-EXPIRY-001": {
      "hash": "sha256:...",
      "tool": "quint+apalache",
      "result": "pass"
    }
  }
}
```

The lock contains no secrets. It may be committed.

## Approval command

```bash
spec approve REQ-AUTH-001 AC-AUTH-001 CMP-AUTH PROP-AUTH-EXPIRY
```

Requirements:

- all referenced IDs exist;
- all are `proposed`;
- structural and native checks pass for the scope;
- every requirement has acceptance criteria and formalization or waiver;
- evidence hashes match the current sources;
- approver identity is available;
- the git tree is clean, or the approval records the dirty state explicitly.

On success:

- hashes are written to `spec.lock`;
- status becomes `approved`;
- an approval record is appended to the audit trail;
- the bundle approval page is updated.

## Human-only enforcement

- `spec approve` requires an interactive human confirmation or a signed approval token.
- Agent permissions deny writing `spec.lock` and deny running `spec approve`.
- CI rejects approval commits that cannot be tied to a human identity.
- The approval record includes the method used.

## Approval scope

Approval can cover:

- a single element;
- a requirement plus its criteria and evidence;
- a feature slice;
- a release baseline.

A feature slice approval does not approve unrelated elements. The audit bundle states the approved scope.

## Evidence requirements

| Element | Required evidence |
|---|---|
| Requirement | Acceptance criteria and formalization or waiver |
| Acceptance criterion | Evidence ID or explicit unknown |
| Formal property | Model-checking result |
| Contract | Adapter validation and compatibility result |
| Component | Architecture validation and owner review |

Missing evidence blocks approval. A waiver is the only exception.

## Invalidation

Approval is invalid when:

- content hash changes;
- evidence hash changes;
- linked formal property fails;
- linked contract becomes incompatible;
- waiver expires;
- blocking unknown is added;
- status moves out of `approved`.

Invalidation is automatic and shown in the change report.

## Signing

Recommended release flow:

1. Generate the bundle from a clean commit.
2. Verify `spec.lock` and the manifest.
3. Create a signed git tag for the approved baseline.
4. Archive the bundle with the tag.

The signed tag binds the human identity to the commit. `spec.lock` binds the commit content to approved elements and evidence.

## Failure modes

- **Hash mismatch**: content changed after approval. Re-review required.
- **Missing approver**: approval rejected.
- **Dirty tree**: approval allowed only with explicit override and recorded dirty hash.
- **Agent approval attempt**: rejected and logged.
- **Stale evidence**: approval blocked until evidence is regenerated.
- **Expired waiver**: approval blocked until the waiver is renewed or the requirement is fixed.
