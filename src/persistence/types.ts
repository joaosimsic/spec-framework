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
  ambiguous: string[]
  entry_points_without_sinks: string[]
  behavior_without_implementation: string[]
  external_systems: string[]
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

export type VerificationRunResult = "passed" | "failed" | "unknown"

export interface VerificationRunRecord {
  id: string
  projectId: string
  snapshotId: string
  specHash: string
  runnerVersion: string
  result: VerificationRunResult
  errors: number
  warnings: number
  checkCount: number
  passedCount: number
  failedCount: number
  unknownCount: number
  findings: string[]
  createdAt: string
}

export interface VerificationCheckResultRecord {
  runId: string
  checkId: string
  method: string
  command: string[]
  workingDirectory: string
  result: VerificationRunResult
  confidence: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  outputHash: string
  output: string
  inputHashes: string[]
}

export interface VerificationRunDetails {
  run: VerificationRunRecord
  results: VerificationCheckResultRecord[]
}

export type InterpretationTargetKind = "contract" | "verification"
export type InterpretationRequestKind = InterpretationTargetKind | "all"

export interface InterpretationEvidence {
  filePath: string
  line: number
  reference: string
}

export interface InterpretationRecord {
  id: string
  runId: string
  targetKind: InterpretationTargetKind
  targetId: string
  title: string
  text: string
  evidence: InterpretationEvidence[]
  confidence: number
  provider: string
  model: string
  promptVersion: string
  inputHashes: string[]
}

export interface InterpretationRunRecord {
  id: string
  projectId: string
  snapshotId: string
  verificationRunId: string | null
  requestKind: InterpretationRequestKind
  targetCount: number
  failures: string[]
  createdAt: string
}

export interface InterpretationRunDetails {
  run: InterpretationRunRecord
  interpretations: InterpretationRecord[]
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
  ambiguous: [],
  entry_points_without_sinks: [],
  behavior_without_implementation: [],
  external_systems: [],
}
