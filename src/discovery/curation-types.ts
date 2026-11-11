import type { DraftElement, MapReport } from "./types"

export const MAPPING_SNAPSHOT_VERSION = 1

export type CurationAction =
  | { kind: "accept"; target: string }
  | { kind: "reject"; target: string }
  | { kind: "rename"; target: string; title: string }
  | { kind: "merge"; targets: string[]; title: string }
  | { kind: "split"; target: string; parts: string[] }
  | { kind: "set-owner"; target: string; owner: string }
  | { kind: "set-responsibility"; target: string; responsibility: string }
  | { kind: "set-boundary"; target: string; boundary: string }
  | { kind: "open-question"; question: string; target?: string; blocking?: boolean }

export interface CurationDecision {
  action: CurationAction
  at: string
}

export interface MappingSnapshot {
  version: typeof MAPPING_SNAPSHOT_VERSION
  map: MapReport
  decisions: CurationDecision[]
}

export interface MappingCurationSummary {
  accepted: number
  rejected: number
  renamed: number
  merged: number
  split: number
  questions: number
}

export interface MappingCurationQuestion {
  question: string
  targetId: string | null
  targetLabel: string | null
  blocking: boolean
  at: string
}

export interface MappingCurationState {
  areas: DraftElement[]
  resolvedIds: string[]
  decisions: CurationDecision[]
  questions: MappingCurationQuestion[]
  summary: MappingCurationSummary
}

export interface MappingCurationReport extends MappingCurationState {
  version: typeof MAPPING_SNAPSHOT_VERSION
  draftPath: string | null
}
