import { attempt, type Result, ok, fail } from "../../core/result"
import type { AnalysisDatabase } from "../db"
import type { AnalysisRunRecord, JobState } from "../types"

interface RunRow {
  id: string
  project_id: string
  state: JobState
  started_at: string | null
  finished_at: string | null
  error: string | null
}

export class AnalysisRunRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  save(run: AnalysisRunRecord): Result<AnalysisRunRecord, string> {
    const [saved, saveError] = attempt(() => {
      this.database.connection
        .query(
          "INSERT INTO analysis_runs (id, project_id, state, started_at, finished_at, error) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(run.id, run.projectId, run.state, run.startedAt, run.finishedAt, run.error)
      return run
    })
    if (saveError !== null || saved === null) return fail(saveError ?? "analysis run was not saved")

    return ok(saved)
  }

  update(run: AnalysisRunRecord): Result<AnalysisRunRecord, string> {
    const [updated, updateError] = attempt(() => {
      this.database.connection
        .query(
          "UPDATE analysis_runs SET state = ?, started_at = ?, finished_at = ?, error = ? WHERE id = ?",
        )
        .run(run.state, run.startedAt, run.finishedAt, run.error, run.id)
      return run
    })
    if (updateError !== null || updated === null) {
      return fail(updateError ?? "analysis run was not updated")
    }

    return ok(updated)
  }

  find(id: string): AnalysisRunRecord | null {
    const row = this.database.connection
      .query<RunRow, [string]>("SELECT * FROM analysis_runs WHERE id = ?")
      .get(id)
    if (row === null) return null

    return this.map(row)
  }

  list(projectId: string): AnalysisRunRecord[] {
    const rows = this.database.connection
      .query<RunRow, [string]>(
        "SELECT * FROM analysis_runs WHERE project_id = ? ORDER BY rowid DESC",
      )
      .all(projectId)

    return rows.map((row) => this.map(row))
  }

  private map(row: RunRow): AnalysisRunRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      state: row.state,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      error: row.error,
    }
  }
}
