import { fail, ok, type Result } from "../core/result"
import {
  AnalysisDatabase,
  GeneratedSpecRepository,
  SnapshotRepository,
  type ProjectRecord,
  type SnapshotRecord,
} from "../persistence"
import type { GeneratedSpec } from "../spec"
import type { SystemEdge, SystemNode, SystemProjection } from "./types"

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
    const root = spec.architecture.elements.find((element) => element.type === "system")
    if (root === undefined) return this.empty(project, spec)
    const childCounts = new Map<string, number>()
    for (const element of spec.architecture.elements) {
      if (element.parent_id !== null)
        childCounts.set(element.parent_id, (childCounts.get(element.parent_id) ?? 0) + 1)
    }
    const nodes: SystemNode[] = spec.architecture.elements.map((element) => ({
      id: element.id,
      label: element.label,
      kind: element.type,
      kindLabel: this.humanize(element.type),
      parentId: element.parent_id,
      childCount: childCounts.get(element.id) ?? 0,
      confidence: element.confidence,
      provenance: element.provenance,
      source: element.confidence === "ambiguous" ? "inferred" : element.confidence,
      ...(element.file_path === null ? {} : { filePath: element.file_path }),
      ...(element.start_line === null ? {} : { startLine: element.start_line }),
      ...(element.end_line === null ? {} : { endLine: element.end_line }),
      ...(element.signature === null ? {} : { signature: element.signature }),
    }))
    const edges: SystemEdge[] = spec.architecture.relationships.map((relationship) => ({
      id: relationship.id,
      sourceId: relationship.source_id,
      targetId: relationship.target_id,
      type: relationship.type,
      label: this.humanize(relationship.type),
      resolution: relationship.resolution,
      confidence: relationship.confidence,
      provenance: relationship.provenance,
    }))

    return {
      projectId: project.id,
      projectName: project.name,
      snapshotId: spec.snapshot.id,
      commit: spec.snapshot.commit,
      rootId: root.id,
      nodes,
      edges,
      coverage: { ...spec.architecture.coverage, entryPointsWithoutSinks: [] },
      summary: {
        nodes: nodes.length,
        edges: edges.length,
        files: nodes.filter((node) => node.kind === "file").length,
        symbols: nodes.filter(
          (node) =>
            !["system", "subsystem", "component", "file", "entry_point"].includes(node.kind),
        ).length,
        mapped: nodes.filter((node) => node.kind === "component").length,
        unassigned: spec.architecture.coverage.unassigned.length,
      },
    }
  }

  private empty(project: ProjectRecord, spec: GeneratedSpec): SystemProjection {
    return {
      projectId: project.id,
      projectName: project.name,
      snapshotId: spec.snapshot.id,
      commit: spec.snapshot.commit,
      rootId: "",
      nodes: [],
      edges: [],
      coverage: {
        mapped: [],
        partial: [],
        unmapped: [],
        unassigned: [],
        stale: [],
        entryPointsWithoutSinks: [],
      },
      summary: { nodes: 0, edges: 0, files: 0, symbols: 0, mapped: 0, unassigned: 0 },
    }
  }

  private humanize(value: string): string {
    if (value === "type_alias") return "Type"
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Related"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
