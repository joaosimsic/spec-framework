import { LikeC4Adapter } from "../adapters/likec4"
import { CliAdapter } from "../adapters/cli"
import { CompilerAdapter } from "../adapters/compiler"
import { JsonSchemaAdapter } from "../adapters/json-schema"
import { QuintAdapter } from "../adapters/quint"
import { RustAdapter } from "../adapters/rust"
import { StrictDocAdapter } from "../adapters/strictdoc"
import type { NativeAdapter } from "../adapters/types"
import { verifySpecLock } from "../approval/verify"
import { EvidenceCollector, type EvidenceRecord } from "../evidence"
import { requiredToolsFor, selectAdapter, selectAdapters } from "./adapter-selection"
import { SpecConfigLoader } from "./config"
import {
  BunProcessRunner,
  ToolResolver,
  type ProcessRunner,
  type ToolLocator,
} from "./runner"
import { lintBlocks } from "./lint"
import { loadRequirementSources } from "./requirements"
import { getToolStatuses, missingRequiredDiagnostics } from "./doctor"
import type { CheckResult, Diagnostic } from "./types"

export interface CheckOptions {
  structural?: boolean
  json?: boolean
  verifyApprovals?: boolean
  implementationAdapter?: NativeAdapter
  architectureAdapter?: NativeAdapter
  requirementsAdapter?: NativeAdapter
  formalAdapter?: NativeAdapter
  contractAdapters?: NativeAdapter[]
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
}

export interface CheckRun {
  result: CheckResult
  output: string
  code: number
  evidence: EvidenceRecord[]
}

async function runNativeChecks(
  target: string,
  options: CheckOptions,
  diagnostics: Diagnostic[],
): Promise<EvidenceRecord[]> {
  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError) {
    diagnostics.push({ level: "error", code: configError.code, message: configError.message })
    return []
  }
  if (config === null) {
    diagnostics.push({
      level: "error",
      code: "SPEC-BAD-CONFIG",
      message: "config loader returned no configuration",
    })
    return []
  }

  const activeAdapters: NativeAdapter[] = []
  const implementation = await selectAdapter(target, config.adapters.implementation, [
    options.implementationAdapter ?? new CompilerAdapter(),
  ])
  if (implementation.unknownId !== null) {
    diagnostics.push({
      level: "error",
      code: "IMPL-UNKNOWN-ADAPTER",
      message: `unsupported implementation adapter '${implementation.unknownId}'`,
    })
    return []
  }
  if (implementation.adapter !== null) activeAdapters.push(implementation.adapter)

  const architecture = await selectAdapter(target, config.adapters.architecture, [
    options.architectureAdapter ?? new LikeC4Adapter(),
  ])
  if (architecture.unknownId !== null) {
    diagnostics.push({
      level: "error",
      code: "ARCH-UNKNOWN-ADAPTER",
      message: `unsupported architecture adapter '${architecture.unknownId}'`,
    })
    return []
  }
  if (architecture.adapter !== null) activeAdapters.push(architecture.adapter)

  const requirements = await selectAdapter(target, config.adapters.requirements, [
    options.requirementsAdapter ?? new StrictDocAdapter(),
  ])
  if (requirements.unknownId !== null) {
    diagnostics.push({
      level: "error",
      code: "REQ-UNKNOWN-ADAPTER",
      message: `unsupported requirements adapter '${requirements.unknownId}'`,
    })
    return []
  }
  if (requirements.adapter !== null) activeAdapters.push(requirements.adapter)

  const formal = await selectAdapter(target, config.adapters.formal, [
    options.formalAdapter ?? new QuintAdapter(),
  ])
  if (formal.unknownId !== null) {
    diagnostics.push({
      level: "error",
      code: "FORMAL-UNKNOWN-ADAPTER",
      message: `unsupported formal adapter '${formal.unknownId}'`,
    })
    return []
  }
  if (formal.adapter !== null) activeAdapters.push(formal.adapter)

  const contracts = await selectAdapters(
    target,
    config.adapters.contracts ?? [],
    options.contractAdapters ?? [new JsonSchemaAdapter(), new CliAdapter(), new RustAdapter()],
  )
  for (const unknownId of contracts.unknownIds) {
    diagnostics.push({
      level: "error",
      code: "CONTRACT-UNKNOWN-ADAPTER",
      message: `unsupported contract adapter '${unknownId}'`,
    })
  }
  activeAdapters.push(...contracts.active)

  diagnostics.push(
    ...missingRequiredDiagnostics(getToolStatuses(target), requiredToolsFor(activeAdapters)),
  )

  const context = {
    target,
    processRunner: options.processRunner ?? new BunProcessRunner(),
    toolLocator: options.toolLocator ?? new ToolResolver(target),
  }
  const records: EvidenceRecord[] = []
  for (const adapter of activeAdapters) {
    const adapterRun = await adapter.run(context)
    diagnostics.push(...adapterRun.diagnostics)
    records.push(...(adapterRun.evidence ?? []))
  }

  const [evidence, evidenceError] = new EvidenceCollector().collect(records)
  if (evidenceError !== null) {
    diagnostics.push({
      level: "error",
      code: evidenceError.code,
      message: evidenceError.message,
    })
    return []
  }

  return evidence ?? []
}

export async function runCheck(target: string, options: CheckOptions = {}): Promise<CheckRun> {
  const sources = await loadRequirementSources(target)
  const diagnostics: Diagnostic[] = [...sources.diagnostics]
  const blocks = sources.blocks

  const structural = lintBlocks(blocks)
  diagnostics.push(...structural.diagnostics)

  const evidence = options.structural ? [] : await runNativeChecks(target, options, diagnostics)

  if (options.verifyApprovals !== false) {
    diagnostics.push(
      ...(await verifySpecLock(target, blocks, options.structural ? undefined : evidence)),
    )
  }

  const errors = diagnostics.filter((item) => item.level === "error").length
  const warnings = diagnostics.filter((item) => item.level === "warning").length

  if (options.json) {
    return {
      result: { diagnostics, errors, warnings },
      evidence,
      output: JSON.stringify({ diagnostics, errors, warnings }, null, 2),
      code: errors > 0 ? 1 : 0,
    }
  }

  const lines = diagnostics.map((item) => {
    const location = item.file ? `${item.file}:${item.line ?? 1}` : "spec"
    const id = item.id ? ` ${item.id}` : ""
    return `${location}: ${item.level} ${item.code}${id} ${item.message}`
  })

  lines.push("")
  lines.push(`${errors} error(s), ${warnings} warning(s), ${blocks.length} requirement record(s)`)

  return {
    result: { diagnostics, errors, warnings },
    evidence,
    output: lines.join("\n"),
    code: errors > 0 ? 1 : 0,
  }
}
