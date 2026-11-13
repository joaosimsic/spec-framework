import type { SnapshotRecord, ProjectRecord } from "../persistence"
import type { IrElement, IrEntryPoint, IrRelationship } from "../analysis/ir"

export type SystemSource = "specified" | "observed" | "inferred" | "unknown"

export interface SystemNode {
  id: string
  label: string
  kind: string
  kindLabel: string
  parentId: string | null
  childCount: number
  confidence: string
  provenance: string
  source: SystemSource
  filePath?: string
  startLine?: number
  endLine?: number
  signature?: string
  visibility?: string
  exported?: boolean
  responsibility?: string
  boundary?: string
  owner?: string
  technology?: string
  entryPointKind?: string
  mappingSource?: string
}

export interface SystemEdge {
  id: string
  sourceId: string
  targetId: string
  type: string
  label: string
  resolution: string
  confidence: string
  provenance: string
}

export interface SystemCoverage {
  mapped: string[]
  partial: string[]
  unmapped: string[]
  unassigned: string[]
  stale: string[]
  entryPointsWithoutSinks: string[]
}

export interface SystemProjection {
  projectId: string
  projectName: string
  snapshotId: string
  commit: string
  rootId: string
  nodes: SystemNode[]
  edges: SystemEdge[]
  coverage: SystemCoverage
  summary: {
    nodes: number
    edges: number
    files: number
    symbols: number
    mapped: number
    unassigned: number
  }
}

export interface SystemBuildInput {
  project: ProjectRecord
  snapshot: SnapshotRecord
  elements: IrElement[]
  relationships: IrRelationship[]
  entryPoints: IrEntryPoint[]
}
