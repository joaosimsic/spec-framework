import type { Result } from "../core/result"
import {
  DISPLAY_MODEL_VERSION,
  type DisplayChoice,
  type DisplayEntry,
  type DisplayFailure,
  type DisplayModel,
  type DisplayReference,
  type DisplayRelationship,
  type DisplayTechnical,
} from "./display-types"
import type { GraphElement, GraphFinding, GraphStatus, SpecGraph } from "./types"

const STATE_LABELS: Record<GraphStatus, string> = {
  draft: "Draft - not reviewed",
  proposed: "Ready for review",
  approved: "Approved",
  deprecated: "Retired",
  unknown: "State unavailable",
}

const KIND_LABELS: Record<string, string> = {
  system: "System",
  component: "Component",
  interface: "Interface",
  data_entity: "Data entity",
  requirement: "Requirement",
  capability: "Capability",
  acceptance_criterion: "Acceptance criterion",
  verification_objective: "Verification objective",
  verification_case: "Verification case",
  invariant: "Invariant",
  formal_module: "Formal module",
  formal_property: "Formal property",
  contract: "Contract",
  ontology: "Ontology",
  concept_scheme: "Concept scheme",
  concept: "Concept",
  semantic_contract: "Semantic contract",
  evidence: "Evidence",
  unknown: "Open question",
  waiver: "Waiver",
  decision: "Decision",
  term: "Term",
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  derives_from: "Comes from",
  acceptance: "Acceptance criteria",
  component: "Implemented by",
  formalization: "Formalized by",
  contract: "Constrained by",
  verification: "Verified by",
  evidence: "Evidence",
  waiver: "Waiver",
}

const BLOCKER_LABELS: Record<string, string> = {
  "GRAPH-UNRESOLVED-LINK": "A related item is missing from the model.",
}

const DEFAULT_BLOCKER = "This item has an issue that needs attention."

export class DisplayProjection {
  private readonly modelValue: DisplayModel
  private readonly entriesByRef = new Map<string, DisplayEntry>()
  private readonly entriesById = new Map<string, DisplayEntry>()

  constructor(graph: SpecGraph) {
    const references = graph.elements.map((element, index) => this.reference(element, index))
    const referencesById = new Map(
      graph.elements.map((element, index) => [element.id, references[index]] as const),
    )
    const entries = graph.elements.map((element, index) =>
      this.entry(graph, element, references[index], referencesById),
    )

    this.modelValue = {
      version: DISPLAY_MODEL_VERSION,
      graphVersion: graph.version,
      commit: graph.commit,
      entries,
    }

    for (const entry of entries) {
      this.entriesByRef.set(entry.ref, entry)
      this.entriesById.set(entry.technical.id, entry)
    }
  }

  get model(): DisplayModel {
    return this.modelValue
  }

  resolve(handle: string): Result<DisplayEntry, DisplayFailure> {
    const normalized = handle.trim()
    const byRef = this.entriesByRef.get(normalized)
    if (byRef !== undefined) return [byRef, null]

    const byId = this.entriesById.get(normalized)
    if (byId !== undefined) return [byId, null]

    const matches = this.modelValue.entries.filter(
      (entry) => entry.label.toLowerCase() === normalized.toLowerCase(),
    )
    if (matches.length === 1) return [matches[0] ?? null, null]
    if (matches.length > 1) {
      return [
        null,
        {
          code: "DISPLAY-AMBIGUOUS",
          message: `more than one item is named '${normalized}'`,
          choices: matches.map((entry) => this.choice(entry)),
        },
      ]
    }

    return [null, { code: "DISPLAY-NOT-FOUND", message: `unknown item: ${normalized}` }]
  }

  private entry(
    graph: SpecGraph,
    element: GraphElement,
    reference: DisplayReference,
    referencesById: Map<string, DisplayReference | undefined>,
  ): DisplayEntry {
    const findings = graph.findings.filter((finding) => finding.id === element.id)

    return {
      ref: reference.ref,
      label: this.label(element),
      kindLabel: this.kindLabel(element.kind),
      state: this.state(element.status),
      relationships: this.relationships(element, referencesById),
      openQuestions: this.openQuestions(graph, element, referencesById),
      blockers: this.blockers(findings),
      technical: this.technical(element, findings),
    }
  }

  private reference(element: GraphElement, index: number): DisplayReference {
    return {
      ref: this.refFor(index),
      label: this.label(element),
      kindLabel: this.kindLabel(element.kind),
    }
  }

  private relationships(
    element: GraphElement,
    referencesById: Map<string, DisplayReference | undefined>,
  ): DisplayRelationship[] {
    const groups = new Map<string, DisplayReference[]>()

    for (const link of element.links) {
      const target = referencesById.get(link.to)
      if (target === undefined) continue

      const label = RELATIONSHIP_LABELS[link.type] ?? this.humanize(link.type)
      const items = groups.get(label) ?? []
      items.push(target)
      groups.set(label, items)
    }

    return [...groups.entries()].map(([label, items]) => ({ label, items }))
  }

  private openQuestions(
    graph: SpecGraph,
    element: GraphElement,
    referencesById: Map<string, DisplayReference | undefined>,
  ): DisplayReference[] {
    return graph.elements
      .filter(
        (candidate) =>
          candidate.kind === "unknown" && candidate.links.some((link) => link.to === element.id),
      )
      .map((candidate) => referencesById.get(candidate.id))
      .filter((reference): reference is DisplayReference => reference !== undefined)
  }

  private blockers(findings: GraphFinding[]): string[] {
    return [...new Set(findings.map((finding) => BLOCKER_LABELS[finding.code] ?? DEFAULT_BLOCKER))]
  }

  private technical(element: GraphElement, findings: GraphFinding[]): DisplayTechnical {
    return {
      id: element.id,
      kind: element.kind,
      ...(element.status === undefined ? {} : { status: element.status }),
      ...(element.owner === undefined ? {} : { owner: element.owner }),
      ...(element.provenance === undefined ? {} : { provenance: element.provenance }),
      ...(element.confidence === undefined ? {} : { confidence: element.confidence }),
      links: element.links.map((link) => ({ type: link.type, to: link.to })),
      diagnostics: findings.map((finding) => ({ ...finding })),
    }
  }

  private label(element: GraphElement): string {
    const title = element.title?.trim()
    if (title !== undefined && title !== "") return title
    if (element.kind === "unknown") return "Open question"

    return `Untitled ${this.kindLabel(element.kind).toLowerCase()}`
  }

  private kindLabel(kind: string): string {
    return KIND_LABELS[kind] ?? this.humanize(kind)
  }

  private state(status: GraphStatus | undefined): string {
    if (status === undefined) return "State unavailable"

    return STATE_LABELS[status]
  }

  private choice(entry: DisplayEntry): DisplayChoice {
    const owner = entry.technical.owner === undefined ? "" : ` - owned by ${entry.technical.owner}`

    return {
      ref: entry.ref,
      label: entry.label,
      context: `${entry.kindLabel} - ${entry.state}${owner}`,
    }
  }

  private refFor(index: number): string {
    return `ref_${index.toString(36)}`
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Item"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
