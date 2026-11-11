import { describe, expect, test } from "bun:test"
import { parseSdoc } from "../src/core/sdoc"
import { DisplayProjection, RequirementsGraphSource, SpecGraphBuilder } from "../src/model"
import type { GraphWorkspace, SpecGraph } from "../src/model/types"

const workspace: GraphWorkspace = {
  workspace: "single-repo",
  commit: "a1b2c3d",
  dirty: false,
}

const source = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Duplicate behavior
STATUS: Draft
COMPONENT: CMP-MISSING
ACCEPTANCE: AC-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test

[REQUIREMENT]
UID: REQ-SAMPLE-002
TITLE: Duplicate behavior
STATUS: Approved
PROVENANCE: human:test@2026-11-10
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
PROVENANCE: human:test@2026-11-10
OWNER: test

[UNKNOWN]
UID: UNK-SAMPLE-001
TITLE: What happens if the store is down?
STATUS: Draft
PROVENANCE: human:security@2026-11-10
OWNER: security
`

function buildGraph(): SpecGraph {
  const blocks = parseSdoc("core.sdoc", source)
  const builder = new SpecGraphBuilder()
  builder.add(new RequirementsGraphSource().collect(blocks))
  const [graph, error] = builder.build(workspace, { spec: "0.1.0" })
  expect(error).toBeNull()
  if (graph === null) throw new Error("graph build returned null")

  return graph
}

describe("DisplayProjection", () => {
  test("projects names, state, and relationships without ids", () => {
    const model = new DisplayProjection(buildGraph()).model
    const requirement = model.entries[1]

    expect(model.graphVersion).toBe(1)
    expect(model.commit).toBe("a1b2c3d")
    expect(model.entries).toHaveLength(4)
    expect(requirement).toMatchObject({
      label: "Duplicate behavior",
      kindLabel: "Requirement",
      state: "Draft - not reviewed",
    })
    expect(requirement?.relationships).toEqual([
      {
        label: "Acceptance criteria",
        items: [
          {
            ref: "ref_0",
            label: "Sample criterion",
            kindLabel: "Acceptance criterion",
          },
        ],
      },
    ])
    expect(model.entries.map((entry) => entry.ref)).toEqual([
      "ref_0",
      "ref_1",
      "ref_2",
      "ref_3",
    ])
    expect(model.entries[3]?.kindLabel).toBe("Open question")
    expect(model.entries[3]?.label).toBe("What happens if the store is down?")
  })

  test("translates blockers without leaking ids or diagnostic codes", () => {
    const model = new DisplayProjection(buildGraph()).model
    const requirement = model.entries[1]

    expect(requirement?.blockers).toEqual(["A related item is missing from the model."])
    expect(requirement?.blockers.join(" ")).not.toMatch(/\b(?:REQ|AC|CMP|GRAPH)-/)
    expect(requirement?.technical.diagnostics[0]?.code).toBe("GRAPH-UNRESOLVED-LINK")
    expect(requirement?.technical.diagnostics[0]?.message).toContain("CMP-MISSING")
  })

  test("names open questions linked to an element", () => {
    const graph: SpecGraph = {
      version: 1,
      workspace: "single-repo",
      commit: "a1b2c3d",
      dirty: false,
      elements: [
        { id: "REQ-SAMPLE-001", kind: "requirement", title: "Needs an answer", links: [] },
        {
          id: "UNK-SAMPLE-001",
          kind: "unknown",
          title: "What happens if the store is down?",
          links: [{ type: "question_for", to: "REQ-SAMPLE-001" }],
        },
      ],
      evidence: [],
      findings: [],
      tool_versions: {},
    }
    const model = new DisplayProjection(graph).model

    expect(model.entries[0]?.openQuestions).toEqual([
      {
        ref: "ref_1",
        label: "What happens if the store is down?",
        kindLabel: "Open question",
      },
    ])
  })

  test("resolves refs, technical ids, and unambiguous names", () => {
    const projection = new DisplayProjection(buildGraph())

    const byRef = projection.resolve("ref_1")
    const byId = projection.resolve("REQ-SAMPLE-001")
    const byName = projection.resolve("sample criterion")

    expect(byRef[1]).toBeNull()
    expect(byRef[0]?.label).toBe("Duplicate behavior")
    expect(byId[1]).toBeNull()
    expect(byId[0]?.technical.id).toBe("REQ-SAMPLE-001")
    expect(byName[1]).toBeNull()
    expect(byName[0]?.label).toBe("Sample criterion")
  })

  test("returns contextual choices for an ambiguous name", () => {
    const projection = new DisplayProjection(buildGraph())
    const [entry, error] = projection.resolve("duplicate behavior")

    expect(entry).toBeNull()
    expect(error?.code).toBe("DISPLAY-AMBIGUOUS")
    if (error?.code !== "DISPLAY-AMBIGUOUS") throw new Error("expected ambiguous result")
    expect(error.choices).toEqual([
      {
        ref: "ref_1",
        label: "Duplicate behavior",
        context: "Requirement - Draft - not reviewed - owned by test",
      },
      {
        ref: "ref_2",
        label: "Duplicate behavior",
        context: "Requirement - Approved - owned by test",
      },
    ])
    expect(error.choices.map((choice) => choice.context).join(" ")).not.toMatch(/\bREQ-/)
  })

  test("returns not found for an unknown handle", () => {
    const projection = new DisplayProjection(buildGraph())
    const [entry, error] = projection.resolve("missing item")

    expect(entry).toBeNull()
    expect(error?.code).toBe("DISPLAY-NOT-FOUND")
  })

  test("is deterministic for the same graph", () => {
    const first = new DisplayProjection(buildGraph()).model
    const second = new DisplayProjection(buildGraph()).model

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
