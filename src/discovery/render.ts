import { likec4Alias } from "./ids"
import type { DraftElement } from "./types"

const KIND_ORDER = ["system", "component", "data_store", "external_system"]

export function renderDraftModel(elements: DraftElement[]): string {
  const aliases = buildAliases(elements)
  const byId = new Map(elements.map((element) => [element.id, element]))
  const kinds = [...new Set(elements.map((element) => element.kind))].sort((left, right) => {
    const leftIndex = KIND_ORDER.indexOf(left)
    const rightIndex = KIND_ORDER.indexOf(right)
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right)
    if (leftIndex === -1) return 1
    if (rightIndex === -1) return -1
    return leftIndex - rightIndex
  })

  const elementLines = elements.map((element) => {
    const alias = aliases.get(element.id) ?? likec4Alias(element.id)
    return [
      `  // ${element.id} ${element.confidence} ${element.provenance}${metadata(element)}`,
      `  ${alias} = ${element.kind} '${quote(element.title)}'`,
    ]
  })

  const relationLines = new Set<string>()
  for (const element of elements) {
    const source = aliases.get(element.id)
    if (source === undefined) continue

    for (const link of element.links) {
      const target = aliases.get(link.to)
      if (target === undefined) continue
      if (!byId.has(link.to)) continue

      if (link.type === "part_of") {
        relationLines.add(`  ${target} -> ${source} 'contains'`)
        continue
      }
      if (link.type === "depends_on") {
        relationLines.add(`  ${source} -> ${target} 'depends_on'`)
        continue
      }

      relationLines.add(`  ${source} -> ${target} '${quote(link.type)}'`)
    }
  }

  const lines = ["specification {", ...kinds.map((kind) => `  element ${kind}`), "}", "", "model {"]
  for (const elementLine of elementLines) lines.push(...elementLine)
  if (relationLines.size > 0) {
    lines.push("")
    lines.push(...[...relationLines].sort())
  }
  lines.push("}", "", "views {", "  view mapDraft {", "    include *", "  }", "}", "")

  return lines.join("\n")
}

function buildAliases(elements: DraftElement[]): Map<string, string> {
  const aliases = new Map<string, string>()
  const used = new Set<string>()

  for (const element of elements) {
    const base = likec4Alias(element.id)
    let alias = base
    let suffix = 2
    while (used.has(alias)) {
      alias = `${base}${suffix}`
      suffix += 1
    }
    used.add(alias)
    aliases.set(element.id, alias)
  }

  return aliases
}

function metadata(element: DraftElement): string {
  const fields: string[] = []
  if (element.owner !== undefined) fields.push(`owner=${JSON.stringify(element.owner)}`)
  if (element.responsibility !== undefined) {
    fields.push(`responsibility=${JSON.stringify(element.responsibility)}`)
  }
  if (element.boundary !== undefined) fields.push(`boundary=${JSON.stringify(element.boundary)}`)

  return fields.length === 0 ? "" : ` ${fields.join(" ")}`
}

function quote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\s+/g, " ").trim()
}
