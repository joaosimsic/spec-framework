# AGENTS.md

`CODING_STYLE.md` is normative for this repository. Read it before changing
code.

## Formatting rule

Run the formatter over all files before finishing a task or committing:

```sh
bun run format
bun run format:check
```

- Use Prettier, do not hand-format.
- `bun run format` runs `prettier --write .`.
- Generated architecture output is ignored by `.prettierignore`; regenerate it
  with `bun run render:graphs`.
- Fix formatting with `bun run format`, then re-run `bun run lint`,
  `bun run typecheck`, and `bun test`.
