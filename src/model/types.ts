export const GRAPH_VERSION = 1

export type GraphStatus = "draft" | "proposed" | "approved" | "deprecated" | "unknown"

export interface GraphLink {
  type: string
  to: string
}

export interface GraphElement {
  id: string
  kind: string
  title?: string
  status?: GraphStatus
  owner?: string
  provenance?: string
  confidence?: string
  links: GraphLink[]
}

export interface GraphFinding {
  level: "error" | "warning"
  code: string
  message: string
  id?: string
}

export interface GraphEvidence {
  id: string
  kind?: string
  method?: string
  result?: string
  hash?: string
}

export interface GraphWorkspace {
  workspace: string
  commit: string
  dirty: boolean
}

export interface SpecGraph {
  version: typeof GRAPH_VERSION
  workspace: string
  commit: string
  dirty: boolean
  elements: GraphElement[]
  evidence: GraphEvidence[]
  findings: GraphFinding[]
  tool_versions: Record<string, string>
}

export interface GraphContribution {
  elements: GraphElement[]
  evidence?: GraphEvidence[]
  findings?: GraphFinding[]
}

export interface GraphFailure {
  code: string
  message: string
}
