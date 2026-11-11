import { describe, expect, test } from "bun:test"
import { lintBlocks } from "../src/core/lint"
import { parseSdoc, requirementBlocks } from "../src/core/sdoc"

const valid = `[DOCUMENT]
TITLE: Sample

[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
STATEMENT: Given a request, the component returns a result.
FORMAL: PROP-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test
`

function lint(text: string) {
  return lintBlocks(requirementBlocks(parseSdoc("sample.sdoc", text)))
}

describe("lintBlocks", () => {
  test("accepts a valid requirement", () => {
    const result = lint(valid)
    expect(result.errors).toBe(0)
  })

  test("rejects missing fields", () => {
    const result = lint(valid.replace("OWNER: test\n", ""))
    expect(result.diagnostics.some((item) => item.code === "SDOC-MISSING-FIELD")).toBe(true)
  })

  test("rejects non-EARS statements", () => {
    const result = lint(
      valid.replace("The sample component shall return a result.", "Return a result."),
    )
    expect(result.diagnostics.some((item) => item.code === "SDOC-BAD-EARS")).toBe(true)
  })

  test("rejects ambiguous terms", () => {
    const result = lint(valid.replace("shall return a result.", "shall return a result quickly."))
    expect(result.diagnostics.some((item) => item.code === "SDOC-AMBIGUOUS")).toBe(true)
  })

  test("rejects duplicate ids", () => {
    const result = lint(
      valid.replace("AC-SAMPLE-001\nTITLE: Sample criterion", "REQ-SAMPLE-001\nTITLE: Duplicate"),
    )
    expect(result.diagnostics.some((item) => item.code === "SDOC-DUPLICATE-ID")).toBe(true)
  })

  test("requires a waiver when formalization is none", () => {
    const result = lint(valid.replace("FORMAL: PROP-SAMPLE-001", "FORMAL: none"))
    expect(result.diagnostics.some((item) => item.code === "SDOC-MISSING-WAIVER")).toBe(true)
  })

  test("requires the acceptance criterion to exist", () => {
    const withoutAc = valid.split("[REQUIREMENT]\nUID: AC-SAMPLE-001")[0]
    const result = lint(withoutAc)
    expect(result.diagnostics.some((item) => item.code === "SDOC-MISSING-AC")).toBe(true)
  })
})
