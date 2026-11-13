import { ArchitectureCatalogLoader } from "../approval/architecture"
import { SpecConfigLoader } from "../core/config"
import { runCheck } from "../core/check"
import { runMap } from "../core/map"
import { runMapReview } from "../core/map-review"
import { fail, ok, type Result } from "../core/result"
import type { ProcessRunner, ToolLocator } from "../core/runner"
import type { ProposalGit } from "../change/change"
import { runProposalOperations } from "../change/change"
import { ProposalReportReader } from "../change/review"
import { ScratchBriefingFactory } from "../change/start"
import type { ChangeReport, Proposal, ProposalOperation } from "../change/types"
import type { SpecGraph } from "../model/types"
import { WorkbenchArchitectureGraphDisplay } from "./architecture-graph-display"
import { TypeScriptSymbolReader } from "./code-symbols"
import { WorkbenchChangeDisplay } from "./change-display"
import { WorkbenchFailureFactory, type WorkbenchFailure } from "./failure"
import { WorkbenchGraphDisplay } from "./graph-display"
import { WorkbenchMappingDisplay } from "./mapping-display"
import { WorkbenchOperationResolver } from "./operation-resolver"
import { WorkbenchRepoGraphDisplay } from "./repo-graph-display"
import { WorkbenchStateReader, type WorkbenchStateOptions } from "./state"
import type {
  WorkbenchArchitectureGraphView,
  WorkbenchChangeView,
  WorkbenchCheckView,
  WorkbenchContextView,
  WorkbenchCurationRequest,
  WorkbenchDiffView,
  WorkbenchGraphView,
  WorkbenchImpactView,
  WorkbenchMappingView,
  WorkbenchProposalSummary,
  WorkbenchRepoGraphView,
  WorkbenchSession,
  WorkbenchTechnicalView,
} from "./types"

export interface WorkbenchServiceOptions extends WorkbenchStateOptions {
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  gitRepository?: ProposalGit
  now?: () => Date
}

export class WorkbenchService {
  private readonly state: WorkbenchStateReader

  constructor(
    private readonly target: string,
    private readonly options: WorkbenchServiceOptions = {},
  ) {
    this.state = new WorkbenchStateReader(target, options)
  }

  async session(
    csrfToken: string,
    assetReady: boolean,
  ): Promise<Result<WorkbenchSession, WorkbenchFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return fail(WorkbenchFailureFactory.internal(workspaceError))
    if (workspace === null) return fail(WorkbenchFailureFactory.internal("workspace unavailable"))

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return fail(WorkbenchFailureFactory.internal(graphError))
    if (graph === null) return fail(WorkbenchFailureFactory.internal("graph unavailable"))

    const display = new WorkbenchGraphDisplay(graph)
    const proposal =
      workspace.proposal === null ? null : display.labels.proposal(workspace.proposal)

    return ok({
      csrf_token: csrfToken,
      mode: workspace.proposal?.mode ?? "read-only",
      commit: workspace.state.commit,
      dirty: !workspace.state.clean,
      proposal,
      views: this.views(workspace.proposal),
      asset_ready: assetReady,
    })
  }

  async graph(): Promise<Result<WorkbenchGraphView, WorkbenchFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return fail(WorkbenchFailureFactory.internal(workspaceError))
    if (workspace === null) return fail(WorkbenchFailureFactory.internal("workspace unavailable"))

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return fail(WorkbenchFailureFactory.internal(graphError))
    if (graph === null) return fail(WorkbenchFailureFactory.internal("graph unavailable"))

    return ok(new WorkbenchGraphDisplay(graph).view())
  }

  async context(names: string[]): Promise<Result<WorkbenchContextView, WorkbenchFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return fail(WorkbenchFailureFactory.internal(workspaceError))
    if (workspace === null) return fail(WorkbenchFailureFactory.internal("workspace unavailable"))

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return fail(WorkbenchFailureFactory.internal(graphError))
    if (graph === null) return fail(WorkbenchFailureFactory.internal("graph unavailable"))

    const display = new WorkbenchGraphDisplay(graph)
    const proposal =
      workspace.proposal === null ? null : display.labels.proposal(workspace.proposal)
    const [prompts, next] = await this.contextGuidance(workspace.proposal, proposal)
    const [context, contextError] = display.context(proposal, names, prompts, next)
    if (contextError !== null) return fail(this.displayFailure(contextError))

    return ok(context)
  }

  async architectureGraph(): Promise<Result<WorkbenchArchitectureGraphView, WorkbenchFailure>> {
    const [catalog, catalogError] = await new ArchitectureCatalogLoader(this.target).load()
    if (catalogError !== null) {
      return fail(WorkbenchFailureFactory.internal(catalogError))
    }
    if (catalog === null) {
      return fail(WorkbenchFailureFactory.internal("architecture model unavailable"))
    }

    const hasCodePaths = catalog.elements.some(
      (element) => (element.annotation.metadata["code"]?.trim() ?? "") !== "",
    )
    const discovery = hasCodePaths
      ? await runMap(this.target, {
          processRunner: this.options.processRunner,
          toolLocator: this.options.toolLocator,
        })
      : null
    const report = discovery?.code === 0 ? discovery.report : null
    const sourcePaths =
      report?.elements.flatMap((element) => (element.kind === "module" ? [element.title] : [])) ??
      []
    const symbolsByPath = await new TypeScriptSymbolReader(this.target).read(sourcePaths)

    return ok(new WorkbenchArchitectureGraphDisplay(catalog, report, symbolsByPath).view())
  }

  async repoGraph(): Promise<Result<WorkbenchRepoGraphView, WorkbenchFailure>> {
    const run = await runMap(this.target, {
      processRunner: this.options.processRunner,
      toolLocator: this.options.toolLocator,
    })
    if (run.code !== 0 || run.report === null) {
      return fail(WorkbenchFailureFactory.internal(run.output))
    }

    return ok(new WorkbenchRepoGraphDisplay(run.report).view())
  }

  async mapping(): Promise<Result<WorkbenchMappingView, WorkbenchFailure>> {
    const [mapping, mappingError] = await this.state.readMapping()
    if (mappingError !== null) return fail(WorkbenchFailureFactory.notFound(mappingError))
    if (mapping === null) return fail(WorkbenchFailureFactory.notFound("no mapping review"))

    return ok(new WorkbenchMappingDisplay(mapping).view())
  }

  async applyMapping(
    actions: WorkbenchCurationRequest[],
  ): Promise<Result<WorkbenchMappingView, WorkbenchFailure>> {
    const [mapping, mappingError] = await this.state.readMapping()
    if (mappingError !== null) return fail(WorkbenchFailureFactory.notFound(mappingError))
    if (mapping === null) return fail(WorkbenchFailureFactory.notFound("no mapping review"))

    const [resolved, resolutionError] = new WorkbenchMappingDisplay(mapping).resolve(actions)
    if (resolutionError !== null) {
      return fail({
        code: resolutionError.code,
        message: resolutionError.message,
        status: resolutionError.code === "WORKBENCH-AMBIGUOUS" ? 409 : 404,
        ...(resolutionError.choices === undefined ? {} : { choices: resolutionError.choices }),
      })
    }
    if (resolved === null) return fail(WorkbenchFailureFactory.badRequest("no actions supplied"))

    const run = await runMapReview(this.target, {
      actions: resolved,
      author: mapping.proposal.author,
      now: this.options.now,
      processRunner: this.options.processRunner,
      toolLocator: this.options.toolLocator,
      gitRepository: this.options.gitRepository,
    })
    if (run.code !== 0) return fail(WorkbenchFailureFactory.badRequest(run.output))

    const [updated, updatedError] = await this.state.readMapping()
    if (updatedError !== null) return fail(WorkbenchFailureFactory.internal(updatedError))
    if (updated === null)
      return fail(WorkbenchFailureFactory.internal("mapping review unavailable"))

    return ok(new WorkbenchMappingDisplay(updated).view())
  }

  async change(): Promise<Result<WorkbenchChangeView, WorkbenchFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return fail(WorkbenchFailureFactory.internal(workspaceError))
    if (workspace === null) return fail(WorkbenchFailureFactory.internal("workspace unavailable"))
    if (workspace.proposal === null) return fail(this.noProposal())

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return fail(WorkbenchFailureFactory.internal(graphError))
    if (graph === null) return fail(WorkbenchFailureFactory.internal("graph unavailable"))

    const [report, reportError] = await new ProposalReportReader(this.target).read({
      simulate: true,
      processRunner: this.options.processRunner,
      toolLocator: this.options.toolLocator,
      gitRepository: this.options.gitRepository,
    })
    if (reportError !== null) return fail(WorkbenchFailureFactory.internal(reportError))
    if (report === null)
      return fail(WorkbenchFailureFactory.internal("proposal report unavailable"))

    return ok(new WorkbenchChangeDisplay(graph).view(report))
  }

  async impact(): Promise<Result<WorkbenchImpactView, WorkbenchFailure>> {
    const [view, viewError] = await this.change()
    if (viewError !== null) return fail(viewError)
    if (view === null) return fail(WorkbenchFailureFactory.internal("change view unavailable"))

    return ok(view.impact)
  }

  async diff(): Promise<Result<WorkbenchDiffView, WorkbenchFailure>> {
    const [view, viewError] = await this.change()
    if (viewError !== null) return fail(viewError)
    if (view === null) return fail(WorkbenchFailureFactory.internal("change view unavailable"))

    return ok(view.diff)
  }

  async check(structural: boolean): Promise<Result<WorkbenchCheckView, WorkbenchFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return fail(WorkbenchFailureFactory.internal(workspaceError))
    if (workspace === null) return fail(WorkbenchFailureFactory.internal("workspace unavailable"))

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return fail(WorkbenchFailureFactory.internal(graphError))
    if (graph === null) return fail(WorkbenchFailureFactory.internal("graph unavailable"))

    const run = await runCheck(this.target, {
      structural,
      json: true,
      processRunner: this.options.processRunner,
      toolLocator: this.options.toolLocator,
    })

    return ok(new WorkbenchGraphDisplay(graph).check(run.result))
  }

  async operations(
    proposalRef: string,
    operations: ProposalOperation[],
    simulate: boolean,
  ): Promise<Result<WorkbenchChangeView, WorkbenchFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return fail(WorkbenchFailureFactory.internal(workspaceError))
    if (workspace === null) return fail(WorkbenchFailureFactory.internal("workspace unavailable"))
    if (workspace.proposal === null) return fail(this.noProposal())

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return fail(WorkbenchFailureFactory.internal(graphError))
    if (graph === null) return fail(WorkbenchFailureFactory.internal("graph unavailable"))

    const display = new WorkbenchGraphDisplay(graph)
    const expectedRef = display.labels.proposal(workspace.proposal).ref
    if (proposalRef !== expectedRef) {
      return fail(WorkbenchFailureFactory.conflict("the proposal changed; reload the workbench"))
    }

    const [resolved, resolveError] = new WorkbenchOperationResolver(display).resolve(operations)
    if (resolveError !== null) return fail(resolveError)
    if (resolved === null) return fail(WorkbenchFailureFactory.badRequest("no operations supplied"))

    const run = await runProposalOperations(this.target, resolved, {
      simulate,
      processRunner: this.options.processRunner,
      toolLocator: this.options.toolLocator,
      gitRepository: this.options.gitRepository,
      now: this.options.now,
    })
    if (run.code !== 0 || run.report === null) {
      return fail(WorkbenchFailureFactory.badRequest(run.output))
    }

    return ok(this.changedView(run.report, graph))
  }

  async technical(proposalRef: string): Promise<Result<WorkbenchTechnicalView, WorkbenchFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return fail(WorkbenchFailureFactory.internal(workspaceError))
    if (workspace === null) return fail(WorkbenchFailureFactory.internal("workspace unavailable"))
    if (workspace.proposal === null) return fail(this.noProposal())

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return fail(WorkbenchFailureFactory.internal(graphError))
    if (graph === null) return fail(WorkbenchFailureFactory.internal("graph unavailable"))

    const expectedRef = new WorkbenchGraphDisplay(graph).labels.proposal(workspace.proposal).ref
    if (proposalRef !== expectedRef) {
      return fail(WorkbenchFailureFactory.conflict("the proposal changed; reload the workbench"))
    }

    const [config, configError] = await new SpecConfigLoader(this.target).load()
    if (configError !== null) return fail(WorkbenchFailureFactory.internal(configError.message))
    if (config === null) return fail(WorkbenchFailureFactory.internal("config unavailable"))

    const [mapping] = await this.state.readMapping()

    return ok({
      proposal: workspace.proposal,
      graph,
      lock: workspace.lock,
      mapping: mapping?.curation ?? null,
      adapters: config?.adapters ?? null,
      toolVersions: graph.tool_versions,
    })
  }

  private changedView(report: ChangeReport, graph: SpecGraph): WorkbenchChangeView {
    return new WorkbenchChangeDisplay(graph).view(report)
  }

  private async contextGuidance(
    proposal: Proposal | null,
    summary: WorkbenchProposalSummary | null,
  ): Promise<[string[], string[]]> {
    if (proposal === null) {
      return [[], ["Open a proposal from the CLI to begin planning."]]
    }

    if (proposal.mode === "scratch") {
      const briefing = ScratchBriefingFactory.build(proposal.direction)
      return [briefing.prompts, briefing.next]
    }

    if (proposal.mode === "mapping") {
      const [mapping] = await this.state.readMapping()
      if (mapping !== null) {
        const view = new WorkbenchMappingDisplay(mapping).view()
        return [[], view.next]
      }
    }

    void summary
    return [
      [],
      [
        "Review the before and after state and the affected approvals.",
        "Run spec check.",
        "Approve the changed scope in the CLI.",
      ],
    ]
  }

  private views(proposal: Proposal | null): string[] {
    if (proposal === null) return ["architecture", "code", "overview"]
    if (proposal.mode === "mapping") {
      return ["architecture", "code", "overview", "map", "review", "technical"]
    }
    if (proposal.mode === "scratch") {
      return ["architecture", "code", "overview", "compose", "review", "technical"]
    }

    return ["architecture", "code", "overview", "rework", "review", "technical"]
  }

  private noProposal(): WorkbenchFailure {
    return {
      code: "WORKBENCH-NO-PROPOSAL",
      message: "No active proposal. Open one from the CLI first.",
      status: 404,
    }
  }

  private displayFailure(failure: {
    code: string
    message: string
    choices?: Array<{ ref: string; label: string; context: string }>
  }): WorkbenchFailure {
    const choices = failure.choices?.map((choice) => ({
      label: choice.label,
      context: choice.context,
    }))

    return {
      code: failure.code,
      message: failure.message,
      status: failure.code === "DISPLAY-AMBIGUOUS" ? 409 : 404,
      ...(choices === undefined ? {} : { choices }),
    }
  }
}
