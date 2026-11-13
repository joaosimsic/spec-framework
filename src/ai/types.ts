import type { Result } from "../core/result"
import type {
  InterpretationEvidence,
  InterpretationTargetKind,
  SnapshotRecord,
} from "../persistence"

export interface AiConfig {
  mode: "local" | "remote"
  endpoint: string
  model: string
  apiKeyEnvironment: string | null
  promptVersion: string
}

export interface AiRequest {
  task: string
  prompt: string
  context: string
  responseSchema: unknown
}

export interface AiProvider {
  readonly id: string
  readonly model: string
  complete(request: AiRequest, signal?: AbortSignal): Promise<Result<string, string>>
}

export interface AiInterpretationSubject {
  kind: InterpretationTargetKind
  id: string
  title: string
  prompt: string
}

export interface AiInterpretation {
  kind: InterpretationTargetKind
  targetId: string
  title: string
  text: string
  evidence: InterpretationEvidence[]
  confidence: number
}

export interface AiInterpretationResult {
  interpretation: AiInterpretation
  inputHashes: string[]
  provider: string
  model: string
  promptVersion: string
}

export const AI_DIAGNOSIS_RULES = ["ARC-005", "ARC-006", "ARC-009", "ARC-010"] as const
export type AiDiagnosisRule = (typeof AI_DIAGNOSIS_RULES)[number]

export interface AiDiagnosisFinding {
  ruleId: AiDiagnosisRule
  title: string
  explanation: string
  recommendation: string
  affectedElements: string[]
  evidence: AiEvidence[]
  confidence: number
}

export interface AiDiagnosisSubject {
  id: string
  label: string
  summary: string
  catalog: string
  conceptualIds: string[]
}

export interface AiDiagnosisResult {
  findings: AiDiagnosisFinding[]
  inputHashes: string[]
  provider: string
  model: string
  promptVersion: string
}

export interface AiEvidence {
  elementId: string
  filePath: string
  line: number
}

export interface AiAnswer {
  explanation: string
  elements: string[]
  files: string[]
  evidence: AiEvidence[]
  evidenceClass: "ai_inferred"
  confidence: number
  validationStatus: "valid" | "rejected"
}

export interface AiHypothesisResult {
  answer: AiAnswer
  inputHashes: string[]
  provider: string
  model: string
  promptVersion: string
}

export interface AiInterpretationValidationInput {
  files: string[]
  subject: AiInterpretationSubject
}

export interface AiDiagnosisValidationInput {
  elements: Array<{ id: string; filePath: string; endLine: number }>
  files: string[]
  conceptualIds: string[]
}

export interface AiValidationInput {
  snapshot: SnapshotRecord
  elements: Array<{ id: string; filePath: string; endLine: number }>
  files: string[]
  answer: unknown
}
