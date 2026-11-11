import type { SimulationElement, SimulationReport } from "../model"

const KIND_LABELS: Record<string, string> = {
  system: "System",
  actor: "Actor",
  component: "Component",
  data_store: "Data store",
  external_system: "External system",
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

export class SimulationReportRenderer {
  static human(report: SimulationReport): string[] {
    if (!report.available) {
      return [`simulation: unavailable`, `reason: ${report.reason}`]
    }

    const lines = [
      `simulation: ${report.added.length} added, ${report.removed.length} removed, ${report.modified.length} modified`,
    ]

    if (report.added.length > 0) {
      lines.push("", "added:")
      lines.push(...report.added.map((element) => `- ${this.label(element)}`))
    }

    if (report.removed.length > 0) {
      lines.push("", "removed:")
      lines.push(...report.removed.map((element) => `- ${this.label(element)}`))
    }

    if (report.modified.length > 0) {
      lines.push("", "modified:")
      lines.push(...report.modified.map((element) => `- ${this.modifiedLabel(element)}`))
    }

    return lines
  }

  static technical(report: SimulationReport): string[] {
    if (!report.available) {
      return [`simulation: available=false reason=${report.reason}`]
    }

    return [
      [
        "simulation: available=true",
        `baseline=${report.baseline_commit}`,
        `current=${report.current_commit}`,
        `added=${report.added.length}`,
        `removed=${report.removed.length}`,
        `modified=${report.modified.length}`,
      ].join(" "),
      ...report.added.map((element) => this.elementLine("simulation-added", element)),
      ...report.removed.map((element) => this.elementLine("simulation-removed", element)),
      ...report.modified.map((element) => this.elementLine("simulation-modified", element)),
    ]
  }

  private static elementLine(prefix: string, element: SimulationElement): string {
    const previous =
      element.previous_title === undefined ? "" : ` previous=${element.previous_title}`
    const changed = element.changed.length === 0 ? "" : ` fields=${element.changed.join(",")}`

    return `${prefix}: ${element.id} kind=${element.kind} title=${element.title}${previous}${changed}`
  }

  private static label(element: SimulationElement): string {
    const title = element.title.trim()
    const name = title === "" ? "Untitled item" : title

    return `${name} (${this.kindLabel(element.kind)})`
  }

  private static modifiedLabel(element: SimulationElement): string {
    const previous = element.previous_title?.trim() ?? ""
    if (previous !== "" && previous !== element.title) {
      return `${previous} -> ${element.title} (${this.kindLabel(element.kind)})`
    }

    const changed = element.changed.length === 0 ? "changed" : element.changed.join(", ")

    return `${this.label(element)} changed ${changed}`
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
