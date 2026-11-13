import type { IrElement, IrEntryPoint, IrFinding, IrFlow, IrRelationship } from "../analysis/ir"
import type { SpecFrameworkConfig } from "../config"
import { SystemProjectionBuilder } from "../implementation"
import type { ProjectRecord, SnapshotRecord } from "../persistence"
import {
  GENERATED_SPEC_VERSION,
  type GeneratedElement,
  type GeneratedRelationship,
  type GeneratedSpec,
} from "../spec"
import { GeneratedRecordFactory } from "./records"

export interface GeneratedSpecInput {
  root: string
  config: SpecFrameworkConfig
  project: ProjectRecord
  snapshot: SnapshotRecord
  elements: IrElement[]
  relationships: IrRelationship[]
  entryPoints: IrEntryPoint[]
  flows: IrFlow[]
  findings: IrFinding[]
}

export class GeneratedSpecBuilder {
  async build(input: GeneratedSpecInput): Promise<GeneratedSpec> {
    const factory = new GeneratedRecordFactory(input.root, input.config)
    const projection = new SystemProjectionBuilder().build({
      project: input.project,
      snapshot: input.snapshot,
      elements: input.elements,
      relationships: input.relationships,
      entryPoints: input.entryPoints,
    })
    const behavior = factory.behavior(input.elements, input.entryPoints, input.flows, projection)
    const contracts = await factory.contracts(input.elements)
    const verification = factory.verification(input.elements)
    const architectureIds = new Set(projection.nodes.map((node) => node.id))
    const findings = input.findings.filter((finding) =>
      finding.affectedElements.every((id) => architectureIds.has(id)),
    )
    const evidence = this.dedupe([
      ...behavior.evidence,
      ...contracts.evidence,
      ...verification.evidence,
    ])

    return {
      version: GENERATED_SPEC_VERSION,
      snapshot: {
        id: input.snapshot.id,
        project_id: input.snapshot.projectId,
        commit: input.snapshot.commit,
        dirty: input.snapshot.dirty,
        analyzer: input.snapshot.analyzer,
        analyzer_version: input.snapshot.analyzerVersion,
        schema_version: input.snapshot.schemaVersion,
      },
      project: {
        id: input.project.id,
        name: input.project.name,
        root: ".",
        language: this.language(input.elements),
      },
      architecture: {
        elements: projection.nodes.map((node) => this.element(node)),
        relationships: projection.edges
          .filter((edge) => edge.type !== "contains")
          .map((edge) => this.relationship(edge)),
        coverage: {
          mapped: projection.coverage.mapped,
          partial: projection.coverage.partial,
          unmapped: projection.coverage.unmapped,
          unassigned: projection.coverage.unassigned,
          stale: projection.coverage.stale,
        },
      },
      requirements: behavior.records,
      contracts: contracts.records,
      verification: verification.records,
      flows: input.flows,
      findings,
      evidence,
      unknowns: factory.unknowns(input.findings, input.flows),
    }
  }

  private element(node: {
    id: string
    label: string
    kind: string
    parentId: string | null
    filePath?: string
    startLine?: number
    endLine?: number
    signature?: string
    confidence: string
    provenance: string
  }): GeneratedElement {
    return {
      id: node.id,
      type: node.kind,
      label: node.label,
      parent_id: node.parentId,
      file_path: node.filePath ?? null,
      start_line: node.startLine ?? null,
      end_line: node.endLine ?? null,
      signature: node.signature ?? null,
      confidence: this.confidence(node.confidence),
      status: this.confidence(node.confidence),
      provenance: node.provenance,
      evidence: [node.provenance],
    }
  }

  private relationship(edge: {
    id: string
    sourceId: string
    targetId: string
    type: string
    resolution: string
    confidence: string
    provenance: string
  }): GeneratedRelationship {
    return {
      id: edge.id,
      source_id: edge.sourceId,
      target_id: edge.targetId,
      type: edge.type,
      resolution: edge.resolution,
      confidence: this.confidence(edge.confidence),
      provenance: edge.provenance,
    }
  }

  private confidence(value: string): GeneratedElement["confidence"] {
    if (
      value === "observed" ||
      value === "inferred" ||
      value === "ambiguous" ||
      value === "unknown"
    ) {
      return value
    }

    return "unknown"
  }

  private language(elements: IrElement[]): string {
    return [...new Set(elements.map((element) => element.language))].sort()[0] ?? "unknown"
  }

  private dedupe<T extends { id: string }>(items: T[]): T[] {
    return [...new Map(items.map((item) => [item.id, item])).values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    )
  }
}
