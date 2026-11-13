import type { IrElement, IrEntryPoint, IrRelationship } from "../analysis/ir"
import type {
  GeneratedConceptualElement,
  GeneratedDataAccess,
  GeneratedHypothesisEvidence,
} from "../spec"
import type { SnapshotRecord, ProjectRecord } from "../persistence"

export type SystemSource = "specified" | "observed" | "inferred" | "unknown"

export interface SystemDataAccess {
  kind: "read" | "write"
  channel: string
  target: string
  evidence: string[]
}

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
  labelRole?: string
  labelAnchor?: string
  labelEvidence?: string[]
  summary?: string
  entryPoints?: string[]
  publicSurface?: string[]
  dataAccess?: SystemDataAccess[]
  tests?: string[]
  unknowns?: string[]
  filePath?: string
  startLine?: number
  endLine?: number
  signature?: string
  visibility?: string
  exported?: boolean
  entryPointKind?: string
  mappingSource?: string
  hypothesis?: SystemHypothesis
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
  ambiguous: string[]
  entryPointsWithoutSinks: string[]
  behaviorWithoutImplementation: string[]
  externalSystems: string[]
}

export interface SystemMapping {
  id: string
  conceptualId: string
  implementationId: string
  confidence: string
  evidence: string[]
  provenance: string
}

export interface SystemHypothesis {
  id: string
  conceptualId: string
  text: string
  evidence: GeneratedHypothesisEvidence[]
  confidence: number
  provider: string
  model: string
  promptVersion: string
  status: string
}

export interface SystemImplementation {
  files: SystemNode[]
  symbols: SystemNode[]
  mappings: SystemMapping[]
}

export interface SystemProjection {
  projectId: string
  projectName: string
  snapshotId: string
  commit: string
  rootId: string
  nodes: SystemNode[]
  edges: SystemEdge[]
  implementation: SystemImplementation
  hypotheses: SystemHypothesis[]
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
  architecture: {
    system: GeneratedConceptualElement
    subsystems: GeneratedConceptualElement[]
    components: GeneratedConceptualElement[]
    interfaces: GeneratedConceptualElement[]
    data_stores: GeneratedConceptualElement[]
    external_systems: GeneratedConceptualElement[]
  }
}

export interface ConceptualSystemInput {
  project: ProjectRecord
  snapshot: SnapshotRecord
  architecture: GeneratedConceptualElement[]
  relationships: Array<{
    id: string
    source_id: string
    target_id: string
    type: string
    resolution: string
    confidence: string
    provenance: string
  }>
  implementation: {
    files: Array<{ id: string; path: string; language: string }>
    symbols: Array<{
      id: string
      file_id: string
      type: string
      name: string
      qualified_name: string
      signature: string
      start_line: number
      end_line: number
      visibility: string
      exported: boolean
    }>
  }
  mappings: Array<{
    id: string
    conceptual_id: string
    implementation_id: string
    confidence: string
    evidence: string[]
    provenance: string
  }>
  hypotheses: Array<{
    id: string
    conceptual_id: string
    text: string
    evidence: GeneratedHypothesisEvidence[]
    confidence: number
    provider: string
    model: string
    prompt_version: string
    status: string
  }>
  coverage: {
    mapped: string[]
    partial: string[]
    unmapped: string[]
    unassigned: string[]
    stale: string[]
    ambiguous: string[]
    entry_points_without_sinks: string[]
    behavior_without_implementation: string[]
    external_systems: string[]
  }
}

export type { GeneratedDataAccess }
