import { SpecLockLoader } from "../approval/lock"
import type { SpecLock } from "../approval/types"
import type { ProposalGit } from "../change/change"
import { GitProposalRepository } from "../change/git"
import { ProposalGraphLoader } from "../change/graph-loader"
import { ProposalStore } from "../change/store"
import type { GitProposalState, Proposal } from "../change/types"
import { fail, ok, type Result } from "../core/result"
import type { ProcessRunner, ToolLocator } from "../core/runner"
import { MappingCurationEngine } from "../discovery/curation"
import type { MappingCurationState, MappingSnapshot } from "../discovery/curation-types"
import { MappingSnapshotStore } from "../discovery/mapping-store"
import type { SpecGraph } from "../model/types"

export interface WorkbenchStateOptions {
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  gitRepository?: ProposalGit
}

export interface WorkbenchWorkspace {
  state: GitProposalState
  proposal: Proposal | null
  lock: SpecLock | null
}

export interface WorkbenchMappingState {
  proposal: Proposal
  snapshot: MappingSnapshot
  curation: MappingCurationState
}

export class WorkbenchStateReader {
  private readonly git: ProposalGit

  constructor(
    private readonly target: string,
    options: WorkbenchStateOptions = {},
  ) {
    this.git =
      options.gitRepository ?? new GitProposalRepository(options.processRunner, options.toolLocator)
  }

  get repository(): ProposalGit {
    return this.git
  }

  async readWorkspace(): Promise<Result<WorkbenchWorkspace, string>> {
    const [state, stateError] = await this.git.readState(this.target)
    if (stateError !== null) return fail(`cannot read workspace: ${stateError}`)
    if (state === null) return fail("workspace reader returned no metadata")

    const [proposal, proposalError] = await this.readProposal(state.branch)
    if (proposalError !== null) return fail(proposalError)

    const [lock, lockError] = await this.readLock()
    if (lockError !== null) return fail(lockError)

    return ok({ state, proposal, lock })
  }

  async readGraph(state: GitProposalState): Promise<Result<SpecGraph, string>> {
    const workspace = {
      workspace: "single-repo",
      commit: state.commit,
      dirty: !state.clean,
    }
    const [graph, graphError] = await new ProposalGraphLoader().load(this.target, workspace)
    if (graphError !== null) return fail(graphError)
    if (graph === null) return fail("graph loader returned no graph")

    return ok(graph)
  }

  async readMapping(): Promise<Result<WorkbenchMappingState, string>> {
    const [workspace, workspaceError] = await this.readWorkspace()
    if (workspaceError !== null) return fail(workspaceError)
    if (workspace === null) return fail("workspace unavailable")
    if (workspace.proposal === null) return fail("no active mapping proposal")
    if (workspace.proposal.mode !== "mapping")
      return fail("active proposal is not a mapping review")

    const [snapshot, snapshotError] = await new MappingSnapshotStore(this.target).load(
      workspace.proposal.branch,
    )
    if (snapshotError !== null) return fail(snapshotError)
    if (snapshot === null) return fail("mapping snapshot failed to load")

    const [engine, replayError] = MappingCurationEngine.replay(
      snapshot.map,
      snapshot.decisions,
      workspace.proposal.author,
    )
    if (replayError !== null) return fail(replayError)
    if (engine === null) return fail("curation replay failed")

    return ok({
      proposal: workspace.proposal,
      snapshot,
      curation: engine.state(),
    })
  }

  private async readProposal(branch: string): Promise<Result<Proposal | null, string>> {
    if (!branch.startsWith("spec/")) return ok(null)

    const [proposal, proposalError] = await new ProposalStore(this.target).loadForBranch(branch)
    if (proposalError !== null) return fail(proposalError)
    if (proposal === null) return fail("no active proposal")

    return ok(proposal)
  }

  private async readLock(): Promise<Result<SpecLock | null, string>> {
    const [lock, lockError] = await new SpecLockLoader(this.target).load()
    if (lockError === null) return ok(lock)
    if (lockError.code === "SPEC-LOCK-NOT-FOUND") return ok(null)

    return fail(lockError.message)
  }
}
