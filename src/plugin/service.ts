import { fail, ok, type Result } from "../core/result"
import { AnalysisRuntime } from "../workbench/analysis-runtime"
import { GeneratedSpecValidator, type GeneratedElement, type GeneratedSpec } from "../spec"
import type {
  PluginAnalyzeView,
  PluginCheckView,
  PluginContextView,
  PluginFailure,
  PluginQueryView,
  PluginStatusView,
} from "./types"
import { PLUGIN_CONTRACT_VERSION } from "./types"

export interface SpecPluginServiceOptions {
  runtime?: AnalysisRuntime
}

export class SpecPluginService {
  private runtimePromise: Promise<Result<AnalysisRuntime, string>> | null = null

  constructor(
    private readonly target: string,
    private readonly options: SpecPluginServiceOptions = {},
  ) {}

  async status(): Promise<Result<PluginStatusView, PluginFailure>> {
    const [runtime, runtimeError] = await this.runtime()
    if (runtimeError !== null || runtime === null)
      return this.fail("SPEC-PLUGIN-RUNTIME", runtimeError ?? "runtime unavailable")
    const project = runtime.currentProject()
    const snapshot = project === null ? null : runtime.latest(project)
    const spec = project === null ? null : runtime.spec(project)

    return ok({
      contract: PLUGIN_CONTRACT_VERSION,
      project_id: project?.id ?? null,
      snapshot_id: snapshot?.id ?? null,
      commit: snapshot?.commit ?? "",
      dirty: snapshot?.dirty ?? false,
      architecture: spec?.architecture.elements.length ?? 0,
      flows: spec?.flows.length ?? 0,
      findings: spec?.findings.length ?? 0,
      unknowns: spec?.unknowns.length ?? 0,
    })
  }

  async context(): Promise<Result<PluginContextView, PluginFailure>> {
    const [status, statusError] = await this.status()
    if (statusError !== null || status === null)
      return fail(statusError ?? { code: "SPEC-PLUGIN-STATUS", message: "status unavailable" })
    const spec = await this.spec()
    if (spec[1] !== null) return fail(spec[1])

    return ok({ status, spec: spec[0] })
  }

  async query(input: {
    name?: string
    ref?: string
    kind?: string
  }): Promise<Result<PluginQueryView, PluginFailure>> {
    const [spec, specError] = await this.spec()
    if (specError !== null || spec === null)
      return fail(specError ?? { code: "SPEC-PLUGIN-SPEC", message: "generated spec unavailable" })
    const handle = input.ref ?? input.name
    const elements = spec.architecture.elements.filter((element) => {
      if (
        handle !== undefined &&
        element.id !== handle &&
        element.label.toLowerCase() !== handle.toLowerCase()
      )
        return false
      if (input.kind !== undefined && element.type !== input.kind) return false
      return true
    })

    return ok({ snapshot_id: spec.snapshot.id, commit: spec.snapshot.commit, elements })
  }

  async flows(): Promise<Result<unknown[], PluginFailure>> {
    const [spec, specError] = await this.spec()
    if (specError !== null || spec === null)
      return fail(specError ?? { code: "SPEC-PLUGIN-SPEC", message: "generated spec unavailable" })

    return ok(spec.flows)
  }

  async findings(): Promise<Result<unknown[], PluginFailure>> {
    const [spec, specError] = await this.spec()
    if (specError !== null || spec === null)
      return fail(specError ?? { code: "SPEC-PLUGIN-SPEC", message: "generated spec unavailable" })

    return ok(spec.findings)
  }

  async snapshots(): Promise<Result<unknown[], PluginFailure>> {
    const [runtime, runtimeError] = await this.runtime()
    if (runtimeError !== null || runtime === null)
      return fail({ code: "SPEC-PLUGIN-RUNTIME", message: runtimeError ?? "runtime unavailable" })
    const project = runtime.currentProject()
    if (project === null)
      return fail({ code: "SPEC-PLUGIN-PROJECT", message: "project unavailable" })

    return ok(runtime.snapshots.list(project.id))
  }

  async validate(): Promise<Result<PluginCheckView, PluginFailure>> {
    const [spec, specError] = await this.spec()
    if (specError !== null || spec === null)
      return fail(specError ?? { code: "SPEC-PLUGIN-SPEC", message: "generated spec unavailable" })
    const validator = new GeneratedSpecValidator()
    const findings: string[] = []
    const [validated, validationError] = validator.check(spec)
    if (validationError !== null) findings.push(validationError)
    if (validated !== null) {
      const [, referenceError] = validator.checkReferences(validated)
      if (referenceError !== null) findings.push(referenceError)
    }

    return ok({ errors: findings.length, warnings: 0, findings })
  }

  async analyze(): Promise<Result<PluginAnalyzeView, PluginFailure>> {
    const [runtime, runtimeError] = await this.runtime()
    if (runtimeError !== null || runtime === null)
      return fail({ code: "SPEC-PLUGIN-RUNTIME", message: runtimeError ?? "runtime unavailable" })
    const project = runtime.currentProject()
    if (project === null)
      return fail({ code: "SPEC-PLUGIN-PROJECT", message: "project unavailable" })
    const [job, jobError] = runtime.jobs.start(project)
    if (jobError !== null || job === null)
      return fail({ code: "SPEC-PLUGIN-ANALYZE", message: jobError ?? "analysis did not start" })

    return ok({ job_id: job.id, state: job.state, project_id: project.id })
  }

  private async spec(): Promise<Result<GeneratedSpec | null, PluginFailure>> {
    const [runtime, runtimeError] = await this.runtime()
    if (runtimeError !== null || runtime === null)
      return fail({ code: "SPEC-PLUGIN-RUNTIME", message: runtimeError ?? "runtime unavailable" })
    const project = runtime.currentProject()
    if (project === null) return ok(null)

    return ok(runtime.spec(project))
  }

  private async runtime(): Promise<Result<AnalysisRuntime, string>> {
    if (this.options.runtime !== undefined) return ok(this.options.runtime)
    if (this.runtimePromise === null) this.runtimePromise = AnalysisRuntime.create(this.target)

    return this.runtimePromise
  }

  private fail(code: string, message: string): Result<never, PluginFailure> {
    return fail({ code, message })
  }
}

export function summarizeElement(element: GeneratedElement): string {
  return `${element.label} - ${element.type} (${element.confidence})`
}
