import type { Result } from "../core/result"
import {
  BunProcessRunner,
  ToolResolver,
  type ProcessRunner,
  type ToolLocator,
} from "../core/runner"
import type { GraphWorkspace } from "../model/types"
import type { WorkspaceMetadataReader } from "./types"

export class GitWorkspaceReader implements WorkspaceMetadataReader {
  constructor(
    private readonly processRunner: ProcessRunner = new BunProcessRunner(),
    private readonly toolLocator: ToolLocator = new ToolResolver(process.cwd()),
  ) {}

  async read(target: string): Promise<Result<GraphWorkspace, string>> {
    const git = await this.toolLocator.resolve("git")
    if (git === null) return [null, "git executable is not available"]

    const [commitResult, commitError] = await this.processRunner.run({
      executable: git,
      arguments: ["rev-parse", "HEAD"],
      workingDirectory: target,
    })
    if (commitError || commitResult === null) {
      return [null, commitError === null ? "git rev-parse produced no result" : commitError.message]
    }
    if (commitResult.exitCode !== 0) {
      return [null, this.commandFailure("rev-parse HEAD", commitResult)]
    }

    const commit = commitResult.stdout.trim()
    if (commit === "") return [null, "git rev-parse HEAD produced an empty commit"]

    const [statusResult, statusError] = await this.processRunner.run({
      executable: git,
      arguments: ["status", "--porcelain"],
      workingDirectory: target,
    })
    if (statusError || statusResult === null) {
      return [null, statusError === null ? "git status produced no result" : statusError.message]
    }

    if (statusResult.exitCode !== 0) {
      return [null, this.commandFailure("status --porcelain", statusResult)]
    }

    return [
      {
        workspace: "single-repo",
        commit,
        dirty: statusResult.stdout.trim() !== "",
      },
      null,
    ]
  }

  private commandFailure(command: string, result: { stdout: string; stderr: string }): string {
    const detail = `${result.stderr}\n${result.stdout}`.trim().slice(-500).trim()
    return detail === "" ? `git ${command} failed` : `git ${command} failed: ${detail}`
  }
}
