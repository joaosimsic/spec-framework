import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { LikeC4Adapter } from "../adapters/likec4"
import { CliAdapter } from "../adapters/cli"
import { JsonSchemaAdapter } from "../adapters/json-schema"
import { QuintAdapter } from "../adapters/quint"
import { RustAdapter } from "../adapters/rust"
import { StrictDocAdapter } from "../adapters/strictdoc"
import type { NativeAdapter } from "../adapters/types"
import { requiredToolsFor, selectAdapter, selectAdapters } from "./adapter-selection"
import { SpecConfigLoader } from "./config"
import {
  BunProcessRunner,
  ToolResolver,
  type ProcessRunner,
  type ToolLocator,
} from "./runner"
import { attemptAsync } from "./result"
import { lintBlocks } from "./lint"
import { parseSdoc, requirementBlocks } from "./sdoc"
import { getToolStatuses, missingRequiredDiagnostics } from "./doctor"
import type { CheckResult, Diagnostic } from "./types"

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)))
    } else if (entry.isFile() && /\.(sdoc|md)$/.test(entry.name)) {
      files.push(path)
    }
  }

  return files
}

export interface CheckOptions {
  structural?: boolean
  json?: boolean
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
}

async function runNativeChecks(
  target: string,
  options: CheckOptions,
  diagnostics: Diagnostic[],
): Promise<void> {
  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError) {
    diagnostics.push({ level: "error", code: configError.code, message: configError.message })
    return
  }
  if (config === null) {
    diagnostics.push({
      level: "error",
      code: "SPEC-BAD-CONFIG",
      message: "config loader returned no configuration",
    })
    return
  }

  const activeAdapters: NativeAdapter[] = []
  const architecture = await selectAdapter(target, config.adapters.architecture, [
    options.architectureAdapter ?? new LikeC4Adapter(),
  ])
  if (architecture.unknownId !== null) {
    diagnostics.push({
      level: "error",
      code: "ARCH-UNKNOWN-ADAPTER",
      message: `unsupported architecture adapter '${architecture.unknownId}'`,
    })
    return
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
    return
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
    return
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
  for (const adapter of activeAdapters) {
    const adapterRun = await adapter.run(context)
    diagnostics.push(...adapterRun.diagnostics)
  }
}

export async function runCheck(target: string, options: CheckOptions = {}): Promise<CheckRun> {
  const requirementsDir = join(target, "spec", "requirements")
  const files = await collectFiles(requirementsDir)
  const diagnostics: Diagnostic[] = []

  if (files.length === 0) {
    diagnostics.push({
      level: "error",
      code: "SPEC-NO-REQUIREMENTS",
      message: "no .sdoc or .md requirement files found under spec/requirements",
    })
  }

  const blocks = []
  for (const file of files) {
    const [text, readError] = await attemptAsync(() => Bun.file(file).text())
    if (readError) {
      diagnostics.push({
        level: "error",
        code: "SPEC-READ-FAILED",
        message: `cannot read ${file}: ${readError}`,
        file,
      })
      continue
    }
    if (text === null) {
      diagnostics.push({
        level: "error",
        code: "SPEC-READ-FAILED",
        message: `cannot read ${file}`,
        file,
      })
      continue
    }

    blocks.push(...requirementBlocks(parseSdoc(file, text)))
  }

  const structural = lintBlocks(blocks)
  diagnostics.push(...structural.diagnostics)

  if (!options.structural) {
    await runNativeChecks(target, options, diagnostics)
  }

  const errors = diagnostics.filter((item) => item.level === "error").length
  const warnings = diagnostics.filter((item) => item.level === "warning").length

  if (options.json) {
    return {
      result: { diagnostics, errors, warnings },
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
    output: lines.join("\n"),
    code: errors > 0 ? 1 : 0,
  }
}
