import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CompilerAdapter } from "../src/adapters/compiler"
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

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "compiler-"))
  await mkdir(join(target, "spec", "implementation"), { recursive: true })

  return target
}

async function writeCompileConfig(target: string, value: unknown): Promise<string> {
  const configPath = join(target, "spec", "implementation", "compile.json")
  await writeFile(configPath, JSON.stringify(value))

  return configPath
}

async function runAdapter(
  target: string,
  queuedResults: Result<CommandResult, CommandFailure>[] = [],
  executable: string | null = "/bin/fake",
) {
  const processRunner = new FakeProcessRunner(queuedResults)
  const run = await new CompilerAdapter().run({
    target,
    processRunner,
    toolLocator: new FakeToolLocator(executable),
  })

  return { processRunner, run }
}

describe("CompilerAdapter", () => {
  test("detects the compile configuration", async () => {
    const target = await createTarget()
    try {
      expect(await new CompilerAdapter().detect(target)).toBe(false)
      await writeCompileConfig(target, { checks: [] })
      expect(await new CompilerAdapter().detect(target)).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("runs a passing check with configured arguments and timeout", async () => {
    const target = await createTarget()
    try {
      await writeCompileConfig(target, {
        checks: [{ id: "typecheck", command: ["bun", "run", "typecheck"], timeoutMs: 120000 }],
      })
      const { processRunner, run } = await runAdapter(target)

      expect(run.ran).toBe(true)
      expect(run.diagnostics).toEqual([])
      expect(processRunner.calls).toHaveLength(1)
      expect(processRunner.calls[0]).toEqual({
        executable: "/bin/fake",
        arguments: ["run", "typecheck"],
        workingDirectory: target,
        timeoutMs: 120000,
      })
      expect(run.evidence?.[0]?.id).toBe("EVD-IMPL-TYPECHECK")
      expect(run.evidence?.[0]?.result).toBe("pass")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("resolves a relative working directory", async () => {
    const target = await createTarget()
    try {
      await writeCompileConfig(target, {
        checks: [
          { id: "build", command: ["bun", "run", "build"], workingDirectory: "packages/core" },
        ],
      })
      const { processRunner } = await runAdapter(target)

      expect(processRunner.calls[0]?.workingDirectory).toBe(join(target, "packages", "core"))
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a non-zero exit with a bounded output tail", async () => {
    const target = await createTarget()
    try {
      const configPath = await writeCompileConfig(target, {
        checks: [{ id: "typecheck", command: ["bun", "typecheck"] }],
      })
      const failure: Result<CommandResult, CommandFailure> = [
        { exitCode: 1, stdout: "x".repeat(600), stderr: "error: bad type" },
        null,
      ]
      const { run } = await runAdapter(target, [failure])

      expect(run.diagnostics).toHaveLength(1)
      expect(run.diagnostics[0]?.code).toBe("IMPL-COMPILE-FAILED")
      expect(run.diagnostics[0]?.file).toBe(configPath)
      expect(run.diagnostics[0]?.message).toContain("typecheck failed with exit code 1")
      expect(run.diagnostics[0]?.message).toContain("error: bad type")
      expect(run.diagnostics[0]?.message.length).toBeLessThan(600)
      expect(run.evidence?.[0]?.result).toBe("fail")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a missing executable without spawning", async () => {
    const target = await createTarget()
    try {
      await writeCompileConfig(target, {
        checks: [{ id: "typecheck", command: ["missing-tool", "check"] }],
      })
      const { processRunner, run } = await runAdapter(target, [], null)

      expect(processRunner.calls).toHaveLength(0)
      expect(run.diagnostics[0]?.code).toBe("IMPL-COMPILE-MISSING-TOOL")
      expect(run.diagnostics[0]?.message).toContain("missing-tool")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a missing configuration when run explicitly", async () => {
    const target = await createTarget()
    try {
      const { run } = await runAdapter(target)

      expect(run.diagnostics[0]?.code).toBe("IMPL-COMPILE-NO-CONFIG")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects malformed JSON", async () => {
    const target = await createTarget()
    try {
      await writeFile(join(target, "spec", "implementation", "compile.json"), "{")
      const { run } = await runAdapter(target)

      expect(run.diagnostics[0]?.code).toBe("IMPL-COMPILE-BAD-CONFIG")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects an empty check list", async () => {
    const target = await createTarget()
    try {
      await writeCompileConfig(target, { checks: [] })
      const { run } = await runAdapter(target)

      expect(run.diagnostics[0]?.code).toBe("IMPL-COMPILE-NO-CHECKS")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  const invalidConfigurations = [
    {
      name: "duplicate identifiers",
      config: {
        checks: [
          { id: "build", command: ["bun", "build"] },
          { id: "build", command: ["bun", "build:again"] },
        ],
      },
    },
    {
      name: "an empty command",
      config: { checks: [{ id: "build", command: [] }] },
    },
    {
      name: "an absolute working directory",
      config: { checks: [{ id: "build", command: ["bun"], workingDirectory: "/tmp" }] },
    },
    {
      name: "an escaping working directory",
      config: { checks: [{ id: "build", command: ["bun"], workingDirectory: "../outside" }] },
    },
    {
      name: "a non-positive timeout",
      config: { checks: [{ id: "build", command: ["bun"], timeoutMs: 0 }] },
    },
    {
      name: "a non-string identifier",
      config: { checks: [{ id: 1, command: ["bun"] }] },
    },
  ]

  for (const fixture of invalidConfigurations) {
    test(`rejects ${fixture.name}`, async () => {
      const target = await createTarget()
      try {
        await writeCompileConfig(target, fixture.config)
        const { processRunner, run } = await runAdapter(target)

        expect(run.diagnostics[0]?.code).toBe("IMPL-COMPILE-BAD-CONFIG")
        expect(processRunner.calls).toHaveLength(0)
      } finally {
        await rm(target, { recursive: true, force: true })
      }
    })
  }

  test("continues after a failing check", async () => {
    const target = await createTarget()
    try {
      await writeCompileConfig(target, {
        checks: [
          { id: "typecheck", command: ["bun", "typecheck"] },
          { id: "build", command: ["bun", "build"] },
        ],
      })
      const failure: Result<CommandResult, CommandFailure> = [
        { exitCode: 1, stdout: "", stderr: "type error" },
        null,
      ]
      const success: Result<CommandResult, CommandFailure> = [
        { exitCode: 0, stdout: "built", stderr: "" },
        null,
      ]
      const { processRunner, run } = await runAdapter(target, [failure, success])

      expect(processRunner.calls).toHaveLength(2)
      expect(run.diagnostics).toHaveLength(1)
      expect(run.diagnostics[0]?.message).toContain("typecheck")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("forwards process runner failures", async () => {
    const target = await createTarget()
    try {
      await writeCompileConfig(target, {
        checks: [{ id: "build", command: ["bun", "build"] }],
      })
      const failure: Result<CommandResult, CommandFailure> = [
        null,
        { code: "COMMAND_TIMEOUT", message: "took too long" },
      ]
      const { run } = await runAdapter(target, [failure])

      expect(run.diagnostics[0]?.code).toBe("IMPL-COMPILE-RUN")
      expect(run.diagnostics[0]?.message).toContain("COMMAND_TIMEOUT")
      expect(run.diagnostics[0]?.message).toContain("took too long")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
