import { describe, expect, test } from "bun:test"
import type { ForceGraphData } from "../src/workbench/web/views/graph/force-types"
import { ForceGraphVisibility } from "../src/workbench/web/views/graph/force-visibility"

const graph: ForceGraphData = {
  nodes: [
    {
      ref: "system",
      label: "Spec framework",
      kind: "system",
      kindLabel: "System",
      parentRef: null,
    },
    {
      ref: "subsystem",
      label: "Engine",
      kind: "subsystem",
      kindLabel: "Subsystem",
      parentRef: "system",
    },
    {
      ref: "component",
      label: "Query",
      kind: "component",
      kindLabel: "Component",
      parentRef: "subsystem",
    },
    {
      ref: "external",
      label: "Git",
      kind: "external_system",
      kindLabel: "External system",
      parentRef: null,
    },
  ],
  links: [
    {
      ref: "contains_1",
      sourceRef: "system",
      targetRef: "subsystem",
      label: "contains",
      type: "contains",
    },
    {
      ref: "contains_2",
      sourceRef: "subsystem",
      targetRef: "component",
      label: "contains",
      type: "contains",
    },
    { ref: "uses", sourceRef: "system", targetRef: "external", label: "uses", type: "uses" },
  ],
}

describe("ForceGraphVisibility", () => {
  test("collapsed graph starts with system roots only", () => {
    const visible = ForceGraphVisibility.build(graph, new Set(), "")

    expect(visible.nodes.map((node) => node.ref)).toEqual(["system"])
    expect(visible.links).toEqual([])
    expect(visible.nodes[0]?.hiddenCount).toBe(2)
  })

  test("expanding reveals children and direct relation neighbors", () => {
    const visible = ForceGraphVisibility.build(graph, new Set(["system"]), "")
    const byRef = new Map(visible.nodes.map((node) => [node.ref, node]))

    expect([...byRef.keys()].sort()).toEqual(["external", "subsystem", "system"])
    expect(byRef.get("system")?.hiddenCount).toBe(0)
    expect(byRef.get("subsystem")?.hiddenCount).toBe(1)
  })

  test("search reveals matches and ancestors", () => {
    const visible = ForceGraphVisibility.build(graph, new Set(), "Query")

    expect(visible.nodes.map((node) => node.ref).sort()).toEqual([
      "component",
      "subsystem",
      "system",
    ])
  })
})
