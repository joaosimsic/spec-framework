# Audit bundle

The audit bundle is a generated, read-only rendering of one generated spec
snapshot.

## Contents

```text
manifest.json
spec.gen.json
index.html
spec.pdf
flows.json
findings.json
verification.json
interpretations.json
evidence.json
```

## Rules

- Deterministic for the same snapshot and renderer version unless a derived
  verification run is included.
- No approval lock.
- No proposal change report.
- No hand-edited content.
- No absolute paths.
- No secrets.
- Every rendered section cites generated identity and evidence.
- Verification and AI interpretation artifacts are derived evidence, not snapshot
  determinism.

## Manifest

The manifest records:

- snapshot ID;
- commit and dirty state;
- analyzer, schema, rule, prompt, and model versions;
- output hashes;
- renderer version;
- input hashes.

## Review

Reviewers use the bundle to inspect:

- generated architecture;
- observed behavior records;
- observed contracts;
- verification and evidence;
- flows and unknowns;
- diagnostics and AI hypotheses.

The bundle is evidence. It is not an approval record.
