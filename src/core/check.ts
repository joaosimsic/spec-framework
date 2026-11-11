import { readdir } from "node:fs/promises"
import { join } from "node:path"
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
}

export interface CheckRun {
  result: CheckResult
  output: string
  code: number
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
    const text = await Bun.file(file).text()
    blocks.push(...requirementBlocks(parseSdoc(file, text)))
  }

  const structural = lintBlocks(blocks)
  diagnostics.push(...structural.diagnostics)

  if (!options.structural) {
    diagnostics.push(...missingRequiredDiagnostics(getToolStatuses()))
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
