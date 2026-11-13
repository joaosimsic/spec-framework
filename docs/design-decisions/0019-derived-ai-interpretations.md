# 0019 — AI interpretations are derived evidence

Status: accepted.

## Context

The generated spec contains observed contracts and deterministic verification
targets. Verification runs add real check outcomes. Both are evidence a reviewer
needs to understand, but AI explanations depend on the configured provider,
model, prompt, and available inputs.

Writing AI interpretations into `spec.gen.json` would make canonical spec output
depend on a provider and break the generated-spec determinism contract.

## Decision

AI contract and verification interpretations are derived evidence.

- `spec interpret --kind contract|verification|all` runs interpretations
  explicitly. Analysis and `spec check` never call AI for this.
- Contract mode interprets all observed contract records.
- Verification mode interprets failed, missing, timed-out, or unknown checks
  from the latest verification run.
- Every invocation regenerates selected targets. No hidden cache.
- Interpretations are stored in SQLite and exported to
  `spec/generated/interpretations.gen.json`.
- `spec.gen.json` is not mutated and does not require a version bump.
- Interpretations cite contract or check IDs plus file and line evidence.
- AI never changes a contract, check result, finding status, or conceptual
  identity.
- Unsupported rules, missing references, missing files, authority language, and
  invalid confidence reject the whole interpretation.

## Consequences

Positive:

- Contract and verification explanations are available without polluting the
  deterministic spec.
- Provider/model/prompt/input hashes remain auditable.
- Interpretations can be regenerated as models change.
- Interpretations can be excluded from analysis reproducibility claims.

Negative:

- Readers must join spec contracts and verification runs with separate
  interpretation records.
- Repeated runs spend provider tokens.
- Interpretation quality depends on provider quality.

## Rules

- Never present AI interpretation as approval or a verdict.
- Never mutate `spec.gen.json` from `spec interpret`.
- Never hide interpretation failures.
- Never interpret a passing check as a failure.
- Keep contract interpretations and verification interpretations distinct.
