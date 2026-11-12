# Self-host MVP

> Status: implemented. `bun run mvp` exercises one approved self-hosted slice:
> requirement, architecture, Quint property, Apalache verification, evidence,
> approval, audit bundle, change simulation, approval invalidation, and
> re-approval. It runs in a temporary Git worktree and leaves this repository
> untouched.

## Purpose

The MVP answers one question: does the core specification loop produce useful
feedback on a real repository?

It is not a complete self-hosting approval. It approves one pilot slice:

- `REQ-CHECK-001` and `AC-CHECK-001` from `spec/requirements/core.sdoc`;
- the `SYS-SPEC-FRAMEWORK`, `CMP-SPEC-FRAMEWORK-CLI`, and
  `CMP-SPEC-FRAMEWORK-OPENCODE-PLUGIN` architecture elements;
- `PROP-CHECK-001` from `spec/formal/check.qnt`.

The pilot verifies the model, not the TypeScript implementation.

## Prerequisites

- Bun 1.4 or later.
- `uv`.
- Java 21 or later.
- Apalache 0.63.0.
- Project-local LikeC4, Quint, and StrictDoc tools.

Quint is the formal modeling language. Apalache is the model checker that Quint
uses to verify invariants. The MVP installs and checks the project-local tools,
but Apalache remains a manual prerequisite.

Install pinned Apalache into the project-local tool directory:

```bash
mkdir -p .spec/tools/bin .spec/tools/apalache
curl -L -o /tmp/apalache.zip \
  https://github.com/apalache-mc/apalache/releases/download/v0.63.0/apalache-0.63.0.zip
unzip -q /tmp/apalache.zip -d .spec/tools/apalache
ln -sfn ../apalache/apalache-0.63.0/bin/apalache-mc .spec/tools/bin/apalache-mc
```

Provision the remaining tools:

```bash
bun install
bun run spec doctor --fix
bun run spec doctor
```

`spec doctor` must report every required tool as present.

## Run

```bash
bun run mvp
```

Expected runtime is about 90 seconds after tools and caches are warm. The first
run is slower.

The harness prints each step and a heartbeat for long-running checks.

## What it verifies

1. The local toolchain is complete.
2. The full native check passes.
3. The pilot requirement and architecture elements are approved.
4. Evidence is rehashed after approval status writes.
5. The audit bundle contains HTML, PDF, manifest, graph, lock, evidence, and
   change report.
6. Default query output contains no internal IDs.
7. The workbench API serves a session and graph.
8. A refactor proposal lists the pilot approval for renewal.
9. Editing approved content makes `spec check` fail with an approval finding.
10. Re-approval restores a passing check.
11. `spec map --check` reports zero drift for the approved architecture slice.

## Artifacts

On success, the harness prints:

- the temporary workspace path;
- the generated audit bundle path;
- the approval invalidation pair;
- elapsed time.

The temporary workspace is kept for inspection. Remove it after review.

## Evaluate

Use these questions to decide whether the direction is right:

- Did the first gap report arrive quickly and name useful problems?
- Did approval include exactly the expected requirement, acceptance criterion,
  architecture elements, and evidence?
- Did the bundle explain scope, evidence, approvals, and gaps without reading
  internal IDs?
- Did a real content change invalidate exactly the expected approval?
- Did re-approval feel safe and understandable?
- Did the workbench and terminal sessions help, or duplicate the CLI?
- Would you use this on the next real feature?

## Failure behavior

- A missing tool stops the MVP before any approval.
- A failing check stops the MVP and prints diagnostics.
- A failed step keeps the temporary workspace and prints its path.
- Approval, `spec.lock`, and bundle work happen only inside the temporary
  workspace.
- The workbench and plugin still have no approval path.

## Deferred

- Approving every self-hosted requirement.
- Capability and verification planning.
- Semantic adapters, MCP, Explorer, workspaces, and migration.
- Release binaries and macOS packaging.
- Waiver workflows.
