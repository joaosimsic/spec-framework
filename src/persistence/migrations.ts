import type { Database } from "bun:sqlite"
import { attempt, type Result, ok, fail } from "../core/result"
import { INITIAL_SCHEMA, type Migration } from "./migrations/001-initial"
import { GENERATED_SPEC_SCHEMA } from "./migrations/002-generated-spec"

const MIGRATIONS: Migration[] = [INITIAL_SCHEMA, GENERATED_SPEC_SCHEMA]

interface AppliedMigration {
  version: number
}

export class MigrationRunner {
  constructor(
    private readonly database: Database,
    private readonly migrations: Migration[] = MIGRATIONS,
  ) {}

  apply(): Result<number, string> {
    const [prepared, prepareError] = attempt(() => {
      this.database.exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
      )
      return this.appliedVersions()
    })
    if (prepareError !== null || prepared === null) {
      return fail(prepareError ?? "migration state unavailable")
    }
    if (prepared === null) return fail("migration state unavailable")

    const applied = prepared
    const pending = this.migrations
      .filter((migration) => !applied.has(migration.version))
      .sort((left, right) => left.version - right.version)

    for (const migration of pending) {
      const [, migrationError] = this.applyOne(migration)
      if (migrationError !== null) return fail(migrationError)
    }

    return ok(pending.length)
  }

  private applyOne(migration: Migration): Result<null, string> {
    return attempt(() => {
      const timestamp = new Date().toISOString()
      const transaction = this.database.transaction(() => {
        for (const statement of migration.statements) this.database.exec(statement)
        this.database
          .query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(migration.version, timestamp)
      })
      transaction()

      return null
    })
  }

  private appliedVersions(): Set<number> {
    const rows = this.database
      .query<AppliedMigration, []>("SELECT version FROM schema_migrations")
      .all()

    return new Set(rows.map((row) => row.version))
  }
}
