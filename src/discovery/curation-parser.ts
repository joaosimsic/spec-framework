import { attempt, type Result, ok, fail } from "../core/result"
import type { CurationAction, CurationDecision } from "./curation-types"

export class CurationParser {
  static parseJson(text: string): Result<CurationAction[], string> {
    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) {
      return fail(parseError === null ? "empty action document" : parseError)
    }

    return this.parseList(parsed)
  }

  static parseList(value: unknown): Result<CurationAction[], string> {
    const candidates = Array.isArray(value) ? value : [value]
    const actions: CurationAction[] = []

    for (const candidate of candidates) {
      const [action, error] = this.parse(candidate)
      if (error !== null) return fail(error)
      if (action === null) return fail("action failed")
      actions.push(action)
    }

    if (actions.length === 0) return fail("no actions supplied")

    return ok(actions)
  }

  static parseDecisions(value: unknown): Result<CurationDecision[], string> {
    if (!Array.isArray(value)) return fail("decisions must be an array")

    const decisions: CurationDecision[] = []
    for (const candidate of value) {
      if (!this.isRecord(candidate)) return fail("decision must be an object")
      if (typeof candidate["at"] !== "string") return fail("decision at must be a string")

      const [action, error] = this.parse(candidate["action"])
      if (error !== null) return fail(error)
      if (action === null) return fail("decision action failed")
      decisions.push({ action, at: candidate["at"] })
    }

    return ok(decisions)
  }

  static parse(value: unknown): Result<CurationAction, string> {
    if (!this.isRecord(value)) return fail("action must be an object")
    if (typeof value["kind"] !== "string") return fail("action kind must be a string")

    switch (value["kind"]) {
      case "accept":
        return this.readTargetAction(value, "accept")
      case "reject":
        return this.readTargetAction(value, "reject")
      case "accept-relation":
        return this.readRelationAction(value, "accept-relation")
      case "reject-relation":
        return this.readRelationAction(value, "reject-relation")
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
        return fail(`unknown action kind '${value["kind"]}'`)
    }
  }

  private static readTargetAction(
    value: Record<string, unknown>,
    kind: "accept" | "reject",
  ): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return fail(`${kind} requires a target`)

    return ok({ kind, target })
  }

  private static readRelationAction(
    value: Record<string, unknown>,
    kind: "accept-relation" | "reject-relation",
  ): Result<CurationAction, string> {
    const source = this.readText(value["source"])
    if (source === null) return fail(`${kind} requires a source`)
    const target = this.readText(value["target"])
    if (target === null) return fail(`${kind} requires a target`)

    let type: string | undefined
    if (value["type"] !== undefined) {
      const parsed = this.readText(value["type"])
      if (parsed === null) return fail(`${kind} type must be a non-empty string`)
      type = parsed
    }

    return ok({ kind, source, target, ...(type === undefined ? {} : { type }) })
  }

  private static readRename(value: Record<string, unknown>): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return fail("rename requires a target")
    const title = this.readText(value["title"])
    if (title === null) return fail("rename requires a title")

    return ok({ kind: "rename", target, title })
  }

  private static readMerge(value: Record<string, unknown>): Result<CurationAction, string> {
    const targets = this.readTargets(value["targets"])
    if (targets === null) return fail("merge requires at least two unique targets")
    const title = this.readText(value["title"])
    if (title === null) return fail("merge requires a title")

    return ok({ kind: "merge", targets, title })
  }

  private static readSplit(value: Record<string, unknown>): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return fail("split requires a target")
    const parts = this.readTargets(value["parts"])
    if (parts === null) return fail("split requires at least two unique parts")

    return ok({ kind: "split", target, parts })
  }

  private static readMetadata(
    value: Record<string, unknown>,
    kind: "set-owner" | "set-responsibility" | "set-boundary",
    field: "owner" | "responsibility" | "boundary",
  ): Result<CurationAction, string> {
    const target = this.readText(value["target"])
    if (target === null) return fail(`${kind} requires a target`)
    const text = this.readText(value[field])
    if (text === null) return fail(`${kind} requires ${field}`)

    return ok({ kind, target, [field]: text } as CurationAction)
  }

  private static readOpenQuestion(value: Record<string, unknown>): Result<CurationAction, string> {
    const question = this.readText(value["question"])
    if (question === null) return fail("open-question requires a question")
    const target = this.readText(value["target"])
    if (target === null && value["target"] !== undefined) {
      return fail("open-question target must be a non-empty string")
    }
    if (value["blocking"] !== undefined && typeof value["blocking"] !== "boolean") {
      return fail("open-question blocking must be a boolean")
    }

    return ok({
      kind: "open-question",
      question,
      ...(target === null ? {} : { target }),
      ...(value["blocking"] === undefined ? {} : { blocking: value["blocking"] }),
    })
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
