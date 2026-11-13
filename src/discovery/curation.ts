import { uniqueElementId } from "./ids"
import type {
  CurationAction,
  CurationDecision,
  MappingCurationQuestion,
  MappingCurationRelation,
  MappingCurationState,
  MappingCurationSummary,
} from "./curation-types"
import type { DraftElement, DraftLink, MapReport } from "./types"
import { fail, ok, type Result } from "../core/result"

interface MutableArea extends DraftElement {
  resolved: boolean
}

interface ResolvedRelation {
  source: MutableArea
  link: DraftLink
}

export class MappingCurationEngine {
  private readonly areas: Map<string, MutableArea>
  private readonly questions: MappingCurationQuestion[] = []
  private readonly decisions: CurationDecision[] = []
  private usedIds: Set<string>

  private constructor(report: MapReport) {
    this.areas = new Map(report.elements.map((element) => [element.id, this.area(element)]))
    this.usedIds = new Set(this.areas.keys())
  }

  static start(report: MapReport): MappingCurationEngine {
    return new MappingCurationEngine(report)
  }

  static replay(
    report: MapReport,
    decisions: CurationDecision[],
    author: string,
  ): Result<MappingCurationEngine, string> {
    const engine = new MappingCurationEngine(report)

    for (const decision of decisions) {
      const [applied, error] = engine.applyDecision(decision, author)
      if (error !== null) return fail(error)
      if (!applied) return fail("curation decision did not apply")
    }

    return ok(engine)
  }

  apply(action: CurationAction, at: string, author: string): Result<CurationAction, string> {
    const decision: CurationDecision = { action, at }
    const [applied, error] = this.applyDecision(decision, author)
    if (error !== null) return fail(error)
    if (!applied) return fail("curation action did not apply")

    return ok(action)
  }

  state(): MappingCurationState {
    const areas = [...this.areas.values()].map(({ resolved, ...element }) => {
      void resolved
      return this.sortElement(element)
    })

    return {
      areas: areas.sort((left, right) => left.id.localeCompare(right.id)),
      relations: this.relations(),
      resolvedIds: [...this.areas.values()]
        .filter((area) => area.resolved)
        .map((area) => area.id)
        .sort(),
      decisions: [...this.decisions],
      questions: [...this.questions],
      summary: this.summarize(),
    }
  }

  decisionsForStorage(): CurationDecision[] {
    return [...this.decisions]
  }

  private applyDecision(decision: CurationDecision, author: string): Result<boolean, string> {
    const [applied, error] = this.applyAction(decision.action, decision.at, author)
    if (error !== null) return fail(error)
    if (!applied) return fail("curation action did not apply")

    this.decisions.push(decision)

    return ok(true)
  }

  private applyAction(action: CurationAction, at: string, author: string): Result<boolean, string> {
    switch (action.kind) {
      case "accept":
        return this.accept(action.target, at, author)
      case "reject":
        return this.reject(action.target)
      case "accept-relation":
        return this.acceptRelation(action, at, author)
      case "reject-relation":
        return this.rejectRelation(action)
      case "rename":
        return this.rename(action.target, action.title)
      case "merge":
        return this.merge(action.targets, action.title, at, author)
      case "split":
        return this.split(action.target, action.parts, at, author)
      case "set-owner":
        return this.setMetadata(action.target, "owner", action.owner)
      case "set-responsibility":
        return this.setMetadata(action.target, "responsibility", action.responsibility)
      case "set-boundary":
        return this.setMetadata(action.target, "boundary", action.boundary)
      case "open-question":
        return this.openQuestion(action, at)
    }
  }

  private accept(target: string, at: string, author: string): Result<boolean, string> {
    const [area, error] = this.resolve(target)
    if (error !== null) return fail(error)
    if (area === null) return fail(`unknown area '${target}'`)

    area.confidence = "observed"
    area.provenance = this.humanProvenance(author, at)
    area.resolved = true

    return ok(true)
  }

  private reject(target: string): Result<boolean, string> {
    const [area, error] = this.resolve(target)
    if (error !== null) return fail(error)
    if (area === null) return fail(`unknown area '${target}'`)

    this.areas.delete(area.id)
    this.removeLinksTo(area.id)

    return ok(true)
  }

  private acceptRelation(
    action: Extract<CurationAction, { kind: "accept-relation" }>,
    at: string,
    author: string,
  ): Result<boolean, string> {
    const [relation, relationError] = this.resolveRelation(
      action.source,
      action.target,
      action.type,
    )
    if (relationError !== null) return fail(relationError)
    if (relation === null) return fail("relation failed to resolve")

    relation.link.confidence = "observed"
    relation.link.provenance = this.humanProvenance(author, at)

    return ok(true)
  }

  private rejectRelation(
    action: Extract<CurationAction, { kind: "reject-relation" }>,
  ): Result<boolean, string> {
    const [relation, relationError] = this.resolveRelation(
      action.source,
      action.target,
      action.type,
    )
    if (relationError !== null) return fail(relationError)
    if (relation === null) return fail("relation failed to resolve")

    relation.source.links = relation.source.links.filter((link) => link !== relation.link)

    return ok(true)
  }

  private rename(target: string, title: string): Result<boolean, string> {
    const [area, error] = this.resolve(target)
    if (error !== null) return fail(error)
    if (area === null) return fail(`unknown area '${target}'`)

    const [available, availableError] = this.titleAvailable(title, area.id)
    if (availableError !== null) return fail(availableError)
    if (!available) return fail(`another area is already named '${title}'`)
    area.title = title

    return ok(true)
  }

  private merge(
    targets: string[],
    title: string,
    at: string,
    author: string,
  ): Result<boolean, string> {
    const [sources, sourceError] = this.resolveMany(targets)
    if (sourceError !== null) return fail(sourceError)
    if (sources === null) return fail("areas failed to resolve")
    if (sources.length < 2) return fail("merge requires at least two areas")

    const [available, availableError] = this.titleAvailable(
      title,
      ...sources.map((area) => area.id),
    )
    if (availableError !== null) return fail(availableError)
    if (!available) return fail(`another area is already named '${title}'`)

    const sourceIds = new Set(sources.map((area) => area.id))
    const id = uniqueElementId(this.prefixFor(sources[0]?.kind ?? "component"), title, this.usedIds)
    const links = this.mergedLinks(sources, id, sourceIds)
    const first = sources[0]

    for (const source of sources) this.areas.delete(source.id)
    this.rewriteLinks(sourceIds, id)
    this.areas.set(
      id,
      this.area(
        {
          ...(first as DraftElement),
          id,
          title,
          provenance: this.humanProvenance(author, at),
          confidence: "observed",
          links,
        },
        true,
      ),
    )
    this.usedIds.add(id)

    return ok(true)
  }

  private split(
    target: string,
    parts: string[],
    at: string,
    author: string,
  ): Result<boolean, string> {
    const [source, sourceError] = this.resolve(target)
    if (sourceError !== null) return fail(sourceError)
    if (source === null) return fail(`unknown area '${target}'`)
    if (parts.length < 2) return fail("split requires at least two parts")

    for (const part of parts) {
      const [available, availableError] = this.titleAvailable(part, source.id)
      if (availableError !== null) return fail(availableError)
      if (!available) return fail(`another area is already named '${part}'`)
    }

    const links = source.links.filter((link) => link.to !== source.id)
    this.areas.delete(source.id)
    this.removeLinksTo(source.id)

    for (const part of parts) {
      const id = uniqueElementId(this.prefixFor(source.kind), part, this.usedIds)
      this.usedIds.add(id)
      this.areas.set(
        id,
        this.area(
          {
            ...source,
            id,
            title: part,
            provenance: this.humanProvenance(author, at),
            confidence: "observed",
            links: links.map((link) => ({ ...link })),
          },
          true,
        ),
      )
    }

    return ok(true)
  }

  private setMetadata(
    target: string,
    field: "owner" | "responsibility" | "boundary",
    value: string,
  ): Result<boolean, string> {
    const [area, error] = this.resolve(target)
    if (error !== null) return fail(error)
    if (area === null) return fail(`unknown area '${target}'`)

    area[field] = value

    return ok(true)
  }

  private openQuestion(
    action: Extract<CurationAction, { kind: "open-question" }>,
    at: string,
  ): Result<boolean, string> {
    let target: DraftElement | null = null
    if (action.target !== undefined) {
      const [resolved, error] = this.resolve(action.target)
      if (error !== null) return fail(error)
      if (resolved === null) return fail(`unknown area '${action.target}'`)
      target = resolved
    }

    this.questions.push({
      question: action.question,
      targetId: target?.id ?? null,
      targetLabel: target?.title ?? null,
      blocking: action.blocking ?? false,
      at,
    })

    return ok(true)
  }

  private resolve(target: string): Result<MutableArea | null, string> {
    const exact = this.areas.get(target)
    if (exact !== undefined) return ok(exact)

    const normalized = target.trim().toLowerCase()
    const matches = [...this.areas.values()].filter(
      (area) => area.title.trim().toLowerCase() === normalized,
    )
    if (matches.length > 1) {
      return fail(
        `area name '${target}' is ambiguous; use the technical identity in --technical output`,
      )
    }

    return ok(matches[0] ?? null)
  }

  private resolveMany(targets: string[]): Result<MutableArea[], string> {
    const areas: MutableArea[] = []
    for (const target of targets) {
      const [area, error] = this.resolve(target)
      if (error !== null) return fail(error)
      if (area === null) return fail(`unknown area '${target}'`)
      areas.push(area)
    }

    return ok(areas)
  }

  private resolveRelation(
    sourceTarget: string,
    targetTarget: string,
    type: string | undefined,
  ): Result<ResolvedRelation, string> {
    const [source, sourceError] = this.resolve(sourceTarget)
    if (sourceError !== null) return fail(sourceError)
    if (source === null) return fail(`unknown area '${sourceTarget}'`)

    const [target, targetError] = this.resolve(targetTarget)
    if (targetError !== null) return fail(targetError)
    if (target === null) return fail(`unknown area '${targetTarget}'`)

    const expectedType = type === undefined ? null : normalizeRelationType(type)
    const matches = source.links.filter(
      (link) =>
        link.to === target.id &&
        (expectedType === null || normalizeRelationType(link.type) === expectedType),
    )
    const label = `${source.title} -> ${target.title}`

    if (matches.length === 0) {
      const qualifier = type === undefined ? "" : ` of type '${type}'`
      return fail(`unknown relation '${label}'${qualifier}`)
    }
    if (matches.length > 1) {
      return fail(`relation '${label}' is ambiguous; supply a type`)
    }

    const link = matches[0]
    if (link === undefined) return fail(`unknown relation '${label}'`)

    return ok({ source, link })
  }

  private titleAvailable(title: string, ...excludedIds: string[]): Result<boolean, string> {
    const normalized = title.trim().toLowerCase()
    if (normalized === "") return fail("title is required")
    const excluded = new Set(excludedIds)
    const exists = [...this.areas.values()].some(
      (area) => !excluded.has(area.id) && area.title.trim().toLowerCase() === normalized,
    )

    return ok(!exists)
  }

  private mergedLinks(sources: MutableArea[], id: string, sourceIds: Set<string>): DraftLink[] {
    const links = new Map<string, DraftLink>()
    for (const source of sources) {
      for (const link of source.links) {
        const to = sourceIds.has(link.to) ? id : link.to
        if (to === id) continue
        links.set(`${link.type}\u0000${to}`, { ...link, to })
      }
    }

    return [...links.values()].sort((left, right) => {
      const typeOrder = left.type.localeCompare(right.type)
      return typeOrder === 0 ? left.to.localeCompare(right.to) : typeOrder
    })
  }

  private rewriteLinks(sourceIds: Set<string>, id: string): void {
    for (const area of this.areas.values()) {
      area.links = this.uniqueLinks(
        area.links.map((link) => (sourceIds.has(link.to) ? { ...link, to: id } : link)),
      )
    }
  }

  private removeLinksTo(id: string): void {
    for (const area of this.areas.values()) {
      area.links = area.links.filter((link) => link.to !== id)
    }
  }

  private uniqueLinks(links: DraftLink[]): DraftLink[] {
    const unique = new Map<string, DraftLink>()
    for (const link of links) unique.set(`${link.type}\u0000${link.to}`, link)

    return [...unique.values()].sort((left, right) => {
      const typeOrder = left.type.localeCompare(right.type)
      return typeOrder === 0 ? left.to.localeCompare(right.to) : typeOrder
    })
  }

  private area(element: DraftElement, resolved = false): MutableArea {
    return {
      ...element,
      links: element.links.map((link) => ({ ...link })),
      resolved,
    }
  }

  private sortElement(element: DraftElement): DraftElement {
    return {
      ...element,
      links: this.uniqueLinks(element.links),
    }
  }

  private humanProvenance(author: string, at: string): string {
    const name = author.trim() === "" ? "human" : author.trim()
    return `human:${name}@${at.slice(0, 10)}`
  }

  private prefixFor(kind: string): string {
    switch (kind) {
      case "system":
        return "SYS"
      case "data_store":
        return "DAT"
      case "external_system":
        return "EXT"
      default:
        return "CMP"
    }
  }

  private relations(): MappingCurationRelation[] {
    const ids = new Set(this.areas.keys())
    const relations: MappingCurationRelation[] = []

    for (const area of this.areas.values()) {
      for (const link of area.links) {
        if (!ids.has(link.to)) continue
        relations.push({
          sourceId: area.id,
          targetId: link.to,
          type: link.type,
          confidence: link.confidence ?? "unknown",
          provenance: link.provenance ?? area.provenance,
        })
      }
    }

    return relations.sort((left, right) => {
      const sourceOrder = left.sourceId.localeCompare(right.sourceId)
      if (sourceOrder !== 0) return sourceOrder
      const typeOrder = left.type.localeCompare(right.type)
      return typeOrder === 0 ? left.targetId.localeCompare(right.targetId) : typeOrder
    })
  }

  private summarize(): MappingCurationSummary {
    const summary: MappingCurationSummary = {
      accepted: 0,
      rejected: 0,
      acceptedRelations: 0,
      rejectedRelations: 0,
      renamed: 0,
      merged: 0,
      split: 0,
      questions: 0,
    }

    for (const decision of this.decisions) {
      switch (decision.action.kind) {
        case "accept":
          summary.accepted += 1
          break
        case "reject":
          summary.rejected += 1
          break
        case "accept-relation":
          summary.acceptedRelations += 1
          break
        case "reject-relation":
          summary.rejectedRelations += 1
          break
        case "rename":
          summary.renamed += 1
          break
        case "merge":
          summary.merged += 1
          break
        case "split":
          summary.split += 1
          break
        case "open-question":
          summary.questions += 1
          break
        case "set-owner":
        case "set-responsibility":
        case "set-boundary":
          break
      }
    }

    return summary
  }
}

export function curatedMapReport(
  original: MapReport,
  state: MappingCurationState,
  draftPath: string | null,
): MapReport {
  const areas = state.areas
  const areaIds = new Set(areas.map((area) => area.id))
  const summary = areas.reduce(
    (current, area) => {
      current.elements += 1
      current.relations += area.links.length
      current[area.confidence] += 1
      return current
    },
    { elements: 0, relations: 0, observed: 0, inferred: 0, ambiguous: 0, unknown: 0 },
  )

  return {
    ...original,
    draftPath,
    elements: areas,
    summary,
    gaps: {
      missingOwners: areas.filter((area) => area.owner === undefined).map((area) => area.id),
      missingResponsibilities: areas
        .filter((area) => area.responsibility === undefined)
        .map((area) => area.id),
      externalDependencies: original.gaps.externalDependencies.filter((dependency) =>
        areaIds.has(dependency.split(" -> ")[0] ?? ""),
      ),
      unresolvedRequirementLinks: original.gaps.unresolvedRequirementLinks.filter((link) =>
        areaIds.has(link.split(" -> ").at(-1) ?? ""),
      ),
    },
  }
}

function normalizeRelationType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}
