import { fail, ok, type Result } from "../core/result"
import { AnalysisRuntime } from "../workbench/analysis-runtime"
import type { GeneratedConceptualElement, GeneratedSpec } from "../spec"
import type { InterpretationRunDetails, VerificationRunDetails } from "../persistence"

export interface GeneratedQueryOptions {
  json?: boolean
  kind?: string
  name?: string
  section?: string
}

export interface GeneratedQueryRun {
  output: string
  code: number
}

export class GeneratedQuery {
  constructor(private readonly target: string) {}

  async run(options: GeneratedQueryOptions = {}): Promise<Result<GeneratedQueryRun, string>> {
    const [runtime, runtimeError] = await AnalysisRuntime.create(this.target)
    if (runtimeError !== null || runtime === null)
      return fail(runtimeError ?? "analysis runtime unavailable")
    const project = runtime.currentProject()
    const spec = project === null ? null : runtime.spec(project)
    const verification = project === null ? null : runtime.latestVerification(project)
    const interpretations = project === null ? null : runtime.latestInterpretation(project)
    runtime.close()
    if (spec === null)
      return ok({ output: JSON.stringify({ error: "no generated spec" }, null, 2), code: 1 })
    if (options.section !== undefined) {
      const section = this.section(spec, options.section, verification, interpretations)
      if (section === null) return fail(`unknown generated section: ${options.section}`)

      return ok({
        output: options.json ? JSON.stringify(section, null, 2) : JSON.stringify(section, null, 2),
        code: 0,
      })
    }
    const elements = this.elements(spec, options)
    if (options.json) return ok({ output: JSON.stringify(elements, null, 2), code: 0 })

    return ok({ output: elements.map((element) => this.line(element)).join("\n"), code: 0 })
  }

  private elements(
    spec: GeneratedSpec,
    options: GeneratedQueryOptions,
  ): GeneratedConceptualElement[] {
    const name = options.name?.toLowerCase()
    return conceptualElements(spec).filter((element) => {
      if (options.kind !== undefined && element.type !== options.kind) return false
      if (name !== undefined && !element.label.toLowerCase().includes(name)) return false
      return true
    })
  }

  private line(element: GeneratedConceptualElement): string {
    return `${element.label} (${element.type}, ${element.confidence})`
  }

  private section(
    spec: GeneratedSpec,
    section: string,
    verification: VerificationRunDetails | null,
    interpretations: InterpretationRunDetails | null,
  ): unknown {
    const values: Record<string, unknown> = {
      project: spec.project,
      snapshot: spec.snapshot,
      architecture: spec.architecture,
      implementation: spec.implementation,
      mappings: spec.mappings,
      hypotheses: spec.hypotheses,
      requirements: spec.requirements,
      contracts: spec.contracts,
      verification: spec.verification,
      "verification-run": verification,
      interpretations,
      flows: spec.flows,
      findings: spec.findings,
      evidence: spec.evidence,
      unknowns: spec.unknowns,
    }
    return values[section] ?? null
  }
}

export function conceptualElements(spec: GeneratedSpec): GeneratedConceptualElement[] {
  return [
    spec.architecture.system,
    ...spec.architecture.subsystems,
    ...spec.architecture.components,
    ...spec.architecture.interfaces,
    ...spec.architecture.data_stores,
    ...spec.architecture.external_systems,
  ]
}
