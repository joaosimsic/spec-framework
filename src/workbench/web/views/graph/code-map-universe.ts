import type { WorkbenchRepoGraphEdge, WorkbenchRepoGraphNode } from "../../../types"
import type { ForceGraphData } from "./force-types"

export class CodeMapUniverseBuilder {
  static build(nodes: WorkbenchRepoGraphNode[], edges: WorkbenchRepoGraphEdge[]): ForceGraphData {
    const parentByRef = new Map(
      edges
        .filter((edge) => edge.type === "part_of")
        .map((edge) => [edge.sourceRef, edge.targetRef] as const),
    )
    const forceNodes = nodes.map((node) => ({
      ref: node.ref,
      label: node.label,
      kind: this.kind(node),
      kindLabel: node.kindLabel,
      parentRef: parentByRef.get(node.ref) ?? null,
      description: node.path ?? node.confidenceLabel,
    }))
    const links = edges.map((edge) => ({
      ref: edge.ref,
      sourceRef: edge.sourceRef,
      targetRef: edge.targetRef,
      label: edge.label,
      type: edge.type,
    }))

    return { nodes: forceNodes, links }
  }

  private static kind(node: WorkbenchRepoGraphNode): string {
    if (node.level === "system") return "system"
    if (node.level === "file") return "file"
    if (node.level === "component") return "subsystem"

    return "component"
  }
}
