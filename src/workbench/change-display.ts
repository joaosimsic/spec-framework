import type { ChangeReport, ProposalOperationKind } from "../change"
import type { ImpactReport, SimulationElement, SimulationReport } from "../model"
import type { SpecGraph } from "../model/types"
import { WorkbenchLabeler } from "./labels"
import { WorkbenchGraphDisplay } from "./graph-display"
import type {
  WorkbenchChangeView,
  WorkbenchDiffItem,
  WorkbenchDiffView,
  WorkbenchImpactView,
  WorkbenchNamedItem,
} from "./types"

const OPERATION_LABELS: Record<ProposalOperationKind, string> = {
  rename: "Renamed",
  deprecate: "Retired",
  replace: "Replaced",
  split: "Split",
  merge: "Merged",
  extract: "Extracted",
  move: "Moved",
  "change-contract": "Changed contract",
  "record-decision": "Recorded decision",
  "record-open-question": "Recorded open question",
}

export class WorkbenchChangeDisplay {
  private readonly labels: WorkbenchLabeler

  constructor(graph: SpecGraph) {
    const display = new WorkbenchGraphDisplay(graph)
    this.labels = display.labels
  }

  view(report: ChangeReport): WorkbenchChangeView {
    return {
      proposal: this.labels.proposal(report.proposal),
      operations: report.operations.map((operation) => ({
        ref: null,
        label: `${OPERATION_LABELS[operation.kind]} ${this.targetLabels(operation.targets)}`,
        kindLabel: "Proposal operation",
      })),
      diff: this.diff(report.simulation),
      impact: this.impact(report.impact),
    }
  }

  diff(simulation: SimulationReport | undefined): WorkbenchDiffView {
    if (simulation === undefined) {
      return this.unavailableDiff("No baseline graph snapshot is stored for this proposal.")
    }
    if (!simulation.available) return this.unavailableDiff(simulation.reason)

    return {
      available: true,
      added: simulation.added.map((element) => this.simulationItem(element)),
      removed: simulation.removed.map((element) => this.simulationItem(element)),
      modified: simulation.modified.map((element) => this.modifiedItem(element)),
    }
  }

  impact(impact: ImpactReport): WorkbenchImpactView {
    return {
      available: true,
      changed: impact.changed.map((element) => this.labels.named(element.id, element.title)),
      affected: impact.affected.map((element) => this.labels.named(element.id, element.title)),
      invalidatedEvidence: impact.invalidated_evidence.map((id) => this.labels.named(id)),
      approvalsToRenew: impact.approvals_to_renew.map((id) => this.labels.named(id)),
      openQuestions: impact.open_questions.map((id) => this.labels.named(id)),
    }
  }

  private unavailableDiff(reason: string): WorkbenchDiffView {
    return { available: false, reason, added: [], removed: [], modified: [] }
  }

  private simulationItem(element: SimulationElement): WorkbenchNamedItem {
    return this.labels.named(element.id, element.title)
  }

  private modifiedItem(element: SimulationElement): WorkbenchDiffItem {
    const item = this.labels.named(element.id, element.title)
    const previous = element.previous_title?.trim()

    return {
      ...item,
      ...(previous === undefined || previous === "" || previous === item.label
        ? {}
        : { previousLabel: previous }),
      changed: element.changed.map((field) => this.humanize(field)),
    }
  }

  private targetLabels(targets: string[]): string {
    return targets.map((id) => this.labels.named(id).label).join(", ")
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "changed"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
