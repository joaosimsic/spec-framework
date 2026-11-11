import { describe, expect, test } from "bun:test"
import { elementContentHash } from "../src/approval/hash"
import { ApprovalScopeResolver } from "../src/approval/scope"
import type { SpecLock } from "../src/approval/types"
import { parseSdoc } from "../src/core/sdoc"
import type { SdocBlock } from "../src/core/types"

const sampleSource = `[DOCUMENT]
TITLE: Sample requirements

[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Proposed
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Proposed
STATEMENT: Given a request, the component returns a result.
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test
`

function sampleBlocks(): SdocBlock[] {
  return parseSdoc("sample.sdoc", sampleSource)
}

function sampleLock(blocks: SdocBlock[], ids: string[]): SpecLock {
  const elements: SpecLock["elements"] = {}

  for (const block of blocks) {
    const id = block.fields.UID
    if (id === undefined || !ids.includes(id)) continue
    elements[id] = { content_hash: elementContentHash(block), evidence: [] }
  }

  return {
    version: 1,
    approved_at: "2026-11-11T12:00:00.000Z",
    approver: "tester",
    dirty: false,
    elements,
    evidence: {},
  }
}

describe("ApprovalScopeResolver", () => {
  test("resolves a requirement title and includes its acceptance criteria", () => {
    const [resolution, failure] = new ApprovalScopeResolver(sampleBlocks(), null).resolve([
      "Sample behavior",
    ])

    expect(failure).toBeNull()
    expect(resolution?.ids).toEqual(["REQ-SAMPLE-001", "AC-SAMPLE-001"])
    expect(resolution?.labels).toEqual({
      "REQ-SAMPLE-001": "Sample behavior",
      "AC-SAMPLE-001": "Sample criterion",
    })
    expect(resolution?.selections[1]?.reason).toBe("acceptance")
  })

  test("resolves case-insensitively and collapses whitespace", () => {
    const [resolution, failure] = new ApprovalScopeResolver(sampleBlocks(), null).resolve([
      "  sample   behavior ",
    ])

    expect(failure).toBeNull()
    expect(resolution?.ids).toEqual(["REQ-SAMPLE-001", "AC-SAMPLE-001"])
  })

  test("accepts an exact element ID", () => {
    const [resolution, failure] = new ApprovalScopeResolver(sampleBlocks(), null).resolve([
      "REQ-SAMPLE-001",
    ])

    expect(failure).toBeNull()
    expect(resolution?.ids).toEqual(["REQ-SAMPLE-001", "AC-SAMPLE-001"])
  })

  test("resolves an acceptance criterion without its requirement", () => {
    const [resolution, failure] = new ApprovalScopeResolver(sampleBlocks(), null).resolve([
      "Sample criterion",
    ])

    expect(failure).toBeNull()
    expect(resolution?.ids).toEqual(["AC-SAMPLE-001"])
  })

  test("deduplicates repeated scopes", () => {
    const [resolution, failure] = new ApprovalScopeResolver(sampleBlocks(), null).resolve([
      "Sample behavior",
      "REQ-SAMPLE-001",
    ])

    expect(failure).toBeNull()
    expect(resolution?.ids).toEqual(["REQ-SAMPLE-001", "AC-SAMPLE-001"])
  })

  test("skips an acceptance criterion that is already approved and locked", () => {
    const blocks = sampleBlocks().map((block) =>
      block.fields.UID === "AC-SAMPLE-001"
        ? { ...block, fields: { ...block.fields, STATUS: "Approved" } }
        : block,
    )
    const lock = sampleLock(blocks, ["AC-SAMPLE-001"])
    const [resolution, failure] = new ApprovalScopeResolver(blocks, lock).resolve([
      "Sample behavior",
    ])

    expect(failure).toBeNull()
    expect(resolution?.ids).toEqual(["REQ-SAMPLE-001"])
  })

  test("keeps an approved acceptance criterion that is not locked", () => {
    const blocks = sampleBlocks().map((block) =>
      block.fields.UID === "AC-SAMPLE-001"
        ? { ...block, fields: { ...block.fields, STATUS: "Approved" } }
        : block,
    )

    const [resolution, failure] = new ApprovalScopeResolver(blocks, null).resolve([
      "Sample behavior",
    ])

    expect(failure).toBeNull()
    expect(resolution?.ids).toEqual(["REQ-SAMPLE-001", "AC-SAMPLE-001"])
  })

  test("reports an unknown scope", () => {
    const [resolution, failure] = new ApprovalScopeResolver(sampleBlocks(), null).resolve([
      "Missing behavior",
    ])

    expect(resolution).toBeNull()
    expect(failure?.code).toBe("SCOPE-NOT-FOUND")
  })

  test("reports an element that is not approvable", () => {
    const blocks = [
      ...sampleBlocks(),
      {
        file: "sample.sdoc",
        line: 1,
        kind: "SYSTEM",
        fields: { UID: "SYS-SAMPLE", TITLE: "Sample system" },
      },
    ]
    const [resolution, failure] = new ApprovalScopeResolver(blocks, null).resolve(["SYS-SAMPLE"])

    expect(resolution).toBeNull()
    expect(failure?.code).toBe("SCOPE-NOT-APPROVABLE")
  })

  test("reports ambiguous titles with contextual choices", () => {
    const blocks = [
      {
        file: "sample.sdoc",
        line: 1,
        kind: "REQUIREMENT",
        fields: {
          UID: "REQ-SAMPLE-001",
          TITLE: "Shared behavior",
          STATUS: "Proposed",
          OWNER: "alpha",
        },
      },
      {
        file: "sample.sdoc",
        line: 9,
        kind: "REQUIREMENT",
        fields: {
          UID: "REQ-SAMPLE-002",
          TITLE: "Shared behavior",
          STATUS: "Proposed",
          OWNER: "beta",
        },
      },
    ]
    const [resolution, failure] = new ApprovalScopeResolver(blocks, null).resolve([
      "Shared behavior",
    ])

    expect(resolution).toBeNull()
    expect(failure?.code).toBe("SCOPE-AMBIGUOUS")
    if (failure?.code !== "SCOPE-AMBIGUOUS") return
    expect(failure.choices).toHaveLength(2)
    expect(failure.choices[0]?.context).toContain("owned by alpha")
    expect(failure.choices[1]?.context).toContain("owned by beta")
  })
})
