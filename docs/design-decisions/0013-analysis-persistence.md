# 0013 Analysis persistence and snapshots

Status: accepted.

## Context

Architecture intelligence needs analysis runs, snapshots, findings,
annotations, and comparison across Git commits. The current tool keeps state in
files under `spec/` and `.spec/`, with deterministic generated artifacts and a
hash lock for approval.

A server database would make local adoption heavier. A file-only store would
make querying, history, and annotation status brittle.

## Decision

Use local SQLite through `bun:sqlite` for analysis state, plus generated JSON for
portable artifacts.

- Database: `.spec/analysis.sqlite`, ignored by Git.
- Portable artifacts: `spec/generated/*.gen.json`, ignored by Git.
- Intent and approval sources: unchanged under `spec/`.
- Snapshot identity: Git commit plus analyzer, rule, prompt, and model versions.
- Migrations: versioned SQL under `src/persistence/migrations/`.
- JSON export: latest snapshot and selected comparisons.
- PostgreSQL: not part of the MVP; revisit only if graph traversal becomes a
  measured bottleneck.

The database is a cache and history store, not a source of truth for approved
intent. Deleting it must be safe; a new analysis rebuilds it.

## Consequences

Positive:

- Local-first setup with no external service.
- Recursive queries and indexes without inventing a file format.
- Snapshots support comparison and reproducibility.
- JSON export keeps audit and portability.

Negative:

- SQLite schema and migrations must be maintained.
- Concurrent analysis and reads need care.
- Large symbol graphs may need pruning and pagination.
- Database deletion loses annotations unless they are also exported.

## Rules

- Never store secrets or environment files in the database.
- Never store approved intent only in the database.
- Record tool versions with every snapshot.
- Keep analysis output reproducible for the same commit and versions.
- Make database rebuild explicit and safe.
