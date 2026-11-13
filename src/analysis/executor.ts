import { fail, ok, type Result } from "../core/result"
import { SpecFrameworkConfigLoader } from "../config"
import type {
  AnalysisExecutionRequest,
  AnalysisExecutionResult,
  AnalysisExecutor,
} from "../jobs/types"
import { TypeScriptAdapter } from "./adapters/typescript"
import { RepositoryScanner } from "./scanner"
import { FlowAnalyzer } from "../flows/analyzer"
import { GitStateReader } from "./git-state"

export interface TypeScriptExecutorOptions {
  exclusions?: string[]
}

export class TypeScriptAnalysisExecutor implements AnalysisExecutor {
  private readonly git = new GitStateReader()
  private readonly adapter = new TypeScriptAdapter()
  private readonly scanner: RepositoryScanner

  constructor(options: TypeScriptExecutorOptions = {}) {
    this.scanner = new RepositoryScanner(options.exclusions)
  }

  async execute(
    request: AnalysisExecutionRequest,
  ): Promise<Result<AnalysisExecutionResult, string>> {
    request.report({ phase: "git", progress: 0.05, message: "reading repository state" })
    const [state, stateError] = this.git.read(request.project.repositoryPath)
    if (stateError !== null) return fail(stateError)
    if (state === null) return fail("repository state unavailable")

    request.report({ phase: "scan", progress: 0.15, message: "scanning source files" })
    const [scan, scanError] = await this.scanner.scan(request.project.repositoryPath)
    if (scanError !== null) return fail(scanError)
    if (scan === null) return fail("scanner returned no result")
    if (request.signal.aborted) return fail("analysis cancelled")

    const sourceFiles = scan.files.filter(
      (file) => file.language === "typescript" || file.language === "javascript",
    )
    request.report({
      phase: "typescript",
      progress: 0.35,
      message: `analyzing ${sourceFiles.length} source files`,
    })
    const [ir, irError] = await this.adapter.analyze(request.project.repositoryPath, sourceFiles)
    if (irError !== null || ir === null) return fail(irError ?? "TypeScript analysis failed")
    if (request.signal.aborted) return fail("analysis cancelled")

    const [config, configError] = await new SpecFrameworkConfigLoader(
      request.project.repositoryPath,
    ).load()
    if (configError !== null || config === null) {
      return fail(configError ?? "spec-framework.json unavailable")
    }
    const flows = config.analysis.flowAnalysis
      ? new FlowAnalyzer().analyze(ir.elements, ir.relationships, ir.entryPoints)
      : []
    request.report({ phase: "resolve", progress: 0.95, message: "resolving relationships" })

    return ok({
      commit: state.commit,
      dirty: !state.clean,
      analyzer: this.adapter.id,
      analyzerVersion: this.adapter.version,
      ruleVersion: "1",
      promptVersion: "1",
      modelVersion: "none",
      files: scan.files,
      nodes: ir.elements,
      edges: ir.relationships,
      entryPoints: ir.entryPoints,
      flows,
      findings: ir.findings,
      mapping: null,
      coverage: { mapped: [], partial: [], unmapped: [], unassigned: [], stale: [] },
    })
  }
}
