import { attempt, type Result, ok, fail } from "../../core/result"
import type { AnalysisDatabase } from "../db"
import type { SnapshotCoverage, SnapshotRecord } from "../types"
import { EMPTY_COVERAGE } from "../types"

interface SnapshotRow {
  id: string
  project_id: string
  run_id: string
  commit_hash: string
  dirty: number
  analyzer: string
  analyzer_version: string
  schema_version: number
  rule_version: string
  prompt_version: string
  model_version: string
  fingerprint: string
  node_count: number
  edge_count: number
  flow_count: number
  finding_count: number
  mapping_json: string
  coverage_json: string
  created_at: string
}

export class SnapshotRepository {
  constructor(private readonly database: AnalysisDatabase) {}

  create(snapshot: SnapshotRecord): Result<SnapshotRecord, string> {
    const existing = this.find(snapshot.id)
    if (existing !== null) return ok(existing)

    const [created, createError] = attempt(() => {
      this.database.connection
        .query(
          `INSERT INTO analysis_snapshots (
            id, project_id, run_id, commit_hash, dirty, analyzer, analyzer_version,
            schema_version, rule_version, prompt_version, model_version, fingerprint,
            node_count, edge_count, flow_count, finding_count, mapping_json, coverage_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          snapshot.id,
          snapshot.projectId,
          snapshot.runId,
          snapshot.commit,
          snapshot.dirty ? 1 : 0,
          snapshot.analyzer,
          snapshot.analyzerVersion,
          snapshot.schemaVersion,
          snapshot.ruleVersion,
          snapshot.promptVersion,
          snapshot.modelVersion,
          snapshot.fingerprint,
          snapshot.nodeCount,
          snapshot.edgeCount,
          snapshot.flowCount,
          snapshot.findingCount,
          JSON.stringify(snapshot.mapping),
          JSON.stringify(snapshot.coverage),
          snapshot.createdAt,
        )
      return snapshot
    })
    if (createError !== null || created === null) {
      return fail(createError ?? "snapshot was not created")
    }

    return ok(created)
  }

  find(id: string): SnapshotRecord | null {
    const row = this.database.connection
      .query<SnapshotRow, [string]>("SELECT * FROM analysis_snapshots WHERE id = ?")
      .get(id)
    if (row === null) return null

    return this.map(row)
  }

  latest(projectId: string): SnapshotRecord | null {
    const row = this.database.connection
      .query<SnapshotRow, [string]>(
        "SELECT * FROM analysis_snapshots WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .get(projectId)
    if (row === null) return null

    return this.map(row)
  }

  list(projectId: string): SnapshotRecord[] {
    const rows = this.database.connection
      .query<SnapshotRow, [string]>(
        "SELECT * FROM analysis_snapshots WHERE project_id = ? ORDER BY created_at DESC, id DESC",
      )
      .all(projectId)

    return rows.flatMap((row) => {
      const snapshot = this.map(row)
      return snapshot === null ? [] : [snapshot]
    })
  }

  updateFindingCount(snapshotId: string, count: number): Result<number, string> {
    const [changed, updateError] = attempt(
      () =>
        this.database.connection
          .query("UPDATE analysis_snapshots SET finding_count = ? WHERE id = ?")
          .run(count, snapshotId).changes,
    )
    if (updateError !== null || changed === null) {
      return fail(updateError ?? "finding count was not updated")
    }
    if (changed !== 1) return fail("snapshot not found")

    return ok(count)
  }

  count(): number {
    const row = this.database.connection
      .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM analysis_snapshots")
      .get()

    return row?.total ?? 0
  }

  private map(row: SnapshotRow): SnapshotRecord | null {
    const [mapping, mappingError] = attempt(() => JSON.parse(row.mapping_json) as unknown)
    if (mappingError !== null) return null
    const [coverage, coverageError] = attempt(
      () => JSON.parse(row.coverage_json) as SnapshotCoverage,
    )
    if (coverageError !== null || coverage === null) return null

    return {
      id: row.id,
      projectId: row.project_id,
      runId: row.run_id,
      commit: row.commit_hash,
      dirty: row.dirty === 1,
      analyzer: row.analyzer,
      analyzerVersion: row.analyzer_version,
      schemaVersion: row.schema_version,
      ruleVersion: row.rule_version,
      promptVersion: row.prompt_version,
      modelVersion: row.model_version,
      fingerprint: row.fingerprint,
      nodeCount: row.node_count,
      edgeCount: row.edge_count,
      flowCount: row.flow_count,
      findingCount: row.finding_count,
      mapping,
      coverage: { ...EMPTY_COVERAGE, ...coverage },
      createdAt: row.created_at,
    }
  }
}
