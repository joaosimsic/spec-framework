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
- Record product or module-boundary changes as a decision record.
- Run `bun run format`, `bun run lint`, `bun run typecheck`, and `bun test`
  after refactoring.

## Direction

Decision records [0016](docs/design-decisions/0016-generated-spec-product.md) and
[0017](docs/design-decisions/0017-behavior-derived-architecture.md) are the
product direction. They supersede the curated-spec and approval model.

- The spec product is generated from repository evidence.
- `spec/` is generated output. Input configuration lives in
  `spec-framework.json` at the repository root.
- The workbench reads generated output only. It never reads curated LikeC4,
  StrictDoc, Quint, contract sidecars, proposals, or `spec.lock`.
- Generated records are evidence, never human-approved intent.
- Conceptual architecture is derived from behavior, interfaces, and data flow.
  Directories and file names are implementation evidence only.
- The System view is the primary human surface.
- AI is evidence-bound and never approves, rejects, passes, or fails a check.
- Curated intent, proposals, mapping curation, and hash-locked approval are
  retired. Do not reintroduce them without a new decision record.
- Do not hand-edit `spec/generated/`.

## Formatting rule

Run the formatter over all files before finishing a task or committing:

```sh
bun run format
bun run format:check
```

- Use Prettier, do not hand-format.
- `bun run format` runs `prettier --write .`.
- Generated spec output is ignored by `.prettierignore`; regenerate it with
  `bun run bin/spec.ts analyze` when needed.
- Workbench asset changes require `bun run build:workbench` before verifying the
  served UI.
- Fix formatting with `bun run format`, then re-run `bun run lint`,
  `bun run typecheck`, and `bun test`.
