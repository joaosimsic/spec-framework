import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ok, type Result } from "../src/core/result"
import type { AiProvider, AiRequest } from "../src/ai/types"
import { AiInterpreter } from "../src/ai/interpreter"
import { GeneratedCheck, VerificationRunRecorder } from "../src/checks"
import { InterpretationRunner } from "../src/interpretations"
import { AnalysisRuntime } from "../src/workbench/analysis-runtime"
import { GeneratedBundleWriter } from "../src/bundle"
import { GeneratedQuery } from "../src/query"

const fixture = join(import.meta.dir, "fixtures", "repositories", "typescript-basic")

class FakeProvider implements AiProvider {
  readonly id = "fake"
  readonly model = "fake-model"

  async complete(request: AiRequest): Promise<Result<string, string>> {
    const filePath =
      request.task === "verification_interpretation" ? "spec-framework.json" : "package.json"
    return ok(
      JSON.stringify({
        explanation: `Interpreted ${request.task}.`,
        evidence: [{ filePath, line: 1, reference: request.task }],
        confidence: 0.6,
      }),
    )
  }
}

async function createRepository(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "interpretations-"))
  await cp(fixture, target, { recursive: true })
  await writeFile(
    join(target, "spec-framework.json"),
    `${JSON.stringify(
      {
        version: 1,
        checks: [
          {
            id: "failing",
            kind: "test",
            command: ["bun", "-e", "process.exit(3)"],
            workingDirectory: ".",
            timeoutMs: 5000,
          },
        ],
      },
      null,
      2,
    )}\n`,
  )
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

describe("derived AI interpretations", () => {
  test("interprets contracts and failed verification checks into a derived artifact", async () => {
    const target = await createRepository()
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

    const [checkResult, checkError] = await new GeneratedCheck().run(target, spec)
    expect(checkError).toBeNull()
    if (checkResult === null) return
    const [verification, verificationError] = await new VerificationRunRecorder(
      runtime.verificationRuns,
    ).record(target, { project, snapshot, spec, check: checkResult })
    expect(verificationError).toBeNull()
    expect(verification?.run.result).toBe("failed")
    if (verification === null) return

    const interpreter = new AiInterpreter(
      {
        mode: "local",
        endpoint: "http://127.0.0.1",
        model: "fake-model",
        apiKeyEnvironment: null,
        promptVersion: "1",
      },
      new FakeProvider(),
      runtime.aiRuns,
    )
    const [details, interpretationError] = await new InterpretationRunner(
      interpreter,
      runtime.interpretationRuns,
    ).run({
      root: target,
      project,
      snapshot,
      spec,
      kind: "all",
      verification,
      elements: runtime.elements.list(snapshot.id),
      relationships: runtime.relationships.list(snapshot.id),
      files: runtime.artifacts.list(snapshot.id).map((artifact) => artifact.path),
    })
    expect(interpretationError).toBeNull()
    expect(details).not.toBeNull()
    if (details === null) return

    expect(details.run.failures).toEqual([])
    expect(details.interpretations.some((item) => item.targetKind === "contract")).toBe(true)
    expect(details.interpretations.some((item) => item.targetKind === "verification")).toBe(true)
    expect(details.interpretations.every((item) => item.provider === "fake")).toBe(true)
    expect(runtime.latestInterpretation(project)?.run.id).toBe(details.run.id)
    const artifact = join(target, "spec", "generated", "interpretations.gen.json")
    expect(await Bun.file(artifact).exists()).toBe(true)
    const payload = JSON.parse(await readFile(artifact, "utf8")) as {
      run: { id: string }
      interpretations: Array<{ targetKind: string }>
    }
    expect(payload.run.id).toBe(details.run.id)
    expect(payload.interpretations.length).toBe(details.interpretations.length)
    runtime.close()

    const [bundle, bundleError] = await new GeneratedBundleWriter().write(target, spec, {
      verification,
      interpretations: details,
    })
    expect(bundleError).toBeNull()
    expect(bundle?.files.some((file) => file.endsWith("interpretations.json"))).toBe(true)

    const [queried, queryError] = await new GeneratedQuery(target).run({
      section: "interpretations",
    })
    expect(queryError).toBeNull()
    if (queried === null) return
    const queryPayload = JSON.parse(queried.output) as { run: { id: string } }
    expect(queryPayload.run.id).toBe(details.run.id)
  }, 30000)
})
