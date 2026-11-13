import type { IrElement, IrFinding, IrRelationship } from "../analysis/ir"
import type { SnapshotRecord } from "../persistence"
import { GeneratedSpecIdentity } from "../spec"
import type { AiInterpreter } from "./interpreter"

const MAX_TARGETS = 8
const MAX_CONTEXT_ELEMENTS = 16
const MAX_CATALOG = 60

export interface DiagnosisComponent {
  id: string
  label: string
  summary: string
  implementationIds: string[]
  entryPointCount: number
  publicSurfaceCount: number
  dataAccessCount: number
  unknownCount: number
}

export interface DiagnosisInput {
  root: string
  snapshot: SnapshotRecord
  elements: IrElement[]
  relationships: IrRelationship[]
  files: string[]
  components: DiagnosisComponent[]
}

export interface DiagnosisOutput {
  findings: IrFinding[]
  failures: string[]
}

export class AiDiagnosisGenerator {
  constructor(private readonly interpreter: AiInterpreter) {}

  async generate(input: DiagnosisInput): Promise<DiagnosisOutput> {
    const byId = new Map(input.elements.map((element) => [element.id, element]))
    const candidates = this.candidates(input.components)
    const catalog = this.catalog(input.components, candidates)
    const conceptualIds = input.components.map((component) => component.id)
    const findings: IrFinding[] = []
    const failures: string[] = []

    for (const component of candidates) {
      const targets = this.targets(component, byId)
      if (targets.length === 0) {
        failures.push(`${component.label}: no implementation target`)
        continue
      }
      const [result, error] = await this.interpreter.diagnose(
        {
          root: input.root,
          snapshot: input.snapshot,
          elements: input.elements,
          relationships: input.relationships,
          files: input.files,
        },
        targets,
        {
          id: component.id,
          label: component.label,
          summary: component.summary,
          catalog,
          conceptualIds,
        },
      )
      if (error !== null || result === null) {
        failures.push(`${component.label}: ${error ?? "AI diagnosis rejected"}`)
        continue
      }
      for (const finding of result.findings) {
        const affected = [...new Set(finding.affectedElements)].sort()
        findings.push({
          id: GeneratedSpecIdentity.diagnosis(
            finding.ruleId,
            affected,
            result.provider,
            result.model,
            result.promptVersion,
          ),
          ruleId: finding.ruleId,
          family: "ai_assisted",
          title: finding.title,
          severity: "warning",
          status: "open",
          affectedElements: affected,
          evidence: finding.evidence.map((item) => ({
            kind: "source",
            reference: item.elementId,
            file: item.filePath,
            line: item.line,
          })),
          explanation: finding.explanation,
          recommendation: finding.recommendation,
          confidence: finding.confidence,
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
          inputHashes: result.inputHashes,
        })
      }
    }

    return {
      findings: [...new Map(findings.map((finding) => [finding.id, finding])).values()].sort(
        (left, right) => left.id.localeCompare(right.id),
      ),
      failures: failures.sort(),
    }
  }

  private candidates(components: DiagnosisComponent[]): DiagnosisComponent[] {
    return [...components]
      .filter((component) => component.implementationIds.length > 0)
      .sort((left, right) => {
        const difference = this.score(right) - this.score(left)
        return difference === 0 ? left.id.localeCompare(right.id) : difference
      })
      .slice(0, MAX_TARGETS)
  }

  private score(component: DiagnosisComponent): number {
    return (
      component.entryPointCount * 4 +
      component.publicSurfaceCount * 3 +
      component.dataAccessCount * 2 +
      Math.min(component.implementationIds.length, 20) +
      component.unknownCount * 5
    )
  }

  private targets(component: DiagnosisComponent, byId: Map<string, IrElement>): string[] {
    return component.implementationIds
      .map((id) => byId.get(id))
      .filter((element): element is IrElement => element !== undefined)
      .sort((left, right) => {
        const difference = this.typeRank(left) - this.typeRank(right)
        return difference === 0 ? left.id.localeCompare(right.id) : difference
      })
      .slice(0, MAX_CONTEXT_ELEMENTS)
      .map((element) => element.id)
      .sort()
  }

  private typeRank(element: IrElement): number {
    return ["function", "class", "interface", "module"].includes(element.type) ? 0 : 1
  }

  private catalog(components: DiagnosisComponent[], candidates: DiagnosisComponent[]): string {
    const ordered = [...candidates, ...components].sort((left, right) => {
      const leftCandidate = candidates.some((component) => component.id === left.id) ? 0 : 1
      const rightCandidate = candidates.some((component) => component.id === right.id) ? 0 : 1
      return leftCandidate === rightCandidate
        ? left.id.localeCompare(right.id)
        : leftCandidate - rightCandidate
    })
    const seen = new Set<string>()

    return ordered
      .filter((component) => {
        if (seen.has(component.id)) return false
        seen.add(component.id)
        return true
      })
      .slice(0, MAX_CATALOG)
      .map(
        (component) => `- ${component.id} ${component.label}: ${component.summary.slice(0, 160)}`,
      )
      .join("\n")
  }
}
