import type { Result } from "../core/result"
import {
  GRAPH_VERSION,
  type GraphContribution,
  type GraphElement,
  type GraphEvidence,
  type GraphFailure,
  type GraphFinding,
  type GraphLink,
  type GraphWorkspace,
  type SpecGraph,
} from "./types"

export class SpecGraphBuilder {
  private readonly contributions: GraphContribution[] = []

  add(contribution: GraphContribution): void {
    this.contributions.push(contribution)
  }

  build(
    workspace: GraphWorkspace,
    toolVersions: Record<string, string> = {},
  ): Result<SpecGraph, GraphFailure> {
    const [elements, elementFailure] = this.collectElements()
    if (elementFailure !== null) return [null, elementFailure]
    if (elements === null) return [null, this.failure("GRAPH-BUILD", "element collection failed")]

    const [evidence, evidenceFailure] = this.collectEvidence()
    if (evidenceFailure !== null) return [null, evidenceFailure]
    if (evidence === null) return [null, this.failure("GRAPH-BUILD", "evidence collection failed")]

    const findings = this.collectFindings(elements)

    return [
      {
        version: GRAPH_VERSION,
        workspace: workspace.workspace,
        commit: workspace.commit,
        dirty: workspace.dirty,
        elements,
        evidence,
        findings,
        tool_versions: this.sortedToolVersions(toolVersions),
      },
      null,
    ]
  }

  private collectElements(): Result<GraphElement[], GraphFailure> {
    const byId = new Map<string, GraphElement>()

    for (const contribution of this.contributions) {
      for (const element of contribution.elements) {
        if (byId.has(element.id)) {
          return [
            null,
            this.failure("GRAPH-DUPLICATE-ID", `duplicate graph element '${element.id}'`),
          ]
        }
        byId.set(element.id, this.normalizedElement(element))
      }
    }

    return [[...byId.values()].sort((left, right) => left.id.localeCompare(right.id)), null]
  }

  private collectEvidence(): Result<GraphEvidence[], GraphFailure> {
    const byId = new Map<string, GraphEvidence>()

    for (const contribution of this.contributions) {
      for (const evidence of contribution.evidence ?? []) {
        if (byId.has(evidence.id)) {
          return [
            null,
            this.failure("GRAPH-DUPLICATE-EVIDENCE", `duplicate graph evidence '${evidence.id}'`),
          ]
        }
        byId.set(evidence.id, { ...evidence })
      }
    }

    return [[...byId.values()].sort((left, right) => left.id.localeCompare(right.id)), null]
  }

  private collectFindings(elements: GraphElement[]): GraphFinding[] {
    const byKey = new Map<string, GraphFinding>()
    const elementIds = new Set(elements.map((element) => element.id))

    for (const contribution of this.contributions) {
      for (const finding of contribution.findings ?? []) {
        byKey.set(this.findingKey(finding), { ...finding })
      }
    }

    for (const element of elements) {
      for (const link of element.links) {
        if (elementIds.has(link.to)) continue
        const finding: GraphFinding = {
          level: "warning",
          code: "GRAPH-UNRESOLVED-LINK",
          message: `${element.id} ${link.type} link does not resolve: ${link.to}`,
          id: element.id,
        }
        byKey.set(this.findingKey(finding), finding)
      }
    }

    return [...byKey.values()].sort((left, right) =>
      this.findingKey(left).localeCompare(this.findingKey(right)),
    )
  }

  private normalizedElement(element: GraphElement): GraphElement {
    return {
      ...element,
      links: this.sortedLinks(element.links),
    }
  }

  private sortedLinks(links: GraphLink[]): GraphLink[] {
    const byKey = new Map<string, GraphLink>()

    for (const link of links) {
      byKey.set(`${link.type}\u0000${link.to}`, { type: link.type, to: link.to })
    }

    return [...byKey.values()].sort((left, right) => {
      const typeOrder = left.type.localeCompare(right.type)
      return typeOrder === 0 ? left.to.localeCompare(right.to) : typeOrder
    })
  }

  private sortedToolVersions(toolVersions: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(toolVersions).sort(([left], [right]) => left.localeCompare(right)),
    )
  }

  private findingKey(finding: GraphFinding): string {
    return `${finding.level}\u0000${finding.code}\u0000${finding.id ?? ""}\u0000${finding.message}`
  }

  private failure(code: string, message: string): GraphFailure {
    return { code, message }
  }
}
