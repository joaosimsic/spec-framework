export const IR_VERSION = 1

export type IrElementType =
  | "module"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "property"
  | "constant"
  | "type_alias"
  | "enum"

export type IrVisibility = "public" | "protected" | "private" | "internal"
export type IrResolution = "resolved" | "ambiguous" | "unresolved" | "external"
export type IrConfidence = "observed" | "inferred" | "ambiguous" | "unknown"
export type IrRelationshipType =
  | "contains"
  | "imports"
  | "exports"
  | "calls"
  | "references"
  | "inherits"
  | "implements"
  | "reads"
  | "writes"

export type DataChannel =
  "filesystem" | "network" | "environment" | "database" | "queue" | "standard_stream" | "external"

export interface IrCall {
  target: string | null
  name: string
  state: IrResolution
  confidence: IrConfidence
  provenance: string
}

export interface IrImport {
  specifier: string
  target: string
  external: boolean
}

export interface IrInheritance {
  kind: "extends" | "implements"
  target: string | null
  name: string
}

export interface IrDataAccess {
  kind: "read" | "write"
  channel: DataChannel
  source: string
  line: number
}

export interface IrElement {
  id: string
  type: IrElementType
  language: string
  name: string
  qualifiedName: string
  filePath: string
  startLine: number
  endLine: number
  parentId: string | null
  signature: string
  visibility: IrVisibility
  exported: boolean
  references: string[]
  calls: IrCall[]
  imports: IrImport[]
  inheritance: IrInheritance[]
  dataAccess: IrDataAccess[]
  confidence: IrConfidence
  provenance: string
}

export interface IrRelationship {
  id: string
  sourceId: string
  targetId: string
  type: IrRelationshipType
  resolution: IrResolution
  confidence: IrConfidence
  provenance: string
  resolvedBy: string
}

export type IrEntryPointKind =
  "cli" | "http_route" | "application_main" | "library_api" | "event_handler"

export interface IrEntryPoint {
  id: string
  nodeId: string
  kind: IrEntryPointKind
  label: string
  provenance: string
  confidence: IrConfidence
  metadata: Record<string, string>
}

export type IrFindingFamily = "deterministic" | "ai_assisted"
export type IrFindingStatus =
  "open" | "confirmed" | "rejected" | "needs_investigation" | "dismissed"

export interface IrFinding {
  id: string
  ruleId: string
  family: IrFindingFamily
  title: string
  severity: "error" | "warning"
  status: IrFindingStatus
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

export type FlowEvidence = "static" | "runtime" | "test" | "ai_inferred" | "human_verified"

export interface IrFlowStep {
  nodeId: string
  filePath: string
  line: number
  resolution: IrResolution
  confidence: IrConfidence
  kind: "entry" | "call" | "read" | "write" | "return" | "external" | "unknown"
}

export interface IrFlowAccess {
  nodeId: string
  channel: DataChannel
  source: string
  line: number
}

export interface IrFlow {
  id: string
  entryPointId: string
  steps: IrFlowStep[]
  sources: IrFlowAccess[]
  sinks: IrFlowAccess[]
  returns: string[]
  errors: string[]
  evidence: FlowEvidence
  confidence: IrConfidence
  unknowns: string[]
  limitsReached: string[]
}

export interface IrSnapshot {
  version: typeof IR_VERSION
  elements: IrElement[]
  relationships: IrRelationship[]
  entryPoints: IrEntryPoint[]
  findings: IrFinding[]
}

export class IrIdentity {
  static file(path: string): string {
    return `FILE-${path}`
  }

  static symbol(path: string, qualifiedName: string): string {
    return `SYM-${path}#${qualifiedName}`
  }

  static entry(kind: string, key: string): string {
    return `ENTRY-${kind}-${key}`
  }

  static relationship(source: string, type: string, target: string): string {
    return `REL-${source}->${type}->${target}`
  }

  static finding(ruleId: string, source: string, target: string): string {
    return `FIND-${ruleId}-${source}-${target}`
  }
}
