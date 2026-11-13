import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fail, ok, type Result } from "../src/core/result"
import { AnalysisDatabase, ProjectRepository } from "../src/persistence"
import { AnalysisJobRunner, JobEventBus } from "../src/jobs"
import type {
  AnalysisExecutionRequest,
  AnalysisExecutionResult,
  AnalysisExecutor,
} from "../src/jobs/types"

class FakeExecutor implements AnalysisExecutor {
  constructor(private readonly waitForAbort = false) {}

  async execute(
    request: AnalysisExecutionRequest,
  ): Promise<Result<AnalysisExecutionResult, string>> {
    request.report({ phase: "scan", progress: 0.5, message: "scanning" })
    if (this.waitForAbort) {
      return new Promise((resolve) => {
        request.signal.addEventListener("abort", () => resolve(fail("cancelled")))
      })
    }

    return ok({
      commit: "abc123",
      dirty: false,
      analyzer: "fake",
      analyzerVersion: "1",
      ruleVersion: "1",
      promptVersion: "1",
      modelVersion: "none",
      files: [
        {
          path: "src/index.ts",
          absolutePath: "/tmp/src/index.ts",
          language: "typescript",
          hash: "hash",
          size: 10,
          lineCount: 1,
          modifiedAt: "2026-11-13T00:00:00.000Z",
        },
      ],
      nodes: [],
      edges: [],
      entryPoints: [],
      flows: [],
      findings: [],
      mapping: null,
      coverage: {
        mapped: [],
        partial: [],
        unmapped: [],
        unassigned: [],
        stale: [],
        ambiguous: [],
        entry_points_without_sinks: [],
        behavior_without_implementation: [],
        external_systems: [],
      },
    })
  }
}

async function createRunner(waitForAbort = false) {
  const target = await mkdtemp(join(tmpdir(), "analysis-job-"))
  const [database, databaseError] = AnalysisDatabase.open(target)
  expect(databaseError).toBeNull()
  if (database === null) throw new Error("database unavailable")
  const [project, projectError] = new ProjectRepository(database).save("sample", target, {
    staticAnalysis: true,
    semanticAnalysis: true,
    flowAnalysis: true,
  })
  expect(projectError).toBeNull()
  if (project === null) throw new Error("project unavailable")

  return {
    target,
    database,
    project,
    runner: new AnalysisJobRunner(database, new FakeExecutor(waitForAbort), new JobEventBus()),
  }
}

async function waitForTerminal(runner: AnalysisJobRunner, jobId: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = runner.get(jobId)
    if (job !== null && ["succeeded", "failed", "cancelled"].includes(job.state)) return job
    await Bun.sleep(10)
  }

  throw new Error("job did not finish")
}

describe("analysis jobs", () => {
  test("runs an analysis and persists an exported snapshot", async () => {
    const { database, project, runner } = await createRunner()
    const [job, startError] = runner.start(project)
    expect(startError).toBeNull()
    if (job === null) return

    const finished = await waitForTerminal(runner, job.id)
    expect(finished.state).toBe("succeeded")
    expect(finished.snapshotId).not.toBeNull()
    expect(runner.history(job.id).map((event) => event.type)).toContain("completed")

    const exported = Bun.file(
      join(project.repositoryPath, "spec", "generated", "analysis.gen.json"),
    )
    expect(await exported.exists()).toBe(true)
    database.close()
  })

  test("cancels a running analysis", async () => {
    const { database, project, runner } = await createRunner(true)
    const [job, startError] = runner.start(project)
    expect(startError).toBeNull()
    if (job === null) return

    await Bun.sleep(20)
    const [, cancelError] = runner.cancel(job.id)
    expect(cancelError).toBeNull()
    const finished = await waitForTerminal(runner, job.id)
    expect(finished.state).toBe("cancelled")
    database.close()
  })
})
