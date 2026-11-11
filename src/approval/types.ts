export const SPEC_LOCK_VERSION = 1

export interface SpecLockElement {
  content_hash: string
  evidence: string[]
}

export interface SpecLockEvidence {
  hash: string
  tool: string
  result: string
}

export interface SpecLock {
  version: typeof SPEC_LOCK_VERSION
  approved_at: string
  approver: string
  dirty: boolean
  elements: Record<string, SpecLockElement>
  evidence: Record<string, SpecLockEvidence>
}

export type SpecLockFailureCode = "SPEC-LOCK-NOT-FOUND" | "SPEC-LOCK-BAD"

export interface SpecLockFailure {
  code: SpecLockFailureCode
  message: string
}
