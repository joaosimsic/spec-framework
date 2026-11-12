import type { SdocBlock } from "./types"

const OPTIONAL_STRING_FIELDS = [
  "RATIONALE",
  "ACCEPTANCE",
  "COMPONENT",
  "CAPABILITY",
  "FORMAL",
  "CONTRACTS",
  "VERIFICATION",
  "EVIDENCE",
  "WAIVER",
  "REPLACES",
  "DECIDES",
  "QUESTIONS",
  "PROVENANCE",
  "OWNER",
  "PRIORITY",
] satisfies string[]

const optionalFieldLines = OPTIONAL_STRING_FIELDS.map((field) =>
  [`  - TITLE: ${field}`, "    TYPE: String", "    REQUIRED: False"].join("\n"),
).join("\n")

export const SDOC_GRAMMAR = `[GRAMMAR]
ELEMENTS:
- TAG: REQUIREMENT
  FIELDS:
  - TITLE: UID
    TYPE: String
    REQUIRED: True
  - TITLE: TITLE
    TYPE: String
    REQUIRED: True
  - TITLE: STATUS
    TYPE: SingleChoice(Draft, Proposed, Approved, Deprecated)
    REQUIRED: True
  - TITLE: STATEMENT
    TYPE: String
    REQUIRED: True
${optionalFieldLines}
`

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
