import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ToolStatus } from "../src/core/doctor"
import { ToolProvisioner } from "../src/core/provision"
import type { Result } from "../src/core/result"
import type { CommandFailure, CommandResult, CommandSpec, ProcessRunner } from "../src/core/runner"

class FakeProcessRunner implements ProcessRunner {
  readonly calls: CommandSpec[] = []

  constructor(private readonly results: Result<CommandResult, CommandFailure>[]) {}

  async run(commandSpec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
    this.calls.push(commandSpec)
    const callIndex = this.calls.length - 1

    return (
      this.results[Math.min(callIndex, this.results.length - 1)] ?? [
        { exitCode: 0, stdout: "", stderr: "" },
        null,
      ]
    )
  }
}

function toolStatus(name: string, command: string, present: boolean): ToolStatus {
  return { name, command, required: true, present, install: `install ${name}` }
}

function prerequisiteStatus(name: string, command: string, present: boolean): ToolStatus {
  return { name, command, required: false, present, install: `install ${name}` }
}

function statusSequence(...sequences: ToolStatus[][]): (target: string) => ToolStatus[] {
  let callCount = 0

  return (target: string) => {
    void target
    const sequence = sequences[Math.min(callCount, sequences.length - 1)] ?? []
    callCount += 1

    return sequence
  }
}

async function createTarget(tools: Record<string, string>): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "provision-"))
  await mkdir(join(target, "spec"), { recursive: true })
  await writeFile(
    join(target, "spec", "toolchain.lock.json"),
    `${JSON.stringify({ schema: 1, status: "unprovisioned", tools }, null, 2)}\n`,
  )

  return target
}

async function readLock(target: string): Promise<{
  schema: number
  status: string
  tools: Record<string, string>
}> {
  return JSON.parse(await readFile(join(target, "spec", "toolchain.lock.json"), "utf8")) as {
    schema: number
    status: string
    tools: Record<string, string>
  }
}

describe("ToolProvisioner", () => {
  test("installs a pinned Bun tool into the project-local tools directory", async () => {
    const target = await createTarget({ likec4: "1.60.0" })
    try {
      const processRunner = new FakeProcessRunner([])
      const provisioner = new ToolProvisioner(
        target,
        processRunner,
        statusSequence(
          [toolStatus("likec4", "likec4", false), prerequisiteStatus("bun", "bun", true)],
          [toolStatus("likec4", "likec4", true), prerequisiteStatus("bun", "bun", true)],
        ),
      )

      const [outcome, error] = await provisioner.provision()

      expect(error).toBeNull()
      expect(outcome?.provisioned).toEqual([{ name: "likec4", version: "1.60.0" }])
      expect(processRunner.calls).toHaveLength(1)
      expect(processRunner.calls[0]).toEqual({
        executable: "bun",
        arguments: ["add", "--exact", "--ignore-scripts", "likec4@1.60.0"],
        workingDirectory: join(target, ".spec", "tools"),
        timeoutMs: 300_000,
      })
      expect(
        JSON.parse(await readFile(join(target, ".spec", "tools", "package.json"), "utf8")),
      ).toEqual({ private: true })
      expect((await readLock(target)).status).toBe("provisioned")
      expect(outcome?.lockStatus).toBe("provisioned")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("installs a pinned Python tool with project-local uv directories", async () => {
    const target = await createTarget({ strictdoc: "0.30.4" })
    try {
      const processRunner = new FakeProcessRunner([])
      const provisioner = new ToolProvisioner(
        target,
        processRunner,
        statusSequence(
          [toolStatus("strictdoc", "strictdoc", false), prerequisiteStatus("uv", "uv", true)],
          [toolStatus("strictdoc", "strictdoc", true), prerequisiteStatus("uv", "uv", true)],
        ),
      )

      const [outcome, error] = await provisioner.provision()

      expect(error).toBeNull()
      expect(outcome?.provisioned).toEqual([{ name: "strictdoc", version: "0.30.4" }])
      expect(processRunner.calls[0]).toEqual({
        executable: "uv",
        arguments: ["tool", "install", "--force", "strictdoc==0.30.4"],
        workingDirectory: target,
        timeoutMs: 300_000,
        environment: {
          UV_TOOL_DIR: join(target, ".spec", "tools", "uv"),
          UV_TOOL_BIN_DIR: join(target, ".spec", "tools", "bin"),
        },
      })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("skips a tool without an exact pin", async () => {
    const target = await createTarget({})
    try {
      const processRunner = new FakeProcessRunner([])
      const statuses = [toolStatus("quint", "quint", false), prerequisiteStatus("bun", "bun", true)]
      const provisioner = new ToolProvisioner(target, processRunner, statusSequence(statuses))

      const [outcome, error] = await provisioner.provision()

      expect(error).toBeNull()
      expect(outcome?.skipped[0]?.code).toBe("TOOL-UNPINNED")
      expect(outcome?.skipped[0]?.message).toContain("spec/toolchain.lock.json")
      expect(processRunner.calls).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("skips a tool without an automatic provisioner", async () => {
    const target = await createTarget({ apalache: "0.63.0" })
    try {
      const processRunner = new FakeProcessRunner([])
      const statuses = [toolStatus("apalache", "apalache-mc", false)]
      const provisioner = new ToolProvisioner(target, processRunner, statusSequence(statuses))

      const [outcome, error] = await provisioner.provision()

      expect(error).toBeNull()
      expect(outcome?.skipped[0]?.code).toBe("TOOL-UNSUPPORTED")
      expect(outcome?.skipped[0]?.message).toContain("install apalache")
      expect(processRunner.calls).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("skips a tool when its package manager is missing", async () => {
    const target = await createTarget({ strictdoc: "0.30.4" })
    try {
      const processRunner = new FakeProcessRunner([])
      const statuses = [
        toolStatus("strictdoc", "strictdoc", false),
        prerequisiteStatus("uv", "uv", false),
      ]
      const provisioner = new ToolProvisioner(target, processRunner, statusSequence(statuses))

      const [outcome, error] = await provisioner.provision()

      expect(error).toBeNull()
      expect(outcome?.skipped[0]?.code).toBe("TOOL-PREREQUISITE-MISSING")
      expect(processRunner.calls).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a bounded provisioning failure", async () => {
    const target = await createTarget({ likec4: "1.60.0" })
    try {
      const failure: Result<CommandResult, CommandFailure> = [
        { exitCode: 1, stdout: "x".repeat(600), stderr: "registry unavailable" },
        null,
      ]
      const processRunner = new FakeProcessRunner([failure])
      const statuses = [
        toolStatus("likec4", "likec4", false),
        prerequisiteStatus("bun", "bun", true),
      ]
      const provisioner = new ToolProvisioner(
        target,
        processRunner,
        statusSequence(statuses, statuses),
      )

      const [outcome, error] = await provisioner.provision()

      expect(error).toBeNull()
      expect(outcome?.failed[0]?.code).toBe("TOOL-PROVISION-FAILED")
      expect(outcome?.failed[0]?.message).toContain("exit code 1")
      expect(outcome?.failed[0]?.message).toContain("registry unavailable")
      expect(outcome?.failed[0]?.message.length).toBeLessThan(600)
      expect((await readLock(target)).status).toBe("unprovisioned")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("preserves unrelated pinned tools when saving the lock", async () => {
    const target = await createTarget({ likec4: "1.60.0", custom: "1.2.3" })
    try {
      const processRunner = new FakeProcessRunner([])
      const provisioner = new ToolProvisioner(
        target,
        processRunner,
        statusSequence(
          [toolStatus("likec4", "likec4", false), prerequisiteStatus("bun", "bun", true)],
          [toolStatus("likec4", "likec4", true), prerequisiteStatus("bun", "bun", true)],
        ),
      )

      const [, error] = await provisioner.provision()

      expect(error).toBeNull()
      expect((await readLock(target)).tools).toEqual({ custom: "1.2.3", likec4: "1.60.0" })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a floating version in the lock", async () => {
    const target = await createTarget({ likec4: "latest" })
    try {
      const processRunner = new FakeProcessRunner([])
      const provisioner = new ToolProvisioner(target, processRunner, statusSequence([]))

      const [outcome, error] = await provisioner.provision()

      expect(outcome).toBeNull()
      expect(error?.code).toBe("TOOLCHAIN-BAD-LOCK")
      expect(processRunner.calls).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
