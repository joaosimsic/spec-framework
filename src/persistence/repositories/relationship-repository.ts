import { attempt, type Result, ok, fail } from "../../core/result"
import type { IrRelationship } from "../../analysis/ir"
import type { AnalysisDatabase } from "../db"

interface RelationshipRow {
  id: string
  data_json: string
}

export class RelationshipRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  replace(snapshotId: string, relationships: IrRelationship[]): Result<number, string> {
    const [count, replaceError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query("DELETE FROM relationships WHERE snapshot_id = ?")
          .run(snapshotId)
        const insert = this.database.connection.query(
          `INSERT INTO relationships
            (id, snapshot_id, source_id, target_id, type, resolution, confidence, provenance, resolved_by, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const relationship of relationships) {
          insert.run(
            relationship.id,
            snapshotId,
            relationship.sourceId,
            relationship.targetId,
            relationship.type,
            relationship.resolution,
            relationship.confidence,
            relationship.provenance,
            relationship.resolvedBy,
            JSON.stringify(relationship),
          )
        }

        return relationships.length
      })
      return transaction()
    })
    if (replaceError !== null || count === null) {
      return fail(replaceError ?? "relationships were not saved")
    }

    return ok(count)
  }

  list(snapshotId: string): IrRelationship[] {
    const rows = this.database.connection
      .query<RelationshipRow, [string]>(
        "SELECT id, data_json FROM relationships WHERE snapshot_id = ? ORDER BY id",
      )
      .all(snapshotId)

    return rows.flatMap((row) => {
      const [relationship, parseError] = attempt(() => JSON.parse(row.data_json) as IrRelationship)
      return parseError !== null || relationship === null ? [] : [relationship]
    })
  }
}
