import { attempt, type Result, ok, fail } from "../core/result"
import type {
  ProposalComponentFields,
  ProposalContractFields,
  ProposalMoveField,
  ProposalOperation,
  ProposalRecordFields,
} from "./types"

const RECORD_KINDS = new Set(["requirement", "acceptance_criterion"])

export class ProposalOperationParser {
  static parseJson(text: string): Result<ProposalOperation[], string> {
    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) {
      return fail(parseError === null ? "empty operation document" : parseError)
    }

    return this.parseList(parsed)
  }

  static parseList(value: unknown): Result<ProposalOperation[], string> {
    const candidates = Array.isArray(value) ? value : [value]
    const operations: ProposalOperation[] = []

    for (const candidate of candidates) {
      const [operation, error] = this.parse(candidate)
      if (error !== null) return fail(error)
      if (operation === null) return fail("operation failed")
      operations.push(operation)
    }

    if (operations.length === 0) return fail("no operations supplied")

    return ok(operations)
  }

  static parse(value: unknown): Result<ProposalOperation, string> {
    if (!this.isRecord(value)) return fail("operation must be an object")
    if (typeof value["kind"] !== "string") return fail("operation kind must be a string")

    switch (value["kind"]) {
      case "rename":
        return this.readRename(value)
      case "deprecate":
        return this.readDeprecate(value)
      case "replace":
        return this.readReplace(value)
      case "split":
        return this.readSplit(value)
      case "merge":
        return this.readMerge(value)
      case "extract":
        return this.readExtract(value)
      case "move":
        return this.readMove(value)
      case "change-contract":
        return this.readChangeContract(value)
      case "record-decision":
        return this.readRecordDecision(value)
      case "record-open-question":
        return this.readRecordOpenQuestion(value)
      case "add-record":
        return this.readAddRecord(value)
      default:
        return fail(`unknown operation kind '${value["kind"]}'`)
    }
  }

  private static readRename(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return fail("rename requires a target")
    if (typeof value["title"] !== "string" || value["title"].trim() === "") {
      return fail("rename requires a title")
    }

    return ok({ kind: "rename", target, title: value["title"].trim() })
  }

  private static readDeprecate(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return fail("deprecate requires a target")

    return ok({ kind: "deprecate", target })
  }

  private static readReplace(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return fail("replace requires a target")

    const [replacement, error] = this.readNewFields(value["replacement"], "replacement")
    if (error !== null) return fail(error)
    if (replacement === null) return fail("replace requires replacement fields")

    return ok({ kind: "replace", target, replacement })
  }

  private static readSplit(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return fail("split requires a target")
    if (!Array.isArray(value["parts"]) || value["parts"].length === 0) {
      return fail("split requires at least one part")
    }

    const parts: ProposalRecordFields[] = []
    for (const candidate of value["parts"]) {
      const [fields, error] = this.readNewFields(candidate, "part")
      if (error !== null) return fail(error)
      if (fields === null) return fail("split part failed")
      parts.push(fields)
    }

    return ok({ kind: "split", target, parts })
  }

  private static readMerge(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const targets = this.readTargets(value["targets"])
    if (targets === null) return fail("merge requires at least two unique targets")

    const [result, error] = this.readNewFields(value["result"], "result")
    if (error !== null) return fail(error)
    if (result === null) return fail("merge requires result fields")

    return ok({ kind: "merge", targets, result })
  }

  private static readExtract(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return fail("extract requires a target")

    const [component, componentError] = this.readComponent(value["component"])
    if (componentError !== null) return fail(componentError)
    if (component === null) return fail("extract requires component fields")

    const parent = this.readOptionalTarget(value["parent"])
    if (parent === null && value["parent"] !== undefined) {
      return fail("extract parent must be a non-empty string")
    }

    const from = this.readOptionalTarget(value["from"])
    if (from === null && value["from"] !== undefined) {
      return fail("extract from must be a non-empty string")
    }

    return ok({
      kind: "extract",
      target,
      component,
      ...(parent === null ? {} : { parent }),
      ...(from === null ? {} : { from }),
    })
  }

  private static readMove(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return fail("move requires a target")
    const to = this.readTarget(value["to"])
    if (to === null) return fail("move requires a destination")
    if (target === to) return fail("move target and destination must differ")

    const field = this.readMoveField(value["field"])
    if (field === null && value["field"] !== undefined) {
      return fail("move field must be COMPONENT or CAPABILITY")
    }

    const from = this.readOptionalTarget(value["from"])
    if (from === null && value["from"] !== undefined) {
      return fail("move from must be a non-empty string")
    }

    return ok({
      kind: "move",
      target,
      to,
      ...(field === null ? {} : { field }),
      ...(from === null ? {} : { from }),
    })
  }

  private static readChangeContract(
    value: Record<string, unknown>,
  ): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return fail("change-contract requires a target")

    const [fields, error] = this.readJsonFields(value["fields"])
    if (error !== null) return fail(error)
    if (fields === null) return fail("change-contract requires fields")

    return ok({ kind: "change-contract", target, fields })
  }

  private static readRecordDecision(
    value: Record<string, unknown>,
  ): Result<ProposalOperation, string> {
    const title = this.readText(value["title"])
    if (title === null) return fail("record-decision requires a title")
    const statement = this.readText(value["statement"])
    if (statement === null) return fail("record-decision requires a statement")

    const target = this.readOptionalTarget(value["target"])
    if (target === null && value["target"] !== undefined) {
      return fail("record-decision target must be a non-empty string")
    }
    const owner = this.readOptionalTarget(value["owner"])
    if (owner === null && value["owner"] !== undefined) {
      return fail("record-decision owner must be a non-empty string")
    }

    return ok({
      kind: "record-decision",
      title,
      statement,
      ...(target === null ? {} : { target }),
      ...(owner === null ? {} : { owner }),
    })
  }

  private static readRecordOpenQuestion(
    value: Record<string, unknown>,
  ): Result<ProposalOperation, string> {
    const question = this.readText(value["question"])
    if (question === null) return fail("record-open-question requires a question")

    const target = this.readOptionalTarget(value["target"])
    if (target === null && value["target"] !== undefined) {
      return fail("record-open-question target must be a non-empty string")
    }
    const owner = this.readOptionalTarget(value["owner"])
    if (owner === null && value["owner"] !== undefined) {
      return fail("record-open-question owner must be a non-empty string")
    }

    return ok({
      kind: "record-open-question",
      question,
      ...(target === null ? {} : { target }),
      ...(owner === null ? {} : { owner }),
    })
  }

  private static readAddRecord(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const recordKind = this.readTarget(value["recordKind"])
    if (recordKind === null) return fail("add-record requires a record kind")
    if (!RECORD_KINDS.has(recordKind)) {
      return fail(`add-record kind '${recordKind}' is not supported`)
    }

    const [record, error] = this.readNewFields(value["record"], "record")
    if (error !== null) return fail(error)
    if (record === null) return fail("add-record requires record fields")
    if ((record.TITLE ?? "").trim() === "") return fail("add-record requires a title")

    const acceptanceOf = this.readOptionalTarget(value["acceptanceOf"])
    if (acceptanceOf === null && value["acceptanceOf"] !== undefined) {
      return fail("add-record acceptanceOf must be a non-empty string")
    }

    return ok({
      kind: "add-record",
      recordKind,
      record,
      ...(acceptanceOf === null ? {} : { acceptanceOf }),
    })
  }

  private static readText(value: unknown): string | null {
    if (typeof value !== "string") return null
    const text = value.replace(/\s+/g, " ").trim()

    return text === "" ? null : text
  }

  private static readComponent(value: unknown): Result<ProposalComponentFields, string> {
    if (!this.isRecord(value)) return fail("component fields must be an object")

    const fields: ProposalRecordFields = {}
    for (const [field, candidate] of Object.entries(value)) {
      if (typeof candidate !== "string") {
        return fail(`component field ${field} must be a string`)
      }
      fields[field] = candidate
    }

    const uid = (fields.UID ?? "").trim()
    const title = (fields.TITLE ?? "").trim()
    if (title === "") return fail("component fields require TITLE")

    return ok({ ...fields, UID: uid, TITLE: title })
  }

  private static readJsonFields(value: unknown): Result<ProposalContractFields, string> {
    if (!this.isRecord(value)) return fail("fields must be an object")
    if (Object.keys(value).length === 0) return fail("fields must not be empty")

    return ok({ ...value })
  }

  private static readMoveField(value: unknown): ProposalMoveField | null {
    return value === "COMPONENT" || value === "CAPABILITY" ? value : null
  }

  private static readOptionalTarget(value: unknown): string | null {
    if (value === undefined) return null
    return this.readTarget(value)
  }

  private static readNewFields(
    value: unknown,
    label: string,
  ): Result<ProposalRecordFields, string> {
    if (!this.isRecord(value)) return fail(`${label} fields must be an object`)

    const fields: ProposalRecordFields = {}
    for (const [field, candidate] of Object.entries(value)) {
      if (typeof candidate !== "string") {
        return fail(`${label} field ${field} must be a string`)
      }
      fields[field] = candidate
    }

    return ok(fields)
  }

  private static readFields(value: unknown, label: string): Result<ProposalRecordFields, string> {
    if (!this.isRecord(value)) return fail(`${label} fields must be an object`)

    const fields: ProposalRecordFields = {}
    for (const [field, candidate] of Object.entries(value)) {
      if (typeof candidate !== "string") {
        return fail(`${label} field ${field} must be a string`)
      }
      fields[field] = candidate
    }

    if ((fields.UID ?? "").trim() === "") return fail(`${label} fields require UID`)

    return ok(fields)
  }

  private static readTargets(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null

    const targets = value
      .filter((candidate): candidate is string => typeof candidate === "string")
      .map((candidate) => candidate.trim())
      .filter(Boolean)

    if (targets.length < 2) return null
    if (new Set(targets).size !== targets.length) return null

    return targets
  }

  private static readTarget(value: unknown): string | null {
    if (typeof value !== "string") return null
    const target = value.trim()

    return target === "" ? null : target
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
