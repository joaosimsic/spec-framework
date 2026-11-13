export interface ValidationCounts {
  files: number
  elements: number
  relationships: number
  behavior: number
  contracts: number
  verification: number
  flows: number
  findings: number
  unknowns: number
  evidence: number
  specBytes: number
  databaseBytes: number
}

export interface ValidationTiming {
  milliseconds: number
  rss: number
}

export interface ApiTiming {
  path: string
  medianMs: number
  maxMs: number
  bytes: number
  status: number
}

export interface RepositoryValidation {
  name: string
  source: string
  commit: string
  clonePath: string
  cleanBefore: boolean
  cleanAfter: boolean
  counts: ValidationCounts
  timing: ValidationTiming
  api: ApiTiming[]
  issues: string[]
  warnings: string[]
  deterministic: boolean
  specHash: string
  secondSpecHash: string
}

export interface ValidationReport {
  generatedAt: string
  analyzerVersion: string
  repositories: RepositoryValidation[]
}
