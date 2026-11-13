import type { GeneratedConceptualElement, GeneratedSpec } from "../spec"

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
  project_id: string | null
  snapshot_id: string | null
  commit: string
  dirty: boolean
  architecture: number
  flows: number
  findings: number
  unknowns: number
}

export interface PluginQueryView {
  snapshot_id: string
  commit: string
  elements: GeneratedConceptualElement[]
}

export interface PluginContextView {
  status: PluginStatusView
  spec: GeneratedSpec | null
}

export interface PluginCheckView {
  errors: number
  warnings: number
  findings: string[]
}

export interface PluginAnalyzeView {
  job_id: string
  state: string
  project_id: string
}

export interface PluginWorkbenchView {
  url: string
  view: string
}
