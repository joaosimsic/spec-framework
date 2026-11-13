import { fail, ok, type Result } from "../core/result"
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
    if (initialError !== null) return fail(initialError.message)
    if (initial === null) return fail("mapping review unavailable")

    let view = initial
    this.renderer.mapping(view)

    for (const area of view.areas.filter((candidate) => candidate.state !== "Confirmed")) {
      const [step, stepError] = await this.curateArea(area, view)
      if (stepError !== null) return fail(stepError)
      if (step === null) return fail("curation failed")
      view = step.view
      if (step.finished) return ok(view)
    }

    const [relationsView, relationsError] = await this.service.mapping()
    if (relationsError !== null) return fail(relationsError.message)
    if (relationsView === null) return fail("mapping review unavailable")

    for (const relation of this.pendingRelations(relationsView)) {
      const [step, stepError] = await this.curateRelation(relation, relationsView)
      if (stepError !== null) return fail(stepError)
      if (step === null) return fail("curation failed")
      view = step.view
      if (step.finished) return ok(view)
    }

    const [finalView, finalError] = await this.service.mapping()
    if (finalError !== null) return fail(finalError.message)
    if (finalView === null) return fail("mapping review unavailable")

    this.renderer.mapping(finalView)
    return ok(finalView)
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
      if (action === null) return ok({ view, finished: true, applied: false })
      if (action === "skip") return ok({ view, finished: false, applied: false })
      if (action === "done") return ok({ view, finished: true, applied: false })

      const [request, requestError] = await this.areaRequest(action, area)
      if (requestError !== null) return fail(requestError)
      if (request === null) return ok({ view, finished: true, applied: false })

      const [step, stepError] = await this.apply(request, view)
      if (stepError !== null) return fail(stepError)
      if (step === null) return fail("curation action failed")
      if (step.applied) return ok(step)
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
      if (action === null) return ok({ view, finished: true, applied: false })
      if (action === "skip") return ok({ view, finished: false, applied: false })
      if (action === "done") return ok({ view, finished: true, applied: false })

      const request: WorkbenchCurationRequest = {
        kind: action === "accept" ? "accept-relation" : "reject-relation",
        source: relation.sourceRef,
        target: relation.targetRef,
        type: relation.type,
      }

      const [step, stepError] = await this.apply(request, view)
      if (stepError !== null) return fail(stepError)
      if (step === null) return fail("curation action failed")
      if (step.applied) return ok(step)
    }
  }

  private async areaRequest(
    action: string,
    area: WorkbenchMappingArea,
  ): Promise<Result<WorkbenchCurationRequest | null, string>> {
    switch (action) {
      case "accept":
        return ok({ kind: "accept", target: area.ref })
      case "reject":
        return ok({ kind: "reject", target: area.ref })
      case "rename": {
        const title = await this.prompt.required("New name")
        return ok(title === null ? null : { kind: "rename", target: area.ref, title })
      }
      case "owner": {
        const owner = await this.prompt.required("Owner")
        return ok(owner === null ? null : { kind: "set-owner", target: area.ref, owner })
      }
      case "responsibility": {
        const responsibility = await this.prompt.required("Responsibility")
        return ok(
          responsibility === null
            ? null
            : { kind: "set-responsibility", target: area.ref, responsibility },
        )
      }
      case "boundary": {
        const boundary = await this.prompt.required("Boundary")
        return ok(boundary === null ? null : { kind: "set-boundary", target: area.ref, boundary })
      }
      case "question": {
        const question = await this.prompt.required("Open question")
        if (question === null) return ok(null)
        const blocking = await this.prompt.confirm("Does this block approval?")
        if (blocking === null) return ok(null)

        return ok({ kind: "open-question", question, target: area.ref, blocking })
      }
      default:
        return fail(`unknown curation action '${action}'`)
    }
  }

  private async apply(
    request: WorkbenchCurationRequest,
    view: WorkbenchMappingView,
  ): Promise<Result<CurationStep, string>> {
    const [updated, error] = await this.service.applyMapping([request])
    if (error !== null) {
      this.printFailure(error)

      return ok({ view, finished: false, applied: false })
    }
    if (updated === null) return fail("mapping review unavailable")

    this.io.print(updated.state)
    this.renderer.mapping(updated)
    return ok({ view: updated, finished: false, applied: true })
  }

  private printFailure(failure: WorkbenchFailure): void {
    this.io.print(`could not apply: ${failure.message}`)
    for (const choice of failure.choices ?? []) {
      this.io.print(`- ${choice.label} - ${choice.context}`)
    }
  }
}
