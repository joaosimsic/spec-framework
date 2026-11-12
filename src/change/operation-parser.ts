import { attempt, type Result } from "../core/result"
import type {
  ProposalComponentFields,
  ProposalContractFields,
  ProposalMoveField,
  ProposalOperation,
  ProposalRecordFields,
} from "./types"

export class ProposalOperationParser {
  static parseJson(text: string): Result<ProposalOperation[], string> {
    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) {
      return [null, parseError === null ? "empty operation document" : parseError]
    }

    return this.parseList(parsed)
  }

  static parseList(value: unknown): Result<ProposalOperation[], string> {
    const candidates = Array.isArray(value) ? value : [value]
    const operations: ProposalOperation[] = []

    for (const candidate of candidates) {
      const [operation, error] = this.parse(candidate)
      if (error !== null) return [null, error]
      if (operation === null) return [null, "operation failed"]
      operations.push(operation)
    }

    if (operations.length === 0) return [null, "no operations supplied"]

    return [operations, null]
  }

  static parse(value: unknown): Result<ProposalOperation, string> {
    if (!this.isRecord(value)) return [null, "operation must be an object"]
    if (typeof value["kind"] !== "string") return [null, "operation kind must be a string"]

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
      default:
        return [null, `unknown operation kind '${value["kind"]}'`]
    }
  }

  private static readRename(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return [null, "rename requires a target"]
    if (typeof value["title"] !== "string" || value["title"].trim() === "") {
      return [null, "rename requires a title"]
    }

    return [{ kind: "rename", target, title: value["title"].trim() }, null]
  }

  private static readDeprecate(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return [null, "deprecate requires a target"]

    return [{ kind: "deprecate", target }, null]
  }

  private static readReplace(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return [null, "replace requires a target"]

    const [replacement, error] = this.readFields(value["replacement"], "replacement")
    if (error !== null) return [null, error]
    if (replacement === null) return [null, "replace requires replacement fields"]

    return [{ kind: "replace", target, replacement }, null]
  }

  private static readSplit(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return [null, "split requires a target"]
    if (!Array.isArray(value["parts"]) || value["parts"].length === 0) {
      return [null, "split requires at least one part"]
    }

    const parts: ProposalRecordFields[] = []
    for (const candidate of value["parts"]) {
      const [fields, error] = this.readFields(candidate, "part")
      if (error !== null) return [null, error]
      if (fields === null) return [null, "split part failed"]
      parts.push(fields)
    }

    return [{ kind: "split", target, parts }, null]
  }

  private static readMerge(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const targets = this.readTargets(value["targets"])
    if (targets === null) return [null, "merge requires at least two unique targets"]

    const [result, error] = this.readFields(value["result"], "result")
    if (error !== null) return [null, error]
    if (result === null) return [null, "merge requires result fields"]

    return [{ kind: "merge", targets, result }, null]
  }

  private static readExtract(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return [null, "extract requires a target"]

    const [component, componentError] = this.readComponent(value["component"])
    if (componentError !== null) return [null, componentError]
    if (component === null) return [null, "extract requires component fields"]

    const parent = this.readOptionalTarget(value["parent"])
    if (parent === null && value["parent"] !== undefined) {
      return [null, "extract parent must be a non-empty string"]
    }

    const from = this.readOptionalTarget(value["from"])
    if (from === null && value["from"] !== undefined) {
      return [null, "extract from must be a non-empty string"]
    }

    return [
      {
        kind: "extract",
        target,
        component,
        ...(parent === null ? {} : { parent }),
        ...(from === null ? {} : { from }),
      },
      null,
    ]
  }

  private static readMove(value: Record<string, unknown>): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return [null, "move requires a target"]
    const to = this.readTarget(value["to"])
    if (to === null) return [null, "move requires a destination"]
    if (target === to) return [null, "move target and destination must differ"]

    const field = this.readMoveField(value["field"])
    if (field === null && value["field"] !== undefined) {
      return [null, "move field must be COMPONENT or CAPABILITY"]
    }

    const from = this.readOptionalTarget(value["from"])
    if (from === null && value["from"] !== undefined) {
      return [null, "move from must be a non-empty string"]
    }

    return [
      {
        kind: "move",
        target,
        to,
        ...(field === null ? {} : { field }),
        ...(from === null ? {} : { from }),
      },
      null,
    ]
  }

  private static readChangeContract(
    value: Record<string, unknown>,
  ): Result<ProposalOperation, string> {
    const target = this.readTarget(value["target"])
    if (target === null) return [null, "change-contract requires a target"]

    const [fields, error] = this.readJsonFields(value["fields"])
    if (error !== null) return [null, error]
    if (fields === null) return [null, "change-contract requires fields"]

    return [{ kind: "change-contract", target, fields }, null]
  }

  private static readRecordDecision(
    value: Record<string, unknown>,
  ): Result<ProposalOperation, string> {
    const title = this.readText(value["title"])
    if (title === null) return [null, "record-decision requires a title"]
    const statement = this.readText(value["statement"])
    if (statement === null) return [null, "record-decision requires a statement"]

    const target = this.readOptionalTarget(value["target"])
    if (target === null && value["target"] !== undefined) {
      return [null, "record-decision target must be a non-empty string"]
    }
    const owner = this.readOptionalTarget(value["owner"])
    if (owner === null && value["owner"] !== undefined) {
      return [null, "record-decision owner must be a non-empty string"]
    }

    return [
      {
        kind: "record-decision",
        title,
        statement,
        ...(target === null ? {} : { target }),
        ...(owner === null ? {} : { owner }),
      },
      null,
    ]
  }

  private static readRecordOpenQuestion(
    value: Record<string, unknown>,
  ): Result<ProposalOperation, string> {
    const question = this.readText(value["question"])
    if (question === null) return [null, "record-open-question requires a question"]

    const target = this.readOptionalTarget(value["target"])
    if (target === null && value["target"] !== undefined) {
      return [null, "record-open-question target must be a non-empty string"]
    }
    const owner = this.readOptionalTarget(value["owner"])
    if (owner === null && value["owner"] !== undefined) {
      return [null, "record-open-question owner must be a non-empty string"]
    }

    return [
      {
        kind: "record-open-question",
        question,
        ...(target === null ? {} : { target }),
        ...(owner === null ? {} : { owner }),
      },
      null,
    ]
  }

  private static readText(value: unknown): string | null {
    if (typeof value !== "string") return null
    const text = value.replace(/\s+/g, " ").trim()

    return text === "" ? null : text
  }

  private static readComponent(value: unknown): Result<ProposalComponentFields, string> {
    if (!this.isRecord(value)) return [null, "component fields must be an object"]

    const fields: ProposalRecordFields = {}
    for (const [field, candidate] of Object.entries(value)) {
      if (typeof candidate !== "string") {
        return [null, `component field ${field} must be a string`]
      }
      fields[field] = candidate
    }

    const uid = (fields.UID ?? "").trim()
    if (uid === "") return [null, "component fields require UID"]
    const title = (fields.TITLE ?? "").trim()
    if (title === "") return [null, "component fields require TITLE"]

    return [{ ...fields, UID: uid, TITLE: title }, null]
  }

  private static readJsonFields(value: unknown): Result<ProposalContractFields, string> {
    if (!this.isRecord(value)) return [null, "fields must be an object"]
    if (Object.keys(value).length === 0) return [null, "fields must not be empty"]

    return [{ ...value }, null]
  }

  private static readMoveField(value: unknown): ProposalMoveField | null {
    return value === "COMPONENT" || value === "CAPABILITY" ? value : null
  }

  private static readOptionalTarget(value: unknown): string | null {
    if (value === undefined) return null
    return this.readTarget(value)
  }

  private static readFields(value: unknown, label: string): Result<ProposalRecordFields, string> {
    if (!this.isRecord(value)) return [null, `${label} fields must be an object`]

    const fields: ProposalRecordFields = {}
    for (const [field, candidate] of Object.entries(value)) {
      if (typeof candidate !== "string") {
        return [null, `${label} field ${field} must be a string`]
      }
      fields[field] = candidate
    }

    if ((fields.UID ?? "").trim() === "") return [null, `${label} fields require UID`]

    return [fields, null]
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
