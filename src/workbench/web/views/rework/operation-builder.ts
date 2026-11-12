import type { ProposalOperation } from "../../../../change"
import type { OperationForm } from "./operation-form"

export function buildOperation(form: OperationForm): ProposalOperation | null {
  switch (form.kind) {
    case "rename":
      return form.title.trim() === ""
        ? null
        : { kind: "rename", target: form.target, title: form.title.trim() }
    case "deprecate":
      return { kind: "deprecate", target: form.target }
    case "replace":
      return form.title.trim() === ""
        ? null
        : {
            kind: "replace",
            target: form.target,
            replacement: fields({
              TITLE: form.title,
              STATEMENT: form.statement,
            }),
          }
    case "split": {
      const parts = form.parts
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => partFields(line))
        .filter((part): part is Record<string, string> => part !== null)
      return parts.length === 0 ? null : { kind: "split", target: form.target, parts }
    }
    case "merge": {
      if (form.title.trim() === "") return null
      return {
        kind: "merge",
        targets: [form.target, ...form.extraTargets],
        result: fields({ TITLE: form.title, STATEMENT: form.statement }),
      }
    }
    case "extract":
      return form.title.trim() === ""
        ? null
        : {
            kind: "extract",
            target: form.target,
            component: {
              UID: "",
              TITLE: form.title.trim(),
              KIND: form.componentKind,
            },
            ...(form.parent === "" ? {} : { parent: form.parent }),
            ...(form.source === "" ? {} : { from: form.source }),
          }
    case "move":
      return form.destination === ""
        ? null
        : {
            kind: "move",
            target: form.target,
            to: form.destination,
            ...(form.moveField === "" ? {} : { field: form.moveField }),
          }
    case "change-contract": {
      const changed = contractFields(form)
      return Object.keys(changed).length === 0
        ? null
        : { kind: "change-contract", target: form.target, fields: changed }
    }
    case "record-decision":
      return form.title.trim() === "" || form.statement.trim() === ""
        ? null
        : {
            kind: "record-decision",
            title: form.title.trim(),
            statement: form.statement.trim(),
            ...(form.target === "" ? {} : { target: form.target }),
            ...(form.owner.trim() === "" ? {} : { owner: form.owner.trim() }),
          }
    case "record-open-question":
      return form.question.trim() === ""
        ? null
        : {
            kind: "record-open-question",
            question: form.question.trim(),
            ...(form.target === "" ? {} : { target: form.target }),
            ...(form.owner.trim() === "" ? {} : { owner: form.owner.trim() }),
          }
  }
}

function partFields(line: string): Record<string, string> | null {
  const [title, statement] = line.split("|")
  const trimmed = (title ?? "").trim()
  if (trimmed === "") return null

  return fields({ TITLE: trimmed, STATEMENT: (statement ?? "").trim() })
}

function fields(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ""))
}

function contractFields(form: OperationForm): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (form.contractCompatibility !== "") fields["compatibility"] = form.contractCompatibility
  if (form.contractTitle.trim() !== "") fields["title"] = form.contractTitle.trim()
  if (form.contractOwner.trim() !== "") fields["owner"] = form.contractOwner.trim()

  return fields
}
