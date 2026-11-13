import { attempt, fail, ok, type Result } from "../../core/result"
import type {
  InterpretationEvidence,
  InterpretationRecord,
  InterpretationRequestKind,
  InterpretationRunDetails,
  InterpretationRunRecord,
  InterpretationTargetKind,
} from "../types"
import type { AnalysisDatabase } from "../db"

interface InterpretationRunRow {
  id: string
  project_id: string
  snapshot_id: string
  verification_run_id: string | null
  request_kind: string
  target_count: number
  failures_json: string
  created_at: string
}

interface InterpretationRow {
  id: string
  run_id: string
  target_kind: string
  target_id: string
  title: string
  text: string
  evidence_json: string
  confidence: number
  provider: string
  model: string
  prompt_version: string
  input_hashes_json: string
}

export class InterpretationRunRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  save(
    run: InterpretationRunRecord,
    interpretations: InterpretationRecord[],
  ): Result<InterpretationRunRecord, string> {
    const [saved, saveError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query(
            `INSERT INTO interpretation_runs
              (id, project_id, snapshot_id, verification_run_id, request_kind, target_count,
               failures_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            run.id,
            run.projectId,
            run.snapshotId,
            run.verificationRunId,
            run.requestKind,
            run.targetCount,
            JSON.stringify(run.failures),
            run.createdAt,
          )
        const insert = this.database.connection.query(
          `INSERT INTO interpretations
            (id, run_id, target_kind, target_id, title, text, evidence_json, confidence,
             provider, model, prompt_version, input_hashes_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const interpretation of interpretations) {
          insert.run(
            interpretation.id,
            interpretation.runId,
            interpretation.targetKind,
            interpretation.targetId,
            interpretation.title,
            interpretation.text,
            JSON.stringify(interpretation.evidence),
            interpretation.confidence,
            interpretation.provider,
            interpretation.model,
            interpretation.promptVersion,
            JSON.stringify(interpretation.inputHashes),
          )
        }

        return run
      })

      return transaction()
    })
    if (saveError !== null || saved === null) {
      return fail(saveError ?? "interpretation run was not saved")
    }

    return ok(saved)
  }

  latest(projectId: string): InterpretationRunDetails | null {
    const row = this.database.connection
      .query<InterpretationRunRow, [string]>(
        "SELECT * FROM interpretation_runs WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .get(projectId)
    if (row === null) return null

    return this.details(row)
  }

  find(runId: string): InterpretationRunDetails | null {
    const row = this.database.connection
      .query<InterpretationRunRow, [string]>("SELECT * FROM interpretation_runs WHERE id = ?")
      .get(runId)
    if (row === null) return null

    return this.details(row)
  }

  private details(row: InterpretationRunRow): InterpretationRunDetails | null {
    const [failures, failureError] = attempt(() => JSON.parse(row.failures_json) as string[])
    if (failureError !== null || failures === null) return null

    return {
      run: {
        id: row.id,
        projectId: row.project_id,
        snapshotId: row.snapshot_id,
        verificationRunId: row.verification_run_id,
        requestKind: this.requestKind(row.request_kind),
        targetCount: row.target_count,
        failures,
        createdAt: row.created_at,
      },
      interpretations: this.interpretations(row.id),
    }
  }

  private interpretations(runId: string): InterpretationRecord[] {
    const rows = this.database.connection
      .query<InterpretationRow, [string]>(
        "SELECT * FROM interpretations WHERE run_id = ? ORDER BY target_kind, target_id",
      )
      .all(runId)

    return rows.flatMap((row) => {
      const [evidence, evidenceError] = attempt(
        () => JSON.parse(row.evidence_json) as InterpretationEvidence[],
      )
      const [inputHashes, hashesError] = attempt(
        () => JSON.parse(row.input_hashes_json) as string[],
      )
      if (
        evidenceError !== null ||
        evidence === null ||
        hashesError !== null ||
        inputHashes === null
      ) {
        return []
      }

      return [
        {
          id: row.id,
          runId: row.run_id,
          targetKind: this.targetKind(row.target_kind),
          targetId: row.target_id,
          title: row.title,
          text: row.text,
          evidence,
          confidence: row.confidence,
          provider: row.provider,
          model: row.model,
          promptVersion: row.prompt_version,
          inputHashes,
        },
      ]
    })
  }

  private targetKind(value: string): InterpretationTargetKind {
    return value === "verification" ? "verification" : "contract"
  }

  private requestKind(value: string): InterpretationRequestKind {
    if (value === "contract" || value === "verification") return value

    return "all"
  }
}
