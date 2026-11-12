import type { ProposalOperation } from "../change"
import type { Result } from "../core/result"
import type { DisplayEntry } from "../model"
import { buildOperation } from "../workbench/forms/operation-builder"
import {
  initialOperationForm,
  type OperationForm,
  type ReworkOperationKind,
} from "../workbench/forms/operation-form"
import type { TerminalEntrySelect } from "./entry-select"
import type { TerminalPrompt } from "./prompt"

export class TerminalReworkForm {
  constructor(
    private readonly prompt: TerminalPrompt,
    private readonly entries: TerminalEntrySelect,
  ) {}

  async build(
    action: string,
    graphEntries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const form = initialOperationForm("", "")
    form.kind = action as ReworkOperationKind
    const optionalTarget = action === "record-decision" || action === "record-open-question"

    const [target, targetError] = optionalTarget
      ? await this.entries.optional("Linked item?", graphEntries)
      : await this.entries.required("Item", graphEntries)
    if (targetError !== null) return [null, targetError]
    if (target === null) return [null, null]
    form.target = target

    if (action === "rename") return this.rename(form)
    if (action === "deprecate") return this.deprecate(form)
    if (action === "replace") return this.replace(form)
    if (action === "split") return this.split(form)
    if (action === "merge") return this.merge(form)
    if (action === "extract") return this.extract(form, graphEntries)
    if (action === "move") return this.move(form, graphEntries)
    if (action === "change-contract") return this.changeContract(form)
    if (action === "record-decision") return this.decision(form)
    if (action === "record-open-question") return this.question(form)

    return [null, `unknown refactor action '${action}'`]
  }

  private async rename(form: OperationForm): Promise<Result<ProposalOperation | null, string>> {
    form.title = (await this.prompt.required("New name")) ?? ""
    if (form.title === "") return [null, null]

    return this.operation(form)
  }

  private async deprecate(form: OperationForm): Promise<Result<ProposalOperation | null, string>> {
    const confirmed = await this.prompt.confirm("Retire this item?")
    if (confirmed !== true) return [null, null]

    return this.operation(form)
  }

  private async replace(form: OperationForm): Promise<Result<ProposalOperation | null, string>> {
    form.title = (await this.prompt.required("New name")) ?? ""
    if (form.title === "") return [null, null]
    form.statement = (await this.prompt.required("New statement")) ?? ""
    if (form.statement === "") return [null, null]

    return this.operation(form)
  }

  private async split(form: OperationForm): Promise<Result<ProposalOperation | null, string>> {
    const lines = await this.prompt.lines("Part as Title | statement")
    if (lines === null || lines.length === 0) return [null, null]
    form.parts = lines.join("\n")

    return this.operation(form)
  }

  private async merge(form: OperationForm): Promise<Result<ProposalOperation | null, string>> {
    const extras = await this.prompt.lines("Additional item name or ref")
    if (extras === null || extras.length === 0) return [null, null]
    form.extraTargets = extras
    form.title = (await this.prompt.required("New name")) ?? ""
    if (form.title === "") return [null, null]
    form.statement = (await this.prompt.required("New statement")) ?? ""
    if (form.statement === "") return [null, null]

    return this.operation(form)
  }

  private async extract(
    form: OperationForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    form.title = (await this.prompt.required("Component name")) ?? ""
    if (form.title === "") return [null, null]

    const componentKind = await this.prompt.select("Component kind", [
      { value: "component", label: "Component" },
      { value: "system", label: "System" },
      { value: "data_store", label: "Data store" },
      { value: "external_system", label: "External system" },
    ])
    if (componentKind === null) return [null, null]
    form.componentKind = componentKind

    const [parent, parentError] = await this.entries.optional("Parent component?", entries, [
      "component",
      "system",
    ])
    if (parentError !== null) return [null, parentError]
    if (parent === null) return [null, null]
    form.parent = parent

    const [source, sourceError] = await this.entries.optional("Requirement link?", entries, [
      "requirement",
    ])
    if (sourceError !== null) return [null, sourceError]
    if (source === null) return [null, null]
    form.source = source

    return this.operation(form)
  }

  private async move(
    form: OperationForm,
    entries: DisplayEntry[],
  ): Promise<Result<ProposalOperation | null, string>> {
    const [destination, destinationError] = await this.entries.required("Destination", entries, [
      "component",
      "system",
      "capability",
    ])
    if (destinationError !== null) return [null, destinationError]
    if (destination === null) return [null, null]
    form.destination = destination

    const field = await this.prompt.select("Link type", [
      { value: "", label: "Containment" },
      { value: "COMPONENT", label: "Component link" },
      { value: "CAPABILITY", label: "Capability link" },
    ])
    if (field === null) return [null, null]
    form.moveField = field as OperationForm["moveField"]

    return this.operation(form)
  }

  private async changeContract(
    form: OperationForm,
  ): Promise<Result<ProposalOperation | null, string>> {
    form.contractCompatibility = (await this.prompt.text("Compatibility (blank to skip)")) ?? ""
    form.contractTitle = (await this.prompt.text("Contract title (blank to skip)")) ?? ""
    form.contractOwner = (await this.prompt.text("Contract owner (blank to skip)")) ?? ""

    return this.operation(form)
  }

  private async decision(form: OperationForm): Promise<Result<ProposalOperation | null, string>> {
    form.title = (await this.prompt.required("Decision")) ?? ""
    if (form.title === "") return [null, null]
    form.statement = (await this.prompt.required("Statement")) ?? ""
    if (form.statement === "") return [null, null]
    form.owner = (await this.prompt.text("Owner (blank to skip)")) ?? ""

    return this.operation(form)
  }

  private async question(form: OperationForm): Promise<Result<ProposalOperation | null, string>> {
    form.question = (await this.prompt.required("Open question")) ?? ""
    if (form.question === "") return [null, null]
    form.owner = (await this.prompt.text("Owner (blank to skip)")) ?? ""

    return this.operation(form)
  }

  private operation(form: OperationForm): Result<ProposalOperation | null, string> {
    const operation = buildOperation(form)
    if (operation === null) return [null, "operation is incomplete"]

    return [operation, null]
  }
}
