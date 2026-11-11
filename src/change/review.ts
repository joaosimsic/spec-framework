import { SpecLockLoader } from "../approval/lock"
import type { SpecLock } from "../approval/types"
import type { Result } from "../core/result"
import type { ProcessRunner, ToolLocator } from "../core/runner"
import { GraphSimulator, type SimulationReport } from "../model"
import type { ProposalGit } from "./change"
import { GitProposalRepository } from "./git"
import { ProposalGraphSnapshotStore } from "./graph-store"
import { ProposalImpactAnalyzer } from "./impact"
import { ProposalStore } from "./store"
import type { ChangeReport, Proposal } from "./types"

export interface ProposalReportOptions {
  simulate?: boolean
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  gitRepository?: ProposalGit
}

export class ProposalReportReader {
  constructor(private readonly target: string) {}

  async read(options: ProposalReportOptions = {}): Promise<Result<ChangeReport, string>> {
    const git =
      options.gitRepository ??
      new GitProposalRepository(options.processRunner, options.toolLocator)
    const [state, stateError] = await git.readState(this.target)
    if (stateError !== null) return [null, `cannot read workspace: ${stateError}`]
    if (state === null) return [null, "workspace reader returned no metadata"]

    const [proposal, proposalError] = await new ProposalStore(this.target).loadForBranch(
      state.branch,
    )
    if (proposalError !== null) return [null, proposalError]
    if (proposal === null) return [null, "no active proposal"]

    const [lock, lockError] = await this.lock()
    if (lockError !== null) return [null, lockError]

    const [impact, impactError] = await new ProposalImpactAnalyzer(this.target).analyze(
      proposal,
      proposal.operations,
      lock,
    )
    if (impactError !== null) return [null, impactError]
    if (impact === null) return [null, "impact analysis failed"]

    const [simulation, simulationError] = await this.simulation(proposal, options.simulate)
    if (simulationError !== null) return [null, simulationError]

    return [
      {
        proposal,
        operations: [...proposal.operations],
        changes: [],
        impact: impact.impact,
        ...(simulation === null ? {} : { simulation }),
      },
      null,
    ]
  }

  private async lock(): Promise<Result<SpecLock | null, string>> {
    const [lock, lockError] = await new SpecLockLoader(this.target).load()
    if (lockError === null) return [lock, null]
    if (lockError.code === "SPEC-LOCK-NOT-FOUND") return [null, null]

    return [null, lockError.message]
  }

  private async simulation(
    proposal: Proposal,
    enabled: boolean | undefined,
  ): Promise<Result<SimulationReport | null, string>> {
    if (enabled === false) return [null, null]

    const store = new ProposalGraphSnapshotStore(this.target)
    const [snapshot, snapshotError] = await store.load(proposal.branch)
    if (snapshotError !== null) return [null, snapshotError]
    if (snapshot === null) return [null, null]

    const [current, currentError] = await new ProposalImpactAnalyzer(this.target).analyze(
      proposal,
      proposal.operations,
      null,
    )
    if (currentError !== null) return [null, currentError]
    if (current === null) return [null, "current graph unavailable"]

    return [new GraphSimulator().simulate(snapshot.graph, current.graph), null]
  }
}
