export type ReworkOperationKind =
  | "rename"
  | "deprecate"
  | "replace"
  | "split"
  | "merge"
  | "extract"
  | "move"
  | "change-contract"
  | "record-decision"
  | "record-open-question"

export interface OperationForm {
  kind: ReworkOperationKind
  target: string
  destination: string
  title: string
  statement: string
  parts: string
  componentKind: string
  parent: string
  source: string
  moveField: "" | "COMPONENT" | "CAPABILITY"
  extraTargets: string[]
  contractCompatibility: string
  contractTitle: string
  contractOwner: string
  question: string
  owner: string
}

export function initialOperationForm(target: string, destination: string): OperationForm {
  return {
    kind: "rename",
    target,
    destination,
    title: "",
    statement: "",
    parts: "",
    componentKind: "component",
    parent: "",
    source: "",
    moveField: "",
    extraTargets: [],
    contractCompatibility: "",
    contractTitle: "",
    contractOwner: "",
    question: "",
    owner: "",
  }
}

export function canSubmit(form: OperationForm): boolean {
  switch (form.kind) {
    case "rename":
      return form.target !== "" && form.title.trim() !== ""
    case "deprecate":
      return form.target !== ""
    case "replace":
      return form.target !== "" && form.title.trim() !== ""
    case "split":
      return form.target !== "" && form.parts.trim() !== ""
    case "merge":
      return form.target !== "" && form.extraTargets.length > 0 && form.title.trim() !== ""
    case "extract":
      return form.target !== "" && form.title.trim() !== ""
    case "move":
      return form.target !== "" && form.destination !== ""
    case "change-contract":
      return (
        form.target !== "" &&
        (form.contractCompatibility !== "" ||
          form.contractTitle.trim() !== "" ||
          form.contractOwner.trim() !== "")
      )
    case "record-decision":
      return form.title.trim() !== "" && form.statement.trim() !== ""
    case "record-open-question":
      return form.question.trim() !== ""
  }
}
