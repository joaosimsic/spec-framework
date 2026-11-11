import type { Confidence, DraftElement, MapReport, MapSummary } from "./types"

export const MAPPING_REVIEW_VERSION = 1

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
  "Run spec check.",
  "Approve the reviewed subset with the CLI after checks pass.",
] satisfies string[]

export type MappingReviewState = "waiting for curation"

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

export interface MappingReviewGaps {
  areasWithoutOwner: number
  areasWithoutResponsibility: number
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
  gaps: MappingReviewGaps
  notes: string[]
  prompts: string[]
  next: string[]
}

export class MappingReviewFactory {
  static build(report: MapReport, direction: string): MappingReview {
    return {
      version: MAPPING_REVIEW_VERSION,
      mode: "mapping",
      direction: direction.replace(/\s+/g, " ").trim(),
      state: "waiting for curation",
      summary: { ...report.summary },
      queue: [...report.elements].sort(this.compare).map((element) => this.item(element)),
      gaps: {
        areasWithoutOwner: report.gaps.missingOwners.length,
        areasWithoutResponsibility: report.gaps.missingResponsibilities.length,
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

  private static humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Item"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
