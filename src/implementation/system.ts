import type { GeneratedSpec } from "../spec"
import type { ProjectRecord } from "../persistence"
import type {
  ConceptualSystemInput,
  SystemCoverage,
  SystemEdge,
  SystemHypothesis,
  SystemNode,
  SystemProjection,
} from "./types"

const KIND_LABELS: Record<string, string> = {
  system: "System",
  subsystem: "Subsystem",
  component: "Component",
  interface: "Interface",
  data_store: "Data store",
  external_system: "External system",
  file: "File",
  function: "Function",
  method: "Method",
  class: "Class",
  type: "Type",
  type_alias: "Type",
  property: "Property",
  constant: "Constant",
  enum: "Enum",
}

export class SystemProjectionBuilder {
  fromSpec(project: ProjectRecord, spec: GeneratedSpec): SystemProjection {
    return this.build({
      project,
      snapshot: {
        id: spec.snapshot.id,
        projectId: spec.snapshot.project_id,
        runId: "",
        commit: spec.snapshot.commit,
        dirty: spec.snapshot.dirty,
        analyzer: spec.snapshot.analyzer,
        analyzerVersion: spec.snapshot.analyzer_version,
        schemaVersion: spec.snapshot.schema_version,
        ruleVersion: "",
        promptVersion: "",
        modelVersion: "",
        fingerprint: "",
        nodeCount: 0,
        edgeCount: 0,
        flowCount: 0,
        findingCount: 0,
        mapping: null,
        coverage: {
          mapped: spec.architecture.coverage.mapped,
          partial: spec.architecture.coverage.partial,
          unmapped: spec.architecture.coverage.unmapped,
          unassigned: spec.architecture.coverage.unassigned,
          stale: spec.architecture.coverage.stale,
          ambiguous: spec.architecture.coverage.ambiguous,
          entry_points_without_sinks: spec.architecture.coverage.entry_points_without_sinks,
          behavior_without_implementation:
            spec.architecture.coverage.behavior_without_implementation,
          external_systems: spec.architecture.coverage.external_systems,
        },
        createdAt: "",
      },
      architecture: [
        spec.architecture.system,
        ...spec.architecture.subsystems,
        ...spec.architecture.components,
        ...spec.architecture.interfaces,
        ...spec.architecture.data_stores,
        ...spec.architecture.external_systems,
      ],
      relationships: spec.architecture.relationships,
      implementation: spec.implementation,
      mappings: spec.mappings,
      hypotheses: spec.hypotheses,
      coverage: spec.architecture.coverage,
    })
  }

  build(input: ConceptualSystemInput): SystemProjection {
    const hypotheses = new Map(
      input.hypotheses.map((hypothesis) => [hypothesis.conceptual_id, this.hypothesis(hypothesis)]),
    )
    const childCounts = new Map<string, number>()
    for (const element of input.architecture) {
      if (element.parent_id === null) continue
      childCounts.set(element.parent_id, (childCounts.get(element.parent_id) ?? 0) + 1)
    }
    const nodes: SystemNode[] = input.architecture.map((element) => ({
      id: element.id,
      label: element.label,
      kind: element.type,
      kindLabel: this.humanize(element.type),
      parentId: element.parent_id,
      childCount: childCounts.get(element.id) ?? 0,
      confidence: element.confidence,
      provenance: element.provenance,
      source: element.confidence === "ambiguous" ? "inferred" : element.confidence,
      labelRole: element.label_role,
      labelAnchor: element.label_anchor,
      labelEvidence: element.label_evidence,
      summary: element.summary,
      entryPoints: element.entry_points,
      publicSurface: element.public_surface,
      dataAccess: element.data_access,
      tests: element.tests,
      unknowns: element.unknowns,
      ...(hypotheses.has(element.id) ? { hypothesis: hypotheses.get(element.id) } : {}),
    }))
    const fileIds = new Set(input.implementation.files.map((file) => file.id))
    const filePaths = new Map(input.implementation.files.map((file) => [file.id, file.path]))
    const files: SystemNode[] = input.implementation.files
      .map((file) => ({
        id: file.id,
        label: file.path,
        kind: "file",
        kindLabel: "File",
        parentId: null,
        childCount: 0,
        confidence: "observed",
        provenance: "analysis:file",
        source: "observed" as const,
        filePath: file.path,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
    const symbols: SystemNode[] = input.implementation.symbols
      .map((symbol) => ({
        id: symbol.id,
        label: symbol.name,
        kind: symbol.type === "type_alias" ? "type" : symbol.type,
        kindLabel: KIND_LABELS[symbol.type] ?? this.humanize(symbol.type),
        parentId: fileIds.has(symbol.file_id) ? symbol.file_id : null,
        childCount: 0,
        confidence: "observed",
        provenance: "analysis:symbol",
        source: "observed" as const,
        signature: symbol.signature,
        visibility: symbol.visibility,
        exported: symbol.exported,
        ...(filePaths.has(symbol.file_id) ? { filePath: filePaths.get(symbol.file_id) } : {}),
        startLine: symbol.start_line,
        endLine: symbol.end_line,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
    const edges: SystemEdge[] = input.relationships
      .map((relationship) => ({
        id: relationship.id,
        sourceId: relationship.source_id,
        targetId: relationship.target_id,
        type: relationship.type,
        label: this.humanize(relationship.type),
        resolution: relationship.resolution,
        confidence: relationship.confidence,
        provenance: relationship.provenance,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
    const coverage = this.coverage(input)
    const root = input.architecture.find((element) => element.type === "system")

    return {
      projectId: input.project.id,
      projectName: input.project.name,
      snapshotId: input.snapshot.id,
      commit: input.snapshot.commit,
      rootId: root?.id ?? "",
      nodes,
      edges,
      implementation: {
        files,
        symbols,
        mappings: input.mappings.map((mapping) => ({
          id: mapping.id,
          conceptualId: mapping.conceptual_id,
          implementationId: mapping.implementation_id,
          confidence: mapping.confidence,
          evidence: mapping.evidence,
          provenance: mapping.provenance,
        })),
      },
      hypotheses: [...hypotheses.values()],
      coverage,
      summary: {
        nodes: nodes.length,
        edges: edges.length,
        files: files.length,
        symbols: symbols.length,
        mapped: input.architecture.filter((element) => element.type === "component").length,
        unassigned: coverage.unassigned.length,
      },
    }
  }

  private coverage(input: ConceptualSystemInput): SystemCoverage {
    return {
      mapped: input.coverage.mapped,
      partial: input.coverage.partial,
      unmapped: input.coverage.unmapped,
      unassigned: input.coverage.unassigned,
      stale: input.coverage.stale,
      ambiguous: input.coverage.ambiguous,
      entryPointsWithoutSinks: input.coverage.entry_points_without_sinks,
      behaviorWithoutImplementation: input.coverage.behavior_without_implementation,
      externalSystems: input.coverage.external_systems,
    }
  }

  private hypothesis(value: {
    id: string
    conceptual_id: string
    text: string
    evidence: Array<{ element_id: string; file_path: string; line: number }>
    confidence: number
    provider: string
    model: string
    prompt_version: string
    status: string
  }): SystemHypothesis {
    return {
      id: value.id,
      conceptualId: value.conceptual_id,
      text: value.text,
      evidence: value.evidence,
      confidence: value.confidence,
      provider: value.provider,
      model: value.model,
      promptVersion: value.prompt_version,
      status: value.status,
    }
  }

  private humanize(value: string): string {
    if (value === "type_alias") return "Type"
    if (value === "data_store") return "Data store"
    if (value === "external_system") return "External system"
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Related"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
