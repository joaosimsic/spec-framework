import { attempt, type Result, ok, fail } from "../../core/result"
import type { AnalysisDatabase } from "../db"

export interface AiRunRecord {
  id: string
  snapshotId: string
  provider: string
  model: string
  promptVersion: string
  inputHashes: string[]
  outputHash: string
  status: string
  createdAt: string
}

export class AiRunRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  save(run: AiRunRecord): Result<AiRunRecord, string> {
    const [saved, saveError] = attempt(() => {
      this.database.connection
        .query(
          `INSERT INTO ai_runs
            (id, snapshot_id, provider, model, prompt_version, input_hashes_json, output_hash, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          run.id,
          run.snapshotId,
          run.provider,
          run.model,
          run.promptVersion,
          JSON.stringify(run.inputHashes),
          run.outputHash,
          run.status,
          run.createdAt,
        )
      return run
    })
    if (saveError !== null || saved === null) return fail(saveError ?? "AI run was not saved")

    return ok(saved)
  }
}
