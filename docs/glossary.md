# Glossary

**Acceptance criterion**: A checkable condition that must hold for a requirement to be satisfied. Linked to verification evidence.

**Approval bundle**: The signed or hash-locked record of approved spec elements and evidence. See [approval](workflow/approval.md).

**Audit bundle**: The generated PDF/HTML/JSON deliverable containing the readable specification and its evidence. See [audit bundle](architecture/audit-bundle.md).

**Audit lock**: `spec.lock`, the file that stores hashes of approved elements and evidence. Any content change invalidates approval.

**Conformance test**: A test that replays a formal model trace against an implementation and checks observable behavior.

**Contract adapter**: A plugin that extracts, validates, documents, or checks one boundary type: language API, data schema, CLI, wire protocol, or hardware interface.

**EARS**: Easy Approach to Requirements Syntax. A set of constrained sentence patterns for requirements, such as "When <trigger>, the <system> shall <response>."

**Element**: A typed spec object with a stable ID, status, provenance, and relations. Examples: system, component, interface, requirement, invariant, contract, evidence.

**Evidence**: A machine-generated artifact that supports a verification claim, such as a model-checking report, trace replay result, compatibility report, or test log.

**Formal model**: An executable, machine-checkable description of behavior. In this framework, primarily Quint modules with actions, invariants, and temporal properties.

**Formalization**: The link from a requirement to the formal property or action that verifies it. A requirement without a formalization needs a human-approved waiver.

**LikeC4**: Architecture-as-code tool used for systems, components, relations, views, validation, and MCP access.

**Model checking**: Exhaustive exploration of a formal model's state space to find violations of invariants or temporal properties.

**Provenance**: The recorded origin of an element: human decision, source file, document, inference, or assumption.

**Quint**: Executable specification language with TypeScript-like syntax, a simulator, and model checking through Apalache/TLC.

**Requirement**: A normative statement with a stable ID, statement, rationale, acceptance criteria, priority, status, and verification links.

**Spec element**: See element.

**Specification source**: A typed source artifact: LikeC4 model, StrictDoc document, Quint module, or contract adapter output.

**StrictDoc**: Text-based requirements and documentation tool with traceability, coverage, diff, and HTML/PDF export.

**Traceability**: The set of links connecting requirements, architecture, formal models, contracts, code, and tests.

**Unknown**: An explicit open question with an owner and blocking status. Unknowns are not failures by themselves; unresolved blocking unknowns are.

**Waiver**: A human-approved, scoped, expiring exception to a required link or verification.

**Workflow gate**: A deterministic check that must pass before a change can be approved or implemented.
