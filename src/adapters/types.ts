import type { ProcessRunner, ToolLocator } from "../core/runner"
import type { Diagnostic } from "../core/types"
import type { EvidenceRecord } from "../evidence"

export interface AdapterContext {
  target: string
  processRunner: ProcessRunner
  toolLocator: ToolLocator
}

export interface AdapterRun {
  ran: boolean
  diagnostics: Diagnostic[]
  evidence?: EvidenceRecord[]
}

export interface NativeAdapter {
  readonly id: string
  readonly tool: string
  readonly requiredTools?: readonly string[]
  detect?(target: string): Promise<boolean>
  run(context: AdapterContext): Promise<AdapterRun>
}
