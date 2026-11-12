import { describe, expect, test } from "bun:test"
import type { MapReport } from "../src/discovery/types"
import { WorkbenchRepoGraphDisplay } from "../src/workbench/repo-graph-display"

const report: MapReport = {
  version: 1,
  draftPath: null,
  elements: [
    {
      id: "SYS-SAMPLE",
      kind: "system",
      title: "Sample",
      status: "draft",
      provenance: "doc:spec/config.json#project.name",
      confidence: "observed",
      links: [],
    },
    {
      id: "CMP-SRC-CORE",
      kind: "component",
      title: "core",
      status: "draft",
      provenance: "code:src/core/",
      confidence: "observed",
      links: [
        {
          type: "part_of",
          to: "SYS-SAMPLE",
          confidence: "observed",
          provenance: "code:src/core/",
        },
      ],
    },
    {
      id: "CMP-SRC-CHANGE",
      kind: "component",
      title: "change",
      status: "draft",
      provenance: "code:src/change/",
      confidence: "observed",
      links: [
        {
          type: "part_of",
          to: "SYS-SAMPLE",
          confidence: "observed",
          provenance: "code:src/change/",
        },
        {
          type: "depends_on",
          to: "CMP-SRC-CORE",
          confidence: "observed",
          provenance: "code:src/change/operations.ts#imports",
        },
      ],
    },
    {
      id: "FILE-SRC-CHANGE-OPERATIONS-TS",
      kind: "module",
      title: "src/change/operations.ts",
      status: "draft",
      provenance: "code:src/change/operations.ts",
      confidence: "observed",
      links: [
        {
          type: "part_of",
          to: "CMP-SRC-CHANGE",
          confidence: "observed",
          provenance: "code:src/change/operations.ts",
        },
        {
          type: "depends_on",
          to: "FILE-SRC-CORE-RESULT-TS",
          confidence: "observed",
          provenance: "code:src/change/operations.ts#imports",
        },
      ],
    },
    {
      id: "FILE-SRC-CORE-RESULT-TS",
      kind: "module",
      title: "src/core/result.ts",
      status: "draft",
      provenance: "code:src/core/result.ts",
      confidence: "observed",
      links: [
        {
          type: "part_of",
          to: "CMP-SRC-CORE",
          confidence: "observed",
          provenance: "code:src/core/result.ts",
        },
      ],
    },
  ],
  summary: { elements: 5, relations: 6, observed: 5, inferred: 0, ambiguous: 0, unknown: 0 },
  gaps: {
    missingOwners: [],
    missingResponsibilities: [],
    externalDependencies: ["CMP-SRC-CHANGE -> ajv"],
    unresolvedRequirementLinks: [],
  },
  findings: [],
}

describe("WorkbenchRepoGraphDisplay", () => {
  test("maps systems, subsystems, and files without exposing IDs", () => {
    const view = new WorkbenchRepoGraphDisplay(report).view()
    const byLabel = new Map(view.nodes.map((node) => [node.label, node]))

    expect(byLabel.get("Sample")?.level).toBe("system")
    expect(byLabel.get("core")?.level).toBe("component")
    expect(byLabel.get("operations.ts")).toMatchObject({
      level: "file",
      path: "src/change/operations.ts",
      kindLabel: "File",
    })
    expect(view.summary).toEqual({
      nodes: 5,
      edges: 6,
      components: 2,
      files: 2,
      externalDependencies: 1,
    })
    expect(view.edges.some((edge) => edge.type === "depends_on")).toBe(true)
    expect(view.edges.every((edge) => edge.ref.startsWith("edge_"))).toBe(true)
    expect(view.nodes.every((node) => node.ref.startsWith("node_"))).toBe(true)
    expect(JSON.stringify(view.nodes)).not.toMatch(/(?:SYS|CMP|FILE)-/)
  })
})
