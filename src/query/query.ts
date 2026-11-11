import pkg from "../../package.json"
import { SpecConfigLoader } from "../core/config"
import { lintBlocks } from "../core/lint"
import { loadRequirementSources } from "../core/requirements"
import type { Diagnostic } from "../core/types"
import { EvidenceStore } from "../evidence"
import { collectWorkspaceContributions, DisplayProjection, SpecGraphBuilder } from "../model/index"
import type { GraphElement, SpecGraph } from "../model/types"
import { GitWorkspaceReader } from "./git"
import { renderHuman, renderTechnical } from "./render"
import type { QueryOptions, QueryRun, WorkspaceMetadataReader } from "./types"

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
    options.workspaceReader ?? new GitWorkspaceReader(options.processRunner, options.toolLocator)
  const [workspace, workspaceError] = await workspaceReader.read(target)
  if (workspaceError !== null) return failure(`cannot read workspace: ${workspaceError}`)
  if (workspace === null) return failure("workspace reader returned no metadata")
  if (workspace.dirty && options.allowDirty !== true) {
    return failure("git tree is dirty; commit the model or pass --allow-dirty")
  }

  const builder = new SpecGraphBuilder()
  for (const contribution of await collectWorkspaceContributions(target, sources.blocks)) {
    builder.add(contribution)
  }
  const storedEvidence = await new EvidenceStore(target).loadAll()
  builder.add({
    elements: [],
    evidence: storedEvidence.records.map((record) => ({
      id: record.id,
      kind: record.kind,
      method: record.method,
      result: record.result,
      hash: record.hash,
    })),
    findings: storedEvidence.failures.map((failure) => ({
      level: "warning",
      code: failure.code,
      message: failure.message,
    })),
  })

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

  const projection = new DisplayProjection(graph)

  return {
    graph,
    output: outputFor(graph, projection, options),
    code: 0,
  }
}

function outputFor(graph: SpecGraph, projection: DisplayProjection, options: QueryOptions): string {
  if (options.json === true && options.view === "experience") {
    return JSON.stringify(projection.model, null, 2)
  }
  if (options.json === true) return JSON.stringify(graph, null, 2)
  if (options.technical === true) return renderTechnical(projection.model)

  return renderHuman(projection.model)
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

function messages(diagnostics: Diagnostic[]): string {
  return diagnostics.map((item) => item.message).join("\n")
}

function failure(message: string): QueryRun {
  return { graph: null, output: `query failed: ${message}`, code: 1 }
}
