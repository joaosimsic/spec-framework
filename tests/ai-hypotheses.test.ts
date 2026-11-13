import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { cp, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ok, type Result } from "../src/core/result"
import type { AiProvider, AiRequest } from "../src/ai/types"
import { AnalysisRuntime } from "../src/workbench/analysis-runtime"

const fixture = join(import.meta.dir, "fixtures", "repositories", "typescript-basic")

class FakeProvider implements AiProvider {
  readonly id = "fake"
  readonly model = "fake-model"

  async complete(request: AiRequest): Promise<Result<string, string>> {
    const elementId = /^element (\S+)$/m.exec(request.context)?.[1]
    const filePath = /^path ([^:]+):/m.exec(request.context)?.[1]
    if (elementId === undefined || filePath === undefined) {
      return ok(JSON.stringify({ responsibility: "x", observedResponsibilities: [], issues: [] }))
    }

    return ok(
      JSON.stringify({
        responsibility: "AI suggests this component should be renamed Example Rename",
        observedResponsibilities: [],
        issues: [],
        evidence: [{ elementId, filePath, line: 1 }],
        confidence: 0.5,
      }),
    )
  }
}

async function createRepository(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "ai-hypotheses-"))
  await cp(fixture, target, { recursive: true })
  execFileSync("git", ["init"], { cwd: target, stdio: "ignore" })
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: target })
  execFileSync("git", ["config", "user.name", "Test"], { cwd: target })
  execFileSync("git", ["add", "."], { cwd: target })
  execFileSync("git", ["commit", "-m", "initial"], { cwd: target, stdio: "ignore" })

  return target
}

describe("AI hypotheses", () => {
  test("stay separate from deterministic labels", async () => {
    const target = await createRepository()
    const [runtime, runtimeError] = await AnalysisRuntime.create(target, {
      aiConfig: {
        mode: "local",
        endpoint: "http://127.0.0.1",
        model: "fake-model",
        apiKeyEnvironment: null,
        promptVersion: "1",
      },
      aiProvider: new FakeProvider(),
    })
    expect(runtimeError).toBeNull()
    if (runtime === null) return
    const project = runtime.currentProject()
    expect(project).not.toBeNull()
    if (project === null) return
    const [job, jobError] = runtime.jobs.start(project)
    expect(jobError).toBeNull()
    if (job === null) return
    for (let attempt = 0; attempt < 200; attempt++) {
      const current = runtime.jobs.get(job.id)
      if (current !== null && ["succeeded", "failed", "cancelled"].includes(current.state)) break
      await Bun.sleep(50)
    }
    const spec = runtime.spec(project)
    runtime.close()
    expect(spec).not.toBeNull()
    if (spec === null) return

    expect(spec.hypotheses.length).toBeGreaterThan(0)
    expect(spec.findings.some((finding) => finding.family === "ai_assisted")).toBe(false)
    expect(spec.unknowns.some((unknown) => unknown.source === "ai:diagnosis")).toBe(true)
    for (const hypothesis of spec.hypotheses) {
      const component = spec.architecture.components.find(
        (candidate) => candidate.id === hypothesis.conceptual_id,
      )
      expect(component).not.toBeUndefined()
      if (component === undefined) continue
      expect(component.label).toBe(`${component.label_role} ${component.label_anchor}`)
      expect(component.label).not.toContain("Example Rename")
      expect(hypothesis.text).toContain("Example Rename")
    }
  })
})
