import type { DriftFinding, DriftKind, DriftReport } from "./drift"

const KIND_LABELS: Record<DriftKind, string> = {
  "missing-in-spec": "Missing from spec",
  "missing-in-code": "Missing from code",
  "changed-relation": "Changed relation",
  "changed-approval": "Changed approval",
}

export class DriftReportRenderer {
  static human(report: DriftReport): string {
    const lines = [`mapping drift: ${report.findings.length} finding(s)`]
    if (report.approved === 0) {
      lines.push("no approved architecture to check")
      lines.push("next: curate a mapping review and approve a scope")
      return lines.join("\n")
    }

    lines.push(`approved architecture elements: ${report.approved}`)

    for (const finding of report.findings) lines.push(this.findingLine(finding))
    if (report.findings.length > 0) lines.push("", "next: spec map --review to curate the change")

    return lines.join("\n")
  }

  static technical(report: DriftReport): string {
    const lines = [
      `mapping-drift: approved=${report.approved} findings=${report.findings.length} missing-in-spec=${report.summary["missing-in-spec"]} missing-in-code=${report.summary["missing-in-code"]} changed-relation=${report.summary["changed-relation"]} changed-approval=${report.summary["changed-approval"]}`,
      ...report.findings.map((finding) => this.technicalLine(finding)),
    ]

    return lines.join("\n")
  }

  static json(report: DriftReport): string {
    return JSON.stringify(report, null, 2)
  }

  private static findingLine(finding: DriftFinding): string {
    const kind = finding.kindLabel === undefined ? "" : ` (${finding.kindLabel})`
    const detail = finding.detail === undefined ? "" : ` - ${finding.detail}`

    return `- ${KIND_LABELS[finding.kind]}: ${finding.label}${kind}${detail}`
  }

  private static technicalLine(finding: DriftFinding): string {
    const id = finding.id === undefined ? "" : ` id=${finding.id}`
    const detail = finding.detail === undefined ? "" : ` detail=${finding.detail}`

    return `mapping-drift-finding: kind=${finding.kind}${id} label=${finding.label}${detail}`
  }
}
