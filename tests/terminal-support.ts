import type { ProposalGit } from "../src/change/change"
import type { GitProposalState } from "../src/change/types"
import { ok, type Result } from "../src/core/result"
import type { TerminalIO } from "../src/terminal/io"

export class FakeTerminalIO implements TerminalIO {
  readonly output: string[] = []

  constructor(private readonly answers: string[]) {}

  async ask(message: string): Promise<string | null> {
    this.output.push(message)
    if (this.answers.length === 0) return null

    return this.answers.shift() ?? null
  }

  print(message: string): void {
    this.output.push(message)
  }

  close(): void {}
}

export class FakeProposalGit implements ProposalGit {
  readonly branches: string[] = []

  constructor(
    public state: GitProposalState = { branch: "main", commit: "base123", clean: true },
    public existingBranch = false,
  ) {}

  async readState(target: string): Promise<Result<GitProposalState, string>> {
    void target
    return ok(this.state)
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    void target
    void branch
    return ok(this.existingBranch)
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    void target
    void baseCommit
    this.branches.push(branch)
    return ok(branch)
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ok("tester")
  }
}
