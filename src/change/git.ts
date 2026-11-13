import { fail, ok, type Result } from "../core/result"
import {
  BunProcessRunner,
  ToolResolver,
  type CommandResult,
  type ProcessRunner,
  type ToolLocator,
} from "../core/runner"
import type { GitProposalState } from "./types"

export class GitProposalRepository {
  constructor(
    private readonly processRunner: ProcessRunner = new BunProcessRunner(),
    private readonly toolLocator: ToolLocator = new ToolResolver(process.cwd()),
  ) {}

  async readState(target: string): Promise<Result<GitProposalState, string>> {
    const [branch, branchError] = await this.output(target, ["rev-parse", "--abbrev-ref", "HEAD"])
    if (branchError !== null) return fail(branchError)
    if (branch === null) return fail("git branch produced no result")

    const [commit, commitError] = await this.output(target, ["rev-parse", "HEAD"])
    if (commitError !== null) return fail(commitError)
    if (commit === null) return fail("git commit produced no result")

    const [status, statusError] = await this.output(target, ["status", "--porcelain"])
    if (statusError !== null) return fail(statusError)
    if (status === null) return fail("git status produced no result")

    return ok({ branch: branch.trim(), commit: commit.trim(), clean: status.trim() === "" })
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    const git = await this.toolLocator.resolve("git")
    if (git === null) return fail("git executable is not available")

    const [result, runError] = await this.processRunner.run({
      executable: git,
      arguments: ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      workingDirectory: target,
    })
    if (runError !== null || result === null) {
      return fail(runError === null ? "git show-ref produced no result" : runError.message)
    }
    if (result.exitCode === 0) return ok(true)
    if (result.exitCode === 1) return ok(false)

    return fail(this.commandFailure("show-ref", result))
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    const [result, runError] = await this.run(target, ["switch", "-c", branch, baseCommit])
    if (runError !== null || result === null) {
      return fail(runError === null ? "git switch produced no result" : runError)
    }
    if (result.exitCode !== 0) return fail(this.commandFailure("switch", result))

    return ok(branch)
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    const configured = process.env.SPEC_AUTHOR?.trim() ?? ""
    if (configured !== "") return ok(configured)

    const [result, runError] = await this.run(target, ["config", "user.name"])
    if (runError !== null || result === null) {
      return fail("proposal author unavailable; set SPEC_AUTHOR or git user.name")
    }

    const author = result.stdout.trim()
    if (result.exitCode !== 0 || author === "") {
      return fail("proposal author unavailable; set SPEC_AUTHOR or git user.name")
    }

    return ok(author)
  }

  private async output(target: string, argumentsList: string[]): Promise<Result<string, string>> {
    const [result, runError] = await this.run(target, argumentsList)
    if (runError !== null || result === null) {
      return fail(runError === null ? "git produced no result" : runError)
    }
    if (result.exitCode !== 0) return fail(this.commandFailure(argumentsList.join(" "), result))

    return ok(result.stdout)
  }

  private async run(
    target: string,
    argumentsList: string[],
  ): Promise<Result<CommandResult, string>> {
    const git = await this.toolLocator.resolve("git")
    if (git === null) return fail("git executable is not available")

    const [result, runError] = await this.processRunner.run({
      executable: git,
      arguments: argumentsList,
      workingDirectory: target,
    })
    if (runError !== null || result === null) {
      return fail(runError === null ? "git produced no result" : runError.message)
    }

    return ok(result)
  }

  private commandFailure(command: string, result: CommandResult): string {
    const detail = `${result.stderr}\n${result.stdout}`.trim().slice(-500).trim()

    return detail === "" ? `git ${command} failed` : `git ${command} failed: ${detail}`
  }
}
