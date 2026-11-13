import { attempt, type Result, ok, fail } from "../../core/result"
import type { AnalysisDatabase } from "../db"
import type { CodeArtifactRecord } from "../types"

interface ArtifactRow {
  id: string
  snapshot_id: string
  path: string
  language: string
  hash: string
  size: number
  line_count: number
  modified_at: string
}

export class CodeArtifactRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  replace(snapshotId: string, artifacts: CodeArtifactRecord[]): Result<number, string> {
    const [count, replaceError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query("DELETE FROM code_artifacts WHERE snapshot_id = ?")
          .run(snapshotId)
        const insert = this.database.connection.query(
          `INSERT INTO code_artifacts
            (id, snapshot_id, path, language, hash, size, line_count, modified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const artifact of artifacts) {
          insert.run(
            artifact.id,
            artifact.snapshotId,
            artifact.path,
            artifact.language,
            artifact.hash,
            artifact.size,
            artifact.lineCount,
            artifact.modifiedAt,
          )
        }

        return artifacts.length
      })
      return transaction()
    })
    if (replaceError !== null || count === null) {
      return fail(replaceError ?? "code artifacts were not saved")
    }

    return ok(count)
  }

  list(snapshotId: string): CodeArtifactRecord[] {
    const rows = this.database.connection
      .query<ArtifactRow, [string]>(
        "SELECT * FROM code_artifacts WHERE snapshot_id = ? ORDER BY path",
      )
      .all(snapshotId)

    return rows.map((row) => ({
      id: row.id,
      snapshotId: row.snapshot_id,
      path: row.path,
      language: row.language,
      hash: row.hash,
      size: row.size,
      lineCount: row.line_count,
      modifiedAt: row.modified_at,
    }))
  }
}
