import { readdir } from "node:fs/promises"
import { join } from "node:path"

export interface C4Element {
  id: string | null
  alias: string
  kind: string
  title: string
  file: string
  line: number
}

export interface C4Relationship {
  source: string
  target: string
  label: string
  file: string
  line: number
}

export interface C4ParseResult {
  elements: C4Element[]
  relationships: C4Relationship[]
}

export const C4_ID_COMMENT = /^\s*\/\/\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?:\s+(.*))?\s*$/
export const C4_ELEMENT =
  /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s+'((?:[^'\\]|\\.)*)'\s*$/
export const C4_RELATION =
  /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)\s+'((?:[^'\\]|\\.)*)'\s*$/

export function parseC4(file: string, text: string): C4ParseResult {
  const elements: C4Element[] = []
  const relationships: C4Relationship[] = []
  const lines = text.split(/\r?\n/)
  let pendingId: string | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ""
    const idComment = C4_ID_COMMENT.exec(line)
    if (idComment !== null) {
      pendingId = idComment[1] ?? null
      continue
    }

    const element = C4_ELEMENT.exec(line)
    if (element !== null) {
      const alias = element[2] ?? ""
      elements.push({
        id: pendingId,
        alias,
        kind: element[3] ?? "",
        title: unescapeTitle(element[4] ?? ""),
        file,
        line: index + 1,
      })
      pendingId = null
      continue
    }

    const relationship = C4_RELATION.exec(line)
    if (relationship !== null) {
      relationships.push({
        source: relationship[2] ?? "",
        target: relationship[3] ?? "",
        label: unescapeTitle(relationship[4] ?? ""),
        file,
        line: index + 1,
      })
      pendingId = null
      continue
    }

    if (line.trim() !== "") pendingId = null
  }

  return { elements, relationships }
}

export function escapeTitle(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\s+/g, " ").trim()
}

export async function collectC4Files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectC4Files(path)))
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.(c4|likec4)$/.test(entry.name)) continue
    if (entry.name.endsWith(".gen.c4")) continue
    files.push(path)
  }

  return files.sort()
}

function unescapeTitle(value: string): string {
  return value.replace(/\\(['\\])/g, "$1")
}
