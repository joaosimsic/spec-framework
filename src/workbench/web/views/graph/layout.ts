import type { WorkbenchRepoGraphNode } from "../../../types"

export interface PositionedNode {
  node: WorkbenchRepoGraphNode
  x: number
  y: number
}

export interface GraphGeometry {
  width: number
  height: number
  nodes: PositionedNode[]
  positions: Map<string, { x: number; y: number }>
}

export class GraphLayout {
  static build(nodes: WorkbenchRepoGraphNode[], focusRef: string | null): GraphGeometry {
    const width = 960
    const height = 640
    const centerX = width / 2
    const centerY = height / 2
    const positions = new Map<string, { x: number; y: number }>()
    const sorted = [...nodes].sort((left, right) => left.label.localeCompare(right.label))
    const focus =
      sorted.find((node) => node.ref === focusRef) ??
      sorted.find((node) => node.level === "system") ??
      null
    const ring = sorted.filter((node) => node !== focus)
    const radius = Math.min(270, 100 + ring.length * 9)

    if (focus !== null) positions.set(focus.ref, { x: centerX, y: centerY })
    ring.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, ring.length) - Math.PI / 2
      positions.set(node.ref, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      })
    })

    return {
      width,
      height,
      nodes: sorted.map((node) => ({
        node,
        x: positions.get(node.ref)?.x ?? centerX,
        y: positions.get(node.ref)?.y ?? centerY,
      })),
      positions,
    }
  }
}
