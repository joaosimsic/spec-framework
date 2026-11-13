# Implementation checks

Status: implemented. Configured checks produce derived verification runs.

## Purpose

Configured build, typecheck, and test commands produce verification evidence in
separate verification runs. A passing command proves only that command's result.

## Scope

In scope:

- explicit command arrays;
- exit codes and bounded output;
- missing executables;
- configured working directory;
- timeout and output bounds;
- tool and input hashes;
- generated verification records;
- persisted verification runs and a derived artifact.

Out of scope:

- executing repository code during analysis;
- formal correctness claims;
- compatibility approval;
- architecture reconstruction;
- arbitrary build-script detection;
- host-level sandboxing.

## Configuration

Commands live in `spec-framework.json`:

```json
{
  "version": 1,
  "checks": [
    {
      "id": "typecheck",
      "command": ["bun", "run", "typecheck"],
      "timeoutMs": 120000
    },
    {
      "id": "tests",
      "command": ["bun", "test"],
      "workingDirectory": ".",
      "timeoutMs": 300000
    }
  ]
}
```

Fields:

| Field              | Required | Rules                                                     |
| ------------------ | -------- | --------------------------------------------------------- |
| `id`               | yes      | Unique, non-empty                                         |
| `command`          | yes      | Non-empty argument array; first element is the executable |
| `workingDirectory` | no       | Relative path inside the repository                       |
| `timeoutMs`        | no       | Positive integer                                          |
| `kind`             | no       | `build`, `typecheck`, `test`, or `external`               |

The configuration is trusted build input. It is reviewed like a package script.

## Execution rules

- Never invoke a shell.
- Resolve the executable explicitly.
- Constrain the working directory to the repository root.
- Reject duplicate check IDs and invalid timeouts.
- Enforce a timeout.
- Bound captured output.
- Record exact command, runner version, working directory, input hashes,
  result, exit code, duration, and output hash.
- Fail closed on malformed or escaping configuration.
- Run only from `spec check`, never during analysis.

## Canonical target versus run result

`spec/generated/spec.gen.json` contains deterministic verification targets. A
configured check target has `result: "unknown"` because analysis does not execute
code.

`spec check` executes the checks and records a verification run in SQLite and at
`spec/generated/verification.gen.json`. The run links to the snapshot and spec
hash it checked. Canonical spec output is never mutated by a run. See
[0018](../design-decisions/0018-verification-runs.md).

## Generated verification record

```json
{
  "id": "VER-check-typecheck",
  "method": "compiler",
  "title": "typecheck",
  "target": "SNAP-...",
  "result": "passed",
  "evidence": [
    {
      "kind": "command",
      "reference": "bun run typecheck",
      "file": "spec-framework.json",
      "line": 5
    }
  ],
  "confidence": "observed"
}
```

## Failure behavior

- Missing executable: generated warning and failed verification record.
- Non-zero exit: failed verification record with bounded output hash.
- Timeout: failed verification record.
- Malformed configuration: analysis fails closed.
- Missing optional check: unknown, not a silent pass.

## Relationship to other layers

| Layer        | Relationship                                        |
| ------------ | --------------------------------------------------- |
| Analysis     | Independent of configured checks                    |
| Contracts    | A compile result does not prove compatibility       |
| Verification | Check results become generated verification records |
| AI           | AI may explain failures but never overrides them    |
| Audit        | Check records and hashes appear in the bundle       |

## Acceptance

- Passing check produces a passing verification record.
- Non-zero exit produces a failing verification record with bounded evidence.
- Missing executable becomes a failed verification, not a crash.
- Malformed configuration fails closed.
- No approval state is read or written.
