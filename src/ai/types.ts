import type { Result } from "../core/result"
import type { SnapshotRecord } from "../persistence"

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

export interface AiValidationInput {
  snapshot: SnapshotRecord
  elements: Array<{ id: string; filePath: string; endLine: number }>
  files: string[]
  answer: unknown
}
