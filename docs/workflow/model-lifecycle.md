# Model lifecycle

> Status: Phase 3 design. Migration tooling is not implemented.

## Purpose

The specification model, config, and lockfile evolve. Upgrades must be explicit,
reproducible, and reversible. A schema change must not silently reinterpret
approved content.

This document defines model migration and versioning. Implementation is Phase 3.

## Versioned artifacts

Version these:

- `spec/config.json`;
- `spec/toolchain.lock.json`;
- `spec/spec.lock`;
- workspace manifests;
- element and relation kinds;
- provenance and status values;
- ID conventions;
- evidence formats.

Generated artifacts carry the model and tool versions that produced them.

## Migration

`spec migrate` previews supported model migrations by default.
`spec migrate --fix` applies them.

Rules:

- preview first;
- never migrate an approved baseline without a change report;
- preserve IDs;
- preserve provenance;
- preserve approval hashes only when content is unchanged;
- invalidate evidence when its inputs change;
- record old and new versions;
- fail closed on unknown constructs;
- do not fetch remote schemas during migration.

A migration that changes meaning requires human review and re-approval.

## Lint repair

`spec lint` inspects structural and cross-layer problems.
`spec lint --fix` applies only safe, documented repairs.

Safe repairs:

- canonical ordering;
- missing required formatting;
- deterministic ID normalization where no collision exists;
- link spelling that resolves to exactly one element;
- known deprecated field migrations.

Unsafe repairs are proposals, not automatic edits:

- changing normative statements;
- changing relation targets;
- deleting elements;
- resolving ambiguous IDs;
- changing owners or approvals.

## Compatibility

The framework declares:

- model version;
- tool contract version;
- minimum readable version;
- migration path;
- deprecation window.

Older models can be read only when the framework can prove the interpretation.
Otherwise the check stops and asks for migration.

## Deprecation

- IDs are never reused.
- Deprecated elements remain readable.
- Replacement links are explicit.
- Evidence remains available for audit.
- Downstream links must be updated or waived.
- A deprecated construct in config fails after its removal window.

## Evidence and approval

- Migration is a change.
- Changed sources invalidate affected evidence.
- Changed evidence invalidates affected approvals.
- Unchanged elements keep their approval hashes.
- The migration report lists every invalidated hash.
- The audit bundle records the migration path and tool versions.

## Rollback

- Reverting the migration commit restores sources.
- Evidence is regenerated for the restored sources.
- Approval hashes are verified against the restored content.
- A rollback is complete only when `spec check` and `spec bundle` pass.
- Do not restore a stale bundle without regenerating it.

## Testing

Every migration has:

- a before fixture;
- an after fixture;
- an idempotence check;
- a failure fixture for unknown constructs;
- a link and hash preservation check;
- a documented rollback path.

## Non-goals

- Silent in-place upgrades.
- Remote schema resolution.
- Automatic meaning changes.
- Reusing IDs across migrations.
- Keeping obsolete constructs forever.
