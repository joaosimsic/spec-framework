import { attempt, type Result, ok, fail } from "../../core/result"
import type { AnalysisDatabase } from "../db"
import { AnalysisIds } from "../ids"
import type { AnalysisOptions, ProjectRecord } from "../types"

interface ProjectRow {
  id: string
  name: string
  repository_path: string
  analysis_options: string
  created_at: string
}

export class ProjectRepository {
  constructor(
    private readonly database: AnalysisDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  save(
    name: string,
    repositoryPath: string,
    analysisOptions: AnalysisOptions,
  ): Result<ProjectRecord, string> {
    const existing = this.findByPath(repositoryPath)
    if (existing !== null) return ok(existing)

    const record: ProjectRecord = {
      id: AnalysisIds.project(repositoryPath),
      name,
      repositoryPath,
      analysisOptions,
      createdAt: this.now(),
    }
    const [saved, saveError] = attempt(() => {
      this.database.connection
        .query(
          "INSERT INTO projects (id, name, repository_path, analysis_options, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          record.id,
          record.name,
          record.repositoryPath,
          JSON.stringify(record.analysisOptions),
          record.createdAt,
        )
      return record
    })
    if (saveError !== null || saved === null) return fail(saveError ?? "project was not saved")

    return ok(saved)
  }

  list(): ProjectRecord[] {
    const rows = this.database.connection
      .query<ProjectRow, []>("SELECT * FROM projects ORDER BY name, id")
      .all()

    return rows.flatMap((row) => {
      const project = this.map(row)
      return project === null ? [] : [project]
    })
  }

  find(id: string): ProjectRecord | null {
    const row = this.database.connection
      .query<ProjectRow, [string]>("SELECT * FROM projects WHERE id = ?")
      .get(id)
    if (row === null) return null

    return this.map(row)
  }

  findByPath(repositoryPath: string): ProjectRecord | null {
    const row = this.database.connection
      .query<ProjectRow, [string]>("SELECT * FROM projects WHERE repository_path = ?")
      .get(repositoryPath)
    if (row === null) return null

    return this.map(row)
  }

  remove(id: string): boolean {
    const [removed, removeError] = attempt(
      () => this.database.connection.query("DELETE FROM projects WHERE id = ?").run(id).changes,
    )

    return removeError === null && removed === 1
  }

  private map(row: ProjectRow): ProjectRecord | null {
    const [options, optionsError] = attempt(
      () => JSON.parse(row.analysis_options) as AnalysisOptions,
    )
    if (optionsError !== null || options === null) return null

    return {
      id: row.id,
      name: row.name,
      repositoryPath: row.repository_path,
      analysisOptions: options,
      createdAt: row.created_at,
    }
  }
}
