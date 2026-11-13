import type { IrElement } from "../analysis/ir"
import { GeneratedSpecIdentity } from "../spec"
import type {
  SystemBuildInput,
  SystemCoverage,
  SystemEdge,
  SystemNode,
  SystemProjection,
} from "./types"

const SYMBOL_TYPES = new Set([
  "function",
  "method",
  "class",
  "interface",
  "type_alias",
  "property",
  "constant",
  "enum",
])

const KIND_LABELS: Record<string, string> = {
  system: "System",
  subsystem: "Subsystem",
  component: "Component",
  file: "File",
  function: "Function",
  method: "Method",
  class: "Class",
  interface: "Interface",
  type_alias: "Type",
  type: "Type",
  property: "Property",
  constant: "Constant",
  enum: "Enum",
  entry_point: "Entry point",
}

export class SystemProjectionBuilder {
  private readonly nodes = new Map<string, SystemNode>()
  private readonly edges = new Map<string, SystemEdge>()
  private readonly moduleByFile = new Map<string, string>()

  build(input: SystemBuildInput): SystemProjection {
    const rootId = GeneratedSpecIdentity.system(input.project.name)
    this.add({
      id: rootId,
      label: input.project.name,
      kind: "system",
      kindLabel: "System",
      parentId: null,
      childCount: 0,
      confidence: "observed",
      provenance: "spec-framework.json#project.name",
      source: "observed",
    })
    this.files(input, rootId)
    this.symbols(input)
    this.entryPoints(input)
    this.relationshipEdges(input)
    this.containmentEdges()

    const nodes = [...this.nodes.values()]
      .map((node) => ({
        ...node,
        childCount: [...this.nodes.values()].filter((candidate) => candidate.parentId === node.id)
          .length,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
    const edges = [...this.edges.values()].sort((left, right) => left.id.localeCompare(right.id))
    const coverage = this.coverage(nodes)
    const files = nodes.filter((node) => node.kind === "file").length
    const symbols = nodes.filter((node) => SYMBOL_TYPES.has(node.kind)).length

    return {
      projectId: input.project.id,
      projectName: input.project.name,
      snapshotId: input.snapshot.id,
      commit: input.snapshot.commit,
      rootId,
      nodes,
      edges,
      coverage,
      summary: {
        nodes: nodes.length,
        edges: edges.length,
        files,
        symbols,
        mapped: nodes.filter((node) => node.kind === "component").length,
        unassigned: coverage.unassigned.length,
      },
    }
  }

  private files(input: SystemBuildInput, rootId: string): void {
    for (const element of input.elements) {
      if (element.type !== "module") continue
      if (element.filePath.startsWith("tests/")) continue
      this.moduleByFile.set(element.filePath, element.id)
      const subsystem = this.subsystem(element.filePath, rootId)
      const parentId = this.component(element.filePath, subsystem)
      this.add({
        id: element.id,
        label: element.filePath.split("/").at(-1) ?? element.filePath,
        kind: "file",
        kindLabel: "File",
        parentId,
        childCount: 0,
        confidence: "observed",
        provenance: element.provenance,
        source: "observed",
        filePath: element.filePath,
        startLine: element.startLine,
        endLine: element.endLine,
      })
    }
  }

  private subsystem(filePath: string, rootId: string): string {
    const segments = filePath.split("/")
    const first = segments[0] ?? "root"
    const name =
      (first === "src" || first === "plugin") && segments.length > 2
        ? segments.slice(0, 2).join("/")
        : first
    const id = GeneratedSpecIdentity.subsystem(name)
    if (!this.nodes.has(id)) {
      this.add({
        id,
        label: name,
        kind: "subsystem",
        kindLabel: "Subsystem",
        parentId: rootId,
        childCount: 0,
        confidence: "inferred",
        provenance: "analysis:directory",
        source: "inferred",
        filePath: name,
      })
    }

    return id
  }

  private component(filePath: string, subsystemId: string): string {
    const directory = filePath.split("/").slice(0, -1).join("/") || "root"
    const subsystemPath = this.nodes.get(subsystemId)?.filePath ?? directory
    if (directory === subsystemPath) return subsystemId
    const id = GeneratedSpecIdentity.component(directory)
    if (!this.nodes.has(id)) {
      this.add({
        id,
        label: directory,
        kind: "component",
        kindLabel: "Component",
        parentId: subsystemId,
        childCount: 0,
        confidence: "inferred",
        provenance: "analysis:directory",
        source: "inferred",
        filePath: directory,
      })
    }

    return id
  }

  private symbols(input: SystemBuildInput): void {
    for (const element of input.elements) {
      if (!SYMBOL_TYPES.has(element.type)) continue
      if (!this.moduleByFile.has(element.filePath)) continue
      this.add({
        id: element.id,
        label: element.name,
        kind: element.type === "type_alias" ? "type" : element.type,
        kindLabel: KIND_LABELS[element.type] ?? this.humanize(element.type),
        parentId: this.symbolParent(element),
        childCount: 0,
        confidence: element.confidence,
        provenance: element.provenance,
        source: "observed",
        filePath: element.filePath,
        startLine: element.startLine,
        endLine: element.endLine,
        signature: element.signature,
        visibility: element.visibility,
        exported: element.exported,
      })
    }
  }

  private entryPoints(input: SystemBuildInput): void {
    for (const entry of input.entryPoints) {
      if (!this.nodes.has(entry.nodeId)) continue
      this.add({
        id: entry.id,
        label: entry.label,
        kind: "entry_point",
        kindLabel: "Entry point",
        parentId: entry.nodeId,
        childCount: 0,
        confidence: entry.confidence,
        provenance: entry.provenance,
        source: entry.confidence === "observed" ? "observed" : "inferred",
        entryPointKind: entry.kind,
      })
    }
  }

  private relationshipEdges(input: SystemBuildInput): void {
    for (const relationship of input.relationships) {
      if (!this.nodes.has(relationship.sourceId) || !this.nodes.has(relationship.targetId)) continue
      this.addEdge({
        id: relationship.id,
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        type: relationship.type,
        label: this.humanize(relationship.type),
        resolution: relationship.resolution,
        confidence: relationship.confidence,
        provenance: relationship.provenance,
      })
    }
  }

  private containmentEdges(): void {
    for (const node of this.nodes.values()) {
      if (node.parentId === null || !this.nodes.has(node.parentId)) continue
      this.addEdge({
        id: `CONTAINS-${node.parentId}-${node.id}`,
        sourceId: node.parentId,
        targetId: node.id,
        type: "contains",
        label: "contains",
        resolution: "resolved",
        confidence: "observed",
        provenance: "analysis:hierarchy",
      })
    }
  }

  private coverage(nodes: SystemNode[]): SystemCoverage {
    const components = nodes.filter((node) => node.kind === "component").map((node) => node.id)
    const files = nodes.filter((node) => node.kind === "file").length

    return {
      mapped: components.sort(),
      partial: [],
      unmapped: [],
      unassigned: files === 0 ? [] : [],
      stale: [],
      entryPointsWithoutSinks: [],
    }
  }

  private symbolParent(element: IrElement): string {
    if (element.parentId !== null && this.nodes.has(element.parentId)) return element.parentId

    return this.moduleByFile.get(element.filePath) ?? element.id
  }

  private add(node: SystemNode): void {
    this.nodes.set(node.id, node)
  }

  private addEdge(edge: SystemEdge): void {
    if (this.edges.has(edge.id)) return
    this.edges.set(edge.id, edge)
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Related"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
