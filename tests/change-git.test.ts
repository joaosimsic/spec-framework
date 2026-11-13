import { describe, expect, test } from "bun:test"
import { GitProposalRepository } from "../src/change/git"
import { ok, type Result } from "../src/core/result"
import type {
  CommandFailure,
  CommandResult,
  CommandSpec,
  ProcessRunner,
  ToolLocator,
} from "../src/core/runner"

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

function result(stdout: string, exitCode = 0): Result<CommandResult, CommandFailure> {
  return ok({ exitCode, stdout, stderr: "" })
}

describe("GitProposalRepository", () => {
  test("reads the current branch, commit, and clean state", async () => {
    const processRunner = new FakeProcessRunner([result("main\n"), result("base123\n"), result("")])
    const repository = new GitProposalRepository(processRunner, new FakeToolLocator())

    const [state, error] = await repository.readState("/sample")

    expect(error).toBeNull()
    expect(state).toEqual({ branch: "main", commit: "base123", clean: true })
    expect(processRunner.calls.map((call) => call.arguments)).toEqual([
      ["rev-parse", "--abbrev-ref", "HEAD"],
      ["rev-parse", "HEAD"],
      ["status", "--porcelain"],
    ])
  })

  test("checks branch existence and creates a branch from the base commit", async () => {
    const processRunner = new FakeProcessRunner([
      result("", 1),
      result("", 0),
      result("Switched\n"),
    ])
    const repository = new GitProposalRepository(processRunner, new FakeToolLocator())

    const [missing, missingError] = await repository.branchExists("/sample", "spec/change")
    expect(missingError).toBeNull()
    expect(missing).toBe(false)

    const [exists, existsError] = await repository.branchExists("/sample", "spec/change")
    expect(existsError).toBeNull()
    expect(exists).toBe(true)

    const [branch, createError] = await repository.createBranch("/sample", "spec/change", "base123")
    expect(createError).toBeNull()
    expect(branch).toBe("spec/change")
    expect(processRunner.calls[2]?.arguments).toEqual(["switch", "-c", "spec/change", "base123"])
  })

  test("resolves the git author", async () => {
    const previousAuthor = process.env.SPEC_AUTHOR
    delete process.env.SPEC_AUTHOR

    try {
      const processRunner = new FakeProcessRunner([result("Tester\n")])
      const repository = new GitProposalRepository(processRunner, new FakeToolLocator())

      const [author, error] = await repository.resolveAuthor("/sample")

      expect(error).toBeNull()
      expect(author).toBe("Tester")
    } finally {
      if (previousAuthor === undefined) delete process.env.SPEC_AUTHOR
      else process.env.SPEC_AUTHOR = previousAuthor
    }
  })
})
