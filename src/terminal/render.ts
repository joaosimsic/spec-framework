import type {
  WorkbenchChangeView,
  WorkbenchContextView,
  WorkbenchMappingView,
  WorkbenchNamedItem,
} from "../workbench/types"
import type { TerminalIO } from "./io"

export class TerminalRenderer {
  constructor(
    private readonly io: TerminalIO,
    private readonly technical: boolean,
  ) {}

  next(view: WorkbenchContextView): void {
    const proposal = view.proposal
    if (proposal === null) {
      this.io.print("mode: read-only")
    } else {
      this.io.print(`proposal: ${proposal.label}`)
      this.io.print(`mode: ${proposal.mode}`)
      this.io.print(`state: ${proposal.state}`)
      if (this.technical) {
        this.io.print(`proposal-ref: ${proposal.ref}`)
        this.io.print(`base-commit: ${proposal.baseCommit}`)
      }
    }

    this.list("decisions to make", view.prompts)
    this.list("next", view.next)
    this.list("blockers", view.blockers)
    this.list(
      "open questions",
      view.openQuestions.map((item) => this.item(item, true)),
    )
  }

  change(view: WorkbenchChangeView): void {
    this.io.print(`proposal: ${view.proposal.label}`)
    this.io.print(`mode: ${view.proposal.mode}`)
    this.io.print(`state: ${view.proposal.state}`)
    if (this.technical) {
      this.io.print(`proposal-ref: ${view.proposal.ref}`)
      this.io.print(`base-commit: ${view.proposal.baseCommit}`)
    }

    this.list(
      "operations",
      view.operations.map((item) => item.label),
    )

    const diff = view.diff
    if (!diff.available) {
      this.io.print(`diff: ${diff.reason ?? "unavailable"}`)
    } else {
      this.list(
        "added",
        diff.added.map((item) => this.item(item, false)),
      )
      this.list(
        "removed",
        diff.removed.map((item) => this.item(item, false)),
      )
      this.list(
        "modified",
        diff.modified.map((item) => {
          const previous = item.previousLabel === undefined ? "" : ` (was ${item.previousLabel})`
          return `${this.item(item, false)}${previous}: ${item.changed.join(", ")}`
        }),
      )
    }

    this.list(
      "affected",
      view.impact.affected.map((item) => this.item(item, false)),
    )
    this.list(
      "invalidated evidence",
      view.impact.invalidatedEvidence.map((item) => this.item(item, false)),
    )
    this.list(
      "approvals to renew",
      view.impact.approvalsToRenew.map((item) => this.item(item, false)),
    )
    this.list(
      "open questions",
      view.impact.openQuestions.map((item) => this.item(item, false)),
    )
  }

  mapping(view: WorkbenchMappingView): void {
    this.io.print(`state: ${view.state}`)
    const pending = view.areas.filter((area) => area.state !== "Confirmed")
    this.list(
      "areas needing review",
      pending.map((area) => `${area.label} (${area.kindLabel}) - ${area.confidenceLabel}`),
    )
    const pendingRelations = view.relations.filter(
      (relation) => relation.confidenceLabel !== "Clear from code",
    )
    this.list(
      "relations needing review",
      pendingRelations.map((relation) => relation.label),
    )
    this.list(
      "open questions",
      view.questions.map(
        (question) => `${question.label}${question.blocking ? " (blocking)" : ""}`,
      ),
    )
    this.list("next", view.next)
  }

  list(title: string, values: string[]): void {
    if (values.length === 0) return

    this.io.print(`${title}:`)
    for (const value of values) this.io.print(`- ${value}`)
  }

  private item(item: WorkbenchNamedItem, technical: boolean): string {
    if (!technical || !this.technical || item.ref === null) return item.label

    return `${item.label} [${item.ref}]`
  }
}
