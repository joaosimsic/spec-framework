import { readdir } from "node:fs/promises"
import { join } from "node:path"

export type ArchitectureStatus = "draft" | "proposed" | "approved" | "deprecated"
export type ArchitectureConfidence = "observed" | "inferred" | "ambiguous" | "unknown"

export interface C4Annotation {
  status?: ArchitectureStatus
  confidence?: ArchitectureConfidence
  provenance?: string
  metadata: Record<string, string>
}

export interface C4Element {
  id: string | null
  alias: string
  kind: string
  title: string
  file: string
  line: number
  annotation: C4Annotation
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

const ARCHITECTURE_STATUSES = new Set<ArchitectureStatus>([
  "draft",
  "proposed",
  "approved",
  "deprecated",
])
const ARCHITECTURE_CONFIDENCES = new Set<ArchitectureConfidence>([
  "observed",
  "inferred",
  "ambiguous",
  "unknown",
])
const PROVENANCE_PREFIXES = ["human", "code", "doc", "inferred", "assumption"]

export const C4_ID_COMMENT = /^\s*\/\/\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?:\s+(.*))?\s*$/
export const C4_ELEMENT =
  /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s+'((?:[^'\\]|\\.)*)'\s*$/
export const C4_RELATION =
  /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)\s+'((?:[^'\\]|\\.)*)'\s*$/

export function parseC4(file: string, text: string): C4ParseResult {
  const elements: C4Element[] = []
  const relationships: C4Relationship[] = []
  const lines = text.split(/\r?\n/)
  let pending: { id: string; annotation: C4Annotation } | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ""
    const idComment = C4_ID_COMMENT.exec(line)
    if (idComment !== null) {
      const id = idComment[1] ?? ""
      pending = { id, annotation: parseC4Annotation(idComment[2] ?? "") }
      continue
    }

    const element = C4_ELEMENT.exec(line)
    if (element !== null) {
      const alias = element[2] ?? ""
      elements.push({
        id: pending?.id ?? null,
        alias,
        kind: element[3] ?? "",
        title: unescapeTitle(element[4] ?? ""),
        file,
        line: index + 1,
        annotation: pending?.annotation ?? emptyAnnotation(),
      })
      pending = null
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
      pending = null
      continue
    }

    if (line.trim() !== "") pending = null
  }

  return { elements, relationships }
}

export function parseC4Annotation(value: string): C4Annotation {
  const tokens = tokenizeAnnotation(value)
  const annotation: C4Annotation = { metadata: {} }
  let index = 0

  const status = tokens[index]
  if (status !== undefined && ARCHITECTURE_STATUSES.has(status as ArchitectureStatus)) {
    annotation.status = status as ArchitectureStatus
    index += 1
  }

  const confidence = tokens[index]
  if (
    confidence !== undefined &&
    ARCHITECTURE_CONFIDENCES.has(confidence as ArchitectureConfidence)
  ) {
    annotation.confidence = confidence as ArchitectureConfidence
    index += 1
  }

  const provenance = tokens[index]
  if (provenance !== undefined && isProvenance(provenance)) {
    annotation.provenance = provenance
    index += 1
  }

  for (const token of tokens.slice(index)) {
    const separator = token.indexOf("=")
    if (separator === -1) continue
    const key = token.slice(0, separator)
    const rawValue = unquote(token.slice(separator + 1))
    if (key === "status" && ARCHITECTURE_STATUSES.has(rawValue as ArchitectureStatus)) {
      annotation.status = rawValue as ArchitectureStatus
      continue
    }
    if (key === "confidence" && ARCHITECTURE_CONFIDENCES.has(rawValue as ArchitectureConfidence)) {
      annotation.confidence = rawValue as ArchitectureConfidence
      continue
    }
    if (key === "provenance" && isProvenance(rawValue)) {
      annotation.provenance = rawValue
      continue
    }
    if (key === "") continue
    annotation.metadata[key] = rawValue
  }

  return annotation
}

export function formatC4Annotation(annotation: C4Annotation): string {
  const tokens: string[] = []
  if (annotation.status !== undefined) tokens.push(annotation.status)
  if (annotation.confidence !== undefined) tokens.push(`confidence=${annotation.confidence}`)
  if (annotation.provenance !== undefined) tokens.push(`provenance=${annotation.provenance}`)

  for (const [key, value] of Object.entries(annotation.metadata)) {
    tokens.push(`${key}=${JSON.stringify(value)}`)
  }

  return tokens.join(" ")
}

function emptyAnnotation(): C4Annotation {
  return { metadata: {} }
}

function isProvenance(value: string): boolean {
  const prefix = value.split(":")[0] ?? ""

  return value.includes(":") && PROVENANCE_PREFIXES.includes(prefix)
}

function tokenizeAnnotation(value: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: string | null = null

  for (const character of value.trim()) {
    if (quote !== null) {
      current += character
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (/\s/.test(character)) {
      if (current !== "") tokens.push(current)
      current = ""
      continue
    }
    current += character
  }

  if (current !== "") tokens.push(current)

  return tokens
}

function unquote(value: string): string {
  if (value.length < 2) return value
  const first = value.charAt(0)
  const last = value.charAt(value.length - 1)
  if (first !== last || (first !== '"' && first !== "'")) return value

  return value.slice(1, -1).replace(/\\(['"\\])/g, "$1")
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
