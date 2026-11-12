import type { WorkbenchArchitectureGraphEdge, WorkbenchArchitectureGraphNode } from "../../../types"

export interface ArchitectureProjection {
  nodes: WorkbenchArchitectureGraphNode[]
  edges: WorkbenchArchitectureGraphEdge[]
}

export class ArchitectureProjectionBuilder {
  static build(
    nodes: WorkbenchArchitectureGraphNode[],
    edges: WorkbenchArchitectureGraphEdge[],
    collapsed: Set<string>,
    query: string,
  ): ArchitectureProjection {
    const parentByRef = new Map(
      nodes.flatMap((node) =>
        node.parentRef === null ? [] : [[node.ref, node.parentRef] as const],
      ),
    )
    const searching = query.trim() !== ""
    const activeCollapsed = searching ? new Set<string>() : collapsed
    const base = nodes.filter(
      (node) =>
        !ArchitectureProjectionBuilder.hasCollapsedAncestor(node.ref, parentByRef, activeCollapsed),
    )
    const visible = searching
      ? ArchitectureProjectionBuilder.withAncestors(base, parentByRef, query)
      : base
    const visibleRefs = new Set(visible.map((node) => node.ref))
    const projected = new Map<string, WorkbenchArchitectureGraphEdge>()

    for (const edge of edges) {
      const sourceRef = ArchitectureProjectionBuilder.visibleRef(
        edge.sourceRef,
        parentByRef,
        visibleRefs,
      )
      const targetRef = ArchitectureProjectionBuilder.visibleRef(
        edge.targetRef,
        parentByRef,
        visibleRefs,
      )
      if (sourceRef === null || targetRef === null || sourceRef === targetRef) continue
      const key = `${sourceRef}\u0000${targetRef}\u0000${edge.label}`
      if (projected.has(key)) continue
      projected.set(key, { ...edge, sourceRef, targetRef })
    }

    return {
      nodes: visible.sort((left, right) => left.label.localeCompare(right.label)),
      edges: [...projected.values()].sort((left, right) => left.ref.localeCompare(right.ref)),
    }
  }

  private static hasCollapsedAncestor(
    ref: string,
    parentByRef: Map<string, string>,
    collapsed: Set<string>,
  ): boolean {
    const seen = new Set<string>()
    let current = parentByRef.get(ref)

    while (current !== undefined && !seen.has(current)) {
      if (collapsed.has(current)) return true
      seen.add(current)
      current = parentByRef.get(current)
    }

    return false
  }

  private static withAncestors(
    nodes: WorkbenchArchitectureGraphNode[],
    parentByRef: Map<string, string>,
    query: string,
  ): WorkbenchArchitectureGraphNode[] {
    const byRef = new Map(nodes.map((node) => [node.ref, node]))
    const included = new Set<string>()

    for (const node of nodes) {
      if (!ArchitectureProjectionBuilder.matches(node, query)) continue
      included.add(node.ref)
      let parentRef = parentByRef.get(node.ref)
      while (parentRef !== undefined && !included.has(parentRef)) {
        included.add(parentRef)
        parentRef = parentByRef.get(parentRef)
      }
    }

    return [...included].flatMap((ref) => {
      const node = byRef.get(ref)
      return node === undefined ? [] : [node]
    })
  }

  private static visibleRef(
    ref: string,
    parentByRef: Map<string, string>,
    visibleRefs: Set<string>,
  ): string | null {
    const seen = new Set<string>()
    let current: string | undefined = ref

    while (current !== undefined && !seen.has(current)) {
      if (visibleRefs.has(current)) return current
      seen.add(current)
      current = parentByRef.get(current)
    }

    return null
  }

  private static matches(node: WorkbenchArchitectureGraphNode, query: string): boolean {
    const value = query.trim().toLowerCase()
    if (value === "") return true

    return node.label.toLowerCase().includes(value) || node.kindLabel.toLowerCase().includes(value)
  }
}
