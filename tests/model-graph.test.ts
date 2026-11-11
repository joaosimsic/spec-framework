import { describe, expect, test } from "bun:test"
import { parseSdoc } from "../src/core/sdoc"
import { RequirementsGraphSource, SpecGraphBuilder } from "../src/model"
import type { GraphWorkspace, SpecGraph } from "../src/model/types"

const workspace: GraphWorkspace = {
  workspace: "single-repo",
  commit: "a1b2c3d",
  dirty: false,
}

const requirementSource = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
CAPABILITY: CAP-SAMPLE
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
CONTRACTS: CON-SAMPLE-001
VERIFICATION: VER-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
WAIVER: WVR-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
STATEMENT: Given a request, the component returns a result.
FORMAL: none
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test
`

function buildGraph(text: string): SpecGraph {
  const blocks = parseSdoc("core.sdoc", text)
  const builder = new SpecGraphBuilder()
  builder.add(new RequirementsGraphSource().collect(blocks))
  const [graph, error] = builder.build(workspace, { spec: "0.1.0" })
  expect(error).toBeNull()
  if (graph === null) throw new Error("graph build returned null")

  return graph
}

describe("SpecGraphBuilder", () => {
  test("maps requirement records to deterministic graph elements and links", () => {
    const graph = buildGraph(requirementSource)
    const requirement = graph.elements.find((element) => element.id === "REQ-SAMPLE-001")
    const criterion = graph.elements.find((element) => element.id === "AC-SAMPLE-001")

    expect(graph.version).toBe(1)
    expect(graph.workspace).toBe("single-repo")
    expect(graph.commit).toBe("a1b2c3d")
    expect(graph.dirty).toBe(false)
    expect(graph.tool_versions).toEqual({ spec: "0.1.0" })
    expect(graph.elements.map((element) => element.id)).toEqual(["AC-SAMPLE-001", "REQ-SAMPLE-001"])
    expect(requirement).toMatchObject({
      id: "REQ-SAMPLE-001",
      kind: "requirement",
      title: "Sample behavior",
      status: "draft",
      owner: "test",
      provenance: "human:test@2026-11-10",
    })
    expect(requirement?.links).toEqual([
      { type: "acceptance", to: "AC-SAMPLE-001" },
      { type: "component", to: "CMP-SAMPLE" },
      { type: "contract", to: "CON-SAMPLE-001" },
      { type: "derives_from", to: "CAP-SAMPLE" },
      { type: "evidence", to: "EVD-SAMPLE-001" },
      { type: "formalization", to: "PROP-SAMPLE-001" },
      { type: "verification", to: "VER-SAMPLE-001" },
      { type: "waiver", to: "WVR-SAMPLE-001" },
    ])
    expect(criterion?.kind).toBe("acceptance_criterion")
    expect(criterion?.links).toEqual([{ type: "evidence", to: "EVD-SAMPLE-001" }])
  })

  test("is deterministic for the same contribution", () => {
    const first = buildGraph(requirementSource)
    const second = buildGraph(requirementSource)

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  test("rejects duplicate element IDs", () => {
    const blocks = parseSdoc(
      "core.sdoc",
      `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: First

[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Second
`,
    )
    const builder = new SpecGraphBuilder()
    builder.add(new RequirementsGraphSource().collect(blocks))
    const [graph, error] = builder.build(workspace)

    expect(graph).toBeNull()
    expect(error?.code).toBe("GRAPH-DUPLICATE-ID")
  })

  test("reports unresolved links without inventing elements", () => {
    const graph = buildGraph(`[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Unresolved sample
CAPABILITY: infrastructure
COMPONENT: CMP-MISSING
`)

    expect(graph.elements).toHaveLength(1)
    expect(graph.findings).toEqual([
      {
        level: "warning",
        code: "GRAPH-UNRESOLVED-LINK",
        message: "REQ-SAMPLE-001 component link does not resolve: CMP-MISSING",
        id: "REQ-SAMPLE-001",
      },
    ])
  })

  test("omits fields that are absent from the source", () => {
    const graph = buildGraph(`[REQUIREMENT]
UID: REQ-SAMPLE-001
`)
    const requirement = graph.elements[0]

    expect(requirement?.kind).toBe("requirement")
    expect(requirement?.links).toEqual([])
    expect(requirement).not.toHaveProperty("title")
    expect(requirement).not.toHaveProperty("status")
    expect(requirement).not.toHaveProperty("owner")
    expect(requirement).not.toHaveProperty("provenance")
  })

  test("maps replaces fields to replacement links", () => {
    const graph = buildGraph(`[REQUIREMENT]
UID: REQ-SAMPLE-002
TITLE: Replacement
REPLACES: REQ-SAMPLE-001
`)

    expect(graph.elements[0]?.links).toEqual([{ type: "replaces", to: "REQ-SAMPLE-001" }])
  })
})
