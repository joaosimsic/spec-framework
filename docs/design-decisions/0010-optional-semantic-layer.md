# 0010 — Optional semantic layer with RDF, OWL, SKOS, and SHACL

**Status:** accepted
**Date:** 2026-11-11

## Context

Reqvire models ontologies, concept schemes, concepts, and semantic contracts as
first-class engineering elements. That layer gives requirements shared
vocabulary, machine-checkable constraints, and a graph that agents can query.

This framework already has typed architecture, requirements, formal behavior,
and contracts. It has a glossary (`TERM-*`) but no ontology, no concept scheme,
and no semantic constraint language.

Decision 0007 rejects a custom specification schema. Decision 0001 requires
composing existing tools. A semantic layer must therefore use established
standards and remain optional.

## Decision

Add an optional semantic layer built on RDF 1.1, OWL 2, SKOS, and SHACL.

The layer is active only when semantic sources exist under `spec/semantic/` or
when `spec/config.json` explicitly requires it. If active, missing semantic
tooling or invalid sources fail the affected check. If inactive, semantic tools
are not required.

The semantic layer owns:

- `ONTO-*` structural ontologies: classes, properties, individuals, axioms, and
  SHACL targets;
- `VOC-*` concept schemes: curated vocabularies with a stable IRI base and
  prefix;
- `CONCEPT-*` concepts: labels, synonyms, definitions, and broader/narrower
  relationships;
- `SCON-*` semantic contracts: reusable SHACL profiles that constrain
  requirements or contracts;
- external vocabulary sources: local, pinned RDF/Turtle, RDF/XML, or JSON-LD
  files used for term resolution and validation;
- semantic evidence: SHACL validation reports, query results, and input hashes.

The semantic layer does not own architecture, requirements, formal behavior, or
contract surfaces. Those remain with LikeC4, StrictDoc, Quint, and the contract
adapters.

## Boundaries

- No new custom schema. The source formats are the standards.
- No remote mutable fetch at verification time. External vocabularies are local
  dependencies with pinned hashes.
- External terms are marked as external and never replace authored framework
  elements as the canonical model.
- Concept schemes and structural ontologies are separate. Curated vocabulary
  does not become ontology classes, and ontology classes do not become curated
  concepts without an explicit mapping.
- Semantic contracts constrain requirements; they do not replace requirements,
  acceptance criteria, formal properties, or contract adapters.
- The semantic adapter records tool versions, source hashes, and results as
  evidence. It never approves anything.

## Proposed adapter interface

```ts
interface SemanticAdapter {
  id: string;
  discover(): Promise<SemanticSource[]>;
  validate(source: SemanticSource): Promise<ValidationResult>;
  query(query: SemanticQuery): Promise<QueryResult>;
  exportGraph(options: GraphExportOptions): Promise<GraphExport>;
  evidence(): Promise<Evidence>;
}
```

Rules:

- adapters activate from sources or explicit config;
- adapters fail closed when active;
- input and output are deterministic;
- external sources are pinned and read locally;
- query results carry source and version provenance;
- evidence is hashed and included in the audit bundle.

## Candidate toolchain

The implementation phase must pin a toolchain. Candidates:

- Oxigraph or Apache Jena for RDF storage and SPARQL;
- `rdf-parse` or equivalent for RDF/Turtle, RDF/XML, and JSON-LD parsing;
- `rdf-validate-shacl` or a Jena SHACL validator for SHACL;
- OWL 2 RL reasoning, if any, only as an explicit capability with recorded
  scope.

The choice belongs in a later implementation decision record. This record fixes
the standards and boundaries, not the library.

## Consequences

- Requirements can share vocabulary through concept schemes instead of
  duplicated glossary prose.
- Semantic contracts can make some constraints machine-checkable before formal
  modeling.
- The graph query surface gains semantic edges and SPARQL support.
- The audit bundle must show ontology scope, external sources, semantic
  contracts, and SHACL results.
- The semantic layer is another optional toolchain to provision and pin.
- Agents can read semantic constraints, but they cannot approve them.

## Alternatives

- **No semantic layer:** simpler, but leaves ontology and concept drift
  unmodeled.
- **Glossary only:** readable, but no machine-checkable vocabulary or
  constraints.
- **Custom ontology format:** easier to start, but violates decision 0007.
- **Full OWL reasoning by default:** expensive and hard to make deterministic;
  use explicit, bounded reasoning instead.
- **Reqvire's model:** proven feature set, but a custom engine and a different
  approval model. Adopt the standards, not the engine.
