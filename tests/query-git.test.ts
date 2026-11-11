import { describe, expect, test } from "bun:test"
import type { Result } from "../src/core/result"
import type {
  CommandFailure,
  CommandResult,
  CommandSpec,
  ProcessRunner,
  ToolLocator,
} from "../src/core/runner"
import { GitWorkspaceReader } from "../src/query/git"

class FakeToolLocator implements ToolLocator {
  constructor(private readonly executable: string | null = "/bin/git") {}

  async resolve(command: string): Promise<string | null> {
    void command

    return this.executable
  }
}

class FakeProcessRunner implements ProcessRunner {
  readonly calls: CommandSpec[] = []

  constructor(private readonly queuedResults: Result<CommandResult, CommandFailure>[]) {}

  async run(commandSpec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
    this.calls.push(commandSpec)
    const callIndex = this.calls.length - 1

    return (
      this.queuedResults[callIndex] ?? [null, { code: "COMMAND_IO_FAILED", message: "missing" }]
    )
  }
}

function result(stdout: string): Result<CommandResult, CommandFailure> {
  return [{ exitCode: 0, stdout, stderr: "" }, null]
}

describe("GitWorkspaceReader", () => {
  test("reads the commit and clean state", async () => {
    const processRunner = new FakeProcessRunner([result("a1b2c3d\n"), result("")])
    const [workspace, error] = await new GitWorkspaceReader(
      processRunner,
      new FakeToolLocator(),
    ).read("/sample")

    expect(error).toBeNull()
    expect(workspace).toEqual({
      workspace: "single-repo",
      commit: "a1b2c3d",
      dirty: false,
    })
    expect(processRunner.calls.map((call) => call.arguments)).toEqual([
      ["rev-parse", "HEAD"],
      ["status", "--porcelain"],
    ])
  })

  test("reports a dirty tree", async () => {
    const processRunner = new FakeProcessRunner([result("a1b2c3d\n"), result(" M src/file.ts\n")])
    const [workspace, error] = await new GitWorkspaceReader(
      processRunner,
      new FakeToolLocator(),
    ).read("/sample")

    expect(error).toBeNull()
    expect(workspace?.dirty).toBe(true)
  })

  test("fails without git", async () => {
    const [workspace, error] = await new GitWorkspaceReader(
      new FakeProcessRunner([]),
      new FakeToolLocator(null),
    ).read("/sample")

    expect(workspace).toBeNull()
    expect(error).toContain("git executable is not available")
  })
})
