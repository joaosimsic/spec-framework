# AGENTS.md

`CODING_STYLE.md` is normative for this repository. Read it before changing
code.

## Active development

This repository is in active development. The current architecture is a working
design, not a compatibility contract.

- The strict rules in `CODING_STYLE.md` apply everywhere. Existing violations
  are refactor debt, not precedent.
- Delete dead, duplicated, or superseded code instead of preserving it.
- Refactor across module boundaries when the current design requires it.
- Do not add compatibility shims, deprecation wrappers, or feature flags for
  internal code unless a versioned external contract requires them.
- Complete migrations. Do not leave two architectures or half-finished paths.
- Replace obsolete tests, fixtures, and documentation in the same change.
- Search references before deleting. Use `rg`, the type checker, and the tests.
- Never delete approved spec content, evidence, or `spec/spec.lock` outside the
  proposal and approval workflow.
- Record product or module-boundary changes as a decision record.
- Run `bun run format`, `bun run lint`, `bun run typecheck`, and `bun test`
  after refactoring.

## Direction

Decision record [0012](docs/design-decisions/0012-architecture-intelligence.md)
is the product direction. Decision record
[0015](docs/design-decisions/0015-retire-legacy-roadmap-and-explorer.md) retires
the Explorer and the old Phase 2/3 roadmap commitments.

- Documentation leads with architecture intelligence, not the old intent-only
  roadmap.
- The workbench System view is the primary human surface.
- Intent, implementation, and mapping stay distinct. Implementation evidence is
  generated, never approved intent.
- AI is evidence-bound and never approves or passes a check.
- Do not reintroduce a retired surface or phase without a new decision record.

## Formatting rule

Run the formatter over all files before finishing a task or committing:

```sh
bun run format
bun run format:check
```

- Use Prettier, do not hand-format.
- `bun run format` runs `prettier --write .`.
- Generated architecture output is ignored by `.prettierignore`; regenerate it
  with `bun run spec architecture generate` when needed.
- Workbench asset changes require `bun run build:workbench` before verifying the
  served UI.
- Fix formatting with `bun run format`, then re-run `bun run lint`,
  `bun run typecheck`, and `bun test`.
