import type { Result } from "../core/result"
import type { WorkbenchFailure } from "../workbench/failure"
import type { WorkbenchService } from "../workbench/service"
import type { WorkbenchChangeView } from "../workbench/types"
import { TerminalEntrySelect } from "./entry-select"
import type { TerminalIO } from "./io"
import type { TerminalPrompt } from "./prompt"
import type { TerminalRenderer } from "./render"
import { TerminalReworkForm } from "./rework-form"
import { TerminalScratchForm } from "./scratch-form"

const SCRATCH_ACTIONS = [
  { value: "requirement", label: "Add requirement" },
  { value: "acceptance", label: "Add acceptance criterion" },
  { value: "revise", label: "Revise an item" },
  { value: "retire", label: "Retire an item" },
  { value: "decision", label: "Record decision" },
  { value: "question", label: "Record open question" },
  { value: "show", label: "Show the proposal" },
  { value: "done", label: "Finish" },
]

const REWORK_ACTIONS = [
  { value: "rename", label: "Rename" },
  { value: "deprecate", label: "Retire" },
  { value: "replace", label: "Replace" },
  { value: "split", label: "Split" },
  { value: "merge", label: "Merge" },
  { value: "extract", label: "Extract component" },
  { value: "move", label: "Move" },
  { value: "change-contract", label: "Change contract" },
  { value: "record-decision", label: "Record decision" },
  { value: "record-open-question", label: "Record open question" },
  { value: "show", label: "Show the proposal" },
  { value: "done", label: "Finish" },
]

export class TerminalProposalSession {
  private readonly select: TerminalEntrySelect
  private readonly scratch: TerminalScratchForm
  private readonly rework: TerminalReworkForm

  constructor(
    private readonly service: WorkbenchService,
    private readonly prompt: TerminalPrompt,
    private readonly renderer: TerminalRenderer,
    private readonly io: TerminalIO,
    private readonly simulate: boolean,
  ) {
    this.select = new TerminalEntrySelect(prompt)
    this.scratch = new TerminalScratchForm(prompt, this.select)
    this.rework = new TerminalReworkForm(prompt, this.select)
  }

  async run(): Promise<Result<WorkbenchChangeView, string>> {
    const [initial, initialError] = await this.service.change()
    if (initialError !== null) return [null, initialError.message]
    if (initial === null) return [null, "proposal report unavailable"]
    if (initial.proposal.mode === "mapping") {
      return [null, "mapping proposals are curated with spec map --review"]
    }

    let view = initial
    this.renderer.change(view)

    while (true) {
      const actions = view.proposal.mode === "scratch" ? SCRATCH_ACTIONS : REWORK_ACTIONS
      const action = await this.prompt.select("Next step", actions)
      if (action === null || action === "done" || this.prompt.isClosed) return [view, null]
      if (action === "show") {
        const [refreshed, refreshedError] = await this.service.change()
        if (refreshedError !== null) {
          this.printFailure(refreshedError)
          continue
        }
        if (refreshed === null) continue
        view = refreshed
        this.renderer.change(view)
        continue
      }

      const [operation, operationError] = await this.operation(action, view)
      if (this.prompt.isClosed) return [view, null]
      if (operationError !== null) {
        this.io.print(operationError)
        continue
      }
      if (operation === null) continue

      const [updated, updateError] = await this.service.operations(
        view.proposal.ref,
        [operation],
        this.simulate,
      )
      if (updateError !== null) {
        this.printFailure(updateError)
        continue
      }
      if (updated === null) {
        this.io.print("could not apply the operation")
        continue
      }

      view = updated
      this.renderer.change(view)
    }
  }

  private async operation(
    action: string,
    view: WorkbenchChangeView,
  ): Promise<ReturnType<TerminalScratchForm["build"]>> {
    const [graph, graphError] = await this.service.graph()
    if (graphError !== null) return [null, graphError.message]
    if (graph === null) return [null, "graph unavailable"]

    return view.proposal.mode === "scratch"
      ? this.scratch.build(action, graph.entries)
      : this.rework.build(action, graph.entries)
  }

  private printFailure(failure: WorkbenchFailure): void {
    this.io.print(`could not apply: ${failure.message}`)
    for (const choice of failure.choices ?? []) {
      this.io.print(`- ${choice.label} - ${choice.context}`)
    }
  }
}
