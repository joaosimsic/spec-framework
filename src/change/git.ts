import type { Result } from "../core/result"
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
    if (branchError !== null) return [null, branchError]
    if (branch === null) return [null, "git branch produced no result"]

    const [commit, commitError] = await this.output(target, ["rev-parse", "HEAD"])
    if (commitError !== null) return [null, commitError]
    if (commit === null) return [null, "git commit produced no result"]

    const [status, statusError] = await this.output(target, ["status", "--porcelain"])
    if (statusError !== null) return [null, statusError]
    if (status === null) return [null, "git status produced no result"]

    return [{ branch: branch.trim(), commit: commit.trim(), clean: status.trim() === "" }, null]
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    const git = await this.toolLocator.resolve("git")
    if (git === null) return [null, "git executable is not available"]

    const [result, runError] = await this.processRunner.run({
      executable: git,
      arguments: ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      workingDirectory: target,
    })
    if (runError !== null || result === null) {
      return [null, runError === null ? "git show-ref produced no result" : runError.message]
    }
    if (result.exitCode === 0) return [true, null]
    if (result.exitCode === 1) return [false, null]

    return [null, this.commandFailure("show-ref", result)]
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    const [result, runError] = await this.run(target, ["switch", "-c", branch, baseCommit])
    if (runError !== null || result === null) {
      return [null, runError === null ? "git switch produced no result" : runError]
    }
    if (result.exitCode !== 0) return [null, this.commandFailure("switch", result)]

    return [branch, null]
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    const configured = process.env.SPEC_AUTHOR?.trim() ?? ""
    if (configured !== "") return [configured, null]

    const [result, runError] = await this.run(target, ["config", "user.name"])
    if (runError !== null || result === null) {
      return [null, "proposal author unavailable; set SPEC_AUTHOR or git user.name"]
    }

    const author = result.stdout.trim()
    if (result.exitCode !== 0 || author === "") {
      return [null, "proposal author unavailable; set SPEC_AUTHOR or git user.name"]
    }

    return [author, null]
  }

  private async output(
    target: string,
    argumentsList: string[],
  ): Promise<Result<string, string>> {
    const [result, runError] = await this.run(target, argumentsList)
    if (runError !== null || result === null) {
      return [null, runError === null ? "git produced no result" : runError]
    }
    if (result.exitCode !== 0) return [null, this.commandFailure(argumentsList.join(" "), result)]

    return [result.stdout, null]
  }

  private async run(
    target: string,
    argumentsList: string[],
  ): Promise<Result<CommandResult, string>> {
    const git = await this.toolLocator.resolve("git")
    if (git === null) return [null, "git executable is not available"]

    const [result, runError] = await this.processRunner.run({
      executable: git,
      arguments: argumentsList,
      workingDirectory: target,
    })
    if (runError !== null || result === null) {
      return [null, runError === null ? "git produced no result" : runError.message]
    }

    return [result, null]
  }

  private commandFailure(command: string, result: CommandResult): string {
    const detail = `${result.stderr}\n${result.stdout}`.trim().slice(-500).trim()

    return detail === "" ? `git ${command} failed` : `git ${command} failed: ${detail}`
  }
}
