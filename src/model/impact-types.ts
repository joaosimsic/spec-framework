export type ImpactState = "changed" | "affected"

export type ImpactDirection = "incoming" | "outgoing"

export interface ImpactLink {
  from: string
  to: string
  type: string
  direction: ImpactDirection
}

export interface ImpactElement {
  id: string
  kind: string
  title?: string
  state: ImpactState
  distance: number
  via: ImpactLink[]
}

export interface ImpactApproval {
  id: string
  evidence: string[]
}

export interface ImpactReport {
  changed: ImpactElement[]
  affected: ImpactElement[]
  invalidated_evidence: string[]
  approvals_to_renew: string[]
  open_questions: string[]
}
