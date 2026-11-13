import { attempt, type Result, ok, fail } from "../../core/result"
import type { AnalysisDatabase } from "../db"

export interface AnnotationRecord {
  id: string
  projectId: string
  snapshotId: string | null
  targetKind: string
  targetId: string
  status: string
  rationale: string
  author: string
  createdAt: string
}

export class AnnotationRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  save(annotation: AnnotationRecord): Result<AnnotationRecord, string> {
    const [saved, saveError] = attempt(() => {
      this.database.connection
        .query(
          `INSERT INTO annotations
            (id, project_id, snapshot_id, target_kind, target_id, status, rationale, author, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          annotation.id,
          annotation.projectId,
          annotation.snapshotId,
          annotation.targetKind,
          annotation.targetId,
          annotation.status,
          annotation.rationale,
          annotation.author,
          annotation.createdAt,
        )
      return annotation
    })
    if (saveError !== null || saved === null) return fail(saveError ?? "annotation was not saved")

    return ok(saved)
  }

  list(projectId: string): AnnotationRecord[] {
    const rows = this.database.connection
      .query<
        {
          id: string
          project_id: string
          snapshot_id: string | null
          target_kind: string
          target_id: string
          status: string
          rationale: string
          author: string
          created_at: string
        },
        [string]
      >("SELECT * FROM annotations WHERE project_id = ? ORDER BY created_at DESC, id DESC")
      .all(projectId)

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      snapshotId: row.snapshot_id,
      targetKind: row.target_kind,
      targetId: row.target_id,
      status: row.status,
      rationale: row.rationale,
      author: row.author,
      createdAt: row.created_at,
    }))
  }
}
