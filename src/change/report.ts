import { ImpactReportRenderer } from "./impact-report"
import { SimulationReportRenderer } from "./simulation-report"
import type { ChangeEntry, ChangeReport, Proposal, ProposalOperationLog } from "./types"

const ACTION_LABELS = {
  added: "Added",
  modified: "Modified",
  deprecated: "Deprecated",
} satisfies Record<ChangeEntry["action"], string>

export class ChangeReportRenderer {
  static human(report: ChangeReport): string {
    const lines = [
      `proposal: ${report.proposal.branch}`,
      `direction: ${report.proposal.direction}`,
      `mode: ${report.proposal.mode}`,
      `status: ${report.proposal.status}`,
      `author: ${report.proposal.author}`,
      `changes: ${report.changes.length}`,
    ]

    for (const change of report.changes) {
      lines.push(`  ${ACTION_LABELS[change.action]} ${change.title}`)
    }

    if (report.operations.length > 0) {
      lines.push(`operations: ${report.operations.length}`)
    }

    if (report.simulation !== undefined) {
      lines.push("")
      lines.push(...SimulationReportRenderer.human(report.simulation))
    }

    lines.push("")
    lines.push(...ImpactReportRenderer.human(report.impact))

    return lines.join("\n")
  }

  static technical(report: ChangeReport): string {
    const lines = [
      `proposal: ${report.proposal.id}`,
      `branch: ${report.proposal.branch}`,
      `direction: ${report.proposal.direction}`,
      `mode: ${report.proposal.mode}`,
      `status: ${report.proposal.status}`,
      `author: ${report.proposal.author}`,
      `base_commit: ${report.proposal.base_commit}`,
      `baseline_commit: ${report.proposal.baseline.commit}`,
      `baseline_lock: ${report.proposal.baseline.lock_hash ?? "none"}`,
      `changes: ${report.changes.length}`,
    ]

    for (const change of report.changes) {
      lines.push(this.changeLine(change))
    }

    for (const operation of report.operations) {
      lines.push(this.operationLine(operation))
    }

    if (report.simulation !== undefined) {
      lines.push(...SimulationReportRenderer.technical(report.simulation))
    }

    lines.push(...ImpactReportRenderer.technical(report.impact))

    return lines.join("\n")
  }

  static status(proposal: Proposal, technical = false): string {
    if (technical) {
      const lines = [
        `proposal: ${proposal.id}`,
        `branch: ${proposal.branch}`,
        `direction: ${proposal.direction}`,
        `mode: ${proposal.mode}`,
        `status: ${proposal.status}`,
        `author: ${proposal.author}`,
        `created_at: ${proposal.created_at}`,
        `base_commit: ${proposal.base_commit}`,
        `baseline_commit: ${proposal.baseline.commit}`,
        `baseline_lock: ${proposal.baseline.lock_hash ?? "none"}`,
        `operations: ${proposal.operations.length}`,
      ]

      return lines.join("\n")
    }

    return [
      `proposal: ${proposal.branch}`,
      `direction: ${proposal.direction}`,
      `mode: ${proposal.mode}`,
      `status: ${proposal.status}`,
      `author: ${proposal.author}`,
      `operations: ${proposal.operations.length}`,
    ].join("\n")
  }

  private static changeLine(change: ChangeEntry): string {
    const previous = change.previous_title === undefined ? "" : ` from '${change.previous_title}'`
    const status =
      change.previous_status === change.status
        ? (change.status ?? "unknown")
        : `${change.previous_status ?? "unknown"} -> ${change.status ?? "unknown"}`

    return [
      `change: ${change.action} ${change.id}`,
      `kind: ${change.kind}`,
      `title: ${change.title}${previous}`,
      `status: ${status}`,
    ].join(" ")
  }

  private static operationLine(operation: ProposalOperationLog): string {
    return [
      `operation: ${operation.kind}`,
      `targets: ${operation.targets.join(",")}`,
      `at: ${operation.at}`,
      `before: ${this.hashList(operation.before_hashes)}`,
      `after: ${this.hashList(operation.after_hashes)}`,
    ].join(" ")
  }

  private static hashList(hashes: Record<string, string | null>): string {
    return Object.entries(hashes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, hash]) => `${id}=${hash ?? "none"}`)
      .join(",")
  }
}
