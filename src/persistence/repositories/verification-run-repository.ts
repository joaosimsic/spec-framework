import { attempt, fail, ok, type Result } from "../../core/result"
import type {
  VerificationCheckResultRecord,
  VerificationRunDetails,
  VerificationRunRecord,
  VerificationRunResult,
} from "../types"
import type { AnalysisDatabase } from "../db"

interface VerificationRunRow {
  id: string
  project_id: string
  snapshot_id: string
  spec_hash: string
  runner_version: string
  result: string
  errors: number
  warnings: number
  check_count: number
  passed_count: number
  failed_count: number
  unknown_count: number
  findings_json: string
  created_at: string
}

interface VerificationResultRow {
  run_id: string
  check_id: string
  method: string
  command_json: string
  working_directory: string
  result: string
  confidence: string
  exit_code: number | null
  timed_out: number
  duration_ms: number
  output_hash: string
  output_tail: string
  input_hashes_json: string
}

export class VerificationRunRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  save(
    run: VerificationRunRecord,
    results: VerificationCheckResultRecord[],
  ): Result<VerificationRunRecord, string> {
    const [saved, saveError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query(
            `INSERT INTO verification_runs
              (id, project_id, snapshot_id, spec_hash, runner_version, result, errors, warnings,
               check_count, passed_count, failed_count, unknown_count, findings_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            run.id,
            run.projectId,
            run.snapshotId,
            run.specHash,
            run.runnerVersion,
            run.result,
            run.errors,
            run.warnings,
            run.checkCount,
            run.passedCount,
            run.failedCount,
            run.unknownCount,
            JSON.stringify(run.findings),
            run.createdAt,
          )
        const insert = this.database.connection.query(
          `INSERT INTO verification_results
            (run_id, check_id, method, command_json, working_directory, result, confidence,
             exit_code, timed_out, duration_ms, output_hash, output_tail, input_hashes_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const result of results) {
          insert.run(
            result.runId,
            result.checkId,
            result.method,
            JSON.stringify(result.command),
            result.workingDirectory,
            result.result,
            result.confidence,
            result.exitCode,
            result.timedOut ? 1 : 0,
            result.durationMs,
            result.outputHash,
            result.output,
            JSON.stringify(result.inputHashes),
          )
        }

        return run
      })

      return transaction()
    })
    if (saveError !== null || saved === null) {
      return fail(saveError ?? "verification run was not saved")
    }

    return ok(saved)
  }

  latest(projectId: string): VerificationRunDetails | null {
    const row = this.database.connection
      .query<VerificationRunRow, [string]>(
        "SELECT * FROM verification_runs WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .get(projectId)
    if (row === null) return null

    return this.details(row)
  }

  find(runId: string): VerificationRunDetails | null {
    const row = this.database.connection
      .query<VerificationRunRow, [string]>("SELECT * FROM verification_runs WHERE id = ?")
      .get(runId)
    if (row === null) return null

    return this.details(row)
  }

  private details(row: VerificationRunRow): VerificationRunDetails | null {
    const [findings, findingsError] = attempt(() => JSON.parse(row.findings_json) as string[])
    if (findingsError !== null || findings === null) return null
    const results = this.results(row.id)

    return {
      run: {
        id: row.id,
        projectId: row.project_id,
        snapshotId: row.snapshot_id,
        specHash: row.spec_hash,
        runnerVersion: row.runner_version,
        result: this.result(row.result),
        errors: row.errors,
        warnings: row.warnings,
        checkCount: row.check_count,
        passedCount: row.passed_count,
        failedCount: row.failed_count,
        unknownCount: row.unknown_count,
        findings,
        createdAt: row.created_at,
      },
      results,
    }
  }

  private results(runId: string): VerificationCheckResultRecord[] {
    const rows = this.database.connection
      .query<VerificationResultRow, [string]>(
        "SELECT * FROM verification_results WHERE run_id = ? ORDER BY check_id",
      )
      .all(runId)

    return rows.flatMap((row) => {
      const [command, commandError] = attempt(() => JSON.parse(row.command_json) as string[])
      const [inputHashes, hashesError] = attempt(
        () => JSON.parse(row.input_hashes_json) as string[],
      )
      if (
        commandError !== null ||
        command === null ||
        hashesError !== null ||
        inputHashes === null
      ) {
        return []
      }

      return [
        {
          runId: row.run_id,
          checkId: row.check_id,
          method: row.method,
          command,
          workingDirectory: row.working_directory,
          result: this.result(row.result),
          confidence: row.confidence,
          exitCode: row.exit_code,
          timedOut: row.timed_out === 1,
          durationMs: row.duration_ms,
          outputHash: row.output_hash,
          output: row.output_tail,
          inputHashes,
        },
      ]
    })
  }

  private result(value: string): VerificationRunResult {
    return value === "passed" || value === "failed" ? value : "unknown"
  }
}
