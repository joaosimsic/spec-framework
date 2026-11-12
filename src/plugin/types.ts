import type { DisplayEntry } from "../model"
import type { ProposalOperation } from "../change"
import type {
  WorkbenchChangeView,
  WorkbenchCheckView,
  WorkbenchContextView,
  WorkbenchDiffView,
  WorkbenchImpactView,
  WorkbenchNamedItem,
  WorkbenchProposalSummary,
  WorkbenchTechnicalView,
} from "../workbench/types"

export const PLUGIN_CONTRACT_VERSION = 1

export interface PluginFailureChoice {
  label: string
  context: string
}

export interface PluginFailure {
  code: string
  message: string
  choices?: PluginFailureChoice[]
}

export interface PluginStatusView {
  contract: number
  mode: string
  commit: string
  dirty: boolean
  proposal: WorkbenchProposalSummary | null
  approved: WorkbenchNamedItem[]
  blockers: string[]
  openQuestions: WorkbenchNamedItem[]
  prompts: string[]
  next: string[]
}

export interface PluginQueryView {
  commit: string
  dirty: boolean
  entries: DisplayEntry[]
}

export interface PluginNextView {
  prompts: string[]
  next: string[]
  blockers: string[]
  openQuestions: WorkbenchNamedItem[]
}

export interface PluginDecisionRequest {
  kind: "decision" | "open-question"
  text: string
  target?: string
  owner?: string
  technical?: boolean
}

export type PluginContextView = WorkbenchContextView
export type PluginChangeView = WorkbenchChangeView
export type PluginCheckView = WorkbenchCheckView
export type PluginDiffView = WorkbenchDiffView
export type PluginImpactView = WorkbenchImpactView
export type PluginTechnicalView = WorkbenchTechnicalView

export interface PluginProposalRequest {
  operations: ProposalOperation[]
  simulate?: boolean
}

export interface PluginWorkbenchView {
  url: string
  view: string
}

export type { WorkbenchNamedItem, ProposalOperation }
