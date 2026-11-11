import { ProposalStore } from "../change/store"
import { GitProposalRepository } from "../change/git"
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

  async read(target: string): Promise<[ProposalContext | null, string | null]> {
    const [state, stateError] = await this.git.readState(target)
    if (stateError !== null) return [null, `cannot read proposal branch: ${stateError}`]
    if (state === null) return [null, "proposal branch reader returned no state"]
    if (!state.branch.startsWith("spec/")) return [null, null]

    const [proposal, proposalError] = await new ProposalStore(target).loadForBranch(state.branch)
    if (proposalError !== null) return [null, proposalError]
    if (proposal === null) return [null, "active proposal was not found"]

    return [{ branch: state.branch, proposal }, null]
  }
}
