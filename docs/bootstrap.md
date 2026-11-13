# Bootstrap

> Implementation status: `spec doctor --fix` installs pinned LikeC4, Quint, and StrictDoc under `.spec/tools` using Bun and uv, then reports any tool it cannot provision safely. Apalache and Java remain manual prerequisites. The LikeC4, StrictDoc, Quint, JSON Schema, CLI, and Rust public API adapters are implemented. Adapters run only when their sources or language are present, or when explicitly required in config.

## Default

`spec-framework` is full-stack by default. The default profile expects:

- LikeC4 for architecture;
- a capability model linked to architecture and requirements;
- StrictDoc for requirements and audit output;
- a verification plan for objectives, methods, and cases;
- optional RDF/OWL/SKOS/SHACL sources when the semantic layer is active;
- Quint and Apalache for formal behavior;
- at least one contract adapter;
- a PDF-capable renderer for the audit bundle.

The framework does not require manual tool-by-tool installation. It requires one bootstrap action and then verifies the environment.

## One-command setup

```bash
spec init
spec doctor --fix
spec check
```

1. `spec init` detects the project type, writes `spec/config.json`, and scaffolds the full profile.
2. `spec doctor --fix` installs pinned tools with the available package-manager runners.
3. `spec check` runs structural checks, then every active native adapter. An adapter is active when its sources or language are detected, or when it is listed in `spec/config.json`. Inactive adapters do not run and their tools are not required.

If provisioning is not possible, `spec doctor` prints exact commands per missing tool. It never installs globally without explicit consent.

## Provisioning matrix

| Tool          | Runner | Behavior                                                  |
| ------------- | ------ | --------------------------------------------------------- |
| LikeC4, Quint | Bun    | `bun add --exact` under `.spec/tools`                     |
| StrictDoc     | uv     | `uv tool install` into `.spec/tools`                      |
| Apalache      | manual | pinned release and Java 21+ reported as instructions      |
| Java          | manual | Java 21+ reported as instructions                         |
| Unpinned tool | none   | `spec doctor --fix` refuses to resolve a floating version |

Pinned versions live in `spec/toolchain.lock.json`. The lockfile is committed. `spec doctor --fix` does not resolve floating versions.

## Project-local by default

The current implementation provisions tools under `.spec/tools/` inside the project. Nix and container runners remain future additions.

No global installs, no `curl | sh`, no edits to shell profiles. A tool provisioned for one project does not silently become the default for another.

## Fast structural checks

`spec check --structural` runs before native tools are invoked. It parses the same SDoc sources and checks:

- unique IDs;
- required fields;
- EARS shape;
- link resolution;
- status and approval consistency;
- unknown and waiver validity.

This is not a reduced product mode. It is a preflight that gives immediate feedback while full provisioning is completed. Full approval and bundle generation still require native checks.

## Missing tools

| Missing           | Effect                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| LikeC4            | architecture validation and views unavailable; affected approval blocked                  |
| Capability lint   | capability coverage and hierarchy unavailable; affected approval blocked                  |
| StrictDoc         | traceability and PDF/HTML audit export unavailable; approval blocked                      |
| Semantic adapter  | semantic validation and SHACL evidence unavailable when active; affected approval blocked |
| Verification plan | verification coverage and method tracking unavailable; affected approval blocked          |
| Query             | read-only graph access unavailable; validation and approval still work                    |
| System workspace  | local review and drill-down unavailable; validation and approval still work               |
| Quint             | formal properties unverified; affected approval blocked                                   |
| Apalache          | model checking unavailable; formal approval blocked                                       |
| Contract adapter  | boundary evidence missing; affected approval blocked                                      |
| PDF renderer      | bundle HTML available; formal PDF approval blocked                                        |

`spec check` reports the exact blocked scope. It does not silently downgrade an approved claim.

## Offline and CI

- `spec doctor --fix` reuses the project-local `.spec/tools` cache.
- CI uses the pinned lockfile and does not resolve new versions.
- The audit bundle records runner, tool versions, command lines, and input hashes.
- Missing tools in CI fail the job; local development may run structural-only checks for fast feedback.

## Example doctor output

```text
$ spec doctor --fix
provisioned strictdoc 0.30.4
provisioned quint 0.33.1
skipped apalache: install pinned Apalache release (requires Java 21+) [TOOL-UNSUPPORTED]

likec4       ok         required  run spec doctor --fix (bun)
strictdoc    ok         required  run spec doctor --fix (uv)
quint        ok         required  run spec doctor --fix (bun)
apalache     missing    required  install pinned Apalache release (requires Java 21+)
java         ok         required  install Java 21+

1 required tool(s) missing
```

## Security

- Provisioning is explicit and pinned.
- No arbitrary remote scripts.
- The runner is recorded in evidence.
- Tool downloads are verified when the ecosystem provides checksums or signatures.
- The framework never stores credentials in the spec tree.
