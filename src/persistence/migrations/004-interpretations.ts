import type { Migration } from "./001-initial"

export const INTERPRETATIONS_SCHEMA: Migration = {
  version: 4,
  name: "interpretations",
  statements: [
    `CREATE TABLE interpretation_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      snapshot_id TEXT NOT NULL REFERENCES analysis_snapshots(id) ON DELETE CASCADE,
      verification_run_id TEXT REFERENCES verification_runs(id) ON DELETE SET NULL,
      request_kind TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      failures_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_interpretation_runs_project_created ON interpretation_runs(project_id, created_at)",
    `CREATE TABLE interpretations (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES interpretation_runs(id) ON DELETE CASCADE,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      confidence REAL NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      input_hashes_json TEXT NOT NULL,
      UNIQUE (run_id, target_kind, target_id)
    )`,
  ],
}
