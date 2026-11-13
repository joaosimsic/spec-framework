# Vision

## End state

A project has one authoritative specification that a human can read end to end and audit without trusting an LLM. The specification is precise enough that an agent can implement it, and mechanically checked enough that omissions and contradictions are detected before code is written.

The same tool explains how the system is implemented. A human lands on a System view that joins approved intent with a generated implementation graph, follows a conceptual element to its files and symbols, traces entry points to outputs and side effects, and sees deterministic diagnostics separated from AI-assisted hypotheses.

The audit artifact remains the generated intent bundle:

- PDF for formal review and sign-off;
- HTML for navigation;
- machine-readable evidence for CI and downstream tooling.

The bundle contains capabilities, architecture, requirements, shared vocabulary and semantic constraints, behavior models, contracts, verification plans and results, traceability, unknowns, waivers, and approvals. It is assembled deterministically from source artifacts. Implementation evidence and mapping provenance stay separate from approved intent and appear in the System workspace and analysis exports.

## Roles

### Human

The human owns intent and approval. The human:

- decides architecture direction;
- answers questions that the spec cannot answer;
- reviews readable requirements and diagrams;
- approves or rejects proposed changes;
- accepts residual risk through explicit waivers.

The human does not need to read every DSL file. The human needs to be able to read the audit bundle and see that every normative claim has evidence or an explicit waiver.

### Agent

The agent is an interviewer, encoder, and implementer. The agent:

- extracts entities and relations from direction;
- drafts requirements, models, and contracts;
- runs validators and repairs failures;
- files unknowns instead of guessing;
- implements approved specifications with stable ID references.

The agent does not approve its own work, does not decide architecture silently, and does not self-certify correctness.

### Deterministic tools

Validators, model checkers, traceability checks, and the bundle renderer are the authority for mechanical correctness. They are reproducible and independent of the LLM.

## What success looks like

- A reviewer can answer "what does this system do, what are its parts, and how do we know?" from one bundle.
- Every capability has requirements and verification coverage or an explicit unknown.
- Every approved requirement has a verification case, a formalization, or a human-approved waiver.
- Every architecture element has an owner, a responsibility, and at least one relation or an explicit boundary marker.
- Every interface has a typed contract and a compatibility policy.
- Every normative term resolves to a glossary entry or a pinned concept.
- Every behavioral claim is either model-checked, conformance-tested, inspected, demonstrated, or waived.
- A change produces a readable impact report before it produces code.
- An unfamiliar repository produces a navigable System view with files, symbols, entry points, flows, and diagnostics.
- Every conceptual element links to implementation and every implementation element shows its provenance and confidence.
- Removing the LLM from the process does not make the specification unauditable.

## What success does not look like

- A beautiful document that nobody can verify.
- A formal model disconnected from requirements.
- A requirements database disconnected from architecture.
- A diagram that drifts from code.
- An agent that says "done" without evidence.
- A framework that only works for HTTP services.

## Non-goals

- Proving arbitrary implementation code correct.
- Replacing domain expertise or design judgment.
- Generating a complete specification from an empty prompt.
- Supporting every language and protocol on day one.
- Hiding complexity from reviewers. The framework exposes gaps; it does not pretend they do not exist.

## Long-term direction

The framework should be portable across languages and project types because the core artifacts are text and the interfaces between layers are stable IDs. Adapters are replaceable. Architecture intelligence starts with TypeScript behind a language adapter contract and grows without changing the intent model. The audit bundle, approval model, and evidence boundary remain the same whether the target is a Rust library, a CLI, an embedded protocol, or a distributed service.
