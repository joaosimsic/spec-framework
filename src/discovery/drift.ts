import {
  ArchitectureCatalogLoader,
  isArchitectureId,
  type ArchitectureCatalog,
} from "../approval/architecture"
import { architectureContentHash } from "../approval/hash"
import { SpecLockLoader } from "../approval/lock"
import type { SpecLock } from "../approval/types"
import { runMap } from "../core/map"
import { fail, ok, type Result } from "../core/result"
import { ArchitectureGraphSource, loadArchitectureSources } from "../model/architecture"
import type { GraphElement } from "../model/types"

export type DriftKind =
  "missing-in-spec" | "missing-in-code" | "changed-relation" | "changed-approval"

export interface DriftFinding {
  kind: DriftKind
  label: string
  id?: string
  detail?: string
  kindLabel?: string
}

export interface DriftSummary {
  "missing-in-spec": number
  "missing-in-code": number
  "changed-relation": number
  "changed-approval": number
}

export interface DriftReport {
  approved: number
  findings: DriftFinding[]
  summary: DriftSummary
}

export class MapDriftAnalyzer {
  constructor(private readonly target: string) {}

  async analyze(): Promise<Result<DriftReport, string>> {
    const [locked, lockError] = await new SpecLockLoader(this.target).load()
    if (lockError !== null && lockError.code !== "SPEC-LOCK-NOT-FOUND")
      return fail(lockError.message)
    const lock = lockError === null ? locked : null
    const approvedIds = Object.keys(lock?.elements ?? {}).filter(isArchitectureId)
    if (approvedIds.length === 0) return ok(this.emptyReport())

    const [architecture, architectureError] = await new ArchitectureCatalogLoader(
      this.target,
    ).load()
    if (
      architectureError !== null &&
      architectureError !== "no LikeC4 architecture sources found"
    ) {
      return fail(architectureError)
    }
    const catalog = architecture ?? { elements: [], relationships: [] }

    const [model, modelError] = await this.modelGraph()
    if (modelError !== null) return fail(modelError)
    if (model === null) return fail("architecture graph returned no result")

    const [discovered, discoverError] = await this.discoveredGraph()
    if (discoverError !== null) return fail(discoverError)
    if (discovered === null) return fail("discovery returned no result")

    const approvedSet = new Set(approvedIds)
    const findings = [
      ...this.missingInCode(approvedIds, discovered, model, catalog),
      ...this.missingInSpec(approvedSet, discovered),
      ...this.changedApprovals(approvedIds, catalog, lock),
      ...this.changedRelations(approvedSet, model, discovered),
    ].sort(compareFindings)

    return ok({ approved: approvedIds.length, findings, summary: summarize(findings) })
  }

  private async modelGraph(): Promise<Result<GraphElement[] | null, string>> {
    const sources = await loadArchitectureSources(this.target)
    const contribution = new ArchitectureGraphSource().collect(sources)

    return ok(contribution.elements)
  }

  private async discoveredGraph(): Promise<Result<GraphElement[] | null, string>> {
    const run = await runMap(this.target, { json: true })
    if (run.code !== 0 || run.report === null) return fail(run.output)

    return ok(
      run.report.elements.map((element) => ({
        id: element.id,
        kind: element.kind,
        title: element.title,
        links: element.links.map((link) => ({ type: link.type, to: link.to })),
      })),
    )
  }

  private missingInCode(
    approvedIds: string[],
    discovered: GraphElement[],
    model: GraphElement[],
    catalog: ArchitectureCatalog,
  ): DriftFinding[] {
    const discoveryIds = new Set(discovered.map((element) => element.id))
    const modelIds = new Set(model.map((element) => element.id))

    return approvedIds
      .filter((id) => !discoveryIds.has(id) || !modelIds.has(id))
      .map((id) => {
        const element = catalog.elements.find((candidate) => candidate.id === id)

        return {
          kind: "missing-in-code",
          id,
          label: element?.title ?? "Approved element",
        }
      })
  }

  private missingInSpec(approved: Set<string>, discovered: GraphElement[]): DriftFinding[] {
    const candidates = this.scopeCandidates(approved, discovered)

    return discovered
      .filter((element) => candidates.has(element.id) && !approved.has(element.id))
      .map((element) => ({
        kind: "missing-in-spec",
        id: element.id,
        label: element.title ?? "Discovered element",
        kindLabel: element.kind,
      }))
  }

  private changedApprovals(
    approvedIds: string[],
    catalog: ArchitectureCatalog,
    lock: SpecLock | null,
  ): DriftFinding[] {
    const findings: DriftFinding[] = []
    for (const id of approvedIds) {
      const element = catalog.elements.find((candidate) => candidate.id === id)
      const locked = lock?.elements[id]
      if (element === undefined || locked === undefined) continue
      if (locked.content_hash === architectureContentHash(element, catalog.relationships)) continue
      findings.push({ kind: "changed-approval", id, label: element.title })
    }

    return findings
  }

  private changedRelations(
    approved: Set<string>,
    model: GraphElement[],
    discovered: GraphElement[],
  ): DriftFinding[] {
    const modelEdges = this.edges(model, approved)
    const discoveredEdges = this.edges(discovered, approved)
    const findings: DriftFinding[] = []

    for (const [key, label] of modelEdges) {
      if (discoveredEdges.has(key)) continue
      findings.push({ kind: "changed-relation", label, detail: "relation no longer observed" })
    }
    for (const [key, label] of discoveredEdges) {
      if (modelEdges.has(key)) continue
      findings.push({ kind: "changed-relation", label, detail: "relation not declared" })
    }

    return findings
  }

  private edges(elements: GraphElement[], approved: Set<string>): Map<string, string> {
    const titles = new Map(elements.map((element) => [element.id, element.title ?? element.id]))
    const edges = new Map<string, string>()

    for (const element of elements) {
      if (!approved.has(element.id)) continue
      for (const link of element.links) {
        if (!approved.has(link.to)) continue
        const key = `${element.id}\u0000${link.type}\u0000${link.to}`
        edges.set(key, `${titles.get(element.id)} -> ${titles.get(link.to)}`)
      }
    }

    return edges
  }

  private scopeCandidates(approved: Set<string>, discovered: GraphElement[]): Set<string> {
    const parents = new Map<string, string[]>()
    for (const element of discovered) {
      const links = element.links.filter((link) => link.type === "part_of").map((link) => link.to)
      parents.set(element.id, links)
    }

    const candidates = new Set<string>()
    for (const element of discovered) {
      if (this.reachesApproved(element.id, approved, parents)) candidates.add(element.id)
    }

    return candidates
  }

  private reachesApproved(
    id: string,
    approved: Set<string>,
    parents: Map<string, string[]>,
  ): boolean {
    const pending = [...(parents.get(id) ?? [])]
    const visited = new Set<string>()

    while (pending.length > 0) {
      const current = pending.pop()
      if (current === undefined || visited.has(current)) continue
      if (approved.has(current)) return true
      visited.add(current)
      pending.push(...(parents.get(current) ?? []))
    }

    return false
  }

  private emptyReport(): DriftReport {
    return {
      approved: 0,
      findings: [],
      summary: {
        "missing-in-spec": 0,
        "missing-in-code": 0,
        "changed-relation": 0,
        "changed-approval": 0,
      },
    }
  }
}

function summarize(findings: DriftFinding[]): DriftSummary {
  return findings.reduce(
    (summary, finding) => {
      summary[finding.kind] += 1
      return summary
    },
    {
      "missing-in-spec": 0,
      "missing-in-code": 0,
      "changed-relation": 0,
      "changed-approval": 0,
    } satisfies DriftSummary,
  )
}

function compareFindings(left: DriftFinding, right: DriftFinding): number {
  const kindOrder = left.kind.localeCompare(right.kind)
  if (kindOrder !== 0) return kindOrder

  return left.label.localeCompare(right.label)
}
