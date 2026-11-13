import type {
  InterpretationRecord,
  InterpretationRunRecord,
  VerificationCheckResultRecord,
  VerificationRunRecord,
} from "../persistence"

export interface WorkbenchSession {
  csrf_token: string
  mode: "generated"
  project_id: string | null
  snapshot_id: string | null
  commit: string
  dirty: boolean
  views: string[]
  asset_ready: boolean
}

export interface WorkbenchProjectSummary {
  id: string
  name: string
  repository_path: string
  created_at: string
}

export interface WorkbenchSystemNode {
  id: string
  label: string
  kind: string
  kind_label: string
  parent_id: string | null
  child_count: number
  confidence: string
  provenance: string
  source: "specified" | "observed" | "inferred" | "unknown"
  file_path: string | null
  start_line: number | null
  end_line: number | null
  signature: string | null
  visibility: string | null
  exported: boolean | null
  entry_point_kind: string | null
  mapping_source: string | null
  label_role: string | null
  label_anchor: string | null
  label_evidence: string[]
  summary: string | null
  entry_points: string[]
  public_surface: string[]
  data_access: Array<{ kind: string; channel: string; target: string; evidence: string[] }>
  tests: string[]
  unknowns: string[]
  hypothesis: WorkbenchHypothesis | null
}

export interface WorkbenchHypothesis {
  id: string
  conceptual_id: string
  text: string
  evidence: Array<{ element_id: string; file_path: string; line: number }>
  confidence: number
  provider: string
  model: string
  prompt_version: string
  status: string
}

export interface WorkbenchSystemEdge {
  id: string
  sourceId: string
  targetId: string
  type: string
  label: string
  resolution: string
  confidence: string
  provenance: string
}

export interface WorkbenchSystemArchitecture {
  project_id: string
  snapshot_id: string
  commit: string
  root_id: string
  coverage: {
    mapped: string[]
    partial: string[]
    unmapped: string[]
    unassigned: string[]
    stale: string[]
    entryPointsWithoutSinks: string[]
    ambiguous: string[]
    behaviorWithoutImplementation: string[]
    externalSystems: string[]
  }
  summary: {
    nodes: number
    edges: number
    files: number
    symbols: number
    mapped: number
    unassigned: number
  }
}

export interface WorkbenchMapping {
  id: string
  conceptual_id: string
  implementation_id: string
  confidence: string
  evidence: string[]
  provenance: string
}

export interface WorkbenchSystemImplementation {
  files: WorkbenchSystemNode[]
  symbols: WorkbenchSystemNode[]
  mappings: WorkbenchMapping[]
}

export interface WorkbenchSystemGraph {
  nodes: WorkbenchSystemNode[]
  edges: WorkbenchSystemEdge[]
}

export interface WorkbenchUnassignedImplementation {
  files: WorkbenchSystemNode[]
}

export interface WorkbenchFlowStep {
  nodeId: string
  filePath: string
  line: number
  resolution: string
  confidence: string
  kind: string
}

export interface WorkbenchFlow {
  id: string
  entryPointId: string
  steps: WorkbenchFlowStep[]
  sources: Array<{ nodeId: string; channel: string; source: string; line: number }>
  sinks: Array<{ nodeId: string; channel: string; source: string; line: number }>
  returns: string[]
  errors: string[]
  evidence: string
  confidence: string
  unknowns: string[]
  limitsReached: string[]
}

export interface WorkbenchFinding {
  id: string
  ruleId: string
  family: "deterministic" | "ai_assisted"
  title: string
  severity: "error" | "warning"
  status: string
  affectedElements: string[]
  evidence: Array<{ kind: string; reference: string; file: string; line: number }>
  explanation: string
  recommendation: string
  confidence: number
  provider?: string
  model?: string
  promptVersion?: string
  inputHashes?: string[]
}

export interface WorkbenchInterpretations {
  run: InterpretationRunRecord | null
  interpretations: InterpretationRecord[]
}

export interface WorkbenchVerification {
  run: VerificationRunRecord | null
  results: VerificationCheckResultRecord[]
}

export interface WorkbenchSnapshotSummary {
  id: string
  project_id: string
  commit: string
  analyzer: string
  analyzer_version: string
  node_count: number
  edge_count: number
  flow_count: number
  finding_count: number
  created_at: string
}

export interface WorkbenchSnapshotComparison {
  from: string
  to: string
  elements: { added: string[]; removed: string[]; changed: string[] }
  relationships: { added: string[]; removed: string[] }
  flows: { added: string[]; removed: string[]; changed: string[] }
  findings: { added: string[]; removed: string[]; changed: string[] }
  entryPoints: { added: string[]; removed: string[] }
  coverage: { newlyMapped: string[]; newlyUnmapped: string[]; newlyStale: string[] }
}
