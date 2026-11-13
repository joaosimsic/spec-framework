import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { Database } from "bun:sqlite"
import { attempt, type Result, ok, fail } from "../core/result"
import { MigrationRunner } from "./migrations"

export interface AnalysisDatabaseOptions {
  fileName?: string
}

export class AnalysisDatabase {
  private constructor(
    readonly connection: Database,
    readonly path: string,
  ) {}

  static open(
    target: string,
    options: AnalysisDatabaseOptions = {},
  ): Result<AnalysisDatabase, string> {
    const path = options.fileName ?? join(target, ".spec", "analysis.sqlite")
    const [created, createError] = attempt(() => {
      mkdirSync(dirname(path), { recursive: true })
      return true
    })
    if (createError !== null || created === null) {
      return fail(createError ?? "cannot create analysis directory")
    }

    const [database, openError] = attempt(() => new Database(path, { create: true, strict: true }))
    if (openError !== null || database === null) {
      return fail(openError ?? "cannot open analysis database")
    }

    const [, pragmaError] = attempt(() => {
      database.exec("PRAGMA foreign_keys = ON")
      database.exec("PRAGMA journal_mode = WAL")
      database.exec("PRAGMA busy_timeout = 5000")
      return true
    })
    if (pragmaError !== null) {
      database.close()
      return fail(pragmaError)
    }

    const [, migrationError] = new MigrationRunner(database).apply()
    if (migrationError !== null) {
      database.close()
      return fail(migrationError)
    }

    return ok(new AnalysisDatabase(database, path))
  }

  close(): void {
    this.connection.close()
  }

  transaction<Value>(operation: () => Value): Result<Value, string> {
    return attempt(() => {
      const transaction = this.connection.transaction(operation)
      return transaction()
    })
  }
}
