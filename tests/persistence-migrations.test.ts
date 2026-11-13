import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  AnalysisDatabase,
  ProjectRepository,
  SnapshotRepository,
  SnapshotIdentityFactory,
} from "../src/persistence"
import { MigrationRunner } from "../src/persistence/migrations"

describe("analysis persistence", () => {
  test("applies migrations once and persists projects and snapshots", async () => {
    const target = await mkdtemp(join(tmpdir(), "analysis-db-"))
    const [database, databaseError] = AnalysisDatabase.open(target)
    expect(databaseError).toBeNull()
    expect(database).not.toBeNull()
    if (database === null) return

    const tables = database.connection
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    expect(tables).toContain("projects")
    expect(tables).toContain("analysis_snapshots")
    expect(tables).toContain("jobs")
    expect(tables).toContain("schema_migrations")

    const [applied, applyError] = new MigrationRunner(database.connection).apply()
    expect(applyError).toBeNull()
    expect(applied).toBe(0)

    const projects = new ProjectRepository(database)
    const [project, projectError] = projects.save("sample", target, {
      staticAnalysis: true,
      semanticAnalysis: true,
      flowAnalysis: true,
    })
    expect(projectError).toBeNull()
    expect(project).not.toBeNull()
    if (project === null) return

    const identity = SnapshotIdentityFactory.create({
      projectId: project.id,
      commit: "abc123",
      dirty: false,
      analyzer: "inventory",
      analyzerVersion: "1",
      schemaVersion: 1,
      ruleVersion: "1",
      promptVersion: "1",
      modelVersion: "none",
      inputHashes: ["hash-b", "hash-a"],
    })
    const snapshots = new SnapshotRepository(database)
    const [snapshot, snapshotError] = snapshots.create({
      id: identity.id,
      projectId: project.id,
      runId: "RUN-1",
      commit: "abc123",
      dirty: false,
      analyzer: "inventory",
      analyzerVersion: "1",
      schemaVersion: 1,
      ruleVersion: "1",
      promptVersion: "1",
      modelVersion: "none",
      fingerprint: identity.fingerprint,
      nodeCount: 0,
      edgeCount: 0,
      flowCount: 0,
      findingCount: 0,
      mapping: null,
      coverage: { mapped: [], partial: [], unmapped: [], unassigned: [], stale: [] },
      createdAt: "2026-11-13T00:00:00.000Z",
    })
    expect(snapshotError).toBeNull()
    expect(snapshot).not.toBeNull()
    expect(snapshots.latest(project.id)?.id).toBe(identity.id)

    database.close()
  })
})
