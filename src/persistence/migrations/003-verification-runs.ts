import type { Migration } from "./001-initial"

export const VERIFICATION_RUNS_SCHEMA: Migration = {
  version: 3,
  name: "verification-runs",
  statements: [
    `CREATE TABLE verification_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      snapshot_id TEXT NOT NULL REFERENCES analysis_snapshots(id) ON DELETE CASCADE,
      spec_hash TEXT NOT NULL,
      runner_version TEXT NOT NULL,
      result TEXT NOT NULL,
      errors INTEGER NOT NULL,
      warnings INTEGER NOT NULL,
      check_count INTEGER NOT NULL,
      passed_count INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      unknown_count INTEGER NOT NULL,
      findings_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_verification_runs_project_created ON verification_runs(project_id, created_at)",
    `CREATE TABLE verification_results (
      run_id TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
      check_id TEXT NOT NULL,
      method TEXT NOT NULL,
      command_json TEXT NOT NULL,
      working_directory TEXT NOT NULL,
      result TEXT NOT NULL,
      confidence TEXT NOT NULL,
      exit_code INTEGER,
      timed_out INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      output_hash TEXT NOT NULL,
      output_tail TEXT NOT NULL,
      input_hashes_json TEXT NOT NULL,
      PRIMARY KEY (run_id, check_id)
    )`,
  ],
}
