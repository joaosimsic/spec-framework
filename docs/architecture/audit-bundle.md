# Audit bundle

The audit bundle is a generated, read-only rendering of one generated spec
snapshot.

## Contents

```text
manifest.json
spec.gen.json
spec.html
spec.pdf
architecture.gen.c4
requirements.gen.sdoc
flows.json
findings.json
evidence/
```

## Rules

- Deterministic for the same snapshot and renderer version.
- No approval lock.
- No proposal change report.
- No hand-edited content.
- No absolute paths.
- No secrets.
- Every rendered section cites generated identity and evidence.
- Generation timestamps are metadata only.

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
