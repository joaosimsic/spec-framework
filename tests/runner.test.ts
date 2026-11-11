import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BunProcessRunner, ToolResolver } from "../src/core/runner"

describe("ToolResolver", () => {
  test("prefers a project-local executable", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const binDirectory = join(target, "node_modules", ".bin")
      const executable = join(binDirectory, "spec-framework-test-tool")
      await mkdir(binDirectory, { recursive: true })
      await Bun.write(executable, "")

      const resolved = await new ToolResolver(target).resolve("spec-framework-test-tool")

      expect(resolved).toBe(executable)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("BunProcessRunner", () => {
  test("fails closed when the executable is missing", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const [result, error] = await new BunProcessRunner().run({
        executable: join(target, "missing-tool"),
        arguments: [],
        workingDirectory: target,
      })

      expect(result).toBeNull()
      expect(error?.code).toBe("COMMAND_SPAWN_FAILED")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("kills a command after the timeout", async () => {
    const target = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const [result, error] = await new BunProcessRunner().run({
        executable: Bun.which("bun") ?? "bun",
        arguments: ["-e", "setTimeout(() => {}, 5000)"],
        workingDirectory: target,
        timeoutMs: 20,
      })

      expect(result).toBeNull()
      expect(error?.code).toBe("COMMAND_TIMEOUT")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
