import type { ProposalOperation } from "../change"
import { fail, ok, type Result } from "../core/result"
import type { DisplayEntry } from "../model"
import {
  buildDraftOperation,
  initialDraftForm,
  type DraftForm,
} from "../workbench/forms/draft-builder"
import type { TerminalEntrySelect } from "./entry-select"
import type { TerminalPrompt } from "./prompt"

const EDITABLE_KINDS = ["requirement", "acceptance_criterion"]

export class TerminalScratchForm {
  constructor(
    private readonly prompt: TerminalPrompt,
    private readonly entries: TerminalEntrySelect,
  ) {}

  async build(
    action: string,
    graphEntries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const form = initialDraftForm()
    form.mode = action as DraftForm["mode"]
    if (action === "requirement") return this.requirement(form, graphEntries)
    if (action === "acceptance") return this.acceptance(form, graphEntries)
    if (action === "revise") return this.revise(form, graphEntries)
    if (action === "retire") return this.retire(form, graphEntries)
    if (action === "decision") return this.decision(form, graphEntries)
    if (action === "question") return this.question(form, graphEntries)

    return fail(`unknown scratch action '${action}'`)
  }

  private async requirement(
    form: DraftForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const title = await this.prompt.required("Name")
    if (title === null) return ok(null)
    const statement = await this.prompt.required("Statement")
    if (statement === null) return ok(null)
    form.title = title
    form.statement = statement
    const rationale = await this.optionalText("Rationale")
    if (rationale === null) return ok(null)
    const owner = await this.optionalText("Owner")
    if (owner === null) return ok(null)
    form.rationale = rationale
    form.owner = owner

    const [component, componentError] = await this.entries.optional("Link a component?", entries, [
      "component",
      "system",
    ])
    if (componentError !== null) return fail(componentError)
    if (component === null) return ok(null)
    form.component = component

    const [capability, capabilityError] = await this.entries.optional(
      "Link a capability?",
      entries,
      ["capability"],
    )
    if (capabilityError !== null) return fail(capabilityError)
    if (capability === null) return ok(null)
    form.capability = capability

    return this.operation(form)
  }

  private async acceptance(
    form: DraftForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const title = await this.prompt.required("Name")
    if (title === null) return ok(null)
    const statement = await this.prompt.required("Statement")
    if (statement === null) return ok(null)
    form.title = title
    form.statement = statement

    const [requirement, requirementError] = await this.entries.optional("Required by", entries, [
      "requirement",
    ])
    if (requirementError !== null) return fail(requirementError)
    if (requirement === null) return ok(null)
    form.requirement = requirement

    return this.operation(form)
  }

  private async revise(
    form: DraftForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const [target, targetError] = await this.entries.required(
      "Item to revise",
      entries,
      EDITABLE_KINDS,
    )
    if (targetError !== null) return fail(targetError)
    if (target === null) return ok(null)
    form.target = target

    const title = await this.prompt.required("New name")
    if (title === null) return ok(null)
    const statement = await this.prompt.required("New statement")
    if (statement === null) return ok(null)
    form.title = title
    form.statement = statement

    return this.operation(form)
  }

  private async retire(
    form: DraftForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const [target, targetError] = await this.entries.required(
      "Item to retire",
      entries,
      EDITABLE_KINDS,
    )
    if (targetError !== null) return fail(targetError)
    if (target === null) return ok(null)

    const confirmed = await this.prompt.confirm("Retire this item?")
    if (confirmed === null) return ok(null)
    if (!confirmed) return ok(null)
    form.target = target

    return this.operation(form)
  }

  private async decision(
    form: DraftForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const title = await this.prompt.required("Decision")
    if (title === null) return ok(null)
    const statement = await this.prompt.required("Statement")
    if (statement === null) return ok(null)
    form.title = title
    form.statement = statement
    const owner = await this.optionalText("Owner")
    if (owner === null) return ok(null)
    form.owner = owner

    const [target, targetError] = await this.entries.optional("Link an item?", entries)
    if (targetError !== null) return fail(targetError)
    if (target === null) return ok(null)
    form.target = target

    return this.operation(form)
  }

  private async question(
    form: DraftForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const statement = await this.prompt.required("Open question")
    if (statement === null) return ok(null)
    form.statement = statement
    const owner = await this.optionalText("Owner")
    if (owner === null) return ok(null)
    form.owner = owner

    const [target, targetError] = await this.entries.optional("Link an item?", entries)
    if (targetError !== null) return fail(targetError)
    if (target === null) return ok(null)
    form.target = target

    return this.operation(form)
  }

  private async optionalText(message: string): Promise<string | null> {
    return this.prompt.text(`${message} (blank to skip)`)
  }

  private operation(form: DraftForm): Result<ProposalOperation | null, string> {
    const operation = buildDraftOperation(form)
    if (operation === null) return fail("draft is incomplete")

    return ok(operation)
  }
}
