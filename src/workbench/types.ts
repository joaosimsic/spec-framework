import type { Proposal, ProposalMode } from "../change"
import type { CurationAction, MappingCurationState } from "../discovery/curation-types"
import type { DisplayEntry } from "../model"
import type { SpecGraph } from "../model/types"

export type WorkbenchMode = "read-only" | ProposalMode

export interface WorkbenchProposalSummary {
  ref: string
  label: string
  mode: ProposalMode
  state: string
  author: string
  baseCommit: string
}

export interface WorkbenchSession {
  csrf_token: string
  mode: WorkbenchMode
  commit: string
  dirty: boolean
  proposal: WorkbenchProposalSummary | null
  views: string[]
  asset_ready: boolean
}

export interface WorkbenchGraphView {
  commit: string
  dirty: boolean
  entries: DisplayEntry[]
}

export interface WorkbenchNamedItem {
  ref: string | null
  label: string
  kindLabel: string
  state?: string
}

export interface WorkbenchDiffItem extends WorkbenchNamedItem {
  previousLabel?: string
  changed: string[]
}

export interface WorkbenchDiffView {
  available: boolean
  reason?: string
  added: WorkbenchNamedItem[]
  removed: WorkbenchNamedItem[]
  modified: WorkbenchDiffItem[]
}

export interface WorkbenchImpactView {
  available: boolean
  reason?: string
  changed: WorkbenchNamedItem[]
  affected: WorkbenchNamedItem[]
  invalidatedEvidence: WorkbenchNamedItem[]
  approvalsToRenew: WorkbenchNamedItem[]
  openQuestions: WorkbenchNamedItem[]
}

export interface WorkbenchChangeView {
  proposal: WorkbenchProposalSummary
  operations: WorkbenchNamedItem[]
  diff: WorkbenchDiffView
  impact: WorkbenchImpactView
}

export interface WorkbenchContextView {
  proposal: WorkbenchProposalSummary | null
  entries: DisplayEntry[]
  blockers: string[]
  openQuestions: WorkbenchNamedItem[]
  prompts: string[]
  next: string[]
}

export interface WorkbenchMappingArea {
  ref: string
  label: string
  kindLabel: string
  confidenceLabel: string
  prompt: string
  state: string
  owner?: string
  responsibility?: string
  boundary?: string
}

export interface WorkbenchMappingRelation {
  ref: string
  sourceRef: string
  targetRef: string
  label: string
  confidenceLabel: string
  prompt: string
  type: string
}

export interface WorkbenchMappingQuestion {
  label: string
  blocking: boolean
}

export interface WorkbenchMappingView {
  direction: string
  state: string
  areas: WorkbenchMappingArea[]
  relations: WorkbenchMappingRelation[]
  questions: WorkbenchMappingQuestion[]
  gaps: {
    areasWithoutOwner: number
    areasWithoutResponsibility: number
    relationsNeedingReview: number
    unresolvedRequirementLinks: number
  }
  next: string[]
}

export interface WorkbenchArchitectureCodeSymbol {
  ref: string
  name: string
  kind: string
  kindLabel: string
  exported: boolean
  line: number
}

export interface WorkbenchArchitectureCodeFile {
  ref: string
  label: string
  path: string
  dependencies: string[]
  symbols: WorkbenchArchitectureCodeSymbol[]
}

export interface WorkbenchArchitectureGraphNode {
  ref: string
  label: string
  kind: string
  kindLabel: string
  parentRef: string | null
  groupRef: string
  childCount: number
  confidenceLabel: string
  stateLabel: string
  description?: string
  responsibility?: string
  boundary?: string
  owner?: string
  technology?: string
  codePaths: string[]
  codeFiles: WorkbenchArchitectureCodeFile[]
}

export interface WorkbenchArchitectureGraphEdge {
  ref: string
  sourceRef: string
  targetRef: string
  label: string
}

export interface WorkbenchArchitectureGraphView {
  nodes: WorkbenchArchitectureGraphNode[]
  edges: WorkbenchArchitectureGraphEdge[]
  warnings: string[]
  summary: {
    nodes: number
    relations: number
    groups: number
    roots: number
  }
}

export interface WorkbenchRepoGraphNode {
  ref: string
  label: string
  kindLabel: string
  level: "system" | "component" | "file" | "other"
  confidenceLabel: string
  path?: string
}

export interface WorkbenchRepoGraphEdge {
  ref: string
  sourceRef: string
  targetRef: string
  type: string
  label: string
  level: "component" | "file" | "other"
}

export interface WorkbenchRepoGraphView {
  nodes: WorkbenchRepoGraphNode[]
  edges: WorkbenchRepoGraphEdge[]
  summary: {
    nodes: number
    edges: number
    components: number
    files: number
    externalDependencies: number
  }
}

export interface WorkbenchCheckFinding {
  level: "error" | "warning"
  message: string
}

export interface WorkbenchCheckView {
  errors: number
  warnings: number
  findings: WorkbenchCheckFinding[]
}

export interface WorkbenchTechnicalView {
  proposal: Proposal
  graph: SpecGraph
  lock: unknown
  mapping: MappingCurationState | null
  adapters: unknown
  toolVersions: Record<string, string>
}

export interface WorkbenchErrorView {
  error: {
    code: string
    message: string
    choices?: Array<{ label: string; context: string }>
  }
}

export type WorkbenchCurationRequest =
  | { kind: "accept"; target: string }
  | { kind: "reject"; target: string }
  | { kind: "accept-relation"; source: string; target: string; type?: string }
  | { kind: "reject-relation"; source: string; target: string; type?: string }
  | { kind: "rename"; target: string; title: string }
  | { kind: "merge"; targets: string[]; title: string }
  | { kind: "split"; target: string; parts: string[] }
  | { kind: "set-owner"; target: string; owner: string }
  | { kind: "set-responsibility"; target: string; responsibility: string }
  | { kind: "set-boundary"; target: string; boundary: string }
  | { kind: "open-question"; question: string; target?: string; blocking?: boolean }

export interface WorkbenchCurationResolution {
  actions: CurationAction[]
}
