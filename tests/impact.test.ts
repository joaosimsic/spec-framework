import { describe, expect, test } from "bun:test"
import { ImpactAnalyzer } from "../src/model"
import type { GraphElement, SpecGraph } from "../src/model/types"

function graph(elements: GraphElement[]): SpecGraph {
  return {
    version: 1,
    workspace: "single-repo",
    commit: "a1b2c3d",
    dirty: false,
    elements,
    evidence: [],
    findings: [],
    tool_versions: {},
  }
}

const sampleGraph = graph([
  {
    id: "REQ-SAMPLE-001",
    kind: "requirement",
    title: "Sample behavior",
    links: [
      { type: "derives_from", to: "CAP-SAMPLE" },
      { type: "acceptance", to: "AC-SAMPLE-001" },
      { type: "evidence", to: "EVD-SAMPLE-001" },
    ],
  },
  {
    id: "AC-SAMPLE-001",
    kind: "acceptance_criterion",
    title: "Sample criterion",
    links: [{ type: "evidence", to: "EVD-SAMPLE-001" }],
  },
  { id: "CAP-SAMPLE", kind: "capability", title: "Sample capability", links: [] },
  { id: "EVD-SAMPLE-001", kind: "evidence", links: [] },
  {
    id: "VOBJ-SAMPLE",
    kind: "verification_objective",
    title: "Verify sample",
    links: [{ type: "verification", to: "REQ-SAMPLE-001" }],
  },
  {
    id: "VER-SAMPLE-002",
    kind: "verification_case",
    title: "Run sample check",
    links: [{ type: "verification", to: "VOBJ-SAMPLE" }],
  },
  {
    id: "UNK-SAMPLE-001",
    kind: "unknown",
    title: "What happens if the store is down?",
    links: [{ type: "question_for", to: "REQ-SAMPLE-001" }],
  },
  { id: "REQ-OTHER-001", kind: "requirement", title: "Other behavior", links: [] },
])

describe("ImpactAnalyzer", () => {
  test("walks links in both directions and reports transitive impact", () => {
    const report = new ImpactAnalyzer().analyze(sampleGraph, ["REQ-SAMPLE-001"])

    expect(report.changed.map((element) => element.id)).toEqual(["REQ-SAMPLE-001"])
    expect(report.affected.map((element) => element.id)).toEqual([
      "AC-SAMPLE-001",
      "CAP-SAMPLE",
      "EVD-SAMPLE-001",
      "UNK-SAMPLE-001",
      "VER-SAMPLE-002",
      "VOBJ-SAMPLE",
    ])
    expect(report.affected.find((element) => element.id === "VER-SAMPLE-002")?.distance).toBe(2)
    expect(report.affected.find((element) => element.id === "VER-SAMPLE-002")?.via).toEqual([
      {
        from: "VER-SAMPLE-002",
        to: "VOBJ-SAMPLE",
        type: "verification",
        direction: "incoming",
      },
    ])
    expect(report.open_questions).toEqual(["UNK-SAMPLE-001"])
  })

  test("does not fan out through shared dependencies", () => {
    const report = new ImpactAnalyzer().analyze(
      graph([
        {
          id: "REQ-SAMPLE-001",
          kind: "requirement",
          title: "First behavior",
          links: [{ type: "derives_from", to: "CAP-SAMPLE" }],
        },
        {
          id: "REQ-SAMPLE-002",
          kind: "requirement",
          title: "Sibling behavior",
          links: [{ type: "derives_from", to: "CAP-SAMPLE" }],
        },
        { id: "CAP-SAMPLE", kind: "capability", title: "Sample capability", links: [] },
      ]),
      ["REQ-SAMPLE-001"],
    )

    expect(report.affected.map((element) => element.id)).toEqual(["CAP-SAMPLE"])
  })

  test("invalidates linked evidence and renews approvals", () => {
    const report = new ImpactAnalyzer().analyze(
      sampleGraph,
      ["REQ-SAMPLE-001"],
      [
        { id: "REQ-SAMPLE-001", evidence: ["EVD-SAMPLE-001"] },
        { id: "AC-SAMPLE-001", evidence: ["EVD-SAMPLE-001"] },
        { id: "REQ-OTHER-001", evidence: ["EVD-SAMPLE-001"] },
      ],
    )

    expect(report.invalidated_evidence).toEqual(["EVD-SAMPLE-001"])
    expect(report.approvals_to_renew).toEqual(["AC-SAMPLE-001", "REQ-OTHER-001", "REQ-SAMPLE-001"])
  })

  test("reports missing changed elements only through dependent identities", () => {
    const report = new ImpactAnalyzer().analyze(
      sampleGraph,
      ["REQ-MISSING-001"],
      [{ id: "REQ-MISSING-001", evidence: ["EVD-MISSING-001"] }],
    )

    expect(report.changed).toEqual([])
    expect(report.affected).toEqual([])
    expect(report.invalidated_evidence).toEqual(["EVD-MISSING-001"])
    expect(report.approvals_to_renew).toEqual(["REQ-MISSING-001"])
  })

  test("does not traverse unresolved links", () => {
    const report = new ImpactAnalyzer().analyze(
      graph([
        {
          id: "REQ-SAMPLE-001",
          kind: "requirement",
          title: "Sample behavior",
          links: [{ type: "component", to: "CMP-MISSING" }],
        },
      ]),
      ["REQ-SAMPLE-001"],
    )

    expect(report.changed).toHaveLength(1)
    expect(report.affected).toEqual([])
  })

  test("is deterministic for the same input", () => {
    const first = new ImpactAnalyzer().analyze(sampleGraph, ["REQ-SAMPLE-001"])
    const second = new ImpactAnalyzer().analyze(sampleGraph, ["REQ-SAMPLE-001"])

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
