# Semantic layer

> Status: unscheduled intent-model design. The optional adapter is not
> implemented and is not part of the current architecture intelligence
> direction. See decision [0015](../design-decisions/0015-retire-legacy-roadmap-and-explorer.md).

## Purpose

The semantic layer gives the specification a shared, machine-readable
vocabulary and a way to state reusable constraints over that vocabulary.

It is optional. It activates when semantic sources exist under
`spec/semantic/` or when `spec/config.json` requires it. When inactive, semantic
tools are not required and semantic checks do not run.

The layer uses established standards:

- RDF 1.1 for the graph data model;
- OWL 2 for structural ontologies;
- SKOS for concept schemes and curated concepts;
- SHACL for semantic contracts and validation.

It does not define a new schema. See
[decision 0010](../design-decisions/0010-optional-semantic-layer.md).

## Element kinds

| Prefix     | Kind              | Purpose                                                                |
| ---------- | ----------------- | ---------------------------------------------------------------------- |
| `ONTO-`    | Ontology          | Structural classes, properties, individuals, axioms, and SHACL targets |
| `VOC-`     | Concept scheme    | Curated vocabulary with a stable IRI base and prefix                   |
| `CONCEPT-` | Concept           | Labeled term with synonyms, definition, and broader/narrower links     |
| `SCON-`    | Semantic contract | Reusable SHACL profile that constrains requirements or contracts       |

These elements are part of the same graph as architecture, requirements,
formal behavior, and contracts. They are not a separate documentation silo.

## Ontologies

An ontology element declares:

- `ontology_base`: the ontology IRI;
- `ontology_prefix`: the term namespace prefix;
- source file and format;
- owner and provenance;
- optional imports from pinned external vocabularies;
- optional SHACL targets.

The authored Turtle must agree with the declared ontology IRI and term
namespace. A mismatch is a validation failure.

Ontologies own structural meaning:

- classes and properties;
- relationships and domains/ranges;
- individuals and axioms;
- SHACL target definitions.

Ontologies do not own requirements or implementation obligations.

## Concept schemes and concepts

A concept scheme is a curated thesaurus, not an ontology. It owns:

- `concept_base`;
- `concept_prefix`;
- labels, synonyms, and definitions;
- broader/narrower relationships;
- optional mappings to structural ontology terms.

Concepts are first-class elements. They give requirements and contracts shared
terms without turning every term into an ontology class.

The semantic layer keeps the layers separate:

```text
Thesaurus
  └─ concept scheme
      └─ concept

Ontologies
  └─ structural ontology
      may map structural terms to curated concepts
```

Do not collapse the concept layer and the structural layer because they share a
label. A mapping is explicit.

## Semantic contracts

A semantic contract is a reusable SHACL profile. It declares:

- shapes in a shapes graph;
- the ontology terms it uses;
- the requirements or contracts it constrains;
- severity and repair guidance;
- owner and provenance.

Relations:

- `uses` / `used_by` connect contracts and ontology terms;
- `constrains` / `constrained_by` connect contracts to requirements or
  contracts;
- `defines` connects a concept scheme to a concept, or an ontology to a
  structural term;
- `maps_to` connects a concept or glossary term to an external term.

A semantic contract is not a requirement. It makes part of a requirement
machine-checkable. It does not replace acceptance criteria, formal properties,
or contract adapters.

## External vocabularies

External RDF/Turtle, RDF/XML, and JSON-LD vocabularies can be referenced when
validation needs terms from a shared or third-party vocabulary.

Rules:

- sources are local and pinned;
- the hash of every external source is recorded;
- no mutable remote fetch happens during verification;
- only the used external subset appears in public graph exports;
- imported terms are marked external;
- external terms never replace authored elements as the canonical model.

## Adapter interface

Every semantic adapter implements:

```ts
interface SemanticAdapter {
  id: string
  discover(): Promise<SemanticSource[]>
  validate(source: SemanticSource): Promise<ValidationResult>
  query(query: SemanticQuery): Promise<QueryResult>
  exportGraph(options: GraphExportOptions): Promise<GraphExport>
  evidence(): Promise<Evidence>
}
```

Rules:

- active adapters fail closed on missing tools or invalid sources;
- adapters never approve elements or contracts;
- adapters record tool versions and input hashes;
- output is deterministic;
- external sources are read from pinned local paths only;
- query results carry source and version provenance.

## Queries

The semantic graph is queryable with SPARQL and with the unified graph JSON
interface described in
[query and agent interface](query-and-agent-interface.md).

Example questions:

- which requirements are constrained by a semantic contract?
- which concepts are used by approved requirements?
- which ontology terms have no requirement or contract usage?
- which external terms are referenced but not pinned?
- which semantic constraints failed validation?

SPARQL is a read-only surface. It does not mutate the model.

## Coverage and evidence

Semantic coverage reports:

- requirements with semantic contracts where required by policy;
- concept schemes with unused concepts;
- ontology terms with no requirement or contract usage;
- external terms without a pinned source;
- semantic contracts without an owner or linked obligation;
- SHACL validation failures by severity.

Evidence records:

- adapter and tool versions;
- source and shapes hashes;
- validation report;
- query used for coverage or search;
- result and counterexamples or violations.

Semantic evidence is separate from formal and contract evidence. The audit
bundle shows the source of each verdict.

## Failure behavior

- A missing semantic tool fails the semantic check when the layer is active.
- A malformed ontology or SHACL shape fails validation.
- A mismatched ontology IRI or prefix fails validation.
- A remote or unpinned external source fails validation.
- A blocking SHACL violation blocks approval of linked requirements.
- An inactive semantic layer does not require semantic tools.
- Generated semantic artifacts never overwrite authored sources.

## Non-goals

- Replacing LikeC4, StrictDoc, Quint, or contract adapters.
- Requiring ontology modeling for every project.
- Full OWL reasoning by default.
- Treating SHACL as a proof of implementation behavior.
- Storing requirements only as RDF.
- Fetching mutable vocabularies during verification.
- Letting an agent author or approve semantic contracts without human review.
