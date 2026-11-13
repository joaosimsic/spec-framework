import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CheckRunner } from "../src/checks/runner"
import { GeneratedCheck, VerificationRunRecorder } from "../src/checks"
import type { CheckConfig } from "../src/config"
import { AnalysisRuntime } from "../src/workbench/analysis-runtime"
import { GeneratedQuery } from "../src/query"

const fixture = join(import.meta.dir, "fixtures", "repositories", "typescript-basic")

function check(id: string, command: string[], overrides: Partial<CheckConfig> = {}): CheckConfig {
  return {
    id,
    command,
    workingDirectory: ".",
    timeoutMs: 5000,
    kind: "test",
    ...overrides,
  }
}

async function createRepository(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "verification-runs-"))
  await cp(fixture, target, { recursive: true })
  execFileSync("git", ["init"], { cwd: target, stdio: "ignore" })
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: target })
  execFileSync("git", ["config", "user.name", "Test"], { cwd: target })
  execFileSync("git", ["add", "."], { cwd: target })
  execFileSync("git", ["commit", "-m", "initial"], { cwd: target, stdio: "ignore" })

  return target
}

async function analyze(runtime: AnalysisRuntime) {
  const project = runtime.currentProject()
  expect(project).not.toBeNull()
  if (project === null) throw new Error("project unavailable")
  const [job, startError] = runtime.jobs.start(project)
  expect(startError).toBeNull()
  if (job === null) throw new Error("job unavailable")
  for (let attempt = 0; attempt < 200; attempt++) {
    const current = runtime.jobs.get(job.id)
    if (current !== null && ["succeeded", "failed", "cancelled"].includes(current.state)) {
      return { project, job: current }
    }
    await Bun.sleep(50)
  }

  throw new Error("analysis did not finish")
}

describe("verification runs", () => {
  test("records pass, fail, missing executable, and timeout outcomes", async () => {
    const target = await createRepository()
    const [run, runError] = await new CheckRunner().run(target, [
      check("pass", ["bun", "-e", "process.exit(0)"]),
      check("fail", ["bun", "-e", "process.exit(7)"]),
      check("missing", ["definitely-not-a-real-executable-xyz"]),
      check("timeout", ["bun", "-e", "setTimeout(() => {}, 1000)"], { timeoutMs: 20 }),
    ])
    expect(runError).toBeNull()
    if (run === null) return

    expect(run.executions.map((result) => [result.checkId, result.result])).toEqual([
      ["pass", "passed"],
      ["fail", "failed"],
      ["missing", "failed"],
      ["timeout", "failed"],
    ])
    expect(run.executions.find((result) => result.checkId === "fail")?.exitCode).toBe(7)
    expect(run.executions.find((result) => result.checkId === "missing")?.confidence).toBe(
      "unknown",
    )
    expect(run.executions.find((result) => result.checkId === "timeout")?.timedOut).toBe(true)
    for (const execution of run.executions) {
      expect(execution.durationMs).toBeGreaterThanOrEqual(0)
      expect(execution.outputHash).not.toBe("")
      expect(execution.inputHashes).toHaveLength(1)
    }
  })

  test("rejects invalid or escaping check configuration", async () => {
    const target = await createRepository()
    const runner = new CheckRunner()
    const [escape, escapeError] = await runner.run(target, [
      check("escape", ["bun", "-e", "process.exit(0)"], { workingDirectory: "../" }),
    ])
    expect(escape).toBeNull()
    expect(escapeError).toContain("escapes")

    const [duplicate, duplicateError] = await runner.run(target, [
      check("same", ["bun", "-e", "process.exit(0)"]),
      check("same", ["bun", "-e", "process.exit(0)"]),
    ])
    expect(duplicate).toBeNull()
    expect(duplicateError).toContain("duplicate")

    const [timeout, timeoutError] = await runner.run(target, [
      check("timeout", ["bun", "-e", "process.exit(0)"], { timeoutMs: 0 }),
    ])
    expect(timeout).toBeNull()
    expect(timeoutError).toContain("invalid timeout")
  })

  test("persists a check run without changing the generated spec", async () => {
    const target = await createRepository()
    await writeFile(
      join(target, "spec-framework.json"),
      `${JSON.stringify(
        {
          version: 1,
          checks: [
            {
              id: "pass",
              kind: "test",
              command: ["bun", "-e", "process.exit(0)"],
              workingDirectory: ".",
              timeoutMs: 5000,
            },
          ],
        },
        null,
        2,
      )}\n`,
    )
    const [runtime, runtimeError] = await AnalysisRuntime.create(target)
    expect(runtimeError).toBeNull()
    if (runtime === null) return

    const { project, job } = await analyze(runtime)
    expect(job.state).toBe("succeeded")
    const spec = runtime.spec(project)
    const snapshot = runtime.latest(project)
    expect(spec).not.toBeNull()
    expect(snapshot).not.toBeNull()
    if (spec === null || snapshot === null) return
    const path = join(target, "spec", "generated", "spec.gen.json")
    const before = await readFile(path, "utf8")
    const specBefore = JSON.stringify(spec)

    const [checkResult, checkError] = await new GeneratedCheck().run(target, spec)
    expect(checkError).toBeNull()
    if (checkResult === null) return
    const [details, recordError] = await new VerificationRunRecorder(
      runtime.verificationRuns,
    ).record(target, { project, snapshot, spec, check: checkResult })
    expect(recordError).toBeNull()
    expect(details).not.toBeNull()
    if (details === null) return

    expect(details.run.result).toBe("passed")
    expect(runtime.latestVerification(project)?.run.id).toBe(details.run.id)
    expect(details.results).toHaveLength(1)
    expect(details.results[0]?.checkId).toBe("pass")
    expect(JSON.stringify(runtime.spec(project))).toBe(specBefore)
    expect(await readFile(path, "utf8")).toBe(before)
    const artifact = join(target, "spec", "generated", "verification.gen.json")
    expect(await Bun.file(artifact).exists()).toBe(true)
    const payload = JSON.parse(await readFile(artifact, "utf8")) as {
      run: { id: string; result: string }
      results: Array<{ checkId: string }>
    }
    expect(payload.run.id).toBe(details.run.id)
    expect(payload.run.result).toBe("passed")
    expect(payload.results[0]?.checkId).toBe("pass")
    runtime.close()
    const [queried, queryError] = await new GeneratedQuery(target).run({
      section: "verification-run",
    })
    expect(queryError).toBeNull()
    if (queried === null) return
    const queryPayload = JSON.parse(queried.output) as { run: { id: string } }
    expect(queryPayload.run.id).toBe(details.run.id)
  }, 20000)
})
