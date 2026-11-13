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
    if (request.task === "architecture_diagnosis") {
      const componentId = /Target component: .* \((CMP-[^)]+)\)/m.exec(request.prompt)?.[1]
      if (componentId === undefined || elementId === undefined || filePath === undefined) {
        return ok(JSON.stringify({ findings: [] }))
      }
      return ok(
        JSON.stringify({
          findings: [
            {
              ruleId: "ARC-005",
              title: "Mixed request responsibilities",
              explanation: "The component serves unrelated request paths.",
              recommendation: "Review whether the behavior should be split.",
              affectedElements: [componentId],
              evidence: [{ elementId, filePath, line: 1 }],
              confidence: 0.6,
            },
          ],
        }),
      )
    }
    if (elementId === undefined || filePath === undefined) {
      return ok(JSON.stringify({ responsibility: "x", observedResponsibilities: [], issues: [] }))
    }

    return ok(
      JSON.stringify({
        responsibility: "Observed responsibility.",
        observedResponsibilities: [],
        issues: [],
        evidence: [{ elementId, filePath, line: 1 }],
        confidence: 0.5,
      }),
    )
  }
}

async function createRepository(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "ai-diagnostics-"))
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

describe("AI diagnostics", () => {
  test("stores validated diagnoses separately with model metadata", async () => {
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

    const { project, job } = await analyze(runtime)
    expect(job.state).toBe("succeeded")
    const spec = runtime.spec(project)
    const snapshot = runtime.latest(project)
    runtime.close()
    expect(spec).not.toBeNull()
    expect(snapshot).not.toBeNull()
    if (spec === null || snapshot === null) return

    const assisted = spec.findings.filter((finding) => finding.family === "ai_assisted")
    expect(assisted.length).toBeGreaterThan(0)
    expect(snapshot.findingCount).toBe(spec.findings.length)
    for (const finding of assisted) {
      expect(["ARC-005", "ARC-006", "ARC-009", "ARC-010"]).toContain(finding.ruleId)
      expect(finding.status).toBe("open")
      expect(finding.severity).toBe("warning")
      expect(finding.provider).toBe("fake")
      expect(finding.model).toBe("fake-model")
      expect(finding.promptVersion).toBe("1")
      expect(finding.inputHashes?.length).toBeGreaterThan(0)
      expect(finding.evidence.length).toBeGreaterThan(0)
      expect(
        spec.architecture.components.some((component) =>
          finding.affectedElements.includes(component.id),
        ),
      ).toBe(true)
    }
    for (const component of spec.architecture.components) {
      expect(component.label).toBe(`${component.label_role} ${component.label_anchor}`)
    }
  }, 20000)

  test("produces no AI findings when AI is disabled", async () => {
    const target = await createRepository()
    const [runtime, runtimeError] = await AnalysisRuntime.create(target)
    expect(runtimeError).toBeNull()
    if (runtime === null) return

    const { project, job } = await analyze(runtime)
    expect(job.state).toBe("succeeded")
    const spec = runtime.spec(project)
    runtime.close()
    expect(spec).not.toBeNull()
    if (spec === null) return

    expect(spec.findings.every((finding) => finding.family === "deterministic")).toBe(true)
    expect(spec.hypotheses).toHaveLength(0)
  }, 20000)
})
