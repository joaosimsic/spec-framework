import { attempt, type Result, ok, fail } from "../../core/result"
import type { IrEntryPoint } from "../../analysis/ir"
import type { AnalysisDatabase } from "../db"

interface EntryPointRow {
  id: string
  snapshot_id: string
  node_id: string
  kind: string
  label: string
  provenance: string
  confidence: string
  metadata_json: string
}

export class EntryPointRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  replace(snapshotId: string, entryPoints: IrEntryPoint[]): Result<number, string> {
    const [count, replaceError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query("DELETE FROM entry_points WHERE snapshot_id = ?")
          .run(snapshotId)
        const insert = this.database.connection.query(
          `INSERT INTO entry_points
            (id, snapshot_id, node_id, kind, label, provenance, confidence, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const entry of entryPoints) {
          insert.run(
            entry.id,
            snapshotId,
            entry.nodeId,
            entry.kind,
            entry.label,
            entry.provenance,
            entry.confidence,
            JSON.stringify(entry.metadata),
          )
        }

        return entryPoints.length
      })
      return transaction()
    })
    if (replaceError !== null || count === null) {
      return fail(replaceError ?? "entry points were not saved")
    }

    return ok(count)
  }

  list(snapshotId: string): IrEntryPoint[] {
    const rows = this.database.connection
      .query<EntryPointRow, [string]>(
        "SELECT * FROM entry_points WHERE snapshot_id = ? ORDER BY id",
      )
      .all(snapshotId)

    return rows.flatMap((row) => {
      const [metadata, parseError] = attempt(
        () => JSON.parse(row.metadata_json) as Record<string, string>,
      )
      if (parseError !== null || metadata === null) return []
      return [
        {
          id: row.id,
          nodeId: row.node_id,
          kind: this.kind(row.kind),
          label: row.label,
          provenance: row.provenance,
          confidence: this.confidence(row.confidence),
          metadata,
        },
      ]
    })
  }

  private kind(value: string): IrEntryPoint["kind"] {
    if (value === "http_route" || value === "library_api" || value === "application_main") {
      return value
    }
    if (value === "event_handler") return "event_handler"

    return "cli"
  }

  private confidence(value: string): IrEntryPoint["confidence"] {
    if (value === "inferred" || value === "ambiguous" || value === "unknown") return value

    return "observed"
  }
}
