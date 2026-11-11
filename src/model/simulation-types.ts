export const SIMULATION_VERSION = 1

export type SimulationState = "added" | "removed" | "modified"

export interface SimulationElement {
  id: string
  kind: string
  title: string
  previous_title?: string
  changed: string[]
}

export interface GraphSimulation {
  version: typeof SIMULATION_VERSION
  available: true
  baseline_commit: string
  current_commit: string
  added: SimulationElement[]
  removed: SimulationElement[]
  modified: SimulationElement[]
}

export interface SimulationUnavailable {
  version: typeof SIMULATION_VERSION
  available: false
  reason: string
}

export type SimulationReport = GraphSimulation | SimulationUnavailable
