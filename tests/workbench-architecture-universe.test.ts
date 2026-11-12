import { describe, expect, test } from "bun:test"
import type { WorkbenchArchitectureGraphNode } from "../src/workbench/types"
import { ArchitectureUniverseBuilder } from "../src/workbench/web/views/architecture/universe"

const component: WorkbenchArchitectureGraphNode = {
  ref: "component",
  label: "Query service",
  kind: "component",
  kindLabel: "Component",
  parentRef: null,
  groupRef: "component",
  childCount: 0,
  confidenceLabel: "Clear from the model",
  stateLabel: "Proposed",
  codePaths: ["src/query"],
  codeFiles: [
    {
      ref: "file_query",
      label: "query.ts",
      path: "src/query/query.ts",
      dependencies: ["src/query/render.ts"],
      symbols: [
        {
          ref: "symbol_run",
          name: "runQuery",
          kind: "function",
          kindLabel: "Function",
          exported: true,
          line: 10,
        },
        {
          ref: "symbol_internal",
          name: "internal",
          kind: "constant",
          kindLabel: "Constant",
          exported: false,
          line: 30,
        },
      ],
    },
    {
      ref: "file_render",
      label: "render.ts",
      path: "src/query/render.ts",
      dependencies: [],
      symbols: [],
    },
  ],
}

describe("ArchitectureUniverseBuilder", () => {
  test("adds files, exported symbols, and import links", () => {
    const universe = ArchitectureUniverseBuilder.build([component], [], false)
    const kinds = universe.graph.nodes.map((node) => node.kind)

    expect(kinds.filter((kind) => kind === "file")).toHaveLength(2)
    expect(universe.graph.nodes.some((node) => node.ref === "symbol_run")).toBe(true)
    expect(universe.graph.nodes.some((node) => node.ref === "symbol_internal")).toBe(false)
    expect(universe.graph.links.some((link) => link.type === "imports")).toBe(true)
  })

  test("includes internal symbols when requested", () => {
    const universe = ArchitectureUniverseBuilder.build([component], [], true)

    expect(universe.graph.nodes.some((node) => node.ref === "symbol_internal")).toBe(true)
  })
})
