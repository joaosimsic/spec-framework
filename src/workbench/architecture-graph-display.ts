import { createHash } from "node:crypto"
import type { ArchitectureCatalog } from "../approval/architecture"
import type { WorkbenchArchitectureGraphEdge, WorkbenchArchitectureGraphView } from "./types"

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

  constructor(private readonly catalog: ArchitectureCatalog) {
    for (const element of catalog.elements) {
      if (this.refByAlias.has(element.alias)) continue
      this.refByAlias.set(element.alias, this.ref(element.id ?? element.alias))
    }
  }

  view(): WorkbenchArchitectureGraphView {
    const parentByRef = this.parentRefs()
    const childCounts = this.childCounts(parentByRef)
    const nodes = this.catalog.elements.flatMap((element) => {
      const ref = this.refByAlias.get(element.alias)
      if (ref === undefined) return []
      const parentRef = parentByRef.get(ref) ?? null

      return [
        {
          ref,
          label: element.title,
          kindLabel: this.humanize(element.kind),
          parentRef,
          groupRef: this.groupRef(ref, parentByRef),
          childCount: childCounts.get(ref) ?? 0,
          confidenceLabel: CONFIDENCE_LABELS[element.annotation.confidence ?? ""] ?? "Needs review",
          stateLabel: STATE_LABELS[element.annotation.status ?? ""] ?? "State not recorded",
        },
      ]
    })
    const edges = this.edges()
    const byRef = new Map(nodes.map((node) => [node.ref, node]))

    return {
      nodes: nodes.sort((left, right) => left.label.localeCompare(right.label)),
      edges,
      summary: {
        nodes: nodes.length,
        relations: edges.length,
        groups: nodes.filter((node) => node.childCount > 0).length,
        roots: nodes.filter((node) => byRef.get(node.ref)?.parentRef == null).length,
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

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Element"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  private ref(id: string): string {
    return `node_${this.digest(id).slice(0, 12)}`
  }

  private edgeRef(source: string, label: string, target: string): string {
    return `edge_${this.digest(`${source}\u0000${label}\u0000${target}`).slice(0, 12)}`
  }

  private digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex")
  }
}
