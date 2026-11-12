import type { WorkbenchArchitectureGraphEdge, WorkbenchArchitectureGraphNode } from "../../../types"
import type { ForceGraphData, ForceGraphLink } from "../graph/force-types"

export interface ArchitectureUniverse {
  graph: ForceGraphData
  details: Map<string, WorkbenchArchitectureGraphNode>
}

export class ArchitectureUniverseBuilder {
  static build(
    nodes: WorkbenchArchitectureGraphNode[],
    edges: WorkbenchArchitectureGraphEdge[],
    showInternal: boolean,
  ): ArchitectureUniverse {
    const details = new Map(nodes.map((node) => [node.ref, node]))
    const graphNodes = nodes.map((node) => ({
      ref: node.ref,
      label: node.label,
      kind: node.kind,
      kindLabel: node.kindLabel,
      parentRef: node.parentRef,
      description: node.description ?? node.responsibility,
    }))
    const links = nodes.flatMap((node) =>
      node.parentRef === null
        ? []
        : [
            {
              ref: `link_parent_${node.ref}`,
              sourceRef: node.parentRef,
              targetRef: node.ref,
              label: "contains",
              type: "contains",
            },
          ],
    )
    links.push(...edges.map((edge) => ({ ...edge, type: edge.label })))

    for (const component of nodes.filter(
      (node) => node.kind === "component" && node.codeFiles.length > 0,
    )) {
      for (const file of component.codeFiles) {
        if (!details.has(file.ref)) {
          details.set(file.ref, this.fileDetail(component, file))
          graphNodes.push({
            ref: file.ref,
            label: file.label,
            kind: "file",
            kindLabel: "File",
            parentRef: component.ref,
            description: `${file.path} - ${file.symbols.length} symbols`,
          })
          links.push({
            ref: `link_file_${file.ref}`,
            sourceRef: component.ref,
            targetRef: file.ref,
            label: "implemented by",
            type: "implements",
          })
        }

        for (const dependency of file.dependencies) {
          const target = component.codeFiles.find((candidate) => candidate.path === dependency)
          if (target === undefined) continue
          links.push({
            ref: `link_import_${file.ref}_${target.ref}`,
            sourceRef: file.ref,
            targetRef: target.ref,
            label: "imports",
            type: "imports",
          })
        }

        for (const symbol of file.symbols) {
          if (!showInternal && !symbol.exported) continue
          if (details.has(symbol.ref)) continue
          details.set(symbol.ref, this.symbolDetail(file, symbol))
          graphNodes.push({
            ref: symbol.ref,
            label: symbol.name,
            kind: symbol.kind,
            kindLabel: symbol.kindLabel,
            parentRef: file.ref,
            description: `${symbol.kindLabel} declared at line ${symbol.line}`,
          })
          links.push({
            ref: `link_symbol_${symbol.ref}`,
            sourceRef: file.ref,
            targetRef: symbol.ref,
            label: "declares",
            type: "declares",
          })
        }
      }
    }

    return {
      graph: { nodes: graphNodes, links: this.dedupeLinks(links) },
      details,
    }
  }

  private static fileDetail(
    component: WorkbenchArchitectureGraphNode,
    file: WorkbenchArchitectureGraphNode["codeFiles"][number],
  ): WorkbenchArchitectureGraphNode {
    return {
      ref: file.ref,
      label: file.label,
      kind: "file",
      kindLabel: "File",
      parentRef: component.ref,
      groupRef: component.ref,
      childCount: file.symbols.length,
      confidenceLabel: "Clear from code",
      stateLabel: "Mapped source",
      description: file.path,
      codePaths: [file.path],
      codeFiles: [file],
    }
  }

  private static symbolDetail(
    file: WorkbenchArchitectureGraphNode["codeFiles"][number],
    symbol: WorkbenchArchitectureGraphNode["codeFiles"][number]["symbols"][number],
  ): WorkbenchArchitectureGraphNode {
    return {
      ref: symbol.ref,
      label: symbol.name,
      kind: symbol.kind,
      kindLabel: symbol.kindLabel,
      parentRef: file.ref,
      groupRef: file.ref,
      childCount: 0,
      confidenceLabel: "Clear from code",
      stateLabel: symbol.exported ? "Exported" : "Internal",
      description: `${symbol.kindLabel} declared at line ${symbol.line}`,
      codePaths: [file.path],
      codeFiles: [],
    }
  }

  private static dedupeLinks(links: ForceGraphLink[]): ForceGraphLink[] {
    const byRef = new Map<string, ForceGraphLink>()
    for (const link of links) byRef.set(link.ref, link)

    return [...byRef.values()]
  }
}
