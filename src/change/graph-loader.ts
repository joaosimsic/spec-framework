import { loadRequirementSources } from "../core/requirements"
import { fail, ok, type Result } from "../core/result"
import {
  collectWorkspaceContributions,
  SpecGraphBuilder,
  type GraphWorkspace,
  type SpecGraph,
} from "../model"

export class ProposalGraphLoader {
  async load(target: string, workspace: GraphWorkspace): Promise<Result<SpecGraph, string>> {
    const sources = await loadRequirementSources(target)
    const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
    if (sourceErrors.length > 0) {
      return fail(sourceErrors.map((item) => item.message).join("\n"))
    }

    const builder = new SpecGraphBuilder()
    for (const contribution of await collectWorkspaceContributions(target, sources.blocks)) {
      builder.add(contribution)
    }

    const [graph, buildError] = builder.build(workspace)
    if (buildError !== null) return fail(`${buildError.code}: ${buildError.message}`)
    if (graph === null) return fail("graph builder returned no graph")

    return ok(graph)
  }
}
