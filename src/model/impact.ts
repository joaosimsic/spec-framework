import type {
  ImpactApproval,
  ImpactElement,
  ImpactLink,
  ImpactReport,
} from "./impact-types"
import type { GraphElement, SpecGraph } from "./types"

export class ImpactAnalyzer {
  analyze(
    graph: SpecGraph,
    changedIds: string[],
    approvals: ImpactApproval[] = [],
  ): ImpactReport {
    const byId = new Map(graph.elements.map((element) => [element.id, element] as const))
    const outgoing = this.outgoingLinks(graph.elements)
    const incoming = this.incomingLinks(graph.elements)
    const visited = this.traverse(byId, outgoing, incoming, changedIds)
    const changed = this.elementsFor(visited, "changed")
    const affected = this.elementsFor(visited, "affected")
    const impactedIds = new Set([...visited.keys(), ...changedIds])
    const invalidatedEvidence = this.invalidatedEvidence(
      graph.elements,
      impactedIds,
      approvals,
    )
    const approvalsToRenew = this.approvalsToRenew(
      impactedIds,
      invalidatedEvidence,
      approvals,
    )

    return {
      changed,
      affected,
      invalidated_evidence: [...invalidatedEvidence].sort(),
      approvals_to_renew: [...approvalsToRenew].sort(),
      open_questions: this.openQuestions(visited),
    }
  }

  private traverse(
    byId: Map<string, GraphElement>,
    outgoing: Map<string, ImpactLink[]>,
    incoming: Map<string, ImpactLink[]>,
    changedIds: string[],
  ): Map<string, ImpactElement> {
    const seeds = [...new Set(changedIds)].filter((id) => byId.has(id)).sort()
    const visited = new Map<string, ImpactElement>()

    for (const id of seeds) {
      const element = byId.get(id)
      if (element === undefined) continue
      visited.set(id, this.impactElement(element, "changed", 0, []))
    }

    const outgoingWalk = this.walk(byId, outgoing, seeds)
    const incomingWalk = this.walk(byId, incoming, seeds)

    for (const walk of [outgoingWalk, incomingWalk]) {
      for (const [id, step] of walk) {
        const existing = visited.get(id)
        if (existing !== undefined) {
          if (existing.state === "changed" || existing.distance <= step.distance) continue
        }

        const element = byId.get(id)
        if (element === undefined) continue
        visited.set(id, this.impactElement(element, "affected", step.distance, [step.link]))
      }
    }

    return visited
  }

  private walk(
    byId: Map<string, GraphElement>,
    linksByNode: Map<string, ImpactLink[]>,
    seeds: string[],
  ): Map<string, { distance: number; link: ImpactLink }> {
    const found = new Map<string, { distance: number; link: ImpactLink }>()
    const queue: Array<{ id: string; distance: number }> = seeds.map((id) => ({
      id,
      distance: 0,
    }))
    const visited = new Set(seeds)
    let queueIndex = 0

    while (queueIndex < queue.length) {
      const current = queue[queueIndex]
      queueIndex += 1
      const links = [...(linksByNode.get(current.id) ?? [])]
      links.sort((left, right) => this.compareLinks(left, right))

      for (const link of links) {
        const neighborId = link.direction === "incoming" ? link.from : link.to
        if (visited.has(neighborId)) continue
        if (!byId.has(neighborId)) continue

        visited.add(neighborId)
        found.set(neighborId, { distance: current.distance + 1, link })
        queue.push({ id: neighborId, distance: current.distance + 1 })
      }
    }

    return found
  }

  private impactElement(
    element: GraphElement,
    state: ImpactElement["state"],
    distance: number,
    via: ImpactLink[],
  ): ImpactElement {
    return {
      id: element.id,
      kind: element.kind,
      ...(element.title === undefined ? {} : { title: element.title }),
      state,
      distance,
      via,
    }
  }

  private outgoingLinks(elements: GraphElement[]): Map<string, ImpactLink[]> {
    const outgoing = new Map<string, ImpactLink[]>()

    for (const element of elements) {
      const links = element.links.map((link) => ({
        from: element.id,
        to: link.to,
        type: link.type,
        direction: "outgoing" as const,
      }))
      outgoing.set(element.id, links)
    }

    return outgoing
  }

  private incomingLinks(elements: GraphElement[]): Map<string, ImpactLink[]> {
    const incoming = new Map<string, ImpactLink[]>()

    for (const element of elements) {
      for (const link of element.links) {
        const links = incoming.get(link.to) ?? []
        links.push({
          from: element.id,
          to: link.to,
          type: link.type,
          direction: "incoming",
        })
        incoming.set(link.to, links)
      }
    }

    return incoming
  }

  private elementsFor(
    visited: Map<string, ImpactElement>,
    state: ImpactElement["state"],
  ): ImpactElement[] {
    return [...visited.values()]
      .filter((element) => element.state === state)
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  private invalidatedEvidence(
    elements: GraphElement[],
    impactedIds: Set<string>,
    approvals: ImpactApproval[],
  ): Set<string> {
    const evidence = new Set<string>()

    for (const element of elements) {
      if (!impactedIds.has(element.id)) continue
      for (const link of element.links) {
        if (link.type === "evidence") evidence.add(link.to)
      }
    }

    for (const approval of approvals) {
      if (!impactedIds.has(approval.id)) continue
      for (const evidenceId of approval.evidence) evidence.add(evidenceId)
    }

    return evidence
  }

  private approvalsToRenew(
    impactedIds: Set<string>,
    invalidatedEvidence: Set<string>,
    approvals: ImpactApproval[],
  ): Set<string> {
    const renewed = new Set<string>()
    let changed = true

    while (changed) {
      changed = false
      for (const approval of approvals) {
        if (renewed.has(approval.id)) continue
        if (!impactedIds.has(approval.id)) {
          const sharesEvidence = approval.evidence.some((id) => invalidatedEvidence.has(id))
          if (!sharesEvidence) continue
        }

        renewed.add(approval.id)
        changed = true
        for (const evidenceId of approval.evidence) invalidatedEvidence.add(evidenceId)
      }
    }

    return renewed
  }

  private openQuestions(visited: Map<string, ImpactElement>): string[] {
    return [...visited.values()]
      .filter((element) => element.kind === "unknown" || element.kind === "question")
      .map((element) => element.id)
      .sort()
  }

  private compareLinks(left: ImpactLink, right: ImpactLink): number {
    const fromOrder = left.from.localeCompare(right.from)
    if (fromOrder !== 0) return fromOrder

    const targetOrder = left.to.localeCompare(right.to)
    if (targetOrder !== 0) return targetOrder

    return left.type.localeCompare(right.type)
  }
}
