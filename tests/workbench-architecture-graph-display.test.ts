import { describe, expect, test } from "bun:test"
import type { ArchitectureCatalog } from "../src/approval/architecture"
import type { C4Element } from "../src/core/c4"
import type { MapReport } from "../src/discovery/types"
import { WorkbenchArchitectureGraphDisplay } from "../src/workbench/architecture-graph-display"

function element(
  id: string,
  alias: string,
  kind: string,
  title: string,
  status: "draft" | "proposed" | "approved" = "proposed",
  metadata: Record<string, string> = {},
): C4Element {
  return {
    id,
    alias,
    kind,
    title,
    file: "/project/spec/architecture/model.c4",
    line: 1,
    annotation: { status, confidence: "observed", metadata },
  }
}

const catalog: ArchitectureCatalog = {
  elements: [
    element("SYS-SAMPLE", "sample", "system", "Sample", "approved"),
    element("CMP-SAMPLE-CORE", "core", "component", "Core", "proposed", {
      description: "Builds the validated graph.",
      responsibility: "Owns validation.",
      boundary: "In scope: checks. Out of scope: editing.",
      code: "src/core",
    }),
    element("CMP-SAMPLE-STORE", "store", "component", "Store", "proposed", {
      description: "Persists sample data.",
      responsibility: "Owns persistence.",
      boundary: "In scope: storage.",
      code: "src/store",
    }),
    element("DAT-SAMPLE-FILES", "files", "data_store", "Files"),
  ],
  relationships: [
    {
      source: "sample",
      target: "core",
      label: "contains",
      file: "/project/spec/architecture/model.c4",
      line: 10,
    },
    {
      source: "sample",
      target: "store",
      label: "contains",
      file: "/project/spec/architecture/model.c4",
      line: 11,
    },
    {
      source: "store",
      target: "files",
      label: "contains",
      file: "/project/spec/architecture/model.c4",
      line: 12,
    },
    {
      source: "core",
      target: "files",
      label: "reads",
      file: "/project/spec/architecture/model.c4",
      line: 13,
    },
  ],
}

const report: MapReport = {
  version: 1,
  draftPath: null,
  elements: [
    {
      id: "FILE-SRC-CORE-RESULT-TS",
      kind: "module",
      title: "src/core/result.ts",
      status: "draft",
      provenance: "code:src/core/result.ts",
      confidence: "observed",
      links: [],
    },
    {
      id: "FILE-SRC-CORE-CHECK-TS",
      kind: "module",
      title: "src/core/check.ts",
      status: "draft",
      provenance: "code:src/core/check.ts",
      confidence: "observed",
      links: [],
    },
    {
      id: "FILE-SRC-STORE-FILES-TS",
      kind: "module",
      title: "src/store/files.ts",
      status: "draft",
      provenance: "code:src/store/files.ts",
      confidence: "observed",
      links: [],
    },
    {
      id: "CMP-SRC-OTHER",
      kind: "component",
      title: "src/other",
      status: "draft",
      provenance: "code:src/other/",
      confidence: "observed",
      links: [],
    },
  ],
  summary: { elements: 4, relations: 0, observed: 4, inferred: 0, ambiguous: 0, unknown: 0 },
  gaps: {
    missingOwners: [],
    missingResponsibilities: [],
    externalDependencies: [],
    unresolvedRequirementLinks: [],
  },
  findings: [],
}

describe("WorkbenchArchitectureGraphDisplay", () => {
  test("maps curated containment and relations without exposing IDs", () => {
    const view = new WorkbenchArchitectureGraphDisplay(catalog, report).view()
    const byLabel = new Map(view.nodes.map((node) => [node.label, node]))

    expect(byLabel.get("Sample")).toMatchObject({
      kindLabel: "System",
      parentRef: null,
      groupRef: byLabel.get("Sample")?.ref,
      childCount: 2,
      stateLabel: "Approved",
    })
    expect(byLabel.get("Core")).toMatchObject({
      parentRef: byLabel.get("Sample")?.ref,
      description: "Builds the validated graph.",
      responsibility: "Owns validation.",
      codePaths: ["src/core"],
    })
    expect(byLabel.get("Core")?.codeFiles.map((file) => file.path)).toEqual([
      "src/core/check.ts",
      "src/core/result.ts",
    ])
    expect(byLabel.get("Sample")?.codeFiles.map((file) => file.path)).toEqual([
      "src/core/check.ts",
      "src/core/result.ts",
      "src/store/files.ts",
    ])
    expect(byLabel.get("Files")).toMatchObject({
      kindLabel: "Data store",
      childCount: 0,
    })
    expect(byLabel.get("Files")?.groupRef).toBe(byLabel.get("Sample")?.ref)
    expect(view.edges.map((edge) => edge.label)).toEqual(["reads"])
    expect(view.summary).toEqual({ nodes: 4, relations: 1, groups: 2, roots: 1 })
    expect(view.warnings).toContain("Sample is a system and can only contain subsystems.")
    expect(JSON.stringify(view)).not.toMatch(/\b(?:SYS|CMP|DAT)-/)
  })
})
