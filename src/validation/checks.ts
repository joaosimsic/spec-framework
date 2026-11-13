import type { GeneratedSpec } from "../spec"
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
    const json = JSON.stringify(spec)
    if (json.includes(root)) issues.push("generated spec contains an absolute repository path")
    if (this.hasApprovedStatus(spec)) issues.push("generated spec contains an approved status")
    if (/node_modules|(?:^|["/])\.env(?:["/]|$)|(?:^|["/])\.git\//.test(json)) {
      issues.push("generated spec references excluded or secret paths")
    }
    const elementIds = new Set(spec.architecture.elements.map((element) => element.id))
    const evidenceIds = new Set(spec.evidence.map((item) => item.id))
    const types = new Set(spec.architecture.elements.map((element) => element.type))
    for (const type of ["system", "subsystem", "component", "file"]) {
      if (!types.has(type)) issues.push(`generated architecture has no ${type}`)
    }
    if (
      !spec.architecture.elements.some(
        (element) =>
          !["system", "subsystem", "component", "file", "entry_point"].includes(element.type),
      )
    ) {
      warnings.push("generated architecture has no symbol nodes")
    }
    if (!types.has("entry_point")) warnings.push("no entry points detected")
    for (const record of spec.requirements) {
      for (const id of record.evidence)
        if (!evidenceIds.has(id)) issues.push(`behavior record references missing evidence ${id}`)
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
    const findings = spec.findings as Array<{ affectedElements?: string[] }>
    for (const finding of findings) {
      for (const id of finding.affectedElements ?? []) {
        if (!elementIds.has(id)) issues.push(`finding references missing element ${id}`)
      }
    }
    const unknownIds = spec.unknowns.map((unknown) => unknown.id)
    if (JSON.stringify(unknownIds) !== JSON.stringify([...unknownIds].sort()))
      issues.push("unknown records are not sorted")
    if (new Set(evidenceIds).size !== spec.evidence.length)
      issues.push("duplicate evidence identities")

    return {
      counts: {
        files: new Set(
          spec.architecture.elements
            .filter((element) => element.type === "file")
            .map((element) => element.file_path),
        ).size,
        elements: spec.architecture.elements.length,
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
      },
      issues: [...new Set(issues)],
      warnings: [...new Set(warnings)],
    }
  }

  private hasApprovedStatus(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((item) => this.hasApprovedStatus(item))
    if (typeof value !== "object" || value === null) return false
    const record = value as Record<string, unknown>
    if (record["status"] === "approved") return true

    return Object.values(record).some((item) => this.hasApprovedStatus(item))
  }
}
