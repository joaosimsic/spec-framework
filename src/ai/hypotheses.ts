import type { IrElement, IrRelationship } from "../analysis/ir"
import type { SnapshotRecord } from "../persistence"
import { GeneratedSpecIdentity, type GeneratedHypothesis } from "../spec"
import type { AiInterpreter } from "./interpreter"

export interface HypothesisComponent {
  id: string
  label: string
  summary: string
  implementationIds: string[]
}

export interface HypothesisInput {
  root: string
  snapshot: SnapshotRecord
  elements: IrElement[]
  relationships: IrRelationship[]
  files: string[]
  components: HypothesisComponent[]
}

export interface HypothesisOutput {
  hypotheses: GeneratedHypothesis[]
  failures: string[]
}

export class AiComponentHypothesisGenerator {
  constructor(private readonly interpreter: AiInterpreter) {}

  async generate(input: HypothesisInput): Promise<HypothesisOutput> {
    const byId = new Map(input.elements.map((element) => [element.id, element]))
    const hypotheses: GeneratedHypothesis[] = []
    const failures: string[] = []
    for (const component of [...input.components].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      const target = this.target(component.implementationIds, byId)
      if (target === undefined) {
        failures.push(`${component.label}: no implementation target`)
        continue
      }
      const [result, error] = await this.interpreter.componentHypothesis(
        {
          root: input.root,
          snapshot: input.snapshot,
          elements: input.elements,
          relationships: input.relationships,
          files: input.files,
        },
        target,
        { label: component.label, summary: component.summary },
      )
      if (error !== null || result === null) {
        failures.push(`${component.label}: ${error ?? "AI hypothesis rejected"}`)
        continue
      }
      hypotheses.push({
        id: GeneratedSpecIdentity.hypothesis(
          component.id,
          result.provider,
          result.model,
          result.promptVersion,
        ),
        conceptual_id: component.id,
        text: result.answer.explanation,
        evidence: result.answer.evidence.map((item) => ({
          element_id: item.elementId,
          file_path: item.filePath,
          line: item.line,
        })),
        confidence: result.answer.confidence,
        provider: result.provider,
        model: result.model,
        prompt_version: result.promptVersion,
        input_hashes: result.inputHashes,
        status: "valid",
      })
    }

    return {
      hypotheses: hypotheses.sort((left, right) => left.id.localeCompare(right.id)),
      failures: failures.sort(),
    }
  }

  private target(implementationIds: string[], byId: Map<string, IrElement>): string | undefined {
    const values = implementationIds
      .map((id) => byId.get(id))
      .filter((element): element is IrElement => element !== undefined)
    const preferred = values
      .filter((element) => ["function", "class", "interface", "module"].includes(element.type))
      .sort((left, right) => left.id.localeCompare(right.id))[0]

    return preferred?.id ?? values.sort((left, right) => left.id.localeCompare(right.id))[0]?.id
  }
}
