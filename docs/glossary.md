# Glossary

**Acceptance criterion**: A checkable condition that must hold for a requirement to be satisfied. Linked to verification evidence.

**Approval bundle**: The signed or hash-locked record of approved spec elements and evidence. See [approval](workflow/approval.md).

**Audit bundle**: The generated PDF/HTML/JSON deliverable containing the readable specification and its evidence. See [audit bundle](architecture/audit-bundle.md).

**Audit lock**: `spec.lock`, the file that stores hashes of approved elements and evidence. Any content change invalidates approval.

**Capability**: A coherent system ability with a stable `CAP-*` ID. It anchors requirements and verification objectives without prescribing implementation.

**Concept**: A curated vocabulary term in a concept scheme, with labels, synonyms, definitions, and broader/narrower links.

**Concept scheme**: A SKOS vocabulary with a stable IRI base and prefix. It is separate from a structural ontology.

**Conformance test**: A test that replays a formal model trace against an implementation and checks observable behavior.

**Contract adapter**: A plugin that extracts, validates, documents, or checks one boundary type: language API, data schema, CLI, wire protocol, or hardware interface.

**Semantic adapter**: An optional plugin that parses, validates, queries, and exports RDF/OWL/SKOS/SHACL sources. It is not a contract adapter.

**EARS**: Easy Approach to Requirements Syntax. A set of constrained sentence patterns for requirements, such as "When <trigger>, the <system> shall <response>."

**Element**: A typed spec object with a stable ID, status, provenance, and relations. Examples: system, component, interface, requirement, invariant, contract, evidence.

**Evidence**: A machine-generated artifact that supports a verification claim, such as a model-checking report, trace replay result, compatibility report, or test log.

**Explorer**: A local read-only UI over the validated spec graph. It is a review aid, not a source of truth or an approval surface.

**Formal model**: An executable, machine-checkable description of behavior. In this framework, primarily Quint modules with actions, invariants, and temporal properties.

**Formalization**: The link from a requirement to the formal property or action that verifies it. A requirement without a formalization needs a human-approved waiver.

**LikeC4**: Architecture-as-code tool used for systems, components, relations, views, validation, and MCP access.

**MCP**: Model Context Protocol. In this framework it exposes the spec graph as read-only resources, tools, and prompts for agents.

**Model checking**: Exhaustive exploration of a formal model's state space to find violations of invariants or temporal properties.

**Ontology**: A structural RDF/OWL vocabulary with classes, properties, individuals, and axioms. It defines shared meaning, not implementation obligations.

**Provenance**: The recorded origin of an element: human decision, source file, document, inference, or assumption.

**Quint**: Executable specification language with TypeScript-like syntax, a simulator, and model checking through Apalache/TLC.

**Requirement**: A normative statement with a stable ID, statement, rationale, acceptance criteria, priority, status, and verification links.

**Semantic contract**: A reusable SHACL profile (`SCON-*`) that constrains vocabulary, shape, or data through ontology terms. It is not a requirement or a boundary contract.

**SHACL**: Shapes Constraint Language. Used for semantic contracts and validation of RDF data.

**SKOS**: Simple Knowledge Organization System. Used for concept schemes and curated concepts.

**Spec element**: See element.

**Specification source**: A typed source artifact: LikeC4 model, StrictDoc document, Quint module, or contract adapter output.

**StrictDoc**: Text-based requirements and documentation tool with traceability, coverage, diff, and HTML/PDF export.

**Traceability**: The set of links connecting capabilities, requirements, architecture, semantic constraints, verification, formal models, contracts, code, and tests.

**Verification case**: A concrete check (`VER-*`) with a method, target, and evidence. Methods include formal, test, analysis, inspection, and demonstration.

**Verification objective**: A planning element (`VOBJ-*`) that groups and sequences verification work across capabilities and requirements.

**Unknown**: An explicit open question with an owner and blocking status. Unknowns are not failures by themselves; unresolved blocking unknowns are.

**Waiver**: A human-approved, scoped, expiring exception to a required link or verification.

**Workflow gate**: A deterministic check that must pass before a change can be approved or implemented.

**Workspace**: A single repository by default, or an optional multi-repository composition with recorded refs, exact commit pins, branch contexts, and validated admission.
