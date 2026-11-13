import type { IrElement, IrEntryPoint, IrFinding, IrFlow, IrRelationship } from "../analysis/ir"
import type { ConceptualArchitecture } from "../architecture"
import type { SpecFrameworkConfig } from "../config"
import type { ProjectRecord, SnapshotRecord } from "../persistence"
import { GENERATED_SPEC_VERSION, type GeneratedHypothesis, type GeneratedSpec } from "../spec"
import { GeneratedRecordFactory } from "./records"

export interface GeneratedSpecInput {
  root: string
  config: SpecFrameworkConfig
  project: ProjectRecord
  snapshot: SnapshotRecord
  elements: IrElement[]
  relationships: IrRelationship[]
  entryPoints: IrEntryPoint[]
  files: Array<{ path: string }>
  flows: IrFlow[]
  findings: IrFinding[]
  architecture: ConceptualArchitecture
  hypotheses?: GeneratedHypothesis[]
}

export class GeneratedSpecBuilder {
  async build(input: GeneratedSpecInput): Promise<GeneratedSpec> {
    const factory = new GeneratedRecordFactory(input.root, input.config)
    const architecture = input.architecture.architecture
    const behavior = factory.behavior(
      input.elements,
      input.entryPoints,
      input.flows,
      input.architecture.component_by_entry,
    )
    const contracts = await factory.contracts(input.elements, input.entryPoints, input.files)
    const verification = factory.verification(input.elements)
    const implementationIds = new Set([
      ...input.architecture.implementation.files.map((file) => file.id),
      ...input.architecture.implementation.symbols.map((symbol) => symbol.id),
    ])
    const conceptualIds = new Set([
      architecture.system.id,
      ...architecture.subsystems.map((element) => element.id),
      ...architecture.components.map((element) => element.id),
      ...architecture.interfaces.map((element) => element.id),
      ...architecture.data_stores.map((element) => element.id),
      ...architecture.external_systems.map((element) => element.id),
    ])
    const findings = input.findings.filter((finding) =>
      finding.affectedElements.every((id) => implementationIds.has(id) || conceptualIds.has(id)),
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
      architecture,
      implementation: input.architecture.implementation,
      mappings: input.architecture.mappings,
      hypotheses: input.hypotheses ?? [],
      requirements: behavior.records,
      contracts: contracts.records,
      verification: verification.records,
      flows: input.flows,
      findings,
      evidence,
      unknowns: factory.unknowns(input.findings, input.flows),
    }
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
