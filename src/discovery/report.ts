import type { DiscoveryFinding, DraftElement, MapReport, MapSummary } from "./types"

export function buildMapReport(
  elements: DraftElement[],
  findings: DiscoveryFinding[],
  externalDependencies: string[],
  unresolvedRequirementLinks: string[],
  draftPath: string | null,
): MapReport {
  const summary = summarize(elements)
  const ids = [...elements.map((element) => element.id)].sort()

  return {
    version: 1,
    draftPath,
    elements,
    summary,
    gaps: {
      missingOwners: ids,
      missingResponsibilities: ids,
      externalDependencies: [...new Set(externalDependencies)].sort(),
      unresolvedRequirementLinks: [...new Set(unresolvedRequirementLinks)].sort(),
    },
    findings: [...findings].sort((left, right) => {
      const codeOrder = left.code.localeCompare(right.code)
      return codeOrder === 0 ? left.message.localeCompare(right.message) : codeOrder
    }),
  }
}

export function formatMapReport(report: MapReport): string {
  const lines = [
    "mapping report",
    `  elements: ${report.summary.elements}`,
    `  relations: ${report.summary.relations}`,
    `  confidence: observed ${report.summary.observed}, inferred ${report.summary.inferred}, ambiguous ${report.summary.ambiguous}, unknown ${report.summary.unknown}`,
    `  draft: ${report.draftPath ?? "not written (run with --draft)"}`,
  ]

  const lowConfidence = report.elements.filter((element) => element.confidence !== "observed")
  if (lowConfidence.length > 0) {
    lines.push("", "low confidence:")
    for (const element of lowConfidence) {
      lines.push(`  ${element.id} ${element.confidence} ${element.provenance}`)
    }
  }

  if (report.gaps.missingOwners.length > 0) {
    lines.push("", "missing owners:")
    for (const id of report.gaps.missingOwners) lines.push(`  ${id}`)
  }

  if (report.gaps.missingResponsibilities.length > 0) {
    lines.push("", "missing responsibilities:")
    for (const id of report.gaps.missingResponsibilities) lines.push(`  ${id}`)
  }

  if (report.gaps.externalDependencies.length > 0) {
    lines.push("", "external dependencies without local mapping:")
    for (const dependency of report.gaps.externalDependencies) lines.push(`  ${dependency}`)
  }

  if (report.gaps.unresolvedRequirementLinks.length > 0) {
    lines.push("", "unresolved requirement links:")
    for (const link of report.gaps.unresolvedRequirementLinks) lines.push(`  ${link}`)
  }

  if (report.findings.length > 0) {
    lines.push("", "findings:")
    for (const finding of report.findings) {
      lines.push(`  ${finding.level} ${finding.code} ${finding.message}`)
    }
  }

  return lines.join("\n")
}

export function renderMapJson(report: MapReport): string {
  return JSON.stringify(report, null, 2)
}

function summarize(elements: DraftElement[]): MapSummary {
  return elements.reduce<MapSummary>(
    (summary, element) => {
      summary.elements += 1
      summary.relations += element.links.length
      summary[element.confidence] += 1
      return summary
    },
    {
      elements: 0,
      relations: 0,
      observed: 0,
      inferred: 0,
      ambiguous: 0,
      unknown: 0,
    },
  )
}
