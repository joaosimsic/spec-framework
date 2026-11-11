import type { SpecLock } from "../approval/types"
import type { Diagnostic } from "../core/types"
import type { GraphFinding } from "../model/types"
import type { CheckOptions } from "../core/check"
import type { WorkspaceMetadataReader } from "../query/types"
import type { Proposal } from "../change/types"

export const BUNDLE_VERSION = 1

export interface BundleOptions {
  allowDirty?: boolean
  output?: string
  force?: boolean
  json?: boolean
  workspaceReader?: WorkspaceMetadataReader
  checkOptions?: CheckOptions
  proposalReader?: ProposalContextReader
}

export interface ProposalContext {
  branch: string
  proposal: Proposal
}

export interface ProposalContextReader {
  read(target: string): Promise<[ProposalContext | null, string | null]>
}

export interface BundleSource {
  group: string
  path: string
  hash: string
  content: Uint8Array
}

export interface BundleElement {
  id: string
  kind: string
  title?: string
  status?: string
  owner?: string
  provenance?: string
  links: Array<{ type: string; to: string }>
}

export interface BundleEvidence {
  id: string
  kind: string
  method: string
  tool: string
  result: string
  hash: string
  input_hash: string
}

export interface BundleApproval {
  id: string
  contentHash: string
  evidence: string[]
}

export interface BundleReport {
  project: string
  specVersion: string
  graphVersion: number
  commit: string
  workspace: string
  dirty: boolean
  preview: boolean
  tools: Record<string, string>
  elements: BundleElement[]
  evidence: BundleEvidence[]
  checks: Diagnostic[]
  findings: GraphFinding[]
  approvals: BundleApproval[]
  pending: string[]
  sources: BundleSource[]
  changeReport: string
  lock: SpecLock | null
}

export interface BundleManifest {
  version: typeof BUNDLE_VERSION
  spec_version: string
  graph_version: number
  project: {
    name: string
    adoption: string
  }
  git: {
    workspace: string
    commit: string
    dirty: boolean
    preview: boolean
  }
  tools: Record<string, string>
  checks: {
    errors: number
    warnings: number
    diagnostics: number
  }
  sources: Record<string, Array<{ path: string; hash: string }>>
  evidence: Record<
    string,
    {
      kind: string
      method: string
      result: string
      tool: string
      hash: string
      input_hash: string
    }
  >
  approvals: {
    approved_elements: number
    approved_evidence: number
    pending: number
    approver: string | null
    approved_at: string | null
  }
  files: Record<string, string>
}

export interface BundleRun {
  directory: string | null
  manifest: BundleManifest | null
  output: string
  code: number
}
