import { attempt, fail, ok, type Result } from "../core/result"
import {
  AI_DIAGNOSIS_RULES,
  type AiAnswer,
  type AiDiagnosisFinding,
  type AiDiagnosisValidationInput,
  type AiEvidence,
  type AiInterpretation,
  type AiInterpretationValidationInput,
  type AiValidationInput,
} from "./types"

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

  validateDiagnosis(
    text: string,
    input: AiDiagnosisValidationInput,
  ): Result<AiDiagnosisFinding[], string> {
    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) return fail(parseError ?? "AI output is not JSON")
    if (!this.isRecord(parsed)) return fail("AI diagnosis must be an object")
    if (Object.keys(parsed).some((key) => key !== "findings")) {
      return fail("AI diagnosis contains unsupported fields")
    }
    const values = parsed["findings"]
    if (!Array.isArray(values)) return fail("AI diagnosis must include findings")
    if (values.length > 4) return fail("AI diagnosis returned too many findings")
    const conceptualIds = new Set(input.conceptualIds)
    const known = new Map(input.elements.map((element) => [element.id, element]))
    const knownFiles = new Set(input.files)
    const findings: AiDiagnosisFinding[] = []
    for (const [index, value] of values.entries()) {
      if (!this.isRecord(value)) return fail(`AI diagnosis finding ${index} must be an object`)
      const allowed = new Set([
        "ruleId",
        "title",
        "explanation",
        "recommendation",
        "affectedElements",
        "evidence",
        "confidence",
      ])
      if (Object.keys(value).some((key) => !allowed.has(key))) {
        return fail(`AI diagnosis finding ${index} contains unsupported fields`)
      }
      const ruleId = value["ruleId"]
      if (
        typeof ruleId !== "string" ||
        !(AI_DIAGNOSIS_RULES as readonly string[]).includes(ruleId)
      ) {
        return fail(`AI diagnosis finding ${index} has unsupported rule`)
      }
      const [title, titleError] = this.text(value["title"], index, "title")
      if (titleError !== null) return fail(titleError)
      const [explanation, explanationError] = this.text(value["explanation"], index, "explanation")
      if (explanationError !== null) return fail(explanationError)
      const [recommendation, recommendationError] = this.text(
        value["recommendation"],
        index,
        "recommendation",
      )
      if (recommendationError !== null) return fail(recommendationError)
      if (
        /\b(approved|rejected|approval|sign[ -]?off)\b/i.test(
          `${title} ${explanation} ${recommendation}`,
        )
      ) {
        return fail(`AI diagnosis finding ${index} claims authority`)
      }
      const rawAffected = value["affectedElements"]
      if (
        !Array.isArray(rawAffected) ||
        rawAffected.length === 0 ||
        !rawAffected.every((id) => typeof id === "string")
      ) {
        return fail(`AI diagnosis finding ${index} has invalid affected elements`)
      }
      const affected = [...new Set(rawAffected)]
      for (const id of affected) {
        if (!conceptualIds.has(id)) {
          return fail(`AI diagnosis finding ${index} references missing component ${id}`)
        }
      }
      const rawEvidence = value["evidence"]
      if (!Array.isArray(rawEvidence) || rawEvidence.length === 0) {
        return fail(`AI diagnosis finding ${index} has no evidence`)
      }
      const evidence: AiEvidence[] = []
      for (const item of rawEvidence) {
        if (!this.isRecord(item)) return fail(`AI diagnosis finding ${index} evidence is invalid`)
        if (Object.keys(item).some((key) => !["elementId", "filePath", "line"].includes(key))) {
          return fail(`AI diagnosis finding ${index} evidence contains unsupported fields`)
        }
        const elementId = item["elementId"]
        const filePath = item["filePath"]
        const line = item["line"]
        if (typeof elementId !== "string") {
          return fail(`AI diagnosis finding ${index} evidence must reference an element`)
        }
        if (typeof filePath !== "string" || !knownFiles.has(filePath)) {
          return fail(`AI diagnosis finding ${index} evidence references missing file ${filePath}`)
        }
        if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
          return fail(`AI diagnosis finding ${index} evidence line is invalid`)
        }
        const element = known.get(elementId)
        if (element === undefined) {
          return fail(
            `AI diagnosis finding ${index} evidence references missing element ${elementId}`,
          )
        }
        if (filePath !== element.filePath) {
          return fail(`AI diagnosis finding ${index} evidence path does not match element`)
        }
        if (line > element.endLine) {
          return fail(`AI diagnosis finding ${index} evidence line is out of range`)
        }
        evidence.push({ elementId, filePath, line })
      }
      const confidence = value["confidence"]
      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
        return fail(`AI diagnosis finding ${index} confidence is invalid`)
      }
      findings.push({
        ruleId: ruleId as AiDiagnosisFinding["ruleId"],
        title,
        explanation,
        recommendation,
        affectedElements: affected,
        evidence,
        confidence,
      })
    }

    return ok(findings)
  }

  validateInterpretation(
    text: string,
    input: AiInterpretationValidationInput,
  ): Result<AiInterpretation, string> {
    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) return fail(parseError ?? "AI output is not JSON")
    if (!this.isRecord(parsed)) return fail("AI interpretation must be an object")
    const allowed = new Set(["explanation", "evidence", "confidence"])
    if (Object.keys(parsed).some((key) => !allowed.has(key))) {
      return fail("AI interpretation contains unsupported fields")
    }
    const [explanation, explanationError] = this.text(parsed["explanation"], 0, "explanation")
    if (explanationError !== null) return fail(explanationError)
    if (/\b(approved|rejected|approval|sign[ -]?off)\b/i.test(explanation)) {
      return fail("AI interpretation claims authority")
    }
    const confidence = parsed["confidence"]
    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      return fail("AI interpretation confidence is invalid")
    }
    const values = parsed["evidence"]
    if (!Array.isArray(values) || values.length === 0) {
      return fail("AI interpretation has no evidence")
    }
    const knownFiles = new Set(input.files)
    const evidence = []
    for (const value of values) {
      if (!this.isRecord(value)) return fail("AI interpretation evidence is invalid")
      if (Object.keys(value).some((key) => !["filePath", "line", "reference"].includes(key))) {
        return fail("AI interpretation evidence contains unsupported fields")
      }
      const filePath = value["filePath"]
      const line = value["line"]
      const reference = value["reference"]
      if (typeof filePath !== "string" || !knownFiles.has(filePath)) {
        return fail(`AI interpretation references missing file ${filePath}`)
      }
      if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
        return fail("AI interpretation evidence line is invalid")
      }
      if (typeof reference !== "string" || reference.trim() === "") {
        return fail("AI interpretation evidence has no reference")
      }
      evidence.push({ filePath, line, reference })
    }

    return ok({
      kind: input.subject.kind,
      targetId: input.subject.id,
      title: input.subject.title,
      text: explanation,
      evidence,
      confidence,
    })
  }

  private text(value: unknown, index: number, field: string): Result<string, string> {
    if (typeof value !== "string" || value.trim() === "") {
      return fail(`AI diagnosis finding ${index} has no ${field}`)
    }

    return ok(value.trim())
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
