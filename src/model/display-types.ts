import type { GraphFinding, GraphLink, GraphStatus } from "./types"

export const DISPLAY_MODEL_VERSION = 1

export interface DisplayReference {
  ref: string
  label: string
  kindLabel: string
}

export interface DisplayRelationship {
  label: string
  items: DisplayReference[]
}

export interface DisplayTechnical {
  id: string
  kind: string
  status?: GraphStatus
  owner?: string
  provenance?: string
  confidence?: string
  links: GraphLink[]
  diagnostics: GraphFinding[]
}

export interface DisplayEntry {
  ref: string
  label: string
  summary?: string
  kindLabel: string
  state: string
  relationships: DisplayRelationship[]
  openQuestions: DisplayReference[]
  blockers: string[]
  technical: DisplayTechnical
}

export interface DisplayModel {
  version: typeof DISPLAY_MODEL_VERSION
  graphVersion: number
  commit: string
  entries: DisplayEntry[]
}

export interface DisplayChoice {
  ref: string
  label: string
  context: string
}

export type DisplayFailure =
  | { code: "DISPLAY-NOT-FOUND"; message: string }
  | { code: "DISPLAY-AMBIGUOUS"; message: string; choices: DisplayChoice[] }
