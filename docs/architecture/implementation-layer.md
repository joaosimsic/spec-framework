# Implementation checks

Status: implemented; migration to generated verification records in progress.

## Purpose

Configured build, typecheck, and test commands produce verification evidence for
the generated spec. A passing command proves only that command's result.

## Scope

In scope:

- explicit command arrays;
- exit codes and bounded output;
- missing executables;
- configured working directory;
- timeout and output bounds;
- tool and input hashes;
- generated verification records.

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
- Enforce a timeout.
- Bound captured output.
- Record exact command, tool version, working directory, input hashes, result,
  and output hash.
- Fail closed on malformed configuration.

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
