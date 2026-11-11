import { createHash } from "node:crypto"
import type { Result } from "../core/result"
import type { CurationAction, MappingCurationRelation } from "../discovery/curation-types"
import { MappingReviewFactory } from "../discovery/review"
import type { DraftElement } from "../discovery/types"
import type { WorkbenchMappingState } from "./state"
import type {
  WorkbenchCurationRequest,
  WorkbenchMappingArea,
  WorkbenchMappingRelation,
  WorkbenchMappingView,
} from "./types"

const CONFIDENCE_LABELS: Record<string, string> = {
  observed: "Clear from code",
  inferred: "Inferred - confirm or correct",
  ambiguous: "Uncertain boundary - choose",
  unknown: "Needs human input",
}

const CONFIDENCE_PROMPTS: Record<string, string> = {
  observed: "Keep, rename, or merge this area.",
  inferred: "Confirm or correct this inferred area.",
  ambiguous: "Choose the real boundary for this area.",
  unknown: "Decide what this area is or record an open question.",
}

const KIND_LABELS: Record<string, string> = {
  system: "System",
  component: "Component",
  data_store: "Data store",
  external_system: "External system",
}

export interface MappingResolutionFailure {
  code: "WORKBENCH-NOT-FOUND" | "WORKBENCH-AMBIGUOUS"
  message: string
  choices?: Array<{ label: string; context: string }>
}

export class WorkbenchMappingDisplay {
  private readonly areasById = new Map<string, DraftElement>()
  private readonly areasByLabel = new Map<string, DraftElement[]>()
  private readonly areaRefs = new Map<string, string>()
  private readonly relationRefs = new Map<string, string>()

  constructor(private readonly mapping: WorkbenchMappingState) {
    for (const area of mapping.curation.areas) {
      this.areasById.set(area.id, area)
      this.areaRefs.set(this.areaRef(area.id), area.id)
      const key = this.normalize(area.title)
      const matches = this.areasByLabel.get(key) ?? []
      matches.push(area)
      this.areasByLabel.set(key, matches)
    }

    for (const relation of mapping.curation.relations) {
      this.relationRefs.set(this.relationRef(relation), this.relationKey(relation))
    }
  }

  view(): WorkbenchMappingView {
    const review = MappingReviewFactory.build(this.mapping.snapshot.map, this.mapping.proposal.direction)
    const resolved = new Set(this.mapping.curation.resolvedIds)
    const relations = this.mapping.curation.relations.map((relation) => this.relation(relation))
    const pendingRelations = relations.filter(
      (relation) => relation.confidenceLabel !== CONFIDENCE_LABELS.observed,
    ).length
    const unresolved = this.mapping.curation.areas.filter((area) => !resolved.has(area.id)).length

    return {
      direction: review.direction,
      state: this.state(unresolved, pendingRelations),
      areas: this.mapping.curation.areas.map((area) => this.area(area, resolved)),
      relations,
      questions: this.mapping.curation.questions.map((question) => ({
        label: this.questionLabel(question.question, question.targetLabel, question.blocking),
        blocking: question.blocking,
      })),
      gaps: review.gaps,
      next: review.next,
    }
  }

  resolve(actions: WorkbenchCurationRequest[]): Result<CurationAction[], MappingResolutionFailure> {
    const resolved: CurationAction[] = []

    for (const action of actions) {
      const [curationAction, error] = this.resolveAction(action)
      if (error !== null) return [null, error]
      if (curationAction === null) continue
      resolved.push(curationAction)
    }

    return [resolved, null]
  }

  private resolveAction(
    action: WorkbenchCurationRequest,
  ): Result<CurationAction, MappingResolutionFailure> {
    switch (action.kind) {
      case "accept":
      case "reject":
        return this.areaAction(action.kind, action.target)
      case "rename":
        return this.rename(action)
      case "merge":
        return this.merge(action)
      case "split":
        return this.split(action)
      case "set-owner":
        return this.metadataAction(action.kind, action.target, action.owner)
      case "set-responsibility":
        return this.metadataAction(action.kind, action.target, action.responsibility)
      case "set-boundary":
        return this.metadataAction(action.kind, action.target, action.boundary)
      case "open-question":
        return this.openQuestion(action)
      case "accept-relation":
      case "reject-relation":
        return this.relationAction(action)
    }
  }

  private areaAction(
    kind: "accept" | "reject",
    target: string,
  ): Result<CurationAction, MappingResolutionFailure> {
    const [area, error] = this.resolveArea(target)
    if (error !== null) return [null, error]
    if (area === null) return [null, this.notFound(target)]

    return [{ kind, target: area.id }, null]
  }

  private rename(
    action: Extract<WorkbenchCurationRequest, { kind: "rename" }>,
  ): Result<CurationAction, MappingResolutionFailure> {
    const [area, error] = this.resolveArea(action.target)
    if (error !== null) return [null, error]
    if (area === null) return [null, this.notFound(action.target)]

    return [{ kind: "rename", target: area.id, title: action.title }, null]
  }

  private merge(
    action: Extract<WorkbenchCurationRequest, { kind: "merge" }>,
  ): Result<CurationAction, MappingResolutionFailure> {
    const [targets, targetsError] = this.resolveAreas(action.targets)
    if (targetsError !== null) return [null, targetsError]
    if (targets === null) return [null, this.notFound("")]

    return [{ kind: "merge", targets: targets.map((area) => area.id), title: action.title }, null]
  }

  private split(
    action: Extract<WorkbenchCurationRequest, { kind: "split" }>,
  ): Result<CurationAction, MappingResolutionFailure> {
    const [area, error] = this.resolveArea(action.target)
    if (error !== null) return [null, error]
    if (area === null) return [null, this.notFound(action.target)]

    return [{ kind: "split", target: area.id, parts: [...action.parts] }, null]
  }

  private metadataAction(
    kind: "set-owner" | "set-responsibility" | "set-boundary",
    target: string,
    value: string,
  ): Result<CurationAction, MappingResolutionFailure> {
    const [area, error] = this.resolveArea(target)
    if (error !== null) return [null, error]
    if (area === null) return [null, this.notFound(target)]

    if (kind === "set-owner") return [{ kind, target: area.id, owner: value }, null]
    if (kind === "set-responsibility") {
      return [{ kind, target: area.id, responsibility: value }, null]
    }

    return [{ kind, target: area.id, boundary: value }, null]
  }

  private openQuestion(
    action: Extract<WorkbenchCurationRequest, { kind: "open-question" }>,
  ): Result<CurationAction, MappingResolutionFailure> {
    if (action.target === undefined) {
      return [{ kind: "open-question", question: action.question, blocking: action.blocking }, null]
    }

    const [area, error] = this.resolveArea(action.target)
    if (error !== null) return [null, error]
    if (area === null) return [null, this.notFound(action.target)]

    return [
      {
        kind: "open-question",
        question: action.question,
        target: area.id,
        blocking: action.blocking,
      },
      null,
    ]
  }

  private relationAction(
    action: Extract<WorkbenchCurationRequest, { kind: "accept-relation" | "reject-relation" }>,
  ): Result<CurationAction, MappingResolutionFailure> {
    const [source, sourceError] = this.resolveArea(action.source)
    if (sourceError !== null) return [null, sourceError]
    if (source === null) return [null, this.notFound(action.source)]

    const [target, targetError] = this.resolveArea(action.target)
    if (targetError !== null) return [null, targetError]
    if (target === null) return [null, this.notFound(action.target)]

    const relation = this.findRelation(source.id, target.id, action.type)
    if (relation === null) {
      return [
        null,
        {
          code: "WORKBENCH-NOT-FOUND",
          message: `unknown relation: ${source.title} to ${target.title}`,
        },
      ]
    }

    return [
      {
        kind: action.kind,
        source: source.id,
        target: target.id,
        type: relation.type,
      },
      null,
    ]
  }

  private resolveArea(target: string): Result<DraftElement | null, MappingResolutionFailure> {
    const refId = this.areaRefs.get(target)
    if (refId !== undefined) return [this.areasById.get(refId) ?? null, null]

    const byId = this.areasById.get(target)
    if (byId !== undefined) return [byId, null]

    const matches = this.areasByLabel.get(this.normalize(target)) ?? []
    if (matches.length > 1) {
      return [
        null,
        {
          code: "WORKBENCH-AMBIGUOUS",
          message: `more than one area is named '${target}'`,
          choices: matches.map((area) => this.choice(area)),
        },
      ]
    }

    return [matches[0] ?? null, null]
  }

  private resolveAreas(targets: string[]): Result<DraftElement[], MappingResolutionFailure> {
    const areas: DraftElement[] = []

    for (const target of targets) {
      const [area, error] = this.resolveArea(target)
      if (error !== null) return [null, error]
      if (area === null) return [null, this.notFound(target)]
      areas.push(area)
    }

    return [areas, null]
  }

  private findRelation(sourceId: string, targetId: string, type: string | undefined): MappingCurationRelation | null {
    const normalizedType = type?.trim().toLowerCase()

    return (
      this.mapping.curation.relations.find(
        (relation) =>
          relation.sourceId === sourceId &&
          relation.targetId === targetId &&
          (normalizedType === undefined || relation.type.toLowerCase() === normalizedType),
      ) ?? null
    )
  }

  private area(area: DraftElement, resolved: Set<string>): WorkbenchMappingArea {
    return {
      ref: this.areaRef(area.id),
      label: area.title.trim() || "Untitled area",
      kindLabel: KIND_LABELS[area.kind] ?? this.humanize(area.kind),
      confidenceLabel: CONFIDENCE_LABELS[area.confidence] ?? "Needs review",
      prompt: CONFIDENCE_PROMPTS[area.confidence] ?? "Review this area.",
      state: resolved.has(area.id) ? "Confirmed" : "Needs review",
      ...(area.owner === undefined ? {} : { owner: area.owner }),
      ...(area.responsibility === undefined ? {} : { responsibility: area.responsibility }),
      ...(area.boundary === undefined ? {} : { boundary: area.boundary }),
    }
  }

  private relation(relation: MappingCurationRelation): WorkbenchMappingRelation {
    const source = this.areasById.get(relation.sourceId)
    const target = this.areasById.get(relation.targetId)
    const label = `${source?.title ?? "Linked area"} to ${target?.title ?? "linked area"}`
    const type = this.humanize(relation.type).toLowerCase()

    return {
      ref: this.relationRef(relation),
      label: `${label} (${type})`,
      confidenceLabel: CONFIDENCE_LABELS[relation.confidence] ?? "Needs review",
      prompt:
        relation.confidence === "observed"
          ? "Kept relation."
          : `Confirm this ${type} relation or reject it.`,
      type: relation.type,
    }
  }

  private state(unresolved: number, pendingRelations: number): string {
    const decisions = this.mapping.curation.decisions.length
    if (unresolved === 0 && pendingRelations === 0 && (decisions > 0 || this.areasById.size === 0)) {
      return "Curation complete"
    }
    if (decisions > 0) return "Curation in progress"

    return "Waiting for curation"
  }

  private choice(area: DraftElement): { label: string; context: string } {
    const owner = area.owner === undefined ? "" : ` - owned by ${area.owner}`

    return {
      label: area.title.trim() || "Untitled area",
      context: `${KIND_LABELS[area.kind] ?? this.humanize(area.kind)} - ${CONFIDENCE_LABELS[area.confidence] ?? "Needs review"}${owner}`,
    }
  }

  private areaRef(id: string): string {
    return `area_${this.digest(id)}`
  }

  private relationRef(relation: MappingCurationRelation): string {
    return `relation_${this.digest(this.relationKey(relation))}`
  }

  private relationKey(relation: MappingCurationRelation): string {
    return `${relation.sourceId}\u0000${relation.targetId}\u0000${relation.type}`
  }

  private digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12)
  }

  private questionLabel(question: string, target: string | null, blocking: boolean): string {
    const targetLabel = target === null ? "" : ` (${target})`
    const blockingLabel = blocking ? " [blocking]" : ""

    return `${question}${targetLabel}${blockingLabel}`
  }

  private notFound(target: string): MappingResolutionFailure {
    return {
      code: "WORKBENCH-NOT-FOUND",
      message: target === "" ? "area not found" : `unknown area: ${target}`,
    }
  }

  private normalize(value: string): string {
    return value.replace(/\s+/g, " ").trim().toLowerCase()
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Item"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
