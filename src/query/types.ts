import type { Result } from "../core/result"
import type { ProcessRunner, ToolLocator } from "../core/runner"
import type { GraphWorkspace, SpecGraph } from "../model/types"

export interface WorkspaceMetadataReader {
  read(target: string): Promise<Result<GraphWorkspace, string>>
}

export type QueryView = "identity" | "experience"

export interface QueryOptions {
  id?: string
  kind?: string
  status?: string
  json?: boolean
  technical?: boolean
  view?: QueryView
  allowDirty?: boolean
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  workspaceReader?: WorkspaceMetadataReader
  toolVersions?: Record<string, string>
}

export interface QueryRun {
  graph: SpecGraph | null
  output: string
  code: number
}
