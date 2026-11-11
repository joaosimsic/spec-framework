import type { DisplayEntry, DisplayModel } from "../model/index"

export function renderHuman(model: DisplayModel): string {
  const lines = model.entries.map(
    (entry) => `${entry.label} - ${entry.state} (${entry.kindLabel.toLowerCase()})`,
  )
  const blockers = model.entries.flatMap((entry) =>
    entry.blockers.map((blocker) => `${entry.label}: ${blocker}`),
  )

  if (blockers.length > 0) {
    lines.push("")
    lines.push("Blockers:")
    lines.push(...blockers.map((blocker) => `- ${blocker}`))
  }

  lines.push("")
  lines.push(`${model.entries.length} element(s)`)

  return lines.join("\n")
}

export function renderTechnical(model: DisplayModel): string {
  const lines = model.entries.flatMap((entry) => technicalLines(entry))
  lines.push("")
  lines.push(`${model.entries.length} element(s)`)

  return lines.join("\n")
}

function technicalLines(entry: DisplayEntry): string[] {
  const lines = [entry.label, `  id: ${entry.technical.id}`, `  kind: ${entry.technical.kind}`]

  if (entry.technical.status !== undefined) lines.push(`  status: ${entry.technical.status}`)
  if (entry.technical.owner !== undefined) lines.push(`  owner: ${entry.technical.owner}`)
  if (entry.technical.provenance !== undefined) {
    lines.push(`  provenance: ${entry.technical.provenance}`)
  }
  if (entry.technical.confidence !== undefined) {
    lines.push(`  confidence: ${entry.technical.confidence}`)
  }
  if (entry.technical.links.length > 0) {
    lines.push(
      `  links: ${entry.technical.links.map((link) => `${link.type} -> ${link.to}`).join(", ")}`,
    )
  }
  for (const diagnostic of entry.technical.diagnostics) {
    lines.push(`  diagnostic ${diagnostic.code} (${diagnostic.level}): ${diagnostic.message}`)
  }

  return lines
}
