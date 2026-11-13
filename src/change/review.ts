import { SpecLockLoader } from "../approval/lock"
import type { SpecLock } from "../approval/types"
import { fail, ok, type Result } from "../core/result"
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
      options.gitRepository ?? new GitProposalRepository(options.processRunner, options.toolLocator)
    const [state, stateError] = await git.readState(this.target)
    if (stateError !== null) return fail(`cannot read workspace: ${stateError}`)
    if (state === null) return fail("workspace reader returned no metadata")

    const [proposal, proposalError] = await new ProposalStore(this.target).loadForBranch(
      state.branch,
    )
    if (proposalError !== null) return fail(proposalError)
    if (proposal === null) return fail("no active proposal")

    const [lock, lockError] = await this.lock()
    if (lockError !== null) return fail(lockError)

    const [impact, impactError] = await new ProposalImpactAnalyzer(this.target).analyze(
      proposal,
      proposal.operations,
      lock,
    )
    if (impactError !== null) return fail(impactError)
    if (impact === null) return fail("impact analysis failed")

    const [simulation, simulationError] = await this.simulation(proposal, options.simulate)
    if (simulationError !== null) return fail(simulationError)

    return ok({
      proposal,
      operations: [...proposal.operations],
      changes: [],
      impact: impact.impact,
      ...(simulation === null ? {} : { simulation }),
    })
  }

  private async lock(): Promise<Result<SpecLock | null, string>> {
    const [lock, lockError] = await new SpecLockLoader(this.target).load()
    if (lockError === null) return ok(lock)
    if (lockError.code === "SPEC-LOCK-NOT-FOUND") return ok(null)

    return fail(lockError.message)
  }

  private async simulation(
    proposal: Proposal,
    enabled: boolean | undefined,
  ): Promise<Result<SimulationReport | null, string>> {
    if (enabled === false) return ok(null)

    const store = new ProposalGraphSnapshotStore(this.target)
    const [snapshot, snapshotError] = await store.load(proposal.branch)
    if (snapshotError !== null) return fail(snapshotError)
    if (snapshot === null) return ok(null)

    const [current, currentError] = await new ProposalImpactAnalyzer(this.target).analyze(
      proposal,
      proposal.operations,
      null,
    )
    if (currentError !== null) return fail(currentError)
    if (current === null) return fail("current graph unavailable")

    return ok(new GraphSimulator().simulate(snapshot.graph, current.graph))
  }
}
