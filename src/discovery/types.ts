export type Confidence = "observed" | "inferred" | "ambiguous" | "unknown"

export interface DraftLink {
  type: string
  to: string
  confidence?: Confidence
  provenance?: string
}

export interface DraftElement {
  id: string
  kind: string
  title: string
  status: "draft"
  provenance: string
  confidence: Confidence
  links: DraftLink[]
  owner?: string
  responsibility?: string
  boundary?: string
  codePaths?: string[]
}

export interface DraftModel {
  elements: DraftElement[]
}

export interface DiscoveryFinding {
  level: "warning" | "info"
  code: string
  message: string
}

export interface DiscoveryContribution {
  elements: DraftElement[]
  findings: DiscoveryFinding[]
  externalDependencies: string[]
}

export interface MapGaps {
  missingOwners: string[]
  missingResponsibilities: string[]
  externalDependencies: string[]
  unresolvedRequirementLinks: string[]
}

export interface MapSummary {
  elements: number
  relations: number
  observed: number
  inferred: number
  ambiguous: number
  unknown: number
}

export interface MapReport {
  version: number
  draftPath: string | null
  elements: DraftElement[]
  summary: MapSummary
  gaps: MapGaps
  findings: DiscoveryFinding[]
}
