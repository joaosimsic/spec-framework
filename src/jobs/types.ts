import type { IrElement, IrEntryPoint, IrFinding, IrFlow, IrRelationship } from "../analysis/ir"
import type { ScannedFile } from "../analysis/types"
import type { Result } from "../core/result"
import type { ProjectRecord, SnapshotCoverage } from "../persistence"

export interface AnalysisProgress {
  phase: string
  progress: number
  message: string
}

export interface AnalysisExecutionRequest {
  project: ProjectRecord
  signal: AbortSignal
  report(progress: AnalysisProgress): void
}

export interface AnalysisExecutionResult {
  commit: string
  dirty: boolean
  analyzer: string
  analyzerVersion: string
  ruleVersion: string
  promptVersion: string
  modelVersion: string
  files: ScannedFile[]
  nodes: IrElement[]
  edges: IrRelationship[]
  entryPoints: IrEntryPoint[]
  flows: IrFlow[]
  findings: IrFinding[]
  mapping: unknown
  coverage: SnapshotCoverage
}

export interface AnalysisExecutor {
  execute(request: AnalysisExecutionRequest): Promise<Result<AnalysisExecutionResult, string>>
}

export type JobEventType =
  | "queued"
  | "phase_started"
  | "progress"
  | "finding"
  | "warning"
  | "completed"
  | "failed"
  | "cancelled"

export interface JobEvent {
  job_id: string
  type: JobEventType
  phase: string
  progress: number
  message: string
  timestamp: string
}
