import type { ImpactReport } from "../model/impact-types"
import type { Proposal, ProposalOperationLog } from "../change/types"

export class BundleChangeReportRenderer {
  render(proposal: Proposal, operations: ProposalOperationLog[], impact: ImpactReport): string {
    const lines = [
      "# Change report",
      "",
      `- Branch: ${proposal.branch}`,
      `- Direction: ${proposal.direction}`,
      `- Mode: ${proposal.mode}`,
      `- Status: ${proposal.status}`,
      `- Author: ${proposal.author}`,
      `- Created: ${proposal.created_at}`,
      `- Base commit: ${proposal.base_commit}`,
      `- Baseline commit: ${proposal.baseline.commit}`,
      `- Baseline lock: ${proposal.baseline.lock_hash ?? "none"}`,
      "",
      "## Operations",
      "",
    ]

    if (operations.length === 0) lines.push("No typed operations.")
    for (const operation of operations) {
      lines.push(`- ${operation.kind}: ${operation.targets.join(", ")} at ${operation.at}`)
    }

    lines.push("", "## Impact", "", `- Changed: ${impact.changed.length}`)
    lines.push(`- Affected: ${impact.affected.length}`)
    lines.push(`- Invalidated evidence: ${impact.invalidated_evidence.length}`)
    lines.push(`- Approvals to renew: ${impact.approvals_to_renew.length}`)
    lines.push(`- Open questions: ${impact.open_questions.length}`)

    lines.push("", "### Changed elements", "")
    if (impact.changed.length === 0) lines.push("None.")
    for (const element of impact.changed) {
      lines.push(`- ${element.id} (${element.kind}) distance ${element.distance}`)
    }

    lines.push("", "### Affected elements", "")
    if (impact.affected.length === 0) lines.push("None.")
    for (const element of impact.affected) {
      const via = element.via[0]
      const link = via === undefined ? "" : ` via ${via.from}:${via.type}:${via.to}`
      lines.push(`- ${element.id} (${element.kind}) distance ${element.distance}${link}`)
    }

    lines.push("", "### Invalidated evidence", "")
    lines.push(...this.list(impact.invalidated_evidence))
    lines.push("", "### Approvals to renew", "")
    lines.push(...this.list(impact.approvals_to_renew))
    lines.push("", "### Open questions", "")
    lines.push(...this.list(impact.open_questions))

    return `${lines.join("\n")}\n`
  }

  empty(commit: string): string {
    return [
      "# Change report",
      "",
      `No active proposal at bundle time. Baseline commit: ${commit}.`,
      "",
    ].join("\n")
  }

  private list(values: string[]): string[] {
    return values.length === 0 ? ["None."] : values.map((value) => `- ${value}`)
  }
}
