import { describe, expect, test } from "bun:test"
import { ProposalOperationParser } from "../src/change/operation-parser"
import {
  buildDraftOperation,
  canSubmitDraft,
  initialDraftForm,
} from "../src/workbench/web/views/compose/draft-builder"
import { buildOperation } from "../src/workbench/web/views/rework/operation-builder"
import { canSubmit, initialOperationForm } from "../src/workbench/web/views/rework/operation-form"

describe("rework operation builder", () => {
  test("builds record and source operations", () => {
    const form = initialOperationForm("req-auth", "cmp-session")

    form.kind = "replace"
    form.title = "New session behavior"
    form.statement = "The system shall expire sessions."
    expect(buildOperation(form)).toMatchObject({
      kind: "replace",
      target: "req-auth",
      replacement: {
        TITLE: "New session behavior",
        STATEMENT: "The system shall expire sessions.",
      },
    })

    form.kind = "split"
    form.parts = "Expire sessions | The system expires sessions.\nReject stale sessions"
    expect(buildOperation(form)).toMatchObject({
      kind: "split",
      parts: [
        { TITLE: "Expire sessions", STATEMENT: "The system expires sessions." },
        { TITLE: "Reject stale sessions" },
      ],
    })

    form.kind = "extract"
    form.title = "Session store"
    form.componentKind = "component"
    form.parent = "cmp-auth"
    expect(buildOperation(form)).toMatchObject({
      kind: "extract",
      component: { UID: "", TITLE: "Session store", KIND: "component" },
      parent: "cmp-auth",
    })

    form.kind = "change-contract"
    form.contractCompatibility = "backward"
    form.contractOwner = "platform"
    expect(buildOperation(form)).toMatchObject({
      kind: "change-contract",
      fields: { compatibility: "backward", owner: "platform" },
    })
  })

  test("builds merge, move, and decision operations", () => {
    const form = initialOperationForm("req-auth", "cmp-session")
    form.kind = "merge"
    form.extraTargets = ["req-session"]
    form.title = "Session behavior"
    expect(buildOperation(form)).toMatchObject({
      kind: "merge",
      targets: ["req-auth", "req-session"],
      result: { TITLE: "Session behavior" },
    })

    form.kind = "move"
    form.moveField = "COMPONENT"
    expect(buildOperation(form)).toMatchObject({
      kind: "move",
      target: "req-auth",
      to: "cmp-session",
      field: "COMPONENT",
    })

    form.kind = "record-decision"
    form.statement = "Use short-lived tokens."
    form.owner = "tester"
    expect(buildOperation(form)).toMatchObject({
      kind: "record-decision",
      title: "Session behavior",
      statement: "Use short-lived tokens.",
      target: "req-auth",
      owner: "tester",
    })

    form.kind = "record-open-question"
    form.question = "What happens on store failure?"
    expect(buildOperation(form)).toMatchObject({
      kind: "record-open-question",
      question: "What happens on store failure?",
    })
  })

  test("reports whether the form is ready", () => {
    const form = initialOperationForm("req-auth", "cmp-session")
    expect(canSubmit(form)).toBe(false)

    form.title = "Changed"
    expect(canSubmit(form)).toBe(true)

    form.kind = "split"
    form.parts = ""
    expect(canSubmit(form)).toBe(false)
  })
})

describe("compose draft builder", () => {
  test("builds add-record operations for requirements and acceptance criteria", () => {
    const requirement = initialDraftForm()
    requirement.title = "Login behavior"
    requirement.statement = "The component shall accept a valid login."
    requirement.component = "cmp-auth"
    requirement.owner = "tester"
    expect(buildDraftOperation(requirement)).toMatchObject({
      kind: "add-record",
      recordKind: "requirement",
      record: {
        TITLE: "Login behavior",
        STATEMENT: "The component shall accept a valid login.",
        COMPONENT: "cmp-auth",
        OWNER: "tester",
      },
    })

    const acceptance = { ...requirement, mode: "acceptance" as const }
    acceptance.requirement = "req-login"
    expect(buildDraftOperation(acceptance)).toMatchObject({
      kind: "add-record",
      recordKind: "acceptance_criterion",
      acceptanceOf: "req-login",
    })
  })

  test("builds revise, retire, and decision operations", () => {
    const form = initialDraftForm()
    form.mode = "revise"
    form.target = "req-login"
    form.title = "Login accepted"
    form.statement = "The component shall accept valid credentials."
    expect(buildDraftOperation(form)).toMatchObject({
      kind: "replace",
      target: "req-login",
      replacement: { TITLE: "Login accepted" },
    })

    form.mode = "retire"
    expect(buildDraftOperation(form)).toMatchObject({ kind: "deprecate", target: "req-login" })

    form.mode = "decision"
    form.title = "Session tokens"
    form.statement = "Use short-lived tokens."
    expect(buildDraftOperation(form)).toMatchObject({
      kind: "record-decision",
      title: "Session tokens",
      statement: "Use short-lived tokens.",
    })

    form.mode = "question"
    form.statement = "What happens on store failure?"
    expect(buildDraftOperation(form)).toMatchObject({
      kind: "record-open-question",
      question: "What happens on store failure?",
    })
  })

  test("operations pass the change parser", () => {
    const form = initialDraftForm()
    form.title = "Login behavior"
    form.statement = "The component shall accept a valid login."

    const [operations, error] = ProposalOperationParser.parseList([buildDraftOperation(form)])
    expect(error).toBeNull()
    expect(operations?.[0]).toMatchObject({ kind: "add-record", recordKind: "requirement" })

    expect(canSubmitDraft(form)).toBe(true)
    form.statement = ""
    expect(canSubmitDraft(form)).toBe(false)
  })
})
