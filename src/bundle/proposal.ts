import { ProposalStore } from "../change/store"
import { GitProposalRepository } from "../change/git"
import { fail, ok, type Result } from "../core/result"
import type { ProcessRunner, ToolLocator } from "../core/runner"
import type { ProposalContext, ProposalContextReader } from "./types"

export class BranchProposalReader implements ProposalContextReader {
  private readonly git: GitProposalRepository

  constructor(processRunner?: ProcessRunner, toolLocator?: ToolLocator) {
    this.git =
      processRunner === undefined && toolLocator === undefined
        ? new GitProposalRepository()
        : new GitProposalRepository(processRunner, toolLocator)
  }

  async read(target: string): Promise<Result<ProposalContext | null, string>> {
    const [state, stateError] = await this.git.readState(target)
    if (stateError !== null) return fail(`cannot read proposal branch: ${stateError}`)
    if (state === null) return fail("proposal branch reader returned no state")
    if (!state.branch.startsWith("spec/")) return ok(null)

    const [proposal, proposalError] = await new ProposalStore(target).loadForBranch(state.branch)
    if (proposalError !== null) return fail(proposalError)
    if (proposal === null) return fail("active proposal was not found")

    return ok({ branch: state.branch, proposal })
  }
}
