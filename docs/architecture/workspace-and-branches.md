# Workspace and branches

> Status: Phase 3 design. Multi-repo workspace support is not implemented.

## Purpose

Most projects start with one repository. Larger products compose several
repositories into one specification. The workspace model supports both without
making multi-repo complexity the default.

This document defines the model. Implementation is Phase 3.

## Default: single repository

With no workspace manifest, the repository root is the workspace root. Relative
paths, IDs, and the audit bundle resolve from that root.

This is the normal mode. It must stay simple.

## Optional multi-repository composition

A workspace manifest (`spec/workspace.toml`) declares repositories, paths, refs,
and exact pins.

```toml
version = 1
repositories_dir = "external"

[[repositories]]
url = "https://github.com/example/website.git"
path = "website"
ref = "refs/heads/main"
commit = "a1b2c3d4e5f6"
```

Rules:

- the manifest is committed with the composition owner;
- `repositories_dir` is explicit, never hardcoded;
- each declaration keeps `ref` as its update source and `commit` as its exact
  selection;
- verification uses recorded commits and does not fetch or synchronize;
- component checkouts are not modified by validation;
- missing or mismatched pins fail the check;
- ignored or ineligible files are reported, not silently included.

## Eligibility

The model root contains at least one eligible Git worktree. Files under the
workspace but outside a worktree are ignored. Ignore rules are explicit and
versioned.

Changing ignore rules changes which sources are eligible. The change report must
show that effect.

## Branch contexts

A branch context pins a model view to a Git branch and one or more component
commits.

A context records:

- branch name;
- base branch and merge-base;
- root commit;
- component commits;
- tool contract version;
- validation state.

Branch names are the public interface. Internal worktree paths and IDs are
private implementation details.

## Admission

A branch context is admitted only when:

- the workspace is clean and owned by this process;
- all pins resolve;
- the composed model validates;
- no blocking unknown or expired waiver exists;
- required evidence matches the selected source state;
- the approval lock is consistent with the selected baseline.

Failed admission preserves the last accepted view. It does not silently replace
it with a partial model.

## Change impact across repositories

Cross-repo impact analysis:

- compares the selected composition with a baseline composition;
- resolves the baseline from a PR merge-base or an explicit commit;
- walks links across component boundaries;
- reports affected requirements, contracts, evidence, and approvals;
- never fetches or synchronizes repositories during analysis.

A cross-repo change without an explicit baseline is incomplete. The report says
so.

## Publication

- component changes commit and publish before the root composition;
- the root records updated pins;
- linked component and root PRs are explicit;
- validation runs on the composed result;
- a pin update without a validated composition is not an approved baseline.

## Isolation

- worktrees are internal and may be reused;
- one process owns a mutable context at a time;
- closing a context preserves branches and commits;
- pending accepted edits block admission of a new context;
- recovery state is explicit.

## Non-goals

- Replacing Git submodules or build systems.
- A package registry.
- Fetching during verification.
- Making every project multi-repo.
- Hiding composition changes inside generated files.
- Allowing an agent to publish or freeze pins without human review.
