import { fail, ok, type Result } from "../core/result"
import {
  BunProcessRunner,
  ToolResolver,
  type ProcessRunner,
  type ToolLocator,
} from "../core/runner"

export interface GitStatusReader {
  read(target: string): Promise<Result<boolean, string>>
}

export class GitCleanlinessReader implements GitStatusReader {
  constructor(
    private readonly processRunner: ProcessRunner = new BunProcessRunner(),
    private readonly toolLocator: ToolLocator = new ToolResolver(process.cwd()),
  ) {}

  async read(target: string): Promise<Result<boolean, string>> {
    const git = await this.toolLocator.resolve("git")
    if (git === null) return fail("git executable is not available")

    const [result, runError] = await this.processRunner.run({
      executable: git,
      arguments: ["status", "--porcelain"],
      workingDirectory: target,
    })
    if (runError || result === null) {
      return fail(runError === null ? "git status produced no result" : runError.message)
    }
    if (result.exitCode !== 0) {
      const detail = `${result.stderr}\n${result.stdout}`.trim().slice(-500).trim()
      return fail(detail === "" ? `git status exited with ${result.exitCode}` : detail)
    }

    return ok(result.stdout.trim() === "")
  }
}

export class GitApproverResolver {
  constructor(
    private readonly processRunner: ProcessRunner = new BunProcessRunner(),
    private readonly toolLocator: ToolLocator = new ToolResolver(process.cwd()),
  ) {}

  async resolve(explicit: string | undefined): Promise<Result<string, string>> {
    const candidate = explicit?.trim() ?? process.env.SPEC_APPROVER?.trim() ?? ""
    if (candidate !== "") return ok(candidate)

    const git = await this.toolLocator.resolve("git")
    if (git === null) return fail("approver identity unavailable; pass --approver <name>")

    const [result, runError] = await this.processRunner.run({
      executable: git,
      arguments: ["config", "user.name"],
      workingDirectory: process.cwd(),
    })
    if (runError || result === null) {
      return fail("approver identity unavailable; pass --approver <name>")
    }

    const identity = result.stdout.trim()
    if (result.exitCode !== 0 || identity === "") {
      return fail("approver identity unavailable; pass --approver <name>")
    }

    return ok(identity)
  }
}
