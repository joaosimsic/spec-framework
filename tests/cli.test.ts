import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliAdapter } from "../src/adapters/cli"
import type { Result } from "../src/core/result"
import type {
  CommandFailure,
  CommandResult,
  CommandSpec,
  ProcessRunner,
  ToolLocator,
} from "../src/core/runner"

class FakeToolLocator implements ToolLocator {
  constructor(private readonly executable: string | null = "/bin/fake") {}

  async resolve(commandName: string): Promise<string | null> {
    void commandName

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
      this.queuedResults[Math.min(callIndex, this.queuedResults.length - 1)] ?? [
        { exitCode: 0, stdout: "", stderr: "" },
        null,
      ]
    )
  }
}

async function createCliTarget(): Promise<{ target: string; contractDirectory: string }> {
  const target = await mkdtemp(join(tmpdir(), "cli-"))
  const contractDirectory = join(target, "spec", "contracts", "cli")
  await mkdir(contractDirectory, { recursive: true })

  return { target, contractDirectory }
}

async function writeSnapshot(
  contractDirectory: string,
  fileName: string,
  snapshot: unknown,
): Promise<string> {
  const snapshotPath = join(contractDirectory, fileName)
  await writeFile(snapshotPath, JSON.stringify(snapshot))

  return snapshotPath
}

async function runAdapter(
  target: string,
  queuedResults: Result<CommandResult, CommandFailure>[],
  executable: string | null = "/bin/fake",
) {
  const processRunner = new FakeProcessRunner(queuedResults)
  const run = await new CliAdapter().run({
    target,
    processRunner,
    toolLocator: new FakeToolLocator(executable),
  })

  return { processRunner, run }
}

describe("CliAdapter", () => {
  test("passes when the probe matches the snapshot", async () => {
    const { target, contractDirectory } = await createCliTarget()
    const snapshotCommand = ["mytool", "--version"]
    await writeSnapshot(contractDirectory, "version.snapshot.json", {
      command: snapshotCommand,
      exitCode: 0,
      stdoutIncludes: ["1.2.3"],
    })
    const success: Result<CommandResult, CommandFailure> = [
      { exitCode: 0, stdout: "mytool 1.2.3", stderr: "" },
      null,
    ]
    const { processRunner, run } = await runAdapter(target, [success])

    expect(run.ran).toBe(true)
    expect(run.diagnostics).toEqual([])
    expect(processRunner.calls).toHaveLength(1)
    expect(processRunner.calls[0]?.executable).toBe("/bin/fake")
    expect(processRunner.calls[0]?.arguments).toEqual(snapshotCommand.slice(1))
    expect(processRunner.calls[0]?.workingDirectory).toBe(target)
    expect(run.evidence?.[0]?.id).toBe("EVD-CLI-VERSION")
    expect(run.evidence?.[0]?.result).toBe("pass")
  })

  test("uses an explicit snapshot evidence id", async () => {
    const { target, contractDirectory } = await createCliTarget()
    await writeSnapshot(contractDirectory, "version.snapshot.json", {
      id: "EVD-CLI-VERSION-001",
      command: ["mytool", "--version"],
      exitCode: 0,
      stdoutIncludes: [],
    })
    const success: Result<CommandResult, CommandFailure> = [
      { exitCode: 0, stdout: "", stderr: "" },
      null,
    ]
    const { run } = await runAdapter(target, [success])

    expect(run.evidence?.[0]?.id).toBe("EVD-CLI-VERSION-001")
  })

  test("reports an exit code mismatch", async () => {
    const { target, contractDirectory } = await createCliTarget()
    const snapshotPath = await writeSnapshot(contractDirectory, "version.snapshot.json", {
      command: ["mytool", "--version"],
      exitCode: 0,
      stdoutIncludes: [],
    })
    const mismatch: Result<CommandResult, CommandFailure> = [
      { exitCode: 1, stdout: "", stderr: "" },
      null,
    ]
    const { run } = await runAdapter(target, [mismatch])

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-CLI-INCOMPATIBLE")
    expect(run.diagnostics[0]?.file).toBe(snapshotPath)
    expect(run.diagnostics[0]?.message).toContain("version.snapshot.json")
    expect(run.diagnostics[0]?.message).toContain("exit code 1, expected 0")
  })

  test("reports a missing stdout substring", async () => {
    const { target, contractDirectory } = await createCliTarget()
    const snapshotPath = await writeSnapshot(contractDirectory, "help.snapshot.json", {
      command: ["mytool", "--help"],
      exitCode: 0,
      stdoutIncludes: ["Usage:"],
    })
    const missing: Result<CommandResult, CommandFailure> = [
      { exitCode: 0, stdout: "hello", stderr: "" },
      null,
    ]
    const { run } = await runAdapter(target, [missing])

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-CLI-INCOMPATIBLE")
    expect(run.diagnostics[0]?.file).toBe(snapshotPath)
    expect(run.diagnostics[0]?.message).toContain('stdout missing "Usage:"')
  })

  test("reports a forbidden stdout substring", async () => {
    const { target, contractDirectory } = await createCliTarget()
    const snapshotPath = await writeSnapshot(contractDirectory, "help.snapshot.json", {
      command: ["mytool", "--help"],
      exitCode: 0,
      stdoutIncludes: [],
      stdoutExcludes: ["secret"],
    })
    const forbidden: Result<CommandResult, CommandFailure> = [
      { exitCode: 0, stdout: "leaked secret here", stderr: "" },
      null,
    ]
    const { run } = await runAdapter(target, [forbidden])

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-CLI-INCOMPATIBLE")
    expect(run.diagnostics[0]?.file).toBe(snapshotPath)
  })

  test("rejects a bad snapshot shape without running processes", async () => {
    const { target, contractDirectory } = await createCliTarget()
    const snapshotPath = await writeSnapshot(contractDirectory, "broken.snapshot.json", {
      command: [],
    })
    const { processRunner, run } = await runAdapter(target, [])

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-CLI-BAD-SNAPSHOT")
    expect(run.diagnostics[0]?.file).toBe(snapshotPath)
    expect(processRunner.calls).toHaveLength(0)
  })

  test("reports an unresolvable binary without running processes", async () => {
    const { target, contractDirectory } = await createCliTarget()
    const snapshotPath = await writeSnapshot(contractDirectory, "version.snapshot.json", {
      command: ["missing-tool", "--version"],
      exitCode: 0,
      stdoutIncludes: [],
    })
    const { processRunner, run } = await runAdapter(target, [], null)

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-CLI-MISSING-TOOL")
    expect(run.diagnostics[0]?.file).toBe(snapshotPath)
    expect(run.diagnostics[0]?.message).toContain("missing-tool")
    expect(processRunner.calls).toHaveLength(0)
  })

  test("forwards spawn failures", async () => {
    const { target, contractDirectory } = await createCliTarget()
    await writeSnapshot(contractDirectory, "version.snapshot.json", {
      command: ["mytool", "--version"],
      exitCode: 0,
      stdoutIncludes: [],
    })
    const spawnFailure: Result<CommandResult, CommandFailure> = [
      null,
      { code: "COMMAND_SPAWN_FAILED", message: "not found" },
    ]
    const { run } = await runAdapter(target, [spawnFailure])

    expect(run.diagnostics.some((diagnostic) => diagnostic.code === "COMMAND_SPAWN_FAILED")).toBe(
      true,
    )
  })

  test("emits no-sources when the contract directory is empty", async () => {
    const { target } = await createCliTarget()
    const { processRunner, run } = await runAdapter(target, [])

    expect(run.ran).toBe(true)
    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("CONTRACT-CLI-NO-SOURCES")
    expect(processRunner.calls).toHaveLength(0)
  })
})
