import type { SdocBlock } from "./types"

const BLOCK_START = /^\[([A-Z_]+)\]\s*$/
const FIELD = /^([A-Z][A-Z0-9_]*):\s*(.*)$/

export function parseSdoc(file: string, text: string): SdocBlock[] {
  const blocks: SdocBlock[] = []
  const lines = text.split(/\r?\n/)
  let current: SdocBlock | null = null
  let lastField: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const start = line.match(BLOCK_START)

    if (start) {
      if (current) blocks.push(current)
      current = { file, line: i + 1, kind: start[1], fields: {} }
      lastField = null
      continue
    }

    if (!current) continue

    const field = line.match(FIELD)
    if (field) {
      current.fields[field[1]] = field[2].trim()
      lastField = field[1]
      continue
    }

    if (line.trim() === "") {
      lastField = null
      continue
    }

    if (/^\s+/.test(line) && lastField) {
      current.fields[lastField] = `${current.fields[lastField]} ${line.trim()}`.trim()
    }
  }

  if (current) blocks.push(current)
  return blocks
}

export function requirementBlocks(blocks: SdocBlock[]): SdocBlock[] {
  return blocks.filter((block) => block.kind === "REQUIREMENT")
}
