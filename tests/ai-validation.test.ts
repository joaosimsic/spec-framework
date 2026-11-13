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
  coverage: { mapped: [], partial: [], unmapped: [], unassigned: [], stale: [] },
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

  test("redacts secrets and environment values", () => {
    const redacted = SecretRedactor.redact("api_key=super-secret-token\nsk-abcdefghijklmnop")
    expect(redacted).not.toContain("super-secret-token")
    expect(redacted).not.toContain("sk-abcdefghijklmnop")
    expect(SecretRedactor.redactFile(".env", "SECRET=value")).toBe("")
  })
})
