# Coding style — spec-framework agent rules

Normative for agents working in this repo. `AGENTS.md` defines workflow and
verification. `README.md`, `docs/`, and the decision records define product
direction. Do not invent theory. When documentation and code disagree, fix the
stale side or record a decision; never preserve a contradiction.

## 1. Result pattern, heavily

Standardize on the discriminated tuple and constructors (`src/core/result.ts`):

```ts
export type Result<Value, Failure = string> =
  [value: Value, err: null] | [value: null, err: Failure]

export function ok<Value>(value: Value): Result<Value, never> {
  return [value, null]
}

export function fail<Failure>(error: Failure): Result<never, Failure> {
  return [null, error]
}
```

- Return `Result` for all expected failures: validation, parsing, guards,
  adapter checks, AI validation, and analysis.
- New code constructs results with `ok` / `fail`. Raw tuple literals are
  migration debt; convert them when touching a file.
- `Value` may be a single value or an object payload. Prefer one
  `Result<object, Failure>` over multiple returns or out-params:

```ts
type ElementCount = { elements: number; links: number }

const countElements = (elements: GraphElement[]): Result<ElementCount, string> => {
  if (elements.length === 0) return fail("GRAPH_EMPTY")

  const links = elements.reduce((total, element) => total + element.links.length, 0)

  return ok({ elements: elements.length, links })
}

const [counted, err] = countElements(graph.elements)
if (err !== null) return fail(err)
```

- Destructure as `const [value, err] = ...`, check `err` first, early-return.
  Never use `value` when `err` is non-null.
- Checking `err !== null` narrows `value` to the success type. Keep distinct
  bindings per result; do not reuse one mutable `err`.
- Type `Failure` narrowly (`string` or a failure union) and never include
  `null` or `undefined` in it.
- Reference examples: `src/core/config.ts`, `src/adapters/compiler.ts`, and
  `src/discovery/generic.ts`.

## 2. Exceptions only at the irreplaceable boundary

- Never write `try-catch` and never `throw` for domain failures or control
  flow. The only `try-catch` in the repo lives inside `attempt` /
  `attemptAsync` themselves.
- At throwing boundaries (`fs`, `bun:sqlite`, network/SDK calls,
  `JSON.parse`, and similar APIs that cannot avoid throwing) always use
  `attempt` / `attemptAsync` from `src/core/result.ts`. They wrap the call into
  a `Result` immediately; use pure `Result` flow inward from there.
- The process entrypoint's terminal `.catch` (log + non-zero exit) is the
  single allowed rejection handler outside `attempt`. Never swallow errors.
- If exhaustive matching needs a throwing helper, it lives at
  `src/core/assert.ts` as `assertNever(value: never)`. It is the only
  sanctioned `throw`, and it is only for unreachable `switch` defaults (§6).
  Never call it for reachable control flow.

## 3. OOP by default, functional iteration style

- Behavior lives with the data it mutates. Entities and aggregates encapsulate
  their transitions and invariants. Services hold their dependencies; storage,
  ids, hashers, clocks, and fs are injected at the composition root
  (`bin/spec.ts`, `src/cli.ts`, `src/workbench/server.ts`), never reached for
  inside domain code.
- Stateless helpers: single-consumer helpers are `private` methods of their
  owner. Shared pure helpers remain `static` utility classes (references:
  `SpecGraphBuilder`, `DisplayProjection`, `EvidenceCollector`,
  `WorkbenchService`). Module-level free functions are not allowed for new
  domain code. Existing free functions are refactor debt. Sanctioned
  exceptions: `ok`, `fail`, `attempt`, `attemptAsync`, test framework globals,
  and thin command entrypoints.
- A class of all-`static` methods is only acceptable when it is a pure
  namespace: no state, no dependencies, no invariants. Anything holding state
  or collaborating with the outside world is an instance.
- Composition roots (`bin/spec.ts`, `src/cli.ts`,
  `src/workbench/server.ts`) are the only places that construct collaborators.
  Inward code receives ports and explicit dependencies. No DI container or
  service locator: runtime resolution fails with exceptions instead of
  `Result` and hides the graph from the type checker.
- "Functional" means iteration style: prefer `.map` / `.filter` / `.find` /
  `.reduce` / `.forEach` / `.some` / `.every` over `for` loops for collection
  processing. Use plain loops for repetition and control flow.
- Never use recursion as a substitute for a loop. Recursion is only for
  inherently recursive processing (grammar parsing, compositional evaluation
  over trees); tree transforms and searches use explicit stacks with loops.
- Never mutate inputs — this is critical for `reduce(state, event)`.
- Keep methods and files small and focused. Delete rather than abstract.
- Prefer files under 150 lines; split a file that grows past that instead of
  adding to it. Existing oversized files are refactor debt.

## 4. DDD tactics

- Apply DDD tactics: entities, value objects, aggregates with encapsulated
  invariants. No anemic bags of getters/setters.
- Aggregates are not data bags: mutation happens through intention-revealing
  methods (`beginStep`, `record`, `ask`, `answer`, `finish`), not public field
  writes. Reads may use getters; adapters consume a DTO/snapshot (`runDto`)
  instead of poking at internals.
- Thin adapters (routes, SSE, event-log I/O, views) stay thin; they may be
  functions or thin classes, but hold no domain logic.

## 5. Formatting [NORMATIVE]

- **Prettier is the source of truth.** `.prettierrc.json` is normative:
  `semi: false`, `singleQuote: false`, `tabWidth: 2`, `printWidth: 100`,
  `trailingComma: "all"`, `endOfLine: "lf"`. Generated and ignored trees are
  listed in `.prettierignore`. `eslint-config-prettier` only disables conflicting
  ESLint rules; it does not replace Prettier.
- **ESLint enforces correctness.** `eslint.config.js` uses the recommended
  JavaScript and TypeScript rule sets. `bun run lint` must pass.
- **All code must be formatted.** Before committing, pushing, or opening a
  PR, run `bun run format` (`prettier --write .`). CI and local checks run
  `bun run format:check` (`prettier --check .`); unformatted code fails the
  build. `bun run lint` must also pass, but lint passing does not imply
  formatting is correct.
- Leave blank lines between logical blocks. One concept per line.
- No golfed one-liners, no chained ternaries, no over-compacted pipelines.
- Prefer descriptive names over abbreviations.
- Do not reformat unrelated files except to fix formatting violations; when
  touching a file, ensure the whole file is formatted via Prettier.
- Do not add `// prettier-ignore` or `/* prettier-ignore */` except for
  generated assets or when explicitly justified; comment the justification.

### Naming [NORMATIVE]

- Use complete, descriptive names for variables, parameters, functions,
  methods, types, and constants.
- Never use single-letter or cryptic identifiers. Banned examples: `v`, `l`,
  `e`, `i`, `n`, `pkg`, `ctx`, `req`, `res`, `msg`, `obj`, `fn`, `cb`, `idx`,
  `len`, `tmp`, `val`, `dir`, `src`, `dst`.
- Prefer full words over abbreviations: `database` not `db`, `environment` not
  `env`, `currentWorkingDirectory` not `cwd`, `fileSystem` not `fs`,
  `operatingSystem` not `os`, `packageJson` not `pkg`, `cliArguments` not
  `args`, `context` not `ctx`, `payload`/`message` not `obj`/`msg`.
- Loop variables use `index`, `elementIndex`, `fileIndex`, and similar names;
  never `i`, `j`, or `k`.
- Test fixtures use descriptive keys, never `a`, `b`, or `c`.
- Exceptions: standard acronyms `id`, `url`, and `apiKey`; and `value`/`err` in
  the `Result` tuple.
- Applies to TypeScript and JavaScript, including tests, tools, and ESLint
  rules. External wire-format fields and third-party API names are exempt.

## 6. Airtight TypeScript designs

- Use `satisfies` for configs, registries, and maps.
- Give objects fully typed fields; do not rely on widened inference.
- Prefer exhaustive matching over branch checking. When branching on a union
  kind (`ProposalOperation`, `CurationAction`, `Diagnostic`, failure unions),
  `switch` the discriminant with a `never` default so a new variant fails
  compilation. Never use `if` / `else` chains to pick union arms; guard clauses
  stay for booleans and preconditions only. Close with
  `const exhaustive: never = value; return exhaustive` or
  `assertNever(value: never): never`; never let `default` silently return a
  value. Reference examples: `src/change/operations.ts`,
  `src/discovery/curation.ts`, and `src/core/types.ts`.
- Model failures as discriminated unions, not loose strings or `any`.
- `no any`. Narrow `unknown` with type guards (`isInt` / `isNum` style).
- No `!` non-null assertion. No silent fallbacks — fail closed.

## 7. Repository invariants

- Approved spec sources and `spec/spec.lock` are written only by the human
  approval workflow. Workbench, plugin, query, and analysis surfaces never
  approve and never write the lock.
- Generated artifacts never overwrite sources. `spec/generated`,
  `spec/evidence`, `spec/audit`, and `src/workbench/web/dist` are outputs.
- Native adapters produce deterministic evidence. Missing required tools fail
  closed; no silent skips.
- Stable IDs are the cross-layer contract. Never reuse or renumber IDs.
- Intent, implementation, and mapping graphs stay distinct until an explicit
  projection joins them.
- Analysis is read-only and never executes repository code.
- AI output is evidence-bound, schema-validated, and never a pass verdict.
- SQLite is disposable local state; approved intent is never stored only there.
- Remove stale modules, adapters, and tests instead of keeping a second path.

## 8. Toolchain, imports, tests

- `bun` runs sources directly. The repository commands are
  `bun run format`, `bun run format:check`, `bun run lint`,
  `bun run typecheck`, `bun test`, `bun run spec`, and
  `bun run build:workbench`.
- Imports are relative and extensionless. No path aliases exist.
- New logic needs a test. Prefer focused fixtures over broad integration
  fixtures.
- Test files live under `tests/` as `tests/<area>.test.ts`. There are no
  colocated `*.test.ts` files.
- Run the touched tests first, then `bun test` when the change crosses modules.
- Workbench changes require `bun run build:workbench` before verifying the
  served UI.
- New analysis behavior requires fixture repositories and deterministic output
  assertions.

## 9. No code comments

- Do not write `//`, `/* */`, `/** */`, or JSX comments in code.
- Code must be self-explanatory through descriptive names and small methods.
- Markdown docs (`AGENTS.md`, `README.md`, `docs/`) may still use prose.

## 10. Low complexity, flat indentation

- Keep cyclomatic complexity low: one method, one decision family. Add a
  helper instead of adding a branch.
- Never nest deeper than 2 levels; prefer 1. The method body is level 0.
- Minimize indentation. Keep code at the shallowest level that still reads
  correctly; never indent code just because a wrapper (`if`, loop, function)
  was convenient.
- Flatten aggressively: guard clauses, early returns, `continue`, and
  extracted helpers instead of indented blocks. If a block can be lifted out
  of a wrapper, lift it.
- A nesting level must earn its place; unnecessary indentation is a defect,
  not a style preference.
- Use guard clauses: early-return, `continue`, fail fast.
- Never use `else if` blocks; use `switch` with small arms instead (for union
  kinds see §6 exhaustive matching). Avoid
  `else` entirely through early returns; use `else` only when extremely
  necessary. No `else` after `return` / `continue`. No nested iteration;
  extract the inner iteration into a helper.
- Prefer flat sequential `Result` chains over nested conditionals.
- Split any method that needs more than ~3 branches.

## 11. Keep related lines adjacent (Go-style declaration + verification)

- A `Result` acquire and its guards are one atomic block, exactly like Go's
  `value, err := f()` immediately followed by `if err != nil { ... }`: the
  destructure, the `err` check, and the `null` / `undefined` check are
  **adjacent lines with no blank lines between them**:

```ts
const [config, configError] = await new SpecConfigLoader(target).load()
if (configError !== null) {
  return failure(configError.message)
}
if (config === null) {
  return failure("config loader returned no configuration")
}

return runMap(target, config)
```

- Never separate the declaration from its verification with blank lines. A
  blank line belongs only _after_ the guard block, when the next statement
  stops processing that `Result` — a new call, a transform of other data, or
  the final return.
- The same holds for the whole guard chain: `err` check, then `null` /
  `undefined` check, then any further guard on the same acquire, all adjacent.
  In tests, `expect(err).toBeNull()` is the `err` check and follows the
  destructure immediately, with the `null` / `undefined` guard right after it.

## 12. Module boundaries and facades

- A directory that exposes a public surface owns `index.ts`.
- Consumers outside the directory import through the facade.
- Siblings inside the directory may import each other relatively.
- Existing facades: `src/model`, `src/evidence`, `src/bundle`, `src/terminal`,
  `src/workbench`, `src/query`, `src/change`, `src/plugin`.
- New modules consumed across boundaries must add a facade.
- Delete facade exports when their implementation is removed.
- The repository does not enforce facades with ESLint today. Treat this as a
  review rule and a refactor target, not an optional preference.

## 13. Active development and refactoring [NORMATIVE]

The repository is in active development. The current architecture is a
hypothesis, not a compatibility promise.

### Delete over preserve

- Remove dead code, unused exports, duplicate implementations, stale fixtures,
  and obsolete documentation.
- Do not keep "just in case" branches, adapters, or wrappers.
- Do not leave TODO stubs or half-finished migrations.
- A compatibility shim is allowed only for a versioned external contract such
  as a CLI, public API, file format, or spec schema. Name the contract and the
  condition for removing the shim.

### Refactor toward the current design

- Move, split, merge, or rename modules when the domain model changes.
- Prefer one coherent architecture over incremental accretion.
- Update call sites, tests, docs, and generated artifacts in the same change.
- Delete the old path. Do not keep both implementations.
- Large refactors need a short plan, explicit boundaries, and a verification
  step before edits begin.

### Safety rails

- Search references before deleting: `rg`, the type checker, and the test suite.
- Preserve approved spec sources, evidence, and `spec/spec.lock`; use the
  proposal and approval workflow.
- Never delete user data, evidence, or audit artifacts without explicit
  instruction.
- Run format, lint, typecheck, and tests after refactoring.
- If a change alters product direction or module boundaries, add or update a
  decision record.

## Repository conventions and exceptions

- Specification and direction: `README.md`, `AGENTS.md`, `docs/`, and
  `docs/design-decisions/`. `spec/` is the self-hosted specification.
- Result module: `src/core/result.ts`; default failure type is `string`.
- Toolchain: Bun. Use `bun run format`, `bun run format:check`,
  `bun run lint`, `bun run typecheck`, `bun test`, `bun run spec`, and
  `bun run build:workbench` for UI changes.
- Imports: relative and extensionless. No path aliases exist.
- Tests: `tests/`; no colocated `*.test.ts`.
- Entrypoints: `bin/spec.ts`, `src/cli.ts`, and `scripts/mvp.ts`.
- Generated and ignored trees: `.spec/`, `spec/evidence/`, `spec/audit/`,
  `spec/**/*.gen.*`, `src/workbench/web/dist/`, `node_modules/`, and `dist/`.
- Sanctioned free functions: `ok`, `fail`, `attempt`, `attemptAsync`, test
  framework globals (`describe`, `it`, `expect`, `beforeEach`, `afterEach`), and
  thin command entrypoints. Existing free functions outside those categories
  are refactor debt.
- Sanctioned throws: only inside `attempt` and `attemptAsync`, plus a future
  `assertNever` if it is added under `src/core/assert.ts`.
- Composition roots: `bin/spec.ts`, `src/cli.ts`, and
  `src/workbench/server.ts` may construct collaborators.
- CLI exemption: `bin/` and `scripts/` are entrypoints. They may use free
  functions and direct error handling, but must follow Prettier, `Result` at
  boundaries, and the no-comments rule.
- Comments: Markdown and CLI usage text may use prose. TypeScript and
  JavaScript code must not contain comments.
- Approval, analysis, and AI invariants are defined in §7 and in
  `docs/design-decisions/0012-architecture-intelligence.md`,
  `0013-analysis-persistence.md`, and `0014-ai-interpretation-boundary.md`.
