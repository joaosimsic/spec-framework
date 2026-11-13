# 0014 AI interpretation boundary

Status: accepted.

## Context

AI can explain responsibilities, propose functional flows, and identify possible
architectural problems faster than a human can read an unfamiliar repository.
It can also invent facts, paths, and certainty. The framework already treats LLM
output as non-authoritative; approval is human-only and hash-locked.

## Decision

Use AI as an interpretation layer over structured evidence.

AI may:

- explain what a component appears to do;
- propose responsibilities from symbols and calls;
- propose functional flow hypotheses;
- suggest architectural problems;
- prioritize areas for human review.

AI may not:

- approve, reject, or bless an element;
- replace deterministic validation;
- claim a flow is complete or observed;
- reference elements, files, or symbols that do not exist;
- receive secrets or environment files;
- execute repository code.

Every AI output records provider, model, prompt version, input hashes, evidence
references, confidence, and whether it is AI-inferred or human-confirmed.

## Validation

- Validate structured output against a versioned JSON Schema.
- Reject unknown element, file, or symbol references.
- Require evidence for every finding.
- Keep AI findings visually distinct from deterministic rule violations.
- Treat repository text as untrusted input, never as instructions.
- Allow local providers by default; require explicit configuration for remote
  providers.
- Redact secrets and sensitive files before any remote request.

## Consequences

Positive:

- Faster understanding without granting false authority.
- Auditable AI contributions.
- Clear separation between evidence and interpretation.
- Local-model deployment remains possible.

Negative:

- Context retrieval and validation add implementation work.
- Model quality varies.
- Remote AI introduces privacy and compliance obligations.
- Findings may require human triage to be useful.
