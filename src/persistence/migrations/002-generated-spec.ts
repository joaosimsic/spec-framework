import type { Migration } from "./001-initial"

export const GENERATED_SPEC_SCHEMA: Migration = {
  version: 2,
  name: "generated-spec",
  statements: [
    `CREATE TABLE generated_specs (
      snapshot_id TEXT PRIMARY KEY REFERENCES analysis_snapshots(id) ON DELETE CASCADE,
      schema_version INTEGER NOT NULL,
      spec_hash TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX idx_generated_specs_hash ON generated_specs(spec_hash)",
  ],
}
