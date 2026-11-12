import type {
  ForceGraphData,
  ForceGraphLink,
  ForceGraphNode,
  VisibleForceGraph,
} from "./force-types"

export class ForceGraphVisibility {
  static build(data: ForceGraphData, expanded: Set<string>, query: string): VisibleForceGraph {
    const nodesByRef = new Map(data.nodes.map((node) => [node.ref, node]))
    const children = ForceGraphVisibility.children(data.nodes)
    const neighbors = ForceGraphVisibility.neighbors(data.links)
    const roots = data.nodes.filter((node) => node.parentRef === null)
    const systemRoots = roots.filter((node) => node.kind === "system")
    const visibleRefs = new Set(
      (systemRoots.length > 0 ? systemRoots : roots).map((node) => node.ref),
    )
    const searching = query.trim() !== ""

    if (searching) {
      const matches = new Set(
        data.nodes
          .filter((node) => ForceGraphVisibility.matches(node, query))
          .map((node) => node.ref),
      )
      for (const ref of matches) ForceGraphVisibility.addAncestors(ref, nodesByRef, visibleRefs)
    } else {
      ForceGraphVisibility.expandVisible(expanded, visibleRefs, children, neighbors)
    }

    const visibleNodes = data.nodes
      .filter((node) => visibleRefs.has(node.ref))
      .map((node) => ({
        ...node,
        hiddenCount: [
          ...new Set([...(children.get(node.ref) ?? []), ...(neighbors.get(node.ref) ?? [])]),
        ].filter((ref) => !visibleRefs.has(ref)).length,
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
    const visibleLinks = data.links.filter(
      (link) => visibleRefs.has(link.sourceRef) && visibleRefs.has(link.targetRef),
    )

    return { nodes: visibleNodes, links: visibleLinks, visibleRefs }
  }

  private static expandVisible(
    expanded: Set<string>,
    visibleRefs: Set<string>,
    children: Map<string, string[]>,
    neighbors: Map<string, string[]>,
  ): void {
    let changed = true
    while (changed) {
      changed = false
      for (const ref of expanded) {
        if (!visibleRefs.has(ref)) continue
        for (const child of children.get(ref) ?? []) {
          if (visibleRefs.has(child)) continue
          visibleRefs.add(child)
          changed = true
        }
        for (const neighbor of neighbors.get(ref) ?? []) {
          if (visibleRefs.has(neighbor)) continue
          visibleRefs.add(neighbor)
          changed = true
        }
      }
    }
  }

  private static children(nodes: ForceGraphNode[]): Map<string, string[]> {
    const children = new Map<string, string[]>()
    for (const node of nodes) {
      if (node.parentRef === null) continue
      const items = children.get(node.parentRef) ?? []
      items.push(node.ref)
      children.set(node.parentRef, items)
    }

    return children
  }

  private static neighbors(links: ForceGraphLink[]): Map<string, string[]> {
    const neighbors = new Map<string, string[]>()
    for (const link of links) {
      const sources = neighbors.get(link.sourceRef) ?? []
      sources.push(link.targetRef)
      neighbors.set(link.sourceRef, sources)
      const targets = neighbors.get(link.targetRef) ?? []
      targets.push(link.sourceRef)
      neighbors.set(link.targetRef, targets)
    }

    return neighbors
  }

  private static addAncestors(
    ref: string,
    nodesByRef: Map<string, ForceGraphNode>,
    visibleRefs: Set<string>,
  ): void {
    let current = ref
    const seen = new Set<string>()
    while (!seen.has(current)) {
      seen.add(current)
      visibleRefs.add(current)
      const parent = nodesByRef.get(current)?.parentRef
      if (parent === undefined || parent === null) return
      current = parent
    }
  }

  private static matches(node: ForceGraphNode, query: string): boolean {
    const value = query.trim().toLowerCase()
    if (value === "") return true

    return [node.label, node.kindLabel, node.description ?? ""].some((candidate) =>
      candidate.toLowerCase().includes(value),
    )
  }
}
