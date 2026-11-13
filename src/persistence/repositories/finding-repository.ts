import { attempt, type Result, ok, fail } from "../../core/result"
import type { IrFinding } from "../../analysis/ir"
import type { AnalysisDatabase } from "../db"

interface FindingRow {
  id: string
  rule_id: string
  family: string
  title: string
  severity: string
  status: string
  confidence: number
  explanation: string
  recommendation: string
  affected_elements_json: string
  provider: string | null
  model: string | null
  prompt_version: string | null
  input_hashes_json: string
}

export class FindingRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  replace(snapshotId: string, findings: IrFinding[]): Result<number, string> {
    const [count, replaceError] = attempt(() => {
      const transaction = this.database.connection.transaction(() => {
        this.database.connection
          .query("DELETE FROM finding_evidence WHERE snapshot_id = ?")
          .run(snapshotId)
        this.database.connection.query("DELETE FROM findings WHERE snapshot_id = ?").run(snapshotId)
        const insert = this.database.connection.query(
          `INSERT INTO findings
            (id, snapshot_id, rule_id, family, title, severity, status, confidence, explanation,
             recommendation, affected_elements_json, provider, model, prompt_version,
             input_hashes_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        const evidence = this.database.connection.query(
          `INSERT INTO finding_evidence (id, snapshot_id, finding_id, kind, reference, file_path, line, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const finding of findings) {
          insert.run(
            finding.id,
            snapshotId,
            finding.ruleId,
            finding.family,
            finding.title,
            finding.severity,
            finding.status,
            finding.confidence,
            finding.explanation,
            finding.recommendation,
            JSON.stringify(finding.affectedElements),
            finding.provider ?? null,
            finding.model ?? null,
            finding.promptVersion ?? null,
            JSON.stringify(finding.inputHashes ?? []),
          )
          for (const [index, item] of finding.evidence.entries()) {
            evidence.run(
              `${finding.id}:${index}`,
              snapshotId,
              finding.id,
              item.kind,
              item.reference,
              item.file,
              item.line,
              null,
            )
          }
        }

        return findings.length
      })
      return transaction()
    })
    if (replaceError !== null || count === null)
      return fail(replaceError ?? "findings were not saved")

    return ok(count)
  }

  updateStatus(snapshotId: string, id: string, status: string): boolean {
    const [changed, changeError] = attempt(
      () =>
        this.database.connection
          .query("UPDATE findings SET status = ? WHERE snapshot_id = ? AND id = ?")
          .run(status, snapshotId, id).changes,
    )

    return changeError === null && changed === 1
  }

  list(snapshotId: string): IrFinding[] {
    const rows = this.database.connection
      .query<FindingRow, [string]>("SELECT * FROM findings WHERE snapshot_id = ? ORDER BY id")
      .all(snapshotId)

    return rows.flatMap((row) => {
      const [affected, parseError] = attempt(
        () => JSON.parse(row.affected_elements_json) as string[],
      )
      if (parseError !== null || affected === null) return []
      const [inputHashes] = attempt(() => JSON.parse(row.input_hashes_json) as string[])
      return [
        {
          id: row.id,
          ruleId: row.rule_id,
          family: row.family === "ai_assisted" ? "ai_assisted" : "deterministic",
          title: row.title,
          severity: row.severity === "error" ? "error" : "warning",
          status: this.status(row.status),
          affectedElements: affected,
          evidence: this.evidence(snapshotId, row.id),
          explanation: row.explanation,
          recommendation: row.recommendation,
          confidence: row.confidence,
          ...(row.provider === null ? {} : { provider: row.provider }),
          ...(row.model === null ? {} : { model: row.model }),
          ...(row.prompt_version === null ? {} : { promptVersion: row.prompt_version }),
          ...(Array.isArray(inputHashes) && inputHashes.length > 0 ? { inputHashes } : {}),
        },
      ]
    })
  }

  private evidence(snapshotId: string, findingId: string): IrFinding["evidence"] {
    const rows = this.database.connection
      .query<
        { kind: string; reference: string; file_path: string; line: number | null },
        [string, string]
      >(
        "SELECT kind, reference, file_path, line FROM finding_evidence WHERE snapshot_id = ? AND finding_id = ? ORDER BY id",
      )
      .all(snapshotId, findingId)

    return rows.map((row) => ({
      kind: row.kind,
      reference: row.reference,
      file: row.file_path,
      line: row.line ?? 1,
    }))
  }

  private status(value: string): IrFinding["status"] {
    if (
      value === "confirmed" ||
      value === "rejected" ||
      value === "needs_investigation" ||
      value === "dismissed"
    ) {
      return value
    }

    return "open"
  }
}
