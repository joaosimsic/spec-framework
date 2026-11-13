import { attempt, type Result, ok, fail } from "../../core/result"
import type { IrElement } from "../../analysis/ir"
import type { AnalysisDatabase } from "../db"

interface ElementRow {
  id: string
  snapshot_id: string
  data_json: string
}

export class ElementRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  replace(snapshotId: string, elements: IrElement[]): Result<number, string> {
    const [count, replaceError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query("DELETE FROM arch_elements WHERE snapshot_id = ?")
          .run(snapshotId)
        const insert = this.database.connection.query(
          `INSERT INTO arch_elements
            (id, snapshot_id, type, name, qualified_name, file_path, start_line, end_line,
             parent_id, signature, visibility, exported, confidence, provenance, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const element of elements) {
          insert.run(
            element.id,
            snapshotId,
            element.type,
            element.name,
            element.qualifiedName,
            element.filePath,
            element.startLine,
            element.endLine,
            element.parentId,
            element.signature,
            element.visibility,
            element.exported ? 1 : 0,
            element.confidence,
            element.provenance,
            JSON.stringify(element),
          )
        }

        return elements.length
      })
      return transaction()
    })
    if (replaceError !== null || count === null) {
      return fail(replaceError ?? "elements were not saved")
    }

    return ok(count)
  }

  list(snapshotId: string): IrElement[] {
    const rows = this.database.connection
      .query<ElementRow, [string]>(
        "SELECT id, snapshot_id, data_json FROM arch_elements WHERE snapshot_id = ? ORDER BY id",
      )
      .all(snapshotId)

    return rows.flatMap((row) => {
      const [element, parseError] = attempt(() => JSON.parse(row.data_json) as IrElement)
      return parseError !== null || element === null ? [] : [element]
    })
  }

  find(snapshotId: string, id: string): IrElement | null {
    const row = this.database.connection
      .query<ElementRow, [string, string]>(
        "SELECT id, snapshot_id, data_json FROM arch_elements WHERE snapshot_id = ? AND id = ?",
      )
      .get(snapshotId, id)
    if (row === null) return null
    const [element, parseError] = attempt(() => JSON.parse(row.data_json) as IrElement)

    return parseError === null && element !== null ? element : null
  }
}
