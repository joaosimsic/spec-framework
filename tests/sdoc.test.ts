import { describe, expect, test } from "bun:test"
import { parseSdoc, requirementBlocks } from "../src/core/sdoc"

const sample = `[DOCUMENT]
TITLE: Sample

[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
STATEMENT: Given a request, the component returns a result.
PROVENANCE: human:test@2026-11-10
OWNER: test
`

describe("parseSdoc", () => {
  test("parses blocks and fields", () => {
    const blocks = parseSdoc("sample.sdoc", sample)
    expect(blocks).toHaveLength(3)
    const requirements = requirementBlocks(blocks)
    expect(requirements).toHaveLength(2)
    expect(requirements[0].fields.UID).toBe("REQ-SAMPLE-001")
    expect(requirements[1].fields.UID).toBe("AC-SAMPLE-001")
  })

  test("supports indented continuation lines", () => {
    const blocks = parseSdoc(
      "sample.sdoc",
      `[REQUIREMENT]\nUID: REQ-X-001\nSTATEMENT: The system shall do\n  a thing.\n`,
    )
    expect(blocks[0].fields.STATEMENT).toBe("The system shall do a thing.")
  })
})
