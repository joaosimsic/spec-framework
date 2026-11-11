import { ChangeReportRenderer } from "../change/report"
import type { Proposal } from "../change/types"
import type { MappingCurationReport } from "./curation-types"
import { MappingCurationReportRenderer } from "./curation-report"
import type { MappingReview, MappingReviewItem } from "./review"
import type { MapReport } from "./types"

const CONFIDENCE_GROUPS: MappingReviewItem["confidence"][] = [
  "unknown",
  "ambiguous",
  "inferred",
  "observed",
]

export class MappingReviewReportRenderer {
  static human(review: MappingReview, curation?: MappingCurationReport): string {
    const lines = [
      "mapping review open",
      `goal: ${review.direction}`,
      `state: ${review.state}`,
      "nothing is approved",
      `areas: ${review.summary.elements}`,
      `relations: ${review.summary.relations}`,
    ]

    if (review.queue.length > 0) {
      lines.push("", "confidence queue:")
      for (const confidence of CONFIDENCE_GROUPS) {
        const items = review.queue.filter((item) => item.confidence === confidence)
        if (items.length === 0) continue
        lines.push(`  ${items[0]?.confidenceLabel ?? confidence}: ${items.length}`)
        for (const item of items) lines.push(`  - ${item.label} (${item.kindLabel})`)
      }
    }

    const gaps = this.gapLines(review)
    if (gaps.length > 0) lines.push("", "gaps:", ...gaps)

    if (review.notes.length > 0)
      lines.push("", "notes:", ...review.notes.map((note) => `  - ${note}`))

    if (curation !== undefined) lines.push(...MappingCurationReportRenderer.human(curation))

    lines.push("", "review prompts:", ...review.prompts.map((prompt) => `- ${prompt}`))
    lines.push("", "next:", ...review.next.map((step) => `- ${step}`))

    return lines.join("\n")
  }

  static technical(
    review: MappingReview,
    report: MapReport,
    proposal: Proposal,
    curation?: MappingCurationReport,
  ): string {
    const lines = [
      `mapping-review: mode=${review.mode} state=${review.state} direction=${review.direction}`,
      `mapping-review-summary: areas=${review.summary.elements} relations=${review.summary.relations}`,
      `mapping-review-draft: ${report.draftPath ?? "none"}`,
      ...review.queue.map((item) => this.itemLine(item)),
      ...report.gaps.missingOwners.map((id) => `mapping-review-gap: missing-owner ${id}`),
      ...report.gaps.missingResponsibilities.map(
        (id) => `mapping-review-gap: missing-responsibility ${id}`,
      ),
      ...report.gaps.externalDependencies.map(
        (dependency) => `mapping-review-gap: external ${dependency}`,
      ),
      ...report.gaps.unresolvedRequirementLinks.map(
        (link) => `mapping-review-gap: unresolved-link ${link}`,
      ),
      ...report.findings.map(
        (finding) => `mapping-review-finding: ${finding.level} ${finding.code} ${finding.message}`,
      ),
      ...review.prompts.map((prompt) => `mapping-review-prompt: ${prompt}`),
      ...review.next.map((step) => `mapping-review-next: ${step}`),
      ...(curation === undefined ? [] : MappingCurationReportRenderer.technical(curation)),
      "",
      ChangeReportRenderer.status(proposal, true),
    ]

    return lines.join("\n")
  }

  private static gapLines(review: MappingReview): string[] {
    const lines: string[] = []
    if (review.gaps.areasWithoutOwner > 0) {
      lines.push(`  - ${review.gaps.areasWithoutOwner} area(s) still need an owner.`)
    }
    if (review.gaps.areasWithoutResponsibility > 0) {
      lines.push(
        `  - ${review.gaps.areasWithoutResponsibility} area(s) still need a stated responsibility.`,
      )
    }
    for (const dependency of review.gaps.externalDependencies) {
      lines.push(`  - External dependency without a local boundary: ${dependency}`)
    }
    if (review.gaps.unresolvedRequirementLinks > 0) {
      lines.push(
        `  - ${review.gaps.unresolvedRequirementLinks} requirement link(s) do not resolve.`,
      )
    }

    return lines
  }

  private static itemLine(item: MappingReviewItem): string {
    return [
      `mapping-review-area: ${item.technical.id}`,
      `kind=${item.technical.kind}`,
      `confidence=${item.confidence}`,
      `provenance=${item.technical.provenance}`,
    ].join(" ")
  }
}
