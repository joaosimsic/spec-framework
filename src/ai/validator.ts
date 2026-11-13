import { attempt, fail, ok, type Result } from "../core/result"
import type { AiAnswer, AiEvidence, AiValidationInput } from "./types"

export class AiOutputValidator {
  validate(text: string, input: AiValidationInput): Result<AiAnswer, string> {
    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) return fail(parseError ?? "AI output is not JSON")
    if (!this.isRecord(parsed)) return fail("AI output must be an object")
    const explanation =
      typeof parsed["explanation"] === "string"
        ? parsed["explanation"]
        : typeof parsed["responsibility"] === "string"
          ? parsed["responsibility"]
          : null
    if (explanation === null || explanation.trim() === "") {
      return fail("AI output must include an explanation")
    }
    if (
      typeof parsed["confidence"] !== "number" ||
      parsed["confidence"] < 0 ||
      parsed["confidence"] > 1
    ) {
      return fail("AI confidence must be between 0 and 1")
    }
    const elements = this.strings(parsed["elements"])
    const files = this.strings(parsed["files"])
    const evidence = this.evidence(parsed["evidence"])
    const known = new Map(input.elements.map((element) => [element.id, element]))
    const knownFiles = new Set(input.files)

    for (const id of elements)
      if (!known.has(id)) return fail(`AI referenced missing element ${id}`)
    for (const file of files)
      if (!knownFiles.has(file)) return fail(`AI referenced missing file ${file}`)
    for (const item of evidence) {
      const element = known.get(item.elementId)
      if (element === undefined)
        return fail(`AI evidence references missing element ${item.elementId}`)
      if (item.filePath !== element.filePath) return fail("AI evidence path does not match element")
      if (item.line < 1 || item.line > element.endLine)
        return fail("AI evidence line is out of range")
    }
    if (
      typeof parsed["confidence"] === "number" &&
      evidence.length === 0 &&
      elements.length === 0
    ) {
      return fail("AI output must reference at least one element or evidence item")
    }

    return ok({
      explanation,
      elements,
      files,
      evidence,
      evidenceClass: "ai_inferred",
      confidence: parsed["confidence"],
      validationStatus: "valid",
    })
  }

  private strings(value: unknown): string[] {
    if (value === undefined) return []
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return []

    return [...new Set(value)]
  }

  private evidence(value: unknown): AiEvidence[] {
    if (value === undefined) return []
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (!this.isRecord(item)) return []
      if (typeof item["elementId"] !== "string" || typeof item["filePath"] !== "string") return []
      if (typeof item["line"] !== "number" || !Number.isInteger(item["line"])) return []
      return [{ elementId: item["elementId"], filePath: item["filePath"], line: item["line"] }]
    })
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
