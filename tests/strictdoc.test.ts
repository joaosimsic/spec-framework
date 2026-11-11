import { describe, expect, test } from "bun:test"
import { StrictDocAdapter } from "../src/adapters/strictdoc"
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
  const run = await new StrictDocAdapter().run({
    target: "/project",
    processRunner,
    toolLocator: new FakeToolLocator("/bin/strictdoc"),
  })

  return { processRunner, run }
}

describe("StrictDocAdapter", () => {
  test("accepts a valid export", async () => {
    const { processRunner, run } = await runAdapter(
      "Export completed. Documentation tree can be found at: /tmp/sdoc-json\nTotal execution time: 0.5s",
    )

    expect(run.ran).toBe(true)
    expect(run.diagnostics).toEqual([])
    expect(processRunner.calls[0]?.arguments).toContain("export")
    expect(processRunner.calls[0]?.arguments).toContain("/project/spec/requirements")
    expect(processRunner.calls[0]?.arguments).toContain("--no-parallelization")
  })

  test("records requirements evidence", async () => {
    const { run } = await runAdapter(
      "Export completed. Documentation tree can be found at: /tmp/sdoc-json",
    )

    expect(run.evidence).toHaveLength(1)
    expect(run.evidence?.[0]?.id).toBe("EVD-REQ-STRICTDOC")
    expect(run.evidence?.[0]?.result).toBe("pass")
  })

  test("maps semantic errors to diagnostics", async () => {
    const { run } = await runAdapter(
      [
        "error: could not parse file: /project/spec/requirements/core.sdoc.",
        "Semantic error: Invalid requirement field: ACCEPTANCE",
        "Location: /project/spec/requirements/core.sdoc:4:1",
        "Hint: Compare with the document grammar.",
      ].join("\n"),
      1,
    )

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("REQ-STRICTDOC")
    expect(run.diagnostics[0]?.file).toBe("/project/spec/requirements/core.sdoc")
    expect(run.diagnostics[0]?.line).toBe(4)
  })

  test("maps syntax errors without a location line", async () => {
    const { run } = await runAdapter(
      "error: Could not parse file: /project/spec/requirements/broken.sdoc. Error: TextXSyntaxError",
      1,
    )

    expect(run.diagnostics).toHaveLength(1)
    expect(run.diagnostics[0]?.code).toBe("REQ-STRICTDOC")
    expect(run.diagnostics[0]?.file).toBe("/project/spec/requirements/broken.sdoc")
  })

  test("fails on non-zero exit without error details", async () => {
    const { run } = await runAdapter("Export failed", 1)

    expect(run.diagnostics.some((item) => item.code === "REQ-STRICTDOC-OUTPUT")).toBe(true)
  })

  test("skips the adapter when the tool is missing", async () => {
    const processRunner = new FakeProcessRunner([{ exitCode: 0, stdout: "", stderr: "" }, null])
    const run = await new StrictDocAdapter().run({
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
    const run = await new StrictDocAdapter().run({
      target: "/project",
      processRunner,
      toolLocator: new FakeToolLocator("/bin/strictdoc"),
    })

    expect(run.diagnostics.some((item) => item.code === "COMMAND_SPAWN_FAILED")).toBe(true)
  })
})
