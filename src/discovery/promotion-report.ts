import type { PromotionReport } from "./promotion"

export class PromotionReportRenderer {
  static human(report: PromotionReport): string {
    const lines = [
      "mapping promotion complete",
      `proposal: ${report.proposal.branch}`,
      `promoted: ${report.promoted.length}`,
      ...report.promoted.map((area) => `  - ${area.label}`),
    ]

    if (report.skipped.length > 0) {
      lines.push(`already present: ${report.skipped.length}`)
      lines.push(...report.skipped.map((area) => `  - ${area.label}`))
    }

    lines.push(`relations promoted: ${report.relations}`)

    if (report.questions.length > 0) {
      lines.push("", "open questions:", ...report.questions.map((question) => `  - ${question}`))
    }

    if (report.files.length > 0) {
      lines.push("", "updated files:", ...report.files.map((file) => `  - ${file}`))
    }

    lines.push("", "next:", '- run spec approve --scope "<name>"')

    return lines.join("\n")
  }

  static technical(report: PromotionReport): string {
    const lines = [
      `mapping-promotion: proposal=${report.proposal.id} status=${report.proposal.status}`,
      `mapping-promotion-summary: promoted=${report.promoted.length} skipped=${report.skipped.length} relations=${report.relations}`,
      ...report.promoted.map((area) => `mapping-promotion-area: ${area.id} ${area.label}`),
      ...report.skipped.map((area) => `mapping-promotion-skipped: ${area.id} ${area.label}`),
      ...report.questions.map((question) => `mapping-promotion-question: ${question}`),
      ...report.files.map((file) => `mapping-promotion-file: ${file}`),
    ]

    return lines.join("\n")
  }

  static json(report: PromotionReport): string {
    return JSON.stringify(
      {
        proposal: report.proposal,
        promoted: report.promoted,
        skipped: report.skipped,
        relations: report.relations,
        questions: report.questions,
        files: report.files,
      },
      null,
      2,
    )
  }
}
