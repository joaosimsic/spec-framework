import { fail, ok, type Result } from "../core/result"
import {
  AnalysisDatabase,
  GeneratedSpecRepository,
  SnapshotRepository,
  type ProjectRecord,
  type SnapshotRecord,
} from "../persistence"
import { GENERATED_SPEC_VERSION, type GeneratedSpec } from "../spec"
import { SystemProjectionBuilder } from "./system"
import type { SystemProjection } from "./types"

export class SystemProjectionService {
  private readonly snapshots: SnapshotRepository
  private readonly generatedSpecs: GeneratedSpecRepository
  private cached: SystemProjection | null = null

  constructor(
    private readonly root: string,
    database: AnalysisDatabase,
  ) {
    this.snapshots = new SnapshotRepository(database)
    this.generatedSpecs = new GeneratedSpecRepository(database)
  }

  async build(
    project: ProjectRecord,
    snapshotId?: string,
  ): Promise<Result<SystemProjection, string>> {
    void this.root
    const snapshot =
      snapshotId === undefined ? this.snapshots.latest(project.id) : this.snapshots.find(snapshotId)
    if (snapshot === null || snapshot.projectId !== project.id) {
      return fail("analysis snapshot unavailable")
    }
    if (this.cached !== null && this.cached.snapshotId === snapshot.id) return ok(this.cached)
    const spec = this.generatedSpecs.find(snapshot.id)
    if (spec === null) return fail("generated spec unavailable")
    if (spec.version !== GENERATED_SPEC_VERSION) {
      return fail(`generated spec version ${String(spec.version)} is not supported`)
    }
    const projection = this.project(project, spec)
    this.cached = projection

    return ok(projection)
  }

  latestSnapshot(project: ProjectRecord): SnapshotRecord | null {
    return this.snapshots.latest(project.id)
  }

  findSnapshot(id: string): SnapshotRecord | null {
    return this.snapshots.find(id)
  }

  private project(project: ProjectRecord, spec: GeneratedSpec): SystemProjection {
    return new SystemProjectionBuilder().fromSpec(project, spec)
  }
}
