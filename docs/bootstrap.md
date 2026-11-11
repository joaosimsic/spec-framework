# Bootstrap

> Implementation status: the current skeleton reports missing tools and prints a provisioning plan. The LikeC4, StrictDoc, Quint, JSON Schema, CLI, and Rust public API adapters are implemented. Adapters run only when their sources or language are present, or when explicitly required in config.

## Default

`spec-framework` is full-stack by default. The default profile expects:

- LikeC4 for architecture;
- StrictDoc for requirements and audit output;
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
2. `spec doctor --fix` resolves missing pinned tools using the best available runner.
3. `spec check` runs structural checks, then every active native adapter. An adapter is active when its sources or language are detected, or when it is listed in `spec/config.json`. Inactive adapters do not run and their tools are not required.

If provisioning is not possible, `spec doctor` prints exact commands per missing tool. It never installs globally without explicit consent.

## Provisioning matrix

| Environment | Runner | Behavior |
|---|---|---|
| Nix available | pinned flake | Preferred; reproducible, no global mutation |
| Container runtime available | pinned image | Reproducible; mounts the project read/write |
| Bun available | project-local `bun add` | LikeC4 and Quint tooling |
| Python `uv` available | `uvx` | StrictDoc |
| Java available | cached Apalache distribution | Quint model checking |
| None of the above | instructions | `spec doctor` prints exact commands and exits non-zero |

Pinned versions live in `spec/toolchain.lock.json`. The lockfile is committed. `spec doctor --fix` does not resolve floating versions.

## Project-local by default

Provisioned tools live under one of:

- `.spec/tools/` inside the project;
- the Nix store;
- a container image;
- an explicitly configured cache.

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

| Missing | Effect |
|---|---|
| LikeC4 | architecture validation, views, and MCP unavailable; affected approval blocked |
| StrictDoc | traceability and PDF/HTML audit export unavailable; approval blocked |
| Quint | formal properties unverified; affected approval blocked |
| Apalache | model checking unavailable; formal approval blocked |
| Contract adapter | boundary evidence missing; affected approval blocked |
| PDF renderer | bundle HTML available; formal PDF approval blocked |

`spec check` reports the exact blocked scope. It does not silently downgrade an approved claim.

## Offline and CI

- `spec doctor --fix` can use a pre-populated cache.
- CI uses the pinned lockfile and does not resolve new versions.
- The audit bundle records runner, tool versions, command lines, and input hashes.
- Missing tools in CI fail the job; local development may run structural-only checks for fast feedback.

## Example doctor output

```text
$ spec doctor
likec4       missing    run: spec doctor --fix
strictdoc    ok         0.30.1
quint        ok         0.30.0
apalache     missing    requires Java 21+; run: spec doctor --fix
pdf          ok         strictdoc html2pdf
contracts    ok         json-schema, cli

2 missing capabilities. Full approval is blocked for architecture and formal claims.
```

## Security

- Provisioning is explicit and pinned.
- No arbitrary remote scripts.
- The runner is recorded in evidence.
- Tool downloads are verified when the ecosystem provides checksums or signatures.
- The framework never stores credentials in the spec tree.
