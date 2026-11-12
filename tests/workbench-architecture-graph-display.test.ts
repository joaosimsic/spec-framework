import { describe, expect, test } from "bun:test"
import type { ArchitectureCatalog } from "../src/approval/architecture"
import type { C4Element } from "../src/core/c4"
import { WorkbenchArchitectureGraphDisplay } from "../src/workbench/architecture-graph-display"

function element(
  id: string,
  alias: string,
  kind: string,
  title: string,
  status: "draft" | "proposed" | "approved" = "proposed",
): C4Element {
  return {
    id,
    alias,
    kind,
    title,
    file: "/project/spec/architecture/model.c4",
    line: 1,
    annotation: { status, confidence: "observed", metadata: {} },
  }
}

const catalog: ArchitectureCatalog = {
  elements: [
    element("SYS-SAMPLE", "sample", "system", "Sample", "approved"),
    element("CMP-SAMPLE-CORE", "core", "component", "Core"),
    element("CMP-SAMPLE-STORE", "store", "component", "Store"),
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

describe("WorkbenchArchitectureGraphDisplay", () => {
  test("maps curated containment and relations without exposing IDs", () => {
    const view = new WorkbenchArchitectureGraphDisplay(catalog).view()
    const byLabel = new Map(view.nodes.map((node) => [node.label, node]))

    expect(byLabel.get("Sample")).toMatchObject({
      kindLabel: "System",
      parentRef: null,
      groupRef: byLabel.get("Sample")?.ref,
      childCount: 2,
      stateLabel: "Approved",
    })
    expect(byLabel.get("Core")?.parentRef).toBe(byLabel.get("Sample")?.ref)
    expect(byLabel.get("Files")).toMatchObject({
      kindLabel: "Data store",
      childCount: 0,
    })
    expect(byLabel.get("Files")?.groupRef).toBe(byLabel.get("Sample")?.ref)
    expect(view.edges.map((edge) => edge.label)).toEqual(["reads"])
    expect(view.summary).toEqual({ nodes: 4, relations: 1, groups: 2, roots: 1 })
    expect(JSON.stringify(view)).not.toMatch(/\b(?:SYS|CMP|DAT)-/)
  })
})
