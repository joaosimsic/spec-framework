import type { Confidence, DraftElement, MapReport, MapSummary } from "./types"

export const MAPPING_REVIEW_VERSION = 2

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  unknown: 0,
  ambiguous: 1,
  inferred: 2,
  observed: 3,
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  observed: "Clear from code",
  inferred: "Inferred - confirm or correct",
  ambiguous: "Uncertain boundary - choose",
  unknown: "Needs human input",
}

const CONFIDENCE_PROMPTS: Record<Confidence, string> = {
  observed: "Keep, rename, or merge this area.",
  inferred: "Confirm or correct this inferred area.",
  ambiguous: "Choose the real boundary for this area.",
  unknown: "Decide what this area is or record an open question.",
}

const KIND_LABELS: Record<string, string> = {
  system: "System",
  component: "Component",
  data_store: "Data store",
  external_system: "External system",
}

const REVIEW_PROMPTS = [
  "Confirm or rename each area discovered from code.",
  "Decide uncertain boundaries and merge accidental ones.",
  "Assign an owner and stated responsibility to each kept area.",
  "Record what code cannot answer as open questions.",
] satisfies string[]

const NEXT_STEPS = [
  "Resolve remaining areas or record open questions.",
  "Run spec check.",
  "Approval remains a separate CLI-only human action.",
] satisfies string[]

export type MappingReviewState =
  "waiting for curation" | "curation in progress" | "curation complete"

export interface MappingReviewTechnical {
  id: string
  kind: string
  provenance: string
}

export interface MappingReviewItem {
  label: string
  kindLabel: string
  confidence: Confidence
  confidenceLabel: string
  prompt: string
  technical: MappingReviewTechnical
}

export interface MappingReviewRelationTechnical {
  source: string
  target: string
  type: string
  provenance: string
}

export interface MappingReviewRelationItem {
  label: string
  confidence: Confidence
  confidenceLabel: string
  prompt: string
  technical: MappingReviewRelationTechnical
}

export interface MappingReviewGaps {
  areasWithoutOwner: number
  areasWithoutResponsibility: number
  relationsNeedingReview: number
  externalDependencies: string[]
  unresolvedRequirementLinks: number
}

export interface MappingReview {
  version: typeof MAPPING_REVIEW_VERSION
  mode: "mapping"
  direction: string
  state: MappingReviewState
  summary: MapSummary
  queue: MappingReviewItem[]
  relationQueue: MappingReviewRelationItem[]
  gaps: MappingReviewGaps
  notes: string[]
  prompts: string[]
  next: string[]
}

export class MappingReviewFactory {
  static build(report: MapReport, direction: string): MappingReview {
    const relationQueue = this.relationQueue(report)

    return {
      version: MAPPING_REVIEW_VERSION,
      mode: "mapping",
      direction: direction.replace(/\s+/g, " ").trim(),
      state: "waiting for curation",
      summary: { ...report.summary },
      queue: [...report.elements].sort(this.compare).map((element) => this.item(element)),
      relationQueue,
      gaps: {
        areasWithoutOwner: report.gaps.missingOwners.length,
        areasWithoutResponsibility: report.gaps.missingResponsibilities.length,
        relationsNeedingReview: relationQueue.length,
        externalDependencies: this.externalDependencies(report.gaps.externalDependencies),
        unresolvedRequirementLinks: report.gaps.unresolvedRequirementLinks.length,
      },
      notes: [...new Set(report.findings.map((finding) => finding.message))].sort(),
      prompts: [...REVIEW_PROMPTS],
      next: [...NEXT_STEPS],
    }
  }

  private static compare(left: DraftElement, right: DraftElement): number {
    const confidenceOrder = CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
    if (confidenceOrder !== 0) return confidenceOrder

    const labelOrder = left.title.localeCompare(right.title)
    return labelOrder === 0 ? left.id.localeCompare(right.id) : labelOrder
  }

  private static item(element: DraftElement): MappingReviewItem {
    return {
      label: this.label(element),
      kindLabel: this.kindLabel(element.kind),
      confidence: element.confidence,
      confidenceLabel: CONFIDENCE_LABELS[element.confidence],
      prompt: CONFIDENCE_PROMPTS[element.confidence],
      technical: {
        id: element.id,
        kind: element.kind,
        provenance: element.provenance,
      },
    }
  }

  private static relationQueue(report: MapReport): MappingReviewRelationItem[] {
    const byId = new Map(report.elements.map((element) => [element.id, element]))
    const items: MappingReviewRelationItem[] = []

    for (const element of report.elements) {
      for (const link of element.links) {
        const target = byId.get(link.to)
        if (target === undefined) continue

        const confidence = link.confidence ?? "unknown"
        if (confidence === "observed") continue

        const typeLabel = this.relationTypeLabel(link.type)
        items.push({
          label: `${this.label(element)} -> ${this.label(target)} (${typeLabel})`,
          confidence,
          confidenceLabel: CONFIDENCE_LABELS[confidence],
          prompt: `Confirm this ${typeLabel} relation or reject it.`,
          technical: {
            source: element.id,
            target: target.id,
            type: link.type,
            provenance: link.provenance ?? element.provenance,
          },
        })
      }
    }

    return items.sort((left, right) => {
      const confidenceOrder = CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]
      if (confidenceOrder !== 0) return confidenceOrder
      const labelOrder = left.label.localeCompare(right.label)
      return labelOrder === 0 ? left.technical.type.localeCompare(right.technical.type) : labelOrder
    })
  }

  private static label(element: DraftElement): string {
    const title = element.title.trim()
    if (title !== "") return title

    return `Untitled ${this.kindLabel(element.kind).toLowerCase()}`
  }

  private static kindLabel(kind: string): string {
    return KIND_LABELS[kind] ?? this.humanize(kind)
  }

  private static externalDependencies(values: string[]): string[] {
    const names = values.map((value) => value.split(" -> ").at(-1) ?? value)
    return [...new Set(names)].sort()
  }

  private static relationTypeLabel(value: string): string {
    return this.humanize(value).toLowerCase()
  }

  private static humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Item"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
