export const ANALYSIS_SCHEMA_VERSION = 1

export type SnapshotConfidence = "observed" | "inferred" | "ambiguous" | "unknown"

export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export type FindingFamily = "deterministic" | "ai_assisted"

export type FindingStatus = "open" | "confirmed" | "rejected" | "needs_investigation" | "dismissed"

export interface AnalysisOptions {
  staticAnalysis: boolean
  semanticAnalysis: boolean
  flowAnalysis: boolean
}

export interface ProjectRecord {
  id: string
  name: string
  repositoryPath: string
  analysisOptions: AnalysisOptions
  createdAt: string
}

export interface SnapshotCoverage {
  mapped: string[]
  partial: string[]
  unmapped: string[]
  unassigned: string[]
  stale: string[]
}

export interface SnapshotRecord {
  id: string
  projectId: string
  runId: string
  commit: string
  dirty: boolean
  analyzer: string
  analyzerVersion: string
  schemaVersion: number
  ruleVersion: string
  promptVersion: string
  modelVersion: string
  fingerprint: string
  nodeCount: number
  edgeCount: number
  flowCount: number
  findingCount: number
  mapping: unknown
  coverage: SnapshotCoverage
  createdAt: string
}

export interface CodeArtifactRecord {
  id: string
  snapshotId: string
  path: string
  language: string
  hash: string
  size: number
  lineCount: number
  modifiedAt: string
}

export interface AnalysisRunRecord {
  id: string
  projectId: string
  state: JobState
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

export interface JobRecord {
  id: string
  projectId: string
  state: JobState
  phase: string
  progress: number
  message: string
  error: string | null
  snapshotId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  staticAnalysis: true,
  semanticAnalysis: true,
  flowAnalysis: true,
}

export const EMPTY_COVERAGE: SnapshotCoverage = {
  mapped: [],
  partial: [],
  unmapped: [],
  unassigned: [],
  stale: [],
}
