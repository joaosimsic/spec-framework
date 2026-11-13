import { describe, expect, test } from "bun:test"
import { SecretRedactor } from "../src/ai/redaction"
import { AiOutputValidator } from "../src/ai/validator"
import type { AiValidationInput } from "../src/ai/types"
import type { SnapshotRecord } from "../src/persistence"

const snapshot: SnapshotRecord = {
  id: "SNAP-AI",
  projectId: "PROJ-AI",
  runId: "JOB-AI",
  commit: "abc123",
  dirty: false,
  analyzer: "typescript",
  analyzerVersion: "1",
  schemaVersion: 1,
  ruleVersion: "1",
  promptVersion: "1",
  modelVersion: "none",
  fingerprint: "fingerprint",
  nodeCount: 1,
  edgeCount: 0,
  flowCount: 0,
  findingCount: 0,
  mapping: null,
  coverage: {
    mapped: [],
    partial: [],
    unmapped: [],
    unassigned: [],
    stale: [],
    ambiguous: [],
    entry_points_without_sinks: [],
    behavior_without_implementation: [],
    external_systems: [],
  },
  createdAt: "2026-11-13T00:00:00.000Z",
}

const input: AiValidationInput = {
  snapshot,
  elements: [{ id: "SYM-src/a.ts#run", filePath: "src/a.ts", endLine: 20 }],
  files: ["src/a.ts"],
  answer: null,
}

describe("AI validation", () => {
  test("accepts a valid evidence-bound answer", () => {
    const answer = {
      explanation: "Run handles the request.",
      elements: ["SYM-src/a.ts#run"],
      files: ["src/a.ts"],
      evidence: [{ elementId: "SYM-src/a.ts#run", filePath: "src/a.ts", line: 4 }],
      confidence: 0.8,
    }
    const [validated, validationError] = new AiOutputValidator().validate(
      JSON.stringify(answer),
      input,
    )
    expect(validationError).toBeNull()
    expect(validated?.validationStatus).toBe("valid")
    expect(validated?.evidenceClass).toBe("ai_inferred")
  })

  test("rejects missing elements, files, and out-of-range lines", () => {
    const missingElement = new AiOutputValidator().validate(
      JSON.stringify({
        explanation: "x",
        elements: ["SYM-missing"],
        files: ["src/a.ts"],
        confidence: 0.5,
      }),
      input,
    )
    expect(missingElement[1]).toContain("missing element")

    const missingFile = new AiOutputValidator().validate(
      JSON.stringify({
        explanation: "x",
        elements: ["SYM-src/a.ts#run"],
        files: ["src/missing.ts"],
        confidence: 0.5,
      }),
      input,
    )
    expect(missingFile[1]).toContain("missing file")

    const invalidLine = new AiOutputValidator().validate(
      JSON.stringify({
        explanation: "x",
        elements: ["SYM-src/a.ts#run"],
        files: ["src/a.ts"],
        evidence: [{ elementId: "SYM-src/a.ts#run", filePath: "src/a.ts", line: 99 }],
        confidence: 0.5,
      }),
      input,
    )
    expect(invalidLine[1]).toContain("line")
  })

  test("accepts diagnosis output with valid component and source evidence", () => {
    const [findings, validationError] = new AiOutputValidator().validateDiagnosis(
      JSON.stringify({
        findings: [
          {
            ruleId: "ARC-005",
            title: "Multiple responsibilities",
            explanation: "The component serves unrelated request paths.",
            recommendation: "Split by request behavior.",
            affectedElements: ["CMP-test"],
            evidence: [{ elementId: "SYM-src/a.ts#run", filePath: "src/a.ts", line: 4 }],
            confidence: 0.7,
          },
        ],
      }),
      {
        elements: input.elements,
        files: input.files,
        conceptualIds: ["CMP-test"],
      },
    )
    expect(validationError).toBeNull()
    expect(findings?.[0]?.ruleId).toBe("ARC-005")
  })

  test("rejects unsupported diagnosis rules, missing references, and authority claims", () => {
    const validator = new AiOutputValidator()
    const diagnosis = (overrides: Record<string, unknown>) =>
      JSON.stringify({
        findings: [
          {
            ruleId: "ARC-005",
            title: "Multiple responsibilities",
            explanation: "The component serves unrelated request paths.",
            recommendation: "Split by request behavior.",
            affectedElements: ["CMP-test"],
            evidence: [{ elementId: "SYM-src/a.ts#run", filePath: "src/a.ts", line: 4 }],
            confidence: 0.7,
            ...overrides,
          },
        ],
      })
    const context = {
      elements: input.elements,
      files: input.files,
      conceptualIds: ["CMP-test"],
    }

    const rule = validator.validateDiagnosis(diagnosis({ ruleId: "ARC-001" }), context)
    expect(rule[1]).toContain("unsupported rule")

    const component = validator.validateDiagnosis(
      diagnosis({ affectedElements: ["CMP-missing"] }),
      context,
    )
    expect(component[1]).toContain("missing component")

    const file = validator.validateDiagnosis(
      diagnosis({
        evidence: [{ elementId: "SYM-src/a.ts#run", filePath: "src/missing.ts", line: 4 }],
      }),
      context,
    )
    expect(file[1]).toContain("missing file")

    const line = validator.validateDiagnosis(
      diagnosis({
        evidence: [{ elementId: "SYM-src/a.ts#run", filePath: "src/a.ts", line: 99 }],
      }),
      context,
    )
    expect(line[1]).toContain("out of range")

    const authority = validator.validateDiagnosis(
      diagnosis({ explanation: "This component is approved." }),
      context,
    )
    expect(authority[1]).toContain("claims authority")
  })

  test("validates derived interpretations and rejects authority claims", () => {
    const validator = new AiOutputValidator()
    const subject = {
      kind: "contract" as const,
      id: "CON-test",
      title: "CLI commands",
      prompt: "Observed CLI contract.",
    }
    const valid = validator.validateInterpretation(
      JSON.stringify({
        explanation: "The contract exposes one command.",
        evidence: [{ filePath: "src/a.ts", line: 4, reference: "CON-test" }],
        confidence: 0.6,
      }),
      { files: input.files, subject },
    )
    expect(valid[1]).toBeNull()
    expect(valid[0]?.targetId).toBe("CON-test")

    const missingFile = validator.validateInterpretation(
      JSON.stringify({
        explanation: "The contract exposes one command.",
        evidence: [{ filePath: "src/missing.ts", line: 4, reference: "CON-test" }],
        confidence: 0.6,
      }),
      { files: input.files, subject },
    )
    expect(missingFile[1]).toContain("missing file")

    const authority = validator.validateInterpretation(
      JSON.stringify({
        explanation: "This contract is approved.",
        evidence: [{ filePath: "src/a.ts", line: 4, reference: "CON-test" }],
        confidence: 0.6,
      }),
      { files: input.files, subject },
    )
    expect(authority[1]).toContain("claims authority")
  })

  test("redacts secrets and environment values", () => {
    const redacted = SecretRedactor.redact("api_key=super-secret-token\nsk-abcdefghijklmnop")
    expect(redacted).not.toContain("super-secret-token")
    expect(redacted).not.toContain("sk-abcdefghijklmnop")
    expect(SecretRedactor.redactFile(".env", "SECRET=value")).toBe("")
  })
})
