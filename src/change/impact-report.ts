import type { ImpactElement, ImpactLink, ImpactReport } from "../model"

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

export class ImpactReportRenderer {
  static human(report: ImpactReport): string[] {
    const byId = this.elementsById(report)
    const lines = [
      `impact: ${report.changed.length} changed, ${report.affected.length} affected`,
      `evidence to regenerate: ${report.invalidated_evidence.length}`,
      `approvals to renew: ${report.approvals_to_renew.length}`,
      `open questions: ${report.open_questions.length}`,
    ]

    if (report.changed.length > 0) {
      lines.push("")
      lines.push("changed:")
      lines.push(...report.changed.map((element) => `- ${this.label(element)}`))
    }

    if (report.affected.length > 0) {
      lines.push("")
      lines.push("affected:")
      lines.push(
        ...report.affected.map((element) => {
          const source = this.sourceLabel(element, byId)
          return source === null
            ? `- ${this.label(element)}`
            : `- ${this.label(element)} - related to ${source}`
        }),
      )
    }

    if (report.approvals_to_renew.length > 0) {
      lines.push("")
      lines.push("approvals to renew:")
      lines.push(...report.approvals_to_renew.map((id) => `- ${this.labelFor(id, byId)}`))
    }

    if (report.open_questions.length > 0) {
      lines.push("")
      lines.push("open questions:")
      lines.push(...report.open_questions.map((id) => `- ${this.labelFor(id, byId)}`))
    }

    return lines
  }

  static technical(report: ImpactReport): string[] {
    const lines = [
      [
        `impact: changed=${report.changed.length}`,
        `affected=${report.affected.length}`,
        `evidence=${report.invalidated_evidence.length}`,
        `approvals=${report.approvals_to_renew.length}`,
        `questions=${report.open_questions.length}`,
      ].join(" "),
    ]

    lines.push(...report.changed.map((element) => this.elementLine("impact-changed", element)))
    lines.push(...report.affected.map((element) => this.elementLine("impact-affected", element)))
    lines.push(...report.invalidated_evidence.map((id) => `impact-evidence: ${id}`))
    lines.push(...report.approvals_to_renew.map((id) => `impact-approval: ${id}`))
    lines.push(...report.open_questions.map((id) => `impact-question: ${id}`))

    return lines
  }

  private static elementLine(prefix: string, element: ImpactElement): string {
    const via = element.via.length === 0 ? "" : ` via=${this.linkText(element.via[0])}`

    return `${prefix}: ${element.id} kind=${element.kind} distance=${element.distance}${via}`
  }

  private static linkText(link: ImpactLink): string {
    return `${link.from}:${link.type}:${link.direction}:${link.to}`
  }

  private static elementsById(report: ImpactReport): Map<string, ImpactElement> {
    return new Map(
      [...report.changed, ...report.affected].map((element) => [element.id, element] as const),
    )
  }

  private static sourceLabel(
    element: ImpactElement,
    byId: Map<string, ImpactElement>,
  ): string | null {
    const link = element.via[0]
    if (link === undefined) return null

    const sourceId = link.direction === "incoming" ? link.to : link.from

    return this.labelFor(sourceId, byId)
  }

  private static label(element: ImpactElement): string {
    const title = element.title?.trim()
    const name = title !== undefined && title !== "" ? title : "Untitled item"

    return `${name} (${this.kindLabel(element.kind)})`
  }

  private static labelFor(id: string, byId: Map<string, ImpactElement>): string {
    const element = byId.get(id)

    return element === undefined ? "Linked item" : this.label(element)
  }

  private static kindLabel(kind: string): string {
    return KIND_LABELS[kind] ?? this.humanize(kind)
  }

  private static humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Item"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
