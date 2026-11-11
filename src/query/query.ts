import pkg from "../../package.json"
import { SpecConfigLoader } from "../core/config"
import { lintBlocks } from "../core/lint"
import { loadRequirementSources } from "../core/requirements"
import type { Diagnostic } from "../core/types"
import { SpecGraphBuilder, RequirementsGraphSource } from "../model/index"
import type { GraphElement, GraphStatus, SpecGraph } from "../model/types"
import { GitWorkspaceReader } from "./git"
import type { QueryOptions, QueryRun, WorkspaceMetadataReader } from "./types"

const STATE_LABELS: Record<GraphStatus, string> = {
  draft: "Draft - not reviewed",
  proposed: "Ready for review",
  approved: "Approved",
  deprecated: "Retired",
  unknown: "State unavailable",
}

const KIND_LABELS: Record<string, string> = {
  requirement: "requirement",
  acceptance_criterion: "acceptance criterion",
}

export async function runQuery(target: string, options: QueryOptions = {}): Promise<QueryRun> {
  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError !== null) return failure(configError.message)
  if (config === null) return failure("config loader returned no configuration")

  const sources = await loadRequirementSources(target)
  const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
  if (sourceErrors.length > 0) return failure(messages(sourceErrors))

  const structural = lintBlocks(sources.blocks)
  const structuralErrors = structural.diagnostics.filter((item) => item.level === "error")
  if (structuralErrors.length > 0) return failure(messages(structuralErrors))

  const workspaceReader: WorkspaceMetadataReader =
    options.workspaceReader ??
    new GitWorkspaceReader(options.processRunner, options.toolLocator)
  const [workspace, workspaceError] = await workspaceReader.read(target)
  if (workspaceError !== null) return failure(`cannot read workspace: ${workspaceError}`)
  if (workspace === null) return failure("workspace reader returned no metadata")
  if (workspace.dirty && options.allowDirty !== true) {
    return failure("git tree is dirty; commit the model or pass --allow-dirty")
  }

  const builder = new SpecGraphBuilder()
  builder.add(new RequirementsGraphSource().collect(sources.blocks))

  const [built, buildError] = builder.build(
    workspace,
    options.toolVersions ?? {
      spec: pkg.version,
    },
  )
  if (buildError !== null) return failure(`${buildError.code}: ${buildError.message}`)
  if (built === null) return failure("graph builder returned no graph")

  const graph = filterGraph(built, options)
  if (options.id !== undefined && graph.elements.length === 0) {
    return failure(`unknown element: ${options.id}`)
  }

  return {
    graph,
    output: options.json === true ? JSON.stringify(graph, null, 2) : renderText(graph),
    code: 0,
  }
}

function filterGraph(graph: SpecGraph, options: QueryOptions): SpecGraph {
  const kind = options.kind?.toLowerCase()
  const status = options.status?.toLowerCase()
  const elements = graph.elements.filter((element) => matches(element, options.id, kind, status))
  const elementIds = new Set(elements.map((element) => element.id))
  const findings = graph.findings.filter(
    (finding) => finding.id === undefined || elementIds.has(finding.id),
  )

  return { ...graph, elements, findings }
}

function matches(
  element: GraphElement,
  id: string | undefined,
  kind: string | undefined,
  status: string | undefined,
): boolean {
  if (id !== undefined && element.id !== id) return false
  if (kind !== undefined && element.kind !== kind) return false
  if (status !== undefined && element.status !== status) return false

  return true
}

function renderText(graph: SpecGraph): string {
  const lines = graph.elements.map((element) => {
    const label = element.title ?? "(untitled)"
    const state = element.status === undefined ? "State unavailable" : STATE_LABELS[element.status]
    return `${label} - ${state} (${KIND_LABELS[element.kind] ?? element.kind})`
  })
  lines.push("")
  lines.push(`${graph.elements.length} element(s)`)

  return lines.join("\n")
}

function messages(diagnostics: Diagnostic[]): string {
  return diagnostics.map((item) => item.message).join("\n")
}

function failure(message: string): QueryRun {
  return { graph: null, output: `query failed: ${message}`, code: 1 }
}
