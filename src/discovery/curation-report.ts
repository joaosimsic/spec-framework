import type {
  CurationAction,
  MappingCurationQuestion,
  MappingCurationReport,
  MappingCurationSummary,
} from "./curation-types"

const SUMMARY_LABELS = [
  ["accepted", "kept"],
  ["rejected", "rejected"],
  ["acceptedRelations", "relations kept"],
  ["rejectedRelations", "relations rejected"],
  ["renamed", "renamed"],
  ["merged", "merged"],
  ["split", "split"],
  ["questions", "open questions"],
] satisfies Array<[keyof MappingCurationSummary, string]>

export class MappingCurationReportRenderer {
  static human(curation: MappingCurationReport): string[] {
    if (curation.decisions.length === 0) return []

    const lines = ["", "curation:", `  decisions: ${curation.decisions.length}`]
    for (const [key, label] of SUMMARY_LABELS) {
      const count = curation.summary[key]
      if (count > 0) lines.push(`  ${label}: ${count}`)
    }

    if (curation.questions.length > 0) {
      lines.push("", "open questions:")
      for (const question of curation.questions) lines.push(`  - ${this.questionLabel(question)}`)
    }

    if (curation.draftPath !== null) lines.push("", `draft: ${curation.draftPath}`)

    return lines
  }

  static technical(curation: MappingCurationReport): string[] {
    const lines = [
      `mapping-curation: decisions=${curation.decisions.length} accepted=${curation.summary.accepted} rejected=${curation.summary.rejected} accepted-relations=${curation.summary.acceptedRelations} rejected-relations=${curation.summary.rejectedRelations} renamed=${curation.summary.renamed} merged=${curation.summary.merged} split=${curation.summary.split} questions=${curation.summary.questions}`,
      `mapping-curation-draft: ${curation.draftPath ?? "none"}`,
    ]

    for (const decision of curation.decisions) {
      lines.push(`mapping-curation-decision: at=${decision.at} ${this.actionLine(decision.action)}`)
    }

    for (const area of curation.areas) {
      lines.push(
        [
          `mapping-curation-area: ${area.id}`,
          `kind=${area.kind}`,
          `title=${area.title}`,
          `confidence=${area.confidence}`,
          `provenance=${area.provenance}`,
          `owner=${area.owner ?? "none"}`,
          `responsibility=${area.responsibility ?? "none"}`,
          `boundary=${area.boundary ?? "none"}`,
        ].join(" "),
      )
    }

    for (const relation of curation.relations) {
      lines.push(
        [
          `mapping-curation-relation: ${relation.sourceId} -> ${relation.targetId}`,
          `type=${relation.type}`,
          `confidence=${relation.confidence}`,
          `provenance=${relation.provenance}`,
        ].join(" "),
      )
    }

    for (const question of curation.questions) {
      lines.push(
        [
          `mapping-curation-question: target=${question.targetId ?? "none"}`,
          `blocking=${question.blocking}`,
          `at=${question.at}`,
          `question=${question.question}`,
        ].join(" "),
      )
    }

    return lines
  }

  private static questionLabel(question: MappingCurationQuestion): string {
    const target = question.targetLabel === null ? "" : ` (${question.targetLabel})`
    const blocking = question.blocking ? " [blocking]" : ""

    return `${question.question}${target}${blocking}`
  }

  private static actionLine(action: CurationAction): string {
    return `kind=${action.kind} ${JSON.stringify(action)}`
  }
}
