import type { ImpactReport } from "../model"

export const PROPOSAL_VERSION = 1

export type ProposalMode = "scratch" | "mapping" | "refactor"

export type ProposalStatus = "draft" | "proposed" | "validated" | "approved" | "superseded"

export type ProposalOperationKind =
  "rename" | "deprecate" | "replace" | "split" | "merge" | "extract" | "move" | "change-contract"

export interface ProposalRecordFields {
  [field: string]: string
}

export interface ProposalComponentFields extends ProposalRecordFields {
  UID: string
  TITLE: string
}

export interface ProposalContractFields {
  [field: string]: unknown
}

export type ProposalMoveField = "COMPONENT" | "CAPABILITY"

export type ProposalOperation =
  | { kind: "rename"; target: string; title: string }
  | { kind: "deprecate"; target: string }
  | { kind: "replace"; target: string; replacement: ProposalRecordFields }
  | { kind: "split"; target: string; parts: ProposalRecordFields[] }
  | { kind: "merge"; targets: string[]; result: ProposalRecordFields }
  | {
      kind: "extract"
      target: string
      component: ProposalComponentFields
      parent?: string
      from?: string
    }
  | {
      kind: "move"
      target: string
      to: string
      field?: ProposalMoveField
      from?: string
    }
  | { kind: "change-contract"; target: string; fields: ProposalContractFields }

export interface ProposalBaseline {
  commit: string
  lock_hash: string | null
}

export interface ProposalOperationLog {
  kind: ProposalOperationKind
  at: string
  targets: string[]
  before_hashes: Record<string, string | null>
  after_hashes: Record<string, string | null>
}

export interface Proposal {
  version: typeof PROPOSAL_VERSION
  id: string
  direction: string
  mode: ProposalMode
  status: ProposalStatus
  branch: string
  base_commit: string
  baseline: ProposalBaseline
  author: string
  created_at: string
  operations: ProposalOperationLog[]
}

export interface GitProposalState {
  branch: string
  commit: string
  clean: boolean
}

export type ChangeAction = "added" | "modified" | "deprecated"

export interface ChangeEntry {
  id: string
  kind: string
  action: ChangeAction
  title: string
  previous_title?: string
  previous_status?: string
  status?: string
}

export interface ChangeReport {
  proposal: Proposal
  operations: ProposalOperationLog[]
  changes: ChangeEntry[]
  impact: ImpactReport
}
