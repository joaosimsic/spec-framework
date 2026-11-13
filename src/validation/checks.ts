import type { GeneratedConceptualElement, GeneratedSpec } from "../spec"
import { GeneratedSpecValidator } from "../spec"
import type { ValidationCounts } from "./types"

export interface SpecCheckResult {
  counts: ValidationCounts
  issues: string[]
  warnings: string[]
}

export class GeneratedSpecQualityCheck {
  check(
    spec: GeneratedSpec,
    root: string,
    specBytes: number,
    databaseBytes: number,
  ): SpecCheckResult {
    const issues: string[] = []
    const warnings: string[] = []
    const validator = new GeneratedSpecValidator()
    const [validated, validationError] = validator.check(spec)
    if (validationError !== null) issues.push(validationError)
    if (validated !== null) {
      const [, referenceError] = validator.checkReferences(validated)
      if (referenceError !== null) issues.push(referenceError)
    }
    const conceptual = conceptualElements(spec)
    const json = JSON.stringify(spec)
    if (json.includes(root)) issues.push("generated spec contains an absolute repository path")
    if (this.hasApprovedStatus(spec)) issues.push("generated spec contains an approved status")
    if (/node_modules|(?:^|["/])\.env(?:["/]|$)|(?:^|["/])\.git\//.test(json)) {
      issues.push("generated spec references excluded or secret paths")
    }
    const implementationIds = new Set([
      ...spec.implementation.files.map((file) => file.id),
      ...spec.implementation.symbols.map((symbol) => symbol.id),
    ])
    const conceptualIds = new Set(conceptual.map((element) => element.id))
    const evidenceIds = new Set(spec.evidence.map((item) => item.id))
    const types = new Set(conceptual.map((element) => element.type))
    if (!types.has("system")) issues.push("generated architecture has no system")
    if (!types.has("component")) warnings.push("generated architecture has no component")
    if (!types.has("interface")) warnings.push("no interfaces detected")
    const forbidden = conceptual.filter((element) =>
      ["file", "module", "symbol", "directory"].includes(element.type),
    )
    if (forbidden.length > 0) issues.push("implementation nodes appear in conceptual architecture")
    const directoryOnly = conceptual.filter(
      (element) =>
        element.provenance.includes("directory") ||
        element.label_evidence.length === 0 ||
        element.label_anchor.trim() === "",
    )
    if (directoryOnly.length > 0) {
      issues.push(`${directoryOnly.length} conceptual elements lack behavior label evidence`)
    }
    const summariesWithoutEvidence = conceptual.filter(
      (element) => element.summary.trim() === "" || element.label_evidence.length === 0,
    )
    if (summariesWithoutEvidence.length > 0) {
      issues.push(`${summariesWithoutEvidence.length} conceptual summaries lack evidence`)
    }
    for (const record of spec.requirements) {
      for (const id of record.evidence) {
        if (!evidenceIds.has(id)) issues.push(`behavior record references missing evidence ${id}`)
      }
    }
    for (const record of spec.contracts) {
      for (const id of record.evidence)
        if (!evidenceIds.has(id)) issues.push(`contract record references missing evidence ${id}`)
    }
    for (const record of spec.verification) {
      for (const id of record.evidence)
        if (!evidenceIds.has(id))
          issues.push(`verification record references missing evidence ${id}`)
    }
    for (const hypothesis of spec.hypotheses) {
      if (!conceptualIds.has(hypothesis.conceptual_id)) {
        issues.push(`hypothesis references missing conceptual element ${hypothesis.conceptual_id}`)
      }
    }
    const findings = spec.findings as Array<{ affectedElements?: string[] }>
    for (const finding of findings) {
      for (const id of finding.affectedElements ?? []) {
        if (!conceptualIds.has(id) && !implementationIds.has(id)) {
          issues.push(`finding references missing element ${id}`)
        }
      }
    }
    const unknownIds = spec.unknowns.map((unknown) => unknown.id)
    if (JSON.stringify(unknownIds) !== JSON.stringify([...unknownIds].sort()))
      issues.push("unknown records are not sorted")
    if (new Set(evidenceIds).size !== spec.evidence.length)
      issues.push("duplicate evidence identities")
    const unassignedFiles = spec.architecture.coverage.unassigned.length
    const files = spec.implementation.files.length
    const unassignedPercent = files === 0 ? 0 : (unassignedFiles / files) * 100
    const mappedFilesPerComponent = this.mappedFilesPerComponent(spec)

    return {
      counts: {
        files,
        elements: conceptual.length,
        relationships: spec.architecture.relationships.length,
        behavior: spec.requirements.length,
        contracts: spec.contracts.length,
        verification: spec.verification.length,
        flows: spec.flows.length,
        findings: spec.findings.length,
        unknowns: spec.unknowns.length,
        evidence: spec.evidence.length,
        specBytes,
        databaseBytes,
        conceptualComponents: spec.architecture.components.length,
        directoryOnlyComponents: directoryOnly.length,
        unassignedFiles,
        unassignedPercent,
        mappedFilesPerComponent,
        summariesWithoutEvidence: summariesWithoutEvidence.length,
        hypotheses: spec.hypotheses.length,
        aiFindings: spec.findings.filter((finding) => finding.family === "ai_assisted").length,
      },
      issues: [...new Set(issues)],
      warnings: [...new Set(warnings)],
    }
  }

  private mappedFilesPerComponent(spec: GeneratedSpec): number {
    const components = new Set(spec.architecture.components.map((component) => component.id))
    if (components.size === 0) return 0
    const files = new Set(spec.implementation.files.map((file) => file.id))
    const mapped = spec.mappings.filter(
      (mapping) => components.has(mapping.conceptual_id) && files.has(mapping.implementation_id),
    )
    return mapped.length / components.size
  }

  private hasApprovedStatus(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((item) => this.hasApprovedStatus(item))
    if (typeof value !== "object" || value === null) return false
    const record = value as Record<string, unknown>
    if (record["status"] === "approved") return true

    return Object.values(record).some((item) => this.hasApprovedStatus(item))
  }
}

function conceptualElements(spec: GeneratedSpec): GeneratedConceptualElement[] {
  return [
    spec.architecture.system,
    ...spec.architecture.subsystems,
    ...spec.architecture.components,
    ...spec.architecture.interfaces,
    ...spec.architecture.data_stores,
    ...spec.architecture.external_systems,
  ]
}
