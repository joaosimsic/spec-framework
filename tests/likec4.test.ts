import { describe, expect, test } from "bun:test"
import { LikeC4Adapter } from "../src/adapters/likec4"
import type { Result } from "../src/core/result"
import type {
  CommandFailure,
  CommandResult,
  CommandSpec,
  ProcessRunner,
  ToolLocator,
} from "../src/core/runner"

class FakeToolLocator implements ToolLocator {
  constructor(private readonly executable: string | null) {}

  async resolve(): Promise<string | null> {
    return this.executable
  }
}

class FakeProcessRunner implements ProcessRunner {
  readonly calls: CommandSpec[] = []

  constructor(private readonly result: Result<CommandResult, CommandFailure>) {}

  async run(spec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
    this.calls.push(spec)

    return this.result
  }
}

async function runAdapter(stdout: string, exitCode = 0, stderr = "") {
  const processRunner = new FakeProcessRunner([{ exitCode, stdout, stderr }, null])
  const run = await new LikeC4Adapter().run({
    target: "/project",
    processRunner,
    toolLocator: new FakeToolLocator("/bin/likec4"),
  })

  return { processRunner, run }
}

describe("LikeC4Adapter", () => {
  test("accepts a valid model", async () => {
    const { processRunner, run } = await runAdapter(
      JSON.stringify({ valid: true, errors: [], stats: { totalFiles: 1 } }),
    )

    expect(run.ran).toBe(true)
    expect(run.diagnostics).toEqual([])
    expect(processRunner.calls[0]?.arguments).toContain("validate")
    expect(processRunner.calls[0]?.arguments).toContain("--json")
    expect(processRunner.calls[0]?.arguments).toContain("/project/spec/architecture")
    expect(processRunner.calls[0]?.arguments).not.toContain("--no-layout")
  })

  test("records passing architecture evidence", async () => {
    const { run } = await runAdapter(
      JSON.stringify({ valid: true, errors: [], stats: { totalFiles: 1 } }),
    )

    expect(run.evidence).toHaveLength(1)
    expect(run.evidence?.[0]?.id).toBe("EVD-ARCH-LIKEC4")
    expect(run.evidence?.[0]?.result).toBe("pass")
    expect(run.evidence?.[0]?.hash).toStartWith("sha256:")
  })

  test("records failing architecture evidence", async () => {
    const { run } = await runAdapter(
      JSON.stringify({ valid: false, errors: [{ message: "Unknown element" }] }),
      1,
    )

    expect(run.evidence?.[0]?.id).toBe("EVD-ARCH-LIKEC4")
    expect(run.evidence?.[0]?.result).toBe("fail")
  })

  test("maps validation errors to diagnostics", async () => {
    const { run } = await runAdapter(
      JSON.stringify({
        valid: false,
        errors: [
          {
            message: "Unknown element",
            file: "/project/spec/architecture/model.c4",
            line: 6,
          },
        ],
      }),
      1,
    )

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("ARCH-LIKEC4")
    expect(run.diagnostics[0]?.file).toBe("/project/spec/architecture/model.c4")
    expect(run.diagnostics[0]?.line).toBe(7)
  })

  test("fails when an invalid model has no error details", async () => {
    const { run } = await runAdapter(JSON.stringify({ valid: false, errors: [] }), 1)

    expect(run.diagnostics.some((item) => item.code === "ARCH-LIKEC4")).toBe(true)
  })

  test("fails on malformed JSON output", async () => {
    const { run } = await runAdapter("not-json", 0, "no LikeC4 sources found")

    expect(run.diagnostics.some((item) => item.code === "ARCH-LIKEC4-OUTPUT")).toBe(true)
    expect(run.diagnostics[0]?.message).toContain("no LikeC4 sources found")
  })

  test("fails when LikeC4 exits non-zero for a valid payload", async () => {
    const { run } = await runAdapter(
      JSON.stringify({ valid: true, errors: [], stats: { totalFiles: 1 } }),
      1,
    )

    expect(run.diagnostics.some((item) => item.code === "ARCH-LIKEC4")).toBe(true)
  })

  test("fails when no LikeC4 sources were validated", async () => {
    const { run } = await runAdapter(
      JSON.stringify({ valid: true, errors: [], stats: { totalFiles: 0 } }),
    )

    expect(run.diagnostics.some((item) => item.code === "ARCH-LIKEC4")).toBe(true)
  })

  test("fails when LikeC4 does not report validated files", async () => {
    const { run } = await runAdapter(JSON.stringify({ valid: true, errors: [] }))

    expect(run.diagnostics.some((item) => item.code === "ARCH-LIKEC4-OUTPUT")).toBe(true)
  })

  test("uses range.start.line when line is absent", async () => {
    const { run } = await runAdapter(
      JSON.stringify({
        valid: false,
        errors: [
          {
            message: "Unknown element",
            file: "/project/spec/architecture/model.c4",
            range: { start: { line: 8 } },
          },
        ],
      }),
      1,
    )

    expect(run.diagnostics[0]?.line).toBe(9)
  })

  test("skips the adapter when the tool is missing", async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, stdout: "", stderr: "" }, null])
    const run = await new LikeC4Adapter().run({
      target: "/project",
      processRunner,
      toolLocator: new FakeToolLocator(null),
    })

    expect(run.ran).toBe(false)
    expect(run.diagnostics).toEqual([])
    expect(processRunner.calls).toHaveLength(0)
  })

  test("reports command failures", async () => {
    const processRunner = new FakeProcessRunner([
      null,
      { code: "COMMAND_SPAWN_FAILED", message: "not found" },
    ])
    const run = await new LikeC4Adapter().run({
      target: "/project",
      processRunner,
      toolLocator: new FakeToolLocator("/bin/likec4"),
    })

    expect(run.diagnostics.some((item) => item.code === "COMMAND_SPAWN_FAILED")).toBe(true)
  })
})
