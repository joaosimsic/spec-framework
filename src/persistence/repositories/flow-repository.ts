import { attempt, type Result, ok, fail } from "../../core/result"
import type { IrFlow } from "../../analysis/ir"
import type { AnalysisDatabase } from "../db"

interface FlowRow {
  id: string
  data_json: string
}

export class FlowRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  replace(snapshotId: string, flows: IrFlow[]): Result<number, string> {
    const [count, replaceError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query("DELETE FROM flow_steps WHERE snapshot_id = ?")
          .run(snapshotId)
        this.database.connection.query("DELETE FROM flows WHERE snapshot_id = ?").run(snapshotId)
        const insertFlow = this.database.connection.query(
          `INSERT INTO flows
            (id, snapshot_id, entry_point_id, evidence, confidence, unknowns_json, limits_reached_json, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        const insertStep = this.database.connection.query(
          `INSERT INTO flow_steps
            (id, snapshot_id, flow_id, ordinal, node_id, file_path, line, resolution, confidence, step_kind, data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const flow of flows) {
          insertFlow.run(
            flow.id,
            snapshotId,
            flow.entryPointId,
            flow.evidence,
            flow.confidence,
            JSON.stringify(flow.unknowns),
            JSON.stringify(flow.limitsReached),
            JSON.stringify(flow),
          )
          for (const [ordinal, step] of flow.steps.entries()) {
            insertStep.run(
              `${flow.id}:${ordinal}`,
              snapshotId,
              flow.id,
              ordinal,
              step.nodeId,
              step.filePath,
              step.line,
              step.resolution,
              step.confidence,
              step.kind,
              JSON.stringify(step),
            )
          }
        }

        return flows.length
      })
      return transaction()
    })
    if (replaceError !== null || count === null) return fail(replaceError ?? "flows were not saved")

    return ok(count)
  }

  list(snapshotId: string): IrFlow[] {
    const rows = this.database.connection
      .query<FlowRow, [string]>("SELECT id, data_json FROM flows WHERE snapshot_id = ? ORDER BY id")
      .all(snapshotId)

    return rows.flatMap((row) => {
      const [flow, parseError] = attempt(() => JSON.parse(row.data_json) as IrFlow)
      return parseError !== null || flow === null ? [] : [flow]
    })
  }

  find(snapshotId: string, id: string): IrFlow | null {
    const row = this.database.connection
      .query<FlowRow, [string, string]>(
        "SELECT id, data_json FROM flows WHERE snapshot_id = ? AND id = ?",
      )
      .get(snapshotId, id)
    if (row === null) return null
    const [flow, parseError] = attempt(() => JSON.parse(row.data_json) as IrFlow)

    return parseError === null && flow !== null ? flow : null
  }
}
