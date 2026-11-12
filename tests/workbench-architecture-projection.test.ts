import { describe, expect, test } from "bun:test"
import type {
  WorkbenchArchitectureGraphEdge,
  WorkbenchArchitectureGraphNode,
} from "../src/workbench/types"
import { ArchitectureLayout } from "../src/workbench/web/views/architecture/layout"
import { ArchitectureProjectionBuilder } from "../src/workbench/web/views/architecture/projection"

function node(
  ref: string,
  label: string,
  parentRef: string | null,
  groupRef: string,
  childCount = 0,
): WorkbenchArchitectureGraphNode {
  return {
    ref,
    label,
    kindLabel: "Component",
    parentRef,
    groupRef,
    childCount,
    confidenceLabel: "Clear from the model",
    stateLabel: "Proposed",
  }
}

const nodes = [
  node("root_a", "Root A", null, "root_a", 2),
  node("child_a", "Child A", "root_a", "root_a"),
  node("child_b", "Child B", "root_a", "root_a"),
  node("root_b", "Root B", null, "root_b", 1),
  node("child_c", "Child C", "root_b", "root_b"),
]

const edges: WorkbenchArchitectureGraphEdge[] = [
  { ref: "edge_1", sourceRef: "child_a", targetRef: "child_c", label: "calls" },
  { ref: "edge_2", sourceRef: "child_a", targetRef: "child_b", label: "reads" },
]

describe("ArchitectureProjectionBuilder", () => {
  test("projects collapsed children onto their visible group", () => {
    const projection = ArchitectureProjectionBuilder.build(nodes, edges, new Set(["root_a"]), "")
    const byRef = new Map(projection.nodes.map((candidate) => [candidate.ref, candidate]))

    expect([...byRef.keys()].sort()).toEqual(["child_c", "root_a", "root_b"])
    expect(projection.edges).toMatchObject([
      { sourceRef: "root_a", targetRef: "child_c", label: "calls" },
    ])
  })

  test("keeps search matches and their ancestors", () => {
    const projection = ArchitectureProjectionBuilder.build(nodes, edges, new Set(), "Child C")

    expect(projection.nodes.map((candidate) => candidate.ref).sort()).toEqual(["child_c", "root_b"])
  })
})

describe("ArchitectureLayout", () => {
  test("places group clusters around their visible children", () => {
    const geometry = ArchitectureLayout.build(nodes, new Set())
    const rootCluster = geometry.clusters.find((cluster) => cluster.ref === "root_a")
    const rootNode = geometry.nodes.find((candidate) => candidate.ref === "root_a")
    const childNode = geometry.nodes.find((candidate) => candidate.ref === "child_a")

    expect(rootCluster).toBeDefined()
    expect(rootNode).toBeDefined()
    expect(childNode).toBeDefined()
    if (rootCluster === undefined || rootNode === undefined || childNode === undefined) {
      throw new Error("layout boxes missing")
    }
    expect(childNode.x).toBeGreaterThanOrEqual(rootCluster.x)
    expect(childNode.y).toBeGreaterThan(rootNode.y)
    expect(rootCluster.width).toBeGreaterThan(rootNode.width)
  })

  test("wraps large groups into multiple rows", () => {
    const children = Array.from({ length: 10 }, (_, index) =>
      node(`child_${index}`, `Child ${index}`, "wide_root", "wide_root"),
    )
    const geometry = ArchitectureLayout.build(
      [node("wide_root", "Wide root", null, "wide_root", children.length), ...children],
      new Set(),
    )
    const cluster = geometry.clusters.find((candidate) => candidate.ref === "wide_root")
    const childRows = new Set(
      geometry.nodes
        .filter((candidate) => candidate.ref.startsWith("child_"))
        .map((candidate) => candidate.y),
    )

    expect(cluster).toBeDefined()
    expect(cluster?.width).toBeLessThan(1400)
    expect(childRows.size).toBeGreaterThan(1)
  })
})
