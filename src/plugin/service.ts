import { ProposalOperationParser } from "../change/operation-parser"
import type { ProposalOperation } from "../change"
import { fail, ok, type Result } from "../core/result"
import { WorkbenchGraphDisplay } from "../workbench/graph-display"
import { WorkbenchService, type WorkbenchServiceOptions } from "../workbench/service"
import { WorkbenchStateReader } from "../workbench/state"
import type { WorkbenchCurationRequest } from "../workbench/types"
import type { WorkbenchFailure } from "../workbench/failure"
import {
  PLUGIN_CONTRACT_VERSION,
  type PluginChangeView,
  type PluginCheckView,
  type PluginContextView,
  type PluginDecisionRequest,
  type PluginDiffView,
  type PluginFailure,
  type PluginImpactView,
  type PluginNextView,
  type PluginProposalRequest,
  type PluginQueryView,
  type PluginStatusView,
  type PluginTechnicalView,
} from "./types"

export interface SpecPluginServiceOptions extends WorkbenchServiceOptions {
  workbench?: WorkbenchService
  state?: WorkbenchStateReader
}

export class SpecPluginService {
  private readonly workbench: WorkbenchService
  private readonly state: WorkbenchStateReader

  constructor(
    private readonly target: string,
    options: SpecPluginServiceOptions = {},
  ) {
    this.workbench = options.workbench ?? new WorkbenchService(target, options)
    this.state = options.state ?? new WorkbenchStateReader(target, options)
  }

  async status(): Promise<Result<PluginStatusView, PluginFailure>> {
    const [workspace, workspaceError] = await this.state.readWorkspace()
    if (workspaceError !== null) return this.fail("SPEC-PLUGIN-STATE", workspaceError)
    if (workspace === null) return this.fail("SPEC-PLUGIN-STATE", "workspace unavailable")

    const [graph, graphError] = await this.state.readGraph(workspace.state)
    if (graphError !== null) return this.fail("SPEC-PLUGIN-GRAPH", graphError)
    if (graph === null) return this.fail("SPEC-PLUGIN-GRAPH", "graph unavailable")

    const display = new WorkbenchGraphDisplay(graph)
    const proposal =
      workspace.proposal === null ? null : display.labels.proposal(workspace.proposal)
    const [context, contextError] = await this.workbench.context([])
    if (contextError !== null) return this.failure(contextError)
    if (context === null) return this.fail("SPEC-PLUGIN-CONTEXT", "context unavailable")

    const approved =
      workspace.lock === null
        ? []
        : Object.keys(workspace.lock.elements)
            .sort()
            .map((id) => display.labels.named(id))

    return ok({
      contract: PLUGIN_CONTRACT_VERSION,
      mode: workspace.proposal?.mode ?? "read-only",
      commit: workspace.state.commit,
      dirty: !workspace.state.clean,
      proposal,
      approved,
      blockers: context.blockers,
      openQuestions: context.openQuestions,
      prompts: context.prompts,
      next: context.next,
    })
  }

  async context(names: string[] = []): Promise<Result<PluginContextView, PluginFailure>> {
    const [view, error] = await this.workbench.context(names)
    if (error !== null) return this.failure(error)
    if (view === null) return this.fail("SPEC-PLUGIN-CONTEXT", "context unavailable")

    return ok(view)
  }

  async query(input: {
    name?: string
    ref?: string
    kind?: string
    status?: string
  }): Promise<Result<PluginQueryView, PluginFailure>> {
    const [graph, graphError] = await this.workbench.graph()
    if (graphError !== null) return this.failure(graphError)
    if (graph === null) return this.fail("SPEC-PLUGIN-GRAPH", "graph unavailable")

    const handle = input.ref ?? input.name
    if (handle !== undefined) {
      const matches = graph.entries.filter(
        (entry) =>
          entry.ref === handle ||
          entry.technical.id === handle ||
          entry.label.toLowerCase() === handle.toLowerCase(),
      )
      if (matches.length === 0) return this.fail("SPEC-PLUGIN-NOT-FOUND", `unknown item: ${handle}`)
      if (matches.length > 1) {
        return fail({
          code: "SPEC-PLUGIN-AMBIGUOUS",
          message: `more than one item is named '${handle}'`,
          choices: matches.map((entry) => ({
            label: entry.label,
            context: entry.kindLabel,
          })),
        })
      }

      return ok({ commit: graph.commit, dirty: graph.dirty, entries: matches })
    }

    const kind = input.kind?.toLowerCase()
    const status = input.status?.toLowerCase()
    const entries = graph.entries.filter(
      (entry) =>
        (kind === undefined || entry.technical.kind.toLowerCase() === kind) &&
        (status === undefined || entry.technical.status?.toLowerCase() === status),
    )

    return ok({ commit: graph.commit, dirty: graph.dirty, entries })
  }

  async next(): Promise<Result<PluginNextView, PluginFailure>> {
    const [context, contextError] = await this.workbench.context([])
    if (contextError !== null) return this.failure(contextError)
    if (context === null) return this.fail("SPEC-PLUGIN-CONTEXT", "context unavailable")

    return ok({
      prompts: context.prompts,
      next: context.next,
      blockers: context.blockers,
      openQuestions: context.openQuestions,
    })
  }

  async impact(): Promise<Result<PluginImpactView, PluginFailure>> {
    const [view, error] = await this.workbench.impact()
    if (error !== null) return this.failure(error)
    if (view === null) return this.fail("SPEC-PLUGIN-IMPACT", "impact unavailable")

    return ok(view)
  }

  async diff(): Promise<Result<PluginDiffView, PluginFailure>> {
    const [view, error] = await this.workbench.diff()
    if (error !== null) return this.failure(error)
    if (view === null) return this.fail("SPEC-PLUGIN-DIFF", "diff unavailable")

    return ok(view)
  }

  async change(): Promise<Result<PluginChangeView, PluginFailure>> {
    const [view, error] = await this.workbench.change()
    if (error !== null) return this.failure(error)
    if (view === null) return this.fail("SPEC-PLUGIN-CHANGE", "change view unavailable")

    return ok(view)
  }

  async validate(structural = false): Promise<Result<PluginCheckView, PluginFailure>> {
    const [view, error] = await this.workbench.check(structural)
    if (error !== null) return this.failure(error)
    if (view === null) return this.fail("SPEC-PLUGIN-CHECK", "check view unavailable")

    return ok(view)
  }

  parseOperations(text: string): Result<ProposalOperation[], PluginFailure> {
    const [operations, error] = ProposalOperationParser.parseJson(text)
    if (error !== null || operations === null) {
      return fail({ code: "SPEC-PLUGIN-BAD-OPERATION", message: error ?? "operations failed" })
    }

    return ok(operations)
  }

  async propose(
    request: PluginProposalRequest,
    proposalRef?: string,
  ): Promise<Result<PluginChangeView, PluginFailure>> {
    if (request.operations.length === 0) {
      return this.fail("SPEC-PLUGIN-BAD-REQUEST", "no operations supplied")
    }

    const [ref, refError] = await this.proposalRef(proposalRef)
    if (refError !== null) return fail(refError)
    if (ref === null) return this.fail("SPEC-PLUGIN-NO-PROPOSAL", "no active proposal")

    const [view, error] = await this.workbench.operations(
      ref,
      request.operations,
      request.simulate ?? false,
    )
    if (error !== null) return this.failure(error)
    if (view === null) return this.fail("SPEC-PLUGIN-CHANGE", "change view unavailable")

    return ok(view)
  }

  async decide(request: PluginDecisionRequest): Promise<Result<PluginChangeView, PluginFailure>> {
    const text = request.text.replace(/\s+/g, " ").trim()
    if (text === "") return this.fail("SPEC-PLUGIN-BAD-REQUEST", "decision text is required")

    const operation: ProposalOperation =
      request.kind === "decision"
        ? {
            kind: "record-decision",
            title: shortTitle(text),
            statement: text,
            ...(request.target === undefined ? {} : { target: request.target }),
            ...(request.owner === undefined ? {} : { owner: request.owner }),
          }
        : {
            kind: "record-open-question",
            question: text,
            ...(request.target === undefined ? {} : { target: request.target }),
            ...(request.owner === undefined ? {} : { owner: request.owner }),
          }

    return this.propose({ operations: [operation], simulate: false })
  }

  async mappingActions(
    actions: WorkbenchCurationRequest[],
  ): Promise<Result<PluginChangeView, PluginFailure>> {
    const [mapping, error] = await this.workbench.applyMapping(actions)
    if (error !== null) return this.failure(error)
    if (mapping === null) return this.fail("SPEC-PLUGIN-MAPPING", "mapping unavailable")

    const [change, changeError] = await this.workbench.change()
    if (changeError !== null) return this.failure(changeError)
    if (change === null) return this.fail("SPEC-PLUGIN-CHANGE", "change view unavailable")

    return ok(change)
  }

  async technical(proposalRef?: string): Promise<Result<PluginTechnicalView, PluginFailure>> {
    const [ref, refError] = await this.proposalRef(proposalRef)
    if (refError !== null) return fail(refError)
    if (ref === null) return this.fail("SPEC-PLUGIN-NO-PROPOSAL", "no active proposal")

    const [view, error] = await this.workbench.technical(ref)
    if (error !== null) return this.failure(error)
    if (view === null) return this.fail("SPEC-PLUGIN-TECHNICAL", "technical view unavailable")

    return ok(view)
  }

  private async proposalRef(supplied: string | undefined): Promise<Result<string, PluginFailure>> {
    if (supplied !== undefined && supplied.trim() !== "") return ok(supplied.trim())

    const [session, sessionError] = await this.workbench.session("plugin", false)
    if (sessionError !== null) return this.failure(sessionError)
    if (session === null) return this.fail("SPEC-PLUGIN-STATE", "workspace unavailable")
    if (session.proposal === null) {
      return this.fail(
        "SPEC-PLUGIN-NO-PROPOSAL",
        "no active proposal; open one from the CLI before proposing changes",
      )
    }

    return ok(session.proposal.ref)
  }

  private failure(failure: WorkbenchFailure): Result<never, PluginFailure> {
    return fail({
      code: failure.code,
      message: failure.message,
      ...(failure.choices === undefined ? {} : { choices: failure.choices }),
    })
  }

  private fail(code: string, message: string): Result<never, PluginFailure> {
    return fail({ code, message })
  }
}

function shortTitle(text: string): string {
  const first = text.split(/[.!?]/)[0]?.trim() ?? text
  if (first.length <= 80) return first

  return `${first.slice(0, 77).trimEnd()}...`
}
