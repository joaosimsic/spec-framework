import { attempt, type Result } from "../core/result"
import type { CurationAction, CurationDecision } from "./curation-types"

export class CurationParser {
  static parseJson(text: string): Result<CurationAction[], string> {
    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) {
      return [null, parseError === null ? "empty action document" : parseError]
    }

    return this.parseList(parsed)
  }

  static parseList(value: unknown): Result<CurationAction[], string> {
    const candidates = Array.isArray(value) ? value : [value]
    const actions: CurationAction[] = []

    for (const candidate of candidates) {
      const [action, error] = this.parse(candidate)
      if (error !== null) return [null, error]
      if (action === null) return [null, "action failed"]
      actions.push(action)
    }

    if (actions.length === 0) return [null, "no actions supplied"]

    return [actions, null]
  }

  static parseDecisions(value: unknown): Result<CurationDecision[], string> {
    if (!Array.isArray(value)) return [null, "decisions must be an array"]

    const decisions: CurationDecision[] = []
    for (const candidate of value) {
      if (!this.isRecord(candidate)) return [null, "decision must be an object"]
      if (typeof candidate["at"] !== "string") return [null, "decision at must be a string"]

      const [action, error] = this.parse(candidate["action"])
      if (error !== null) return [null, error]
      if (action === null) return [null, "decision action failed"]
      decisions.push({ action, at: candidate["at"] })
    }

    return [decisions, null]
  }

  static parse(value: unknown): Result<CurationAction, string> {
    if (!this.isRecord(value)) return [null, "action must be an object"]
    if (typeof value["kind"] !== "string") return [null, "action kind must be a string"]

    switch (value["kind"]) {
      case "accept":
        return this.readTargetAction(value, "accept")
      case "reject":
        return this.readTargetAction(value, "reject")
      case "rename":
        return this.readRename(value)
      case "merge":
        return this.readMerge(value)
      case "split":
        return this.readSplit(value)
      case "set-owner":
        return this.readMetadata(value, "set-owner", "owner")
      case "set-responsibility":
        return this.readMetadata(value, "set-responsibility", "responsibility")
      case "set-boundary":
        return this.readMetadata(value, "set-boundary", "boundary")
      case "open-question":
        return this.readOpenQuestion(value)
      default:
        return [null, `unknown action kind '${value["kind"]}'`]
    }
  }

  private static readTargetAction(
    value: Record<string, unknown>,
    kind: "accept" | "reject",
  ): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return [null, `${kind} requires a target`]

    return [{ kind, target }, null]
  }

  private static readRename(value: Record<string, unknown>): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return [null, "rename requires a target"]
    const title = this.readText(value["title"])
    if (title === null) return [null, "rename requires a title"]

    return [{ kind: "rename", target, title }, null]
  }

  private static readMerge(value: Record<string, unknown>): Result<CurationAction, string> {
    const targets = this.readTargets(value["targets"])
    if (targets === null) return [null, "merge requires at least two unique targets"]
    const title = this.readText(value["title"])
    if (title === null) return [null, "merge requires a title"]

    return [{ kind: "merge", targets, title }, null]
  }

  private static readSplit(value: Record<string, unknown>): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return [null, "split requires a target"]
    const parts = this.readTargets(value["parts"])
    if (parts === null) return [null, "split requires at least two unique parts"]

    return [{ kind: "split", target, parts }, null]
  }

  private static readMetadata(
    value: Record<string, unknown>,
    kind: "set-owner" | "set-responsibility" | "set-boundary",
    field: "owner" | "responsibility" | "boundary",
  ): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return [null, `${kind} requires a target`]
    const text = this.readText(value[field])
    if (text === null) return [null, `${kind} requires ${field}`]

    return [{ kind, target, [field]: text } as CurationAction, null]
  }

  private static readOpenQuestion(value: Record<string, unknown>): Result<CurationAction, string> {
    const question = this.readText(value["question"])
    if (question === null) return [null, "open-question requires a question"]
    const target = this.readText(value["target"])
    if (target === null && value["target"] !== undefined) {
      return [null, "open-question target must be a non-empty string"]
    }
    if (value["blocking"] !== undefined && typeof value["blocking"] !== "boolean") {
      return [null, "open-question blocking must be a boolean"]
    }

    return [
      {
        kind: "open-question",
        question,
        ...(target === null ? {} : { target }),
        ...(value["blocking"] === undefined ? {} : { blocking: value["blocking"] }),
      },
      null,
    ]
  }

  private static readTargets(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null

    const targets = value.map((candidate) => this.readText(candidate))
    if (targets.some((target) => target === null)) return null
    const unique = new Set(targets as string[])
    if (unique.size !== targets.length || unique.size < 2) return null

    return [...unique]
  }

  private static readText(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()

    return trimmed === "" ? null : trimmed
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
