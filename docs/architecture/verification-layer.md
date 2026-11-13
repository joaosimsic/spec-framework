# Verification records

Generated verification records connect observed targets to tests, compiler
checks, and configured external commands.

## Methods

- `compiler`: typecheck or build result from a configured command;
- `test`: test file or test symbol linked to an observed target;
- `analysis`: deterministic analysis result;
- `inspection`: generated evidence requiring human reading;
- `external`: configured external checker or validator.

## Record shape

```json
{
  "id": "VER-...",
  "method": "test",
  "title": "annotation survives re-analysis",
  "target": "REQ-...",
  "result": "passed",
  "evidence": [{ "kind": "test", "file": "tests/analysis-api.test.ts", "line": 31 }],
  "confidence": "observed"
}
```

## Rules

- Verification records are generated output.
- A passing check proves only the configured command result.
- Missing coverage becomes a finding or unknown, not a silent pass.
- External checks are optional and recorded with tool versions and input hashes.
- No verification record approves a requirement.
- No formal proof is claimed unless an external formal checker produced the
  evidence.
