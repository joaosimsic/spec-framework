# Principles

## 1. The specification is data, not prose

Normative facts live in structured sources. Prose is allowed for context, rationale, and narrative, but it cannot carry normative force. If a statement can be violated, it belongs in a typed field.

## 2. Readable output is generated, not authored

The audit bundle is assembled mechanically from LikeC4, StrictDoc, Quint, contract adapters, and evidence. Agents do not write the final document. A reviewer can regenerate it and get the same result.

## 3. Every claim has provenance

An element records whether it came from a human decision, a source file, a document, an inference, or an assumption. An unsourced normative claim is a defect.

## 4. Missing information is an explicit unknown

The agent must not fill gaps with plausible text. It files an unknown with a question, an owner, and a blocking status. The audit bundle lists unknowns prominently.

## 5. Relations are typed and checked

Components, interfaces, data, requirements, and verification are connected by named relations. The linter checks that endpoints exist, cardinalities are legal, and required relations are present.

## 6. Completeness is relative to a question matrix

There is no absolute proof that a spec is complete. Completeness means every mandatory question for each element kind has an answer, an unknown, or a waiver. The matrix is explicit and versioned.

## 7. Deterministic tools decide mechanical correctness

LikeC4 validation, StrictDoc traceability, Quint model checking, and contract checks are the authority. An LLM's statement that something is correct has no evidentiary value.

## 8. Human approval is hash-locked

Approved content and evidence are hashed. Any change invalidates approval until a human reviews and re-approves. Agents cannot approve.

## 9. The default agent is read-only on approved specs

Agents propose changes through a dedicated workflow. The default build agent cannot silently edit architecture, requirements, formal models, or contracts. This is a permission boundary, not a prompt request.

## 10. Non-web is the default assumption

Contracts are language APIs, data formats, CLIs, wire protocols, and hardware interfaces before they are HTTP endpoints. HTTP adapters are optional.

## 11. Compose; do not reinvent

Use mature tools for architecture, requirements, formal methods, and contracts. Build only the cross-layer glue, approval model, and audit bundle.

## 12. Every gate must be reproducible

A reviewer must be able to rerun the checks from a clean checkout and obtain the same verdict. Hidden state, network dependencies in verification, and manual steps are defects.

## 13. Waivers are first-class, expiring, and visible

Some risks are accepted. A waiver records the owner, reason, scope, and expiry. Expired waivers fail the build. Waivers appear in the audit bundle, never in a private comment.

## 14. The framework must survive removing the LLM

If the agent disappears, the sources remain readable, the validators still run, and the audit bundle still renders. The LLM accelerates authoring; it is not part of the correctness argument.

## 15. Full-stack by default, one-command setup

The default profile includes architecture, requirements, formal behavior, and contracts. Setup is automated through `spec doctor --fix`, not a manual checklist. A missing tool blocks the affected check; it does not silently reduce verification.

## 16. Time to first value is a requirement

`spec init` and the structural preflight must produce a useful gap report immediately, before every native tool is installed. Provisioning must not be a prerequisite for understanding the project's specification gaps.
