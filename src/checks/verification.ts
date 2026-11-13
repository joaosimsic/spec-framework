import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { attemptAsync, fail, ok, type Result } from "../core/result"
import type {
  ProjectRecord,
  SnapshotRecord,
  VerificationCheckResultRecord,
  VerificationRunDetails,
  VerificationRunRecord,
} from "../persistence"
import { AnalysisIds, VerificationRunRepository } from "../persistence"
import type { GeneratedSpec } from "../spec"
import type { GeneratedCheckResult } from "./generated-check"

export interface VerificationRecordInput {
  project: ProjectRecord
  snapshot: SnapshotRecord
  spec: GeneratedSpec
  check: GeneratedCheckResult
  now?: string
}

export class VerificationRunRecorder {
  constructor(private readonly runs: VerificationRunRepository) {}

  async record(
    root: string,
    input: VerificationRecordInput,
  ): Promise<Result<VerificationRunDetails, string>> {
    const createdAt = input.now ?? new Date().toISOString()
    const runId = AnalysisIds.verificationRun(input.snapshot.id, createdAt)
    const passedCount = input.check.executions.filter((result) => result.result === "passed").length
    const failedCount = input.check.executions.filter((result) => result.result === "failed").length
    const unknownCount = input.check.executions.filter(
      (result) => result.result === "unknown",
    ).length
    const result =
      input.check.errors > 0 || failedCount > 0
        ? "failed"
        : input.check.executions.length === 0
          ? "unknown"
          : "passed"
    const run: VerificationRunRecord = {
      id: runId,
      projectId: input.project.id,
      snapshotId: input.snapshot.id,
      specHash: createHash("sha256").update(JSON.stringify(input.spec)).digest("hex"),
      runnerVersion: `bun-${Bun.version}`,
      result,
      errors: input.check.errors,
      warnings: input.check.warnings,
      checkCount: input.check.executions.length,
      passedCount,
      failedCount,
      unknownCount,
      findings: input.check.findings,
      createdAt,
    }
    const results: VerificationCheckResultRecord[] = input.check.executions.map((execution) => ({
      runId,
      checkId: execution.checkId,
      method: execution.method,
      command: execution.command,
      workingDirectory: execution.workingDirectory,
      result: execution.result,
      confidence: execution.confidence,
      exitCode: execution.exitCode,
      timedOut: execution.timedOut,
      durationMs: execution.durationMs,
      outputHash: execution.outputHash,
      output: execution.output,
      inputHashes: execution.inputHashes,
    }))
    const [saved, saveError] = this.runs.save(run, results)
    if (saveError !== null || saved === null) {
      return fail(saveError ?? "verification run was not saved")
    }
    const [, writeError] = await new VerificationArtifactWriter().write(root, { run, results })
    if (writeError !== null) return fail(writeError)

    return ok({ run, results })
  }
}

export class VerificationArtifactWriter {
  async write(root: string, details: VerificationRunDetails): Promise<Result<string, string>> {
    const path = join(root, "spec", "generated", "verification.gen.json")
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(
        path,
        `${JSON.stringify({ version: 1, run: details.run, results: details.results }, null, 2)}\n`,
      )
      return path
    })
    if (writeError !== null || written === null) {
      return fail(writeError ?? "verification artifact was not written")
    }

    return ok(written)
  }
}
