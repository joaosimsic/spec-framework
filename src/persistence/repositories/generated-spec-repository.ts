import { createHash } from "node:crypto"
import { attempt, type Result, fail, ok } from "../../core/result"
import type { GeneratedSpec } from "../../spec"
import type { AnalysisDatabase } from "../db"

interface GeneratedSpecRow {
  snapshot_id: string
  schema_version: number
  spec_hash: string
  spec_json: string
  created_at: string
}

export class GeneratedSpecRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  save(snapshotId: string, spec: GeneratedSpec): Result<GeneratedSpec, string> {
    const json = JSON.stringify(spec)
    const [saved, saveError] = attempt(() => {
      this.database.connection
        .query(
          `INSERT INTO generated_specs
            (snapshot_id, schema_version, spec_hash, spec_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          snapshotId,
          spec.version,
          createHash("sha256").update(json).digest("hex"),
          json,
          new Date().toISOString(),
        )

      return spec
    })
    if (saveError !== null || saved === null)
      return fail(saveError ?? "generated spec was not saved")

    return ok(saved)
  }

  find(snapshotId: string): GeneratedSpec | null {
    const row = this.database.connection
      .query<GeneratedSpecRow, [string]>("SELECT * FROM generated_specs WHERE snapshot_id = ?")
      .get(snapshotId)
    if (row === null) return null
    const [spec, parseError] = attempt(() => JSON.parse(row.spec_json) as GeneratedSpec)

    return parseError === null && spec !== null ? spec : null
  }

  latest(projectId: string): GeneratedSpec | null {
    const row = this.database.connection
      .query<GeneratedSpecRow, [string]>(
        `SELECT generated_specs.* FROM generated_specs
         JOIN analysis_snapshots ON analysis_snapshots.id = generated_specs.snapshot_id
         WHERE analysis_snapshots.project_id = ?
         ORDER BY analysis_snapshots.created_at DESC LIMIT 1`,
      )
      .get(projectId)
    if (row === null) return null
    const [spec, parseError] = attempt(() => JSON.parse(row.spec_json) as GeneratedSpec)

    return parseError === null && spec !== null ? spec : null
  }
}
