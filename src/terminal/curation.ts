import type { Result } from "../core/result"
import type { WorkbenchService } from "../workbench/service"
import type { WorkbenchFailure } from "../workbench/failure"
import type {
  WorkbenchCurationRequest,
  WorkbenchMappingArea,
  WorkbenchMappingRelation,
  WorkbenchMappingView,
} from "../workbench/types"
import type { TerminalIO } from "./io"
import type { TerminalPrompt } from "./prompt"
import type { TerminalRenderer } from "./render"

interface CurationStep {
  view: WorkbenchMappingView
  finished: boolean
  applied: boolean
}

export class TerminalCurationSession {
  constructor(
    private readonly service: WorkbenchService,
    private readonly prompt: TerminalPrompt,
    private readonly renderer: TerminalRenderer,
    private readonly io: TerminalIO,
  ) {}

  async run(): Promise<Result<WorkbenchMappingView, string>> {
    const [initial, initialError] = await this.service.mapping()
    if (initialError !== null) return [null, initialError.message]
    if (initial === null) return [null, "mapping review unavailable"]

    let view = initial
    this.renderer.mapping(view)

    for (const area of view.areas.filter((candidate) => candidate.state !== "Confirmed")) {
      const [step, stepError] = await this.curateArea(area, view)
      if (stepError !== null) return [null, stepError]
      if (step === null) return [null, "curation failed"]
      view = step.view
      if (step.finished) return [view, null]
    }

    const [relationsView, relationsError] = await this.service.mapping()
    if (relationsError !== null) return [null, relationsError.message]
    if (relationsView === null) return [null, "mapping review unavailable"]

    for (const relation of this.pendingRelations(relationsView)) {
      const [step, stepError] = await this.curateRelation(relation, relationsView)
      if (stepError !== null) return [null, stepError]
      if (step === null) return [null, "curation failed"]
      view = step.view
      if (step.finished) return [view, null]
    }

    const [finalView, finalError] = await this.service.mapping()
    if (finalError !== null) return [null, finalError.message]
    if (finalView === null) return [null, "mapping review unavailable"]

    this.renderer.mapping(finalView)
    return [finalView, null]
  }

  private pendingRelations(view: WorkbenchMappingView): WorkbenchMappingRelation[] {
    return view.relations.filter((relation) => relation.confidenceLabel !== "Clear from code")
  }

  private async curateArea(
    area: WorkbenchMappingArea,
    view: WorkbenchMappingView,
  ): Promise<Result<CurationStep, string>> {
    this.io.print(`area: ${area.label} (${area.kindLabel})`)
    this.io.print(area.confidenceLabel)
    this.io.print(area.prompt)

    while (true) {
      const action = await this.prompt.select("What should happen?", [
        { value: "accept", label: "Keep this area" },
        { value: "reject", label: "Reject this area" },
        { value: "rename", label: "Rename this area" },
        { value: "owner", label: "Set owner" },
        { value: "responsibility", label: "Set responsibility" },
        { value: "boundary", label: "Set boundary" },
        { value: "question", label: "Record open question" },
        { value: "skip", label: "Skip for now" },
        { value: "done", label: "Finish curation" },
      ])
      if (action === null) return [{ view, finished: true, applied: false }, null]
      if (action === "skip") return [{ view, finished: false, applied: false }, null]
      if (action === "done") return [{ view, finished: true, applied: false }, null]

      const [request, requestError] = await this.areaRequest(action, area)
      if (requestError !== null) return [null, requestError]
      if (request === null) return [{ view, finished: true, applied: false }, null]

      const [step, stepError] = await this.apply(request, view)
      if (stepError !== null) return [null, stepError]
      if (step === null) return [null, "curation action failed"]
      if (step.applied) return [step, null]
    }
  }

  private async curateRelation(
    relation: WorkbenchMappingRelation,
    view: WorkbenchMappingView,
  ): Promise<Result<CurationStep, string>> {
    this.io.print(`relation: ${relation.label}`)
    this.io.print(relation.confidenceLabel)

    while (true) {
      const action = await this.prompt.select("What should happen?", [
        { value: "accept", label: "Keep this relation" },
        { value: "reject", label: "Reject this relation" },
        { value: "skip", label: "Skip for now" },
        { value: "done", label: "Finish curation" },
      ])
      if (action === null) return [{ view, finished: true, applied: false }, null]
      if (action === "skip") return [{ view, finished: false, applied: false }, null]
      if (action === "done") return [{ view, finished: true, applied: false }, null]

      const request: WorkbenchCurationRequest = {
        kind: action === "accept" ? "accept-relation" : "reject-relation",
        source: relation.sourceRef,
        target: relation.targetRef,
        type: relation.type,
      }

      const [step, stepError] = await this.apply(request, view)
      if (stepError !== null) return [null, stepError]
      if (step === null) return [null, "curation action failed"]
      if (step.applied) return [step, null]
    }
  }

  private async areaRequest(
    action: string,
    area: WorkbenchMappingArea,
  ): Promise<Result<WorkbenchCurationRequest | null, string>> {
    switch (action) {
      case "accept":
        return [{ kind: "accept", target: area.ref }, null]
      case "reject":
        return [{ kind: "reject", target: area.ref }, null]
      case "rename": {
        const title = await this.prompt.required("New name")
        return [title === null ? null : { kind: "rename", target: area.ref, title }, null]
      }
      case "owner": {
        const owner = await this.prompt.required("Owner")
        return [owner === null ? null : { kind: "set-owner", target: area.ref, owner }, null]
      }
      case "responsibility": {
        const responsibility = await this.prompt.required("Responsibility")
        return [
          responsibility === null
            ? null
            : { kind: "set-responsibility", target: area.ref, responsibility },
          null,
        ]
      }
      case "boundary": {
        const boundary = await this.prompt.required("Boundary")
        return [
          boundary === null ? null : { kind: "set-boundary", target: area.ref, boundary },
          null,
        ]
      }
      case "question": {
        const question = await this.prompt.required("Open question")
        if (question === null) return [null, null]
        const blocking = await this.prompt.confirm("Does this block approval?")
        if (blocking === null) return [null, null]

        return [{ kind: "open-question", question, target: area.ref, blocking }, null]
      }
      default:
        return [null, `unknown curation action '${action}'`]
    }
  }

  private async apply(
    request: WorkbenchCurationRequest,
    view: WorkbenchMappingView,
  ): Promise<Result<CurationStep, string>> {
    const [updated, error] = await this.service.applyMapping([request])
    if (error !== null) {
      this.printFailure(error)

      return [{ view, finished: false, applied: false }, null]
    }
    if (updated === null) return [null, "mapping review unavailable"]

    this.io.print(updated.state)
    this.renderer.mapping(updated)
    return [{ view: updated, finished: false, applied: true }, null]
  }

  private printFailure(failure: WorkbenchFailure): void {
    this.io.print(`could not apply: ${failure.message}`)
    for (const choice of failure.choices ?? []) {
      this.io.print(`- ${choice.label} - ${choice.context}`)
    }
  }
}
