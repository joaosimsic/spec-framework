export const EVIDENCE_VERSION = 1

export type EvidenceResult = "pass" | "fail" | "incompatible" | "compatible" | "skipped"

export type EvidenceMethod =
  | "formal"
  | "test"
  | "analysis"
  | "inspection"
  | "demonstration"
  | "preflight"
  | "contract"

export type EvidenceFailureCode =
  | "EVIDENCE-DUPLICATE-ID"
  | "EVIDENCE-BAD-RECORD"
  | "EVIDENCE-BAD-HASH"

export interface EvidenceInput {
  path: string
  hash: string
}

export interface EvidenceRecord {
  version: typeof EVIDENCE_VERSION
  id: string
  kind: string
  method: EvidenceMethod
  tool: string
  result: EvidenceResult
  hash: string
  input_hash: string
  inputs: EvidenceInput[]
  command?: string[]
  details?: string
}

export interface EvidenceDraft {
  id: string
  kind: string
  method: EvidenceMethod
  tool: string
  result: EvidenceResult
  inputs: EvidenceInput[]
  command?: string[]
  details?: string
}

export interface EvidenceFailure {
  code: EvidenceFailureCode
  message: string
}
