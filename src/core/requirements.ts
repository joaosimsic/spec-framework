import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { attemptAsync } from "./result"
import { parseSdoc, requirementBlocks } from "./sdoc"
import type { Diagnostic, SdocBlock } from "./types"

export interface RequirementSources {
  files: string[]
  blocks: SdocBlock[]
  diagnostics: Diagnostic[]
}

export function requirementDirectory(target: string): string {
  return join(target, "spec", "requirements")
}

export async function collectRequirementFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectRequirementFiles(path)))
      continue
    }
    if (entry.isFile() && /\.(sdoc|md)$/.test(entry.name)) files.push(path)
  }

  return files
}

export async function loadRequirementSources(target: string): Promise<RequirementSources> {
  const files = await collectRequirementFiles(requirementDirectory(target))
  const diagnostics: Diagnostic[] = []
  const blocks: SdocBlock[] = []

  if (files.length === 0) {
    diagnostics.push({
      level: "error",
      code: "SPEC-NO-REQUIREMENTS",
      message: "no .sdoc or .md requirement files found under spec/requirements",
    })
  }

  for (const file of files) {
    const [text, readError] = await attemptAsync(() => Bun.file(file).text())
    if (readError || text === null) {
      diagnostics.push({
        level: "error",
        code: "SPEC-READ-FAILED",
        message: readError === null ? `cannot read ${file}` : `cannot read ${file}: ${readError}`,
        file,
      })
      continue
    }

    blocks.push(...requirementBlocks(parseSdoc(file, text)))
  }

  return { files, blocks, diagnostics }
}
