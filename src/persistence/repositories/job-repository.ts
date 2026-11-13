import { attempt, type Result, ok, fail } from "../../core/result"
import type { AnalysisDatabase } from "../db"
import type { JobRecord, JobState } from "../types"

interface JobRow {
  id: string
  project_id: string
  state: JobState
  phase: string
  progress: number
  message: string
  error: string | null
  snapshot_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export class JobRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  save(job: JobRecord): Result<JobRecord, string> {
    const [saved, saveError] = attempt(() => {
      this.database.connection
        .query(
          `INSERT INTO jobs
            (id, project_id, state, phase, progress, message, error, snapshot_id, created_at, started_at, finished_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          job.id,
          job.projectId,
          job.state,
          job.phase,
          job.progress,
          job.message,
          job.error,
          job.snapshotId,
          job.createdAt,
          job.startedAt,
          job.finishedAt,
        )
      return job
    })
    if (saveError !== null || saved === null) return fail(saveError ?? "job was not saved")

    return ok(saved)
  }

  update(job: JobRecord): Result<JobRecord, string> {
    const [updated, updateError] = attempt(() => {
      this.database.connection
        .query(
          `UPDATE jobs SET
            state = ?, phase = ?, progress = ?, message = ?, error = ?,
            snapshot_id = ?, started_at = ?, finished_at = ? WHERE id = ?`,
        )
        .run(
          job.state,
          job.phase,
          job.progress,
          job.message,
          job.error,
          job.snapshotId,
          job.startedAt,
          job.finishedAt,
          job.id,
        )
      return job
    })
    if (updateError !== null || updated === null) return fail(updateError ?? "job was not updated")

    return ok(updated)
  }

  find(id: string): JobRecord | null {
    const row = this.database.connection
      .query<JobRow, [string]>("SELECT * FROM jobs WHERE id = ?")
      .get(id)
    if (row === null) return null

    return this.map(row)
  }

  list(projectId: string): JobRecord[] {
    const rows = this.database.connection
      .query<JobRow, [string]>(
        "SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC, id DESC",
      )
      .all(projectId)

    return rows.map((row) => this.map(row))
  }

  private map(row: JobRow): JobRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      state: row.state,
      phase: row.phase,
      progress: row.progress,
      message: row.message,
      error: row.error,
      snapshotId: row.snapshot_id,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }
  }
}
