import type { ProposalOperation } from "../../../../change"

export type DraftMode = "requirement" | "acceptance" | "revise" | "retire" | "decision" | "question"

export interface DraftForm {
  mode: DraftMode
  target: string
  title: string
  statement: string
  rationale: string
  owner: string
  requirement: string
  component: string
  capability: string
  formal: string
  contract: string
  evidence: string
}

export function initialDraftForm(): DraftForm {
  return {
    mode: "requirement",
    target: "",
    title: "",
    statement: "",
    rationale: "",
    owner: "",
    requirement: "",
    component: "",
    capability: "",
    formal: "",
    contract: "",
    evidence: "",
  }
}

export function canSubmitDraft(form: DraftForm): boolean {
  switch (form.mode) {
    case "requirement":
    case "acceptance":
      return form.title.trim() !== "" && form.statement.trim() !== ""
    case "revise":
      return form.target !== "" && form.title.trim() !== "" && form.statement.trim() !== ""
    case "retire":
      return form.target !== ""
    case "decision":
      return form.title.trim() !== "" && form.statement.trim() !== ""
    case "question":
      return form.statement.trim() !== ""
  }
}

export function buildDraftOperation(form: DraftForm): ProposalOperation | null {
  switch (form.mode) {
    case "requirement":
    case "acceptance": {
      if (form.title.trim() === "" || form.statement.trim() === "") return null
      const record = clean({
        TITLE: form.title,
        STATEMENT: form.statement,
        RATIONALE: form.rationale,
        OWNER: form.owner,
        COMPONENT: form.component,
        CAPABILITY: form.capability,
        FORMAL: form.formal,
        CONTRACTS: form.contract,
        EVIDENCE: form.evidence,
      })

      return {
        kind: "add-record",
        recordKind: form.mode === "requirement" ? "requirement" : "acceptance_criterion",
        record,
        ...(form.mode === "acceptance" && form.requirement !== ""
          ? { acceptanceOf: form.requirement }
          : {}),
      }
    }
    case "revise":
      return form.target === "" || form.title.trim() === "" || form.statement.trim() === ""
        ? null
        : {
            kind: "replace",
            target: form.target,
            replacement: clean({ TITLE: form.title, STATEMENT: form.statement }),
          }
    case "retire":
      return form.target === "" ? null : { kind: "deprecate", target: form.target }
    case "decision":
      return form.title.trim() === "" || form.statement.trim() === ""
        ? null
        : {
            kind: "record-decision",
            title: form.title.trim(),
            statement: form.statement.trim(),
            ...(form.target === "" ? {} : { target: form.target }),
            ...(form.owner.trim() === "" ? {} : { owner: form.owner.trim() }),
          }
    case "question":
      return form.statement.trim() === ""
        ? null
        : {
            kind: "record-open-question",
            question: form.statement.trim(),
            ...(form.target === "" ? {} : { target: form.target }),
            ...(form.owner.trim() === "" ? {} : { owner: form.owner.trim() }),
          }
  }
}

function clean(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim() !== ""))
}
