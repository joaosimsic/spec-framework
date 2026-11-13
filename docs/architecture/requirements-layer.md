# Observed behavior records

The generated spec records observed behavior, not normative requirements.

## Sources

Behavior records are generated from observable entry points and public
surfaces, then linked to a behavior-derived conceptual component.

- CLI commands and `bin` entries;
- HTTP route registrations;
- exported library APIs;
- application main functions;
- event handlers and configured entry points;
- data reads, writes, network calls, and external processes;
- test-to-code links where visible.

A behavior record links to a conceptual component, an interface, and
implementation evidence. The component exists because of that behavior, not
because of its directory.

## Record shape

```json
{
  "id": "REQ-...",
  "kind": "observed_behavior",
  "title": "spec analyze writes a generated snapshot",
  "statement": "The analyze command scans a registered repository and writes a snapshot.",
  "component": "CMP-src-cli",
  "entry_point": "ENTRY-cli-bin/spec.ts",
  "evidence": [{ "kind": "source", "file": "src/cli.ts", "line": 120 }],
  "confidence": "inferred",
  "unknowns": []
}
```

## Rules

- Never claim `approved` or `normative`.
- Never generate acceptance criteria without a test or check.
- Include evidence for every record.
- Mark static reachability as `inferred`, not executed behavior.
- Record unresolved dynamic behavior as an unknown.
- Keep generated records deterministic for the same snapshot.

## Relationship to verification

A behavior record can link to verification records when a test or configured
check covers the relevant target. The link is evidence, not proof of complete
coverage.
