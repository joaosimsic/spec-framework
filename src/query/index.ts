import { fail, ok, type Result } from "../core/result"
import { AnalysisRuntime } from "../workbench/analysis-runtime"
import type { GeneratedElement, GeneratedSpec } from "../spec"

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
    runtime.close()
    if (spec === null)
      return ok({ output: JSON.stringify({ error: "no generated spec" }, null, 2), code: 1 })
    if (options.section !== undefined) {
      const section = this.section(spec, options.section)
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

  private elements(spec: GeneratedSpec, options: GeneratedQueryOptions): GeneratedElement[] {
    const name = options.name?.toLowerCase()
    return spec.architecture.elements.filter((element) => {
      if (options.kind !== undefined && element.type !== options.kind) return false
      if (name !== undefined && !element.label.toLowerCase().includes(name)) return false
      return true
    })
  }

  private line(element: GeneratedElement): string {
    const location = element.file_path === null ? "" : ` - ${element.file_path}`
    return `${element.label} (${element.type}, ${element.confidence})${location}`
  }

  private section(spec: GeneratedSpec, section: string): unknown {
    const values: Record<string, unknown> = {
      project: spec.project,
      snapshot: spec.snapshot,
      architecture: spec.architecture,
      requirements: spec.requirements,
      contracts: spec.contracts,
      verification: spec.verification,
      flows: spec.flows,
      findings: spec.findings,
      evidence: spec.evidence,
      unknowns: spec.unknowns,
    }
    return values[section] ?? null
  }
}
