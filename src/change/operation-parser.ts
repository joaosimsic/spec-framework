import { attempt, type Result } from "../core/result"
import type { ProposalOperation, ProposalRecordFields } from "./types"

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

  private static readFields(
    value: unknown,
    label: string,
  ): Result<ProposalRecordFields, string> {
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
