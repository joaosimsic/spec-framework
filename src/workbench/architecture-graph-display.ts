import { createHash } from "node:crypto"
import type { ArchitectureCatalog } from "../approval/architecture"
import type { MapReport } from "../discovery/types"
import type {
  WorkbenchArchitectureCodeFile,
  WorkbenchArchitectureCodeSymbol,
  WorkbenchArchitectureGraphEdge,
  WorkbenchArchitectureGraphNode,
  WorkbenchArchitectureGraphView,
} from "./types"

const CONTAINMENT_LABEL = "contains"

const CONFIDENCE_LABELS: Record<string, string> = {
  observed: "Clear from the model",
  inferred: "Inferred - confirm or correct",
  ambiguous: "Uncertain boundary - choose",
  unknown: "Needs human input",
}

const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  proposed: "Waiting for your approval",
  approved: "Approved",
  deprecated: "Retired",
}

export class WorkbenchArchitectureGraphDisplay {
  private readonly refByAlias = new Map<string, string>()

  constructor(
    private readonly catalog: ArchitectureCatalog,
    private readonly report: MapReport | null = null,
    private readonly symbolsByPath: Map<string, WorkbenchArchitectureCodeSymbol[]> = new Map(),
  ) {
    for (const element of catalog.elements) {
      if (this.refByAlias.has(element.alias)) continue
      this.refByAlias.set(element.alias, this.ref(element.id ?? element.alias))
    }
  }

  view(): WorkbenchArchitectureGraphView {
    const parentByRef = this.parentRefs()
    const childCounts = this.childCounts(parentByRef)
    const descendants = this.descendants(parentByRef)
    const sourceFiles = this.sourceFiles()
    const sourceDependencies = this.sourceDependencies()
    const baseNodes = this.catalog.elements.flatMap((element) => {
      const ref = this.refByAlias.get(element.alias)
      if (ref === undefined) return []
      const parentRef = parentByRef.get(ref) ?? null
      const description = this.metadata(element, "description")
      const responsibility = this.metadata(element, "responsibility")
      const boundary = this.metadata(element, "boundary")
      const owner = this.metadata(element, "owner")
      const technology = this.metadata(element, "technology")

      return [
        {
          ref,
          label: element.title,
          kind: element.kind,
          kindLabel: this.humanize(element.kind),
          parentRef,
          groupRef: this.groupRef(ref, parentByRef),
          childCount: childCounts.get(ref) ?? 0,
          confidenceLabel: CONFIDENCE_LABELS[element.annotation.confidence ?? ""] ?? "Needs review",
          stateLabel: STATE_LABELS[element.annotation.status ?? ""] ?? "State not recorded",
          ...(description === undefined ? {} : { description }),
          ...(responsibility === undefined ? {} : { responsibility }),
          ...(boundary === undefined ? {} : { boundary }),
          ...(owner === undefined ? {} : { owner }),
          ...(technology === undefined ? {} : { technology }),
          codePaths: this.codePaths(element),
          codeFiles: [] as WorkbenchArchitectureCodeFile[],
        },
      ]
    })
    const byRef = new Map(baseNodes.map((node) => [node.ref, node]))
    const nodes = baseNodes.map((node) => {
      const codePaths = this.collectCodePaths(node.ref, node.codePaths, byRef, descendants)

      return {
        ...node,
        codePaths,
        codeFiles: this.codeFiles(codePaths, sourceFiles, sourceDependencies),
      }
    })
    const edges = this.edges()
    const finalByRef = new Map(nodes.map((node) => [node.ref, node]))

    return {
      nodes: nodes.sort((left, right) => left.label.localeCompare(right.label)),
      edges,
      warnings: this.warnings(parentByRef, finalByRef),
      summary: {
        nodes: nodes.length,
        relations: edges.length,
        groups: nodes.filter((node) => node.childCount > 0).length,
        roots: nodes.filter((node) => finalByRef.get(node.ref)?.parentRef == null).length,
      },
    }
  }

  private parentRefs(): Map<string, string> {
    const parents = new Map<string, string>()

    for (const relationship of this.catalog.relationships) {
      if (relationship.label !== CONTAINMENT_LABEL) continue
      const parentRef = this.refByAlias.get(relationship.source)
      const childRef = this.refByAlias.get(relationship.target)
      if (parentRef === undefined || childRef === undefined) continue
      if (parentRef === childRef) continue
      if (parents.has(childRef)) continue
      parents.set(childRef, parentRef)
    }

    return parents
  }

  private childCounts(parentRefs: Map<string, string>): Map<string, number> {
    const counts = new Map<string, number>()
    for (const parentRef of parentRefs.values()) {
      counts.set(parentRef, (counts.get(parentRef) ?? 0) + 1)
    }

    return counts
  }

  private descendants(parentRefs: Map<string, string>): Map<string, string[]> {
    const result = new Map<string, string[]>()

    for (const ref of this.refByAlias.values()) {
      const seen = new Set<string>()
      let parentRef = parentRefs.get(ref)

      while (parentRef !== undefined && !seen.has(parentRef)) {
        seen.add(parentRef)
        const children = result.get(parentRef) ?? []
        children.push(ref)
        result.set(parentRef, children)
        parentRef = parentRefs.get(parentRef)
      }
    }

    return result
  }

  private groupRef(ref: string, parentRefs: Map<string, string>): string {
    const seen = new Set<string>()
    let current = ref

    while (!seen.has(current)) {
      seen.add(current)
      const parentRef = parentRefs.get(current)
      if (parentRef === undefined) return current
      current = parentRef
    }

    return ref
  }

  private edges(): WorkbenchArchitectureGraphEdge[] {
    return this.catalog.relationships.flatMap((relationship) => {
      if (relationship.label === CONTAINMENT_LABEL) return []
      const sourceRef = this.refByAlias.get(relationship.source)
      const targetRef = this.refByAlias.get(relationship.target)
      if (sourceRef === undefined || targetRef === undefined) return []
      if (sourceRef === targetRef) return []

      return [
        {
          ref: this.edgeRef(relationship.source, relationship.label, relationship.target),
          sourceRef,
          targetRef,
          label: relationship.label,
        },
      ]
    })
  }

  private codePaths(element: { annotation: { metadata: Record<string, string> } }): string[] {
    const value = this.metadata(element, "code")
    if (value === undefined) return []

    return [
      ...new Set(
        value
          .split(",")
          .map((path) => this.normalizePath(path))
          .filter(Boolean),
      ),
    ]
  }

  private collectCodePaths(
    ref: string,
    ownPaths: string[],
    byRef: Map<string, WorkbenchArchitectureGraphNode>,
    descendants: Map<string, string[]>,
  ): string[] {
    const paths = new Set(ownPaths)

    for (const descendantRef of descendants.get(ref) ?? []) {
      const descendant = byRef.get(descendantRef)
      if (descendant === undefined) continue
      for (const path of descendant.codePaths) paths.add(path)
    }

    return [...paths].sort()
  }

  private codeFiles(
    paths: string[],
    sourceFiles: string[],
    dependencies: Map<string, string[]>,
  ): WorkbenchArchitectureCodeFile[] {
    return sourceFiles
      .filter((file) => paths.some((path) => file === path || file.startsWith(`${path}/`)))
      .map((file) => ({
        ref: this.fileRef(file),
        label: this.baseName(file),
        path: file,
        dependencies: dependencies.get(file) ?? [],
        symbols: this.symbolsByPath.get(file) ?? [],
      }))
  }

  private sourceFiles(): string[] {
    if (this.report === null) return []

    return [
      ...new Set(
        this.report.elements.flatMap((element) =>
          element.kind === "module" ? [element.title] : [],
        ),
      ),
    ].sort()
  }

  private sourceDependencies(): Map<string, string[]> {
    if (this.report === null) return new Map()
    const pathById = new Map(
      this.report.elements.flatMap((element) =>
        element.kind === "module" ? [[element.id, element.title] as const] : [],
      ),
    )
    const dependencies = new Map<string, string[]>()

    for (const element of this.report.elements) {
      if (element.kind !== "module") continue
      const targets = element.links.flatMap((link) => {
        if (link.type !== "depends_on") return []
        const path = pathById.get(link.to)
        return path === undefined ? [] : [path]
      })
      dependencies.set(element.title, [...new Set(targets)].sort())
    }

    return dependencies
  }

  private warnings(
    parentRefs: Map<string, string>,
    nodes: Map<string, WorkbenchArchitectureGraphNode>,
  ): string[] {
    const warnings = new Set<string>()

    for (const [childRef, parentRef] of parentRefs) {
      const parent = nodes.get(parentRef)
      const child = nodes.get(childRef)
      if (parent === undefined || child === undefined) continue
      if (parent.kind === "system" && child.kind !== "subsystem") {
        warnings.add(`${parent.label} is a system and can only contain subsystems.`)
        continue
      }
      if (
        parent.kind === "subsystem" &&
        !["subsystem", "component", "data_store"].includes(child.kind)
      ) {
        warnings.add(
          `${parent.label} is a subsystem and cannot contain ${child.kindLabel.toLowerCase()} ${child.label}.`,
        )
        continue
      }
      if (parent.kind !== "system" && parent.kind !== "subsystem") {
        warnings.add(
          `${parent.label} is a ${parent.kindLabel.toLowerCase()} and cannot contain ${child.label}.`,
        )
      }
    }

    return [...warnings].sort()
  }

  private metadata(element: { annotation: { metadata: Record<string, string> } }, key: string) {
    const value = element.annotation.metadata[key]?.trim()
    if (value === undefined || value === "") return undefined

    return value
  }

  private normalizePath(value: string): string {
    return value.trim().replace(/^\.\//, "").replace(/\/+$/, "")
  }

  private baseName(path: string): string {
    return path.split("/").at(-1) ?? path
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Element"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  private ref(id: string): string {
    return `node_${this.digest(id).slice(0, 12)}`
  }

  private fileRef(path: string): string {
    return `file_${this.digest(path).slice(0, 12)}`
  }

  private edgeRef(source: string, label: string, target: string): string {
    return `edge_${this.digest(`${source}\u0000${label}\u0000${target}`).slice(0, 12)}`
  }

  private digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex")
  }
}
