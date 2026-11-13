import type { IrElement, IrEntryPoint, IrFinding, IrFlow, IrRelationship } from "./ir"
import type { GeneratedCoverage } from "../spec"

export interface SnapshotData {
  id: string
  commit: string
  elements: IrElement[]
  relationships: IrRelationship[]
  flows: IrFlow[]
  findings: IrFinding[]
  entryPoints: IrEntryPoint[]
  coverage: GeneratedCoverage
}

export interface SnapshotComparison {
  from: string
  to: string
  elements: {
    added: string[]
    removed: string[]
    changed: string[]
  }
  relationships: {
    added: string[]
    removed: string[]
  }
  flows: {
    added: string[]
    removed: string[]
    changed: string[]
  }
  findings: {
    added: string[]
    removed: string[]
    changed: string[]
  }
  entryPoints: {
    added: string[]
    removed: string[]
  }
  coverage: {
    newlyMapped: string[]
    newlyUnmapped: string[]
    newlyStale: string[]
  }
}

export class SnapshotComparator {
  static compare(from: SnapshotData, to: SnapshotData): SnapshotComparison {
    const fromElements = new Map(from.elements.map((element) => [element.id, element]))
    const toElements = new Map(to.elements.map((element) => [element.id, element]))
    const fromRelationships = new Set(from.relationships.map((relationship) => relationship.id))
    const toRelationships = new Set(to.relationships.map((relationship) => relationship.id))
    const fromFlows = new Map(from.flows.map((flow) => [flow.id, flow]))
    const toFlows = new Map(to.flows.map((flow) => [flow.id, flow]))
    const fromFindings = new Map(from.findings.map((finding) => [finding.id, finding]))
    const toFindings = new Map(to.findings.map((finding) => [finding.id, finding]))
    const fromEntries = new Set(from.entryPoints.map((entry) => entry.id))
    const toEntries = new Set(to.entryPoints.map((entry) => entry.id))

    return {
      from: from.id,
      to: to.id,
      elements: {
        added: [...toElements.keys()].filter((id) => !fromElements.has(id)).sort(),
        removed: [...fromElements.keys()].filter((id) => !toElements.has(id)).sort(),
        changed: [...toElements.keys()]
          .filter((id) => {
            const before = fromElements.get(id)
            const after = toElements.get(id)
            return before !== undefined && after !== undefined && this.elementChanged(before, after)
          })
          .sort(),
      },
      relationships: {
        added: [...toRelationships].filter((id) => !fromRelationships.has(id)).sort(),
        removed: [...fromRelationships].filter((id) => !toRelationships.has(id)).sort(),
      },
      flows: {
        added: [...toFlows.keys()].filter((id) => !fromFlows.has(id)).sort(),
        removed: [...fromFlows.keys()].filter((id) => !toFlows.has(id)).sort(),
        changed: [...toFlows.keys()]
          .filter((id) => {
            const before = fromFlows.get(id)
            const after = toFlows.get(id)
            if (before === undefined || after === undefined) return false
            return (
              JSON.stringify(before.steps.map((step) => step.nodeId)) !==
              JSON.stringify(after.steps.map((step) => step.nodeId))
            )
          })
          .sort(),
      },
      findings: {
        added: [...toFindings.keys()].filter((id) => !fromFindings.has(id)).sort(),
        removed: [...fromFindings.keys()].filter((id) => !toFindings.has(id)).sort(),
        changed: [...toFindings.keys()]
          .filter((id) => {
            const before = fromFindings.get(id)
            const after = toFindings.get(id)
            return before !== undefined && after !== undefined && before.status !== after.status
          })
          .sort(),
      },
      entryPoints: {
        added: [...toEntries].filter((id) => !fromEntries.has(id)).sort(),
        removed: [...fromEntries].filter((id) => !toEntries.has(id)).sort(),
      },
      coverage: {
        newlyMapped: to.coverage.mapped.filter((id) => !from.coverage.mapped.includes(id)).sort(),
        newlyUnmapped: to.coverage.unmapped
          .filter((id) => !from.coverage.unmapped.includes(id))
          .sort(),
        newlyStale: to.coverage.stale.filter((id) => !from.coverage.stale.includes(id)).sort(),
      },
    }
  }

  private static elementChanged(before: IrElement, after: IrElement): boolean {
    return (
      before.type !== after.type ||
      before.signature !== after.signature ||
      before.visibility !== after.visibility ||
      before.exported !== after.exported ||
      before.parentId !== after.parentId ||
      JSON.stringify(before.dataAccess) !== JSON.stringify(after.dataAccess)
    )
  }
}
