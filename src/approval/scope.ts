import { loadRequirementSources } from "../core/requirements"
import { fail, ok, type Result } from "../core/result"
import type { C4Element } from "../core/c4"
import type { SdocBlock } from "../core/types"
import {
  ArchitectureCatalogLoader,
  architectureElementHash,
  isArchitectureId,
  type ArchitectureCatalog,
} from "./architecture"
import { elementContentHash } from "./hash"
import { SpecLockLoader } from "./lock"
import type { SpecLock } from "./types"

export interface ApprovalScopeChoice {
  id: string
  label: string
  context: string
}

export interface ApprovalScopeSelection {
  id: string
  label: string
  kind: string
  reason: "requested" | "acceptance"
}

export type ApprovalScopeFailure =
  | { code: "SCOPE-NOT-FOUND"; message: string }
  | { code: "SCOPE-AMBIGUOUS"; message: string; choices: ApprovalScopeChoice[] }
  | { code: "SCOPE-NOT-APPROVABLE"; message: string }

export interface ApprovalScopeResolution {
  ids: string[]
  selections: ApprovalScopeSelection[]
  labels: Record<string, string>
}

type ApprovalTarget =
  { source: "sdoc"; block: SdocBlock } | { source: "architecture"; element: C4Element }

const APPROVABLE_PREFIXES = ["REQ-", "AC-"] as const

export class ApprovalScopeResolver {
  private readonly byId = new Map<string, ApprovalTarget>()
  private readonly byTitle = new Map<string, ApprovalTarget[]>()

  constructor(
    blocks: SdocBlock[],
    private readonly lock: SpecLock | null,
    private readonly architecture: ArchitectureCatalog = { elements: [], relationships: [] },
  ) {
    for (const block of blocks) {
      const id = block.fields.UID
      if (id === undefined || id === "") continue
      this.addTarget({ source: "sdoc", block })
    }

    for (const element of architecture.elements) {
      const id = element.id
      if (id === null || id === "") continue
      this.addTarget({ source: "architecture", element })
    }
  }

  resolve(scopes: string[]): Result<ApprovalScopeResolution, ApprovalScopeFailure> {
    const selections: ApprovalScopeSelection[] = []
    const seen = new Set<string>()

    for (const scope of scopes) {
      const term = scope.trim()
      if (term === "") return fail(this.notFound(scope))

      const [matched, matchFailure] = this.match(term)
      if (matchFailure !== null) return fail(matchFailure)
      if (matched === null) return fail(this.notFound(term))

      for (const target of this.expand(matched)) {
        const id = this.id(target)
        if (id === "") continue
        if (seen.has(id)) continue
        if (target !== matched && this.isApprovedAndLocked(target)) continue

        seen.add(id)
        selections.push({
          id,
          label: this.label(target),
          kind: this.kindLabel(target),
          reason: target === matched ? "requested" : "acceptance",
        })
      }
    }

    return ok({
      ids: selections.map((selection) => selection.id),
      selections,
      labels: Object.fromEntries(selections.map((selection) => [selection.id, selection.label])),
    })
  }

  private addTarget(target: ApprovalTarget): void {
    const id = this.id(target)
    this.byId.set(id, target)
    if (!this.isApprovable(target)) return

    const key = this.titleKey(target)
    if (key === "") return

    const matches = this.byTitle.get(key) ?? []
    matches.push(target)
    this.byTitle.set(key, matches)
  }

  private match(term: string): Result<ApprovalTarget | null, ApprovalScopeFailure> {
    const byId = this.byId.get(term)
    if (byId !== undefined) return this.approvable(byId)

    const matches = this.byTitle.get(this.normalize(term)) ?? []
    if (matches.length === 0) return ok(null)
    if (matches.length > 1) return fail(this.ambiguous(term, matches))

    return this.approvable(matches[0] ?? null)
  }

  private approvable(
    target: ApprovalTarget | null,
  ): Result<ApprovalTarget | null, ApprovalScopeFailure> {
    if (target === null) return ok(null)

    if (this.isApprovable(target)) return ok(target)

    const id = this.id(target)

    return fail({
      code: "SCOPE-NOT-APPROVABLE",
      message: `${id} is not an approvable element`,
    })
  }

  private expand(target: ApprovalTarget): ApprovalTarget[] {
    if (target.source === "architecture") return [target]

    const id = this.id(target)
    if (!id.startsWith("REQ-")) return [target]

    const acceptance = this.splitList(target.block.fields.ACCEPTANCE ?? "")
    const criteria = acceptance
      .map((criterionId) => this.byId.get(criterionId))
      .filter((candidate): candidate is ApprovalTarget => candidate !== undefined)

    return [target, ...criteria]
  }

  private isApprovedAndLocked(target: ApprovalTarget): boolean {
    const id = this.id(target)
    const locked = this.lock?.elements[id]
    if (locked === undefined) return false
    if (target.source === "sdoc") {
      if (target.block.fields.STATUS !== "Approved") return false

      return locked.content_hash === elementContentHash(target.block)
    }

    if (target.element.annotation.status !== "approved") return false

    return locked.content_hash === architectureElementHash(this.architecture, target.element)
  }

  private notFound(term: string): ApprovalScopeFailure {
    return { code: "SCOPE-NOT-FOUND", message: `unknown approval scope: ${term}` }
  }

  private ambiguous(term: string, matches: ApprovalTarget[]): ApprovalScopeFailure {
    const choices = matches
      .map((match) => this.choice(match))
      .sort((left, right) => left.id.localeCompare(right.id))

    return {
      code: "SCOPE-AMBIGUOUS",
      message: `more than one approval scope is named '${term}'`,
      choices,
    }
  }

  private choice(target: ApprovalTarget): ApprovalScopeChoice {
    const id = this.id(target)
    const owner = this.owner(target)
    const context = [this.kindLabel(target), this.status(target)]
    if (owner !== "") context.push(`owned by ${owner}`)

    return { id, label: this.label(target), context: context.join(" - ") }
  }

  private label(target: ApprovalTarget): string {
    if (target.source === "architecture") {
      const title = target.element.title.trim()
      return title === "" ? `Untitled ${this.kindLabel(target).toLowerCase()}` : title
    }

    const title = target.block.fields.TITLE?.trim() ?? ""
    if (title !== "") return title

    return `Untitled ${this.kindLabel(target).toLowerCase()}`
  }

  private kindLabel(target: ApprovalTarget): string {
    if (target.source === "sdoc") {
      return this.id(target).startsWith("AC-") ? "Acceptance criterion" : "Requirement"
    }

    const labels: Record<string, string> = {
      system: "System",
      component: "Component",
      data_store: "Data store",
      external_system: "External system",
      actor: "Actor",
    }

    return labels[target.element.kind] ?? "Architecture element"
  }

  private status(target: ApprovalTarget): string {
    if (target.source === "sdoc") return target.block.fields.STATUS ?? "Unknown state"

    return target.element.annotation.status ?? "Unknown state"
  }

  private owner(target: ApprovalTarget): string {
    if (target.source === "sdoc") return target.block.fields.OWNER?.trim() ?? ""

    return target.element.annotation.metadata.owner?.trim() ?? ""
  }

  private id(target: ApprovalTarget): string {
    if (target.source === "sdoc") return target.block.fields.UID ?? ""

    return target.element.id ?? ""
  }

  private isApprovable(target: ApprovalTarget): boolean {
    const id = this.id(target)
    if (target.source === "sdoc") {
      return APPROVABLE_PREFIXES.some((prefix) => id.startsWith(prefix))
    }

    return isArchitectureId(id)
  }

  private titleKey(target: ApprovalTarget): string {
    if (target.source === "sdoc") return this.normalize(target.block.fields.TITLE ?? "")

    return this.normalize(target.element.title)
  }

  private normalize(value: string): string {
    return value.replace(/\s+/g, " ").trim().toLowerCase()
  }

  private splitList(value: string): string[] {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

export class ApprovalScopeLoader {
  constructor(private readonly target: string) {}

  async resolve(scopes: string[]): Promise<Result<ApprovalScopeResolution, string>> {
    const sources = await loadRequirementSources(this.target)
    const sourceErrors = sources.diagnostics.filter(
      (item) => item.level === "error" && item.code !== "SPEC-NO-REQUIREMENTS",
    )
    if (sourceErrors.length > 0) {
      return fail(sourceErrors.map((item) => item.message).join("\n"))
    }

    const [loadedArchitecture, architectureError] = await new ArchitectureCatalogLoader(
      this.target,
    ).load()
    if (
      architectureError !== null &&
      architectureError !== "no LikeC4 architecture sources found"
    ) {
      return fail(architectureError)
    }
    const architecture = loadedArchitecture ?? { elements: [], relationships: [] }

    const [locked, lockError] = await new SpecLockLoader(this.target).load()
    if (lockError !== null && lockError.code !== "SPEC-LOCK-NOT-FOUND") {
      return fail(lockError.message)
    }
    const lock = lockError === null ? locked : null

    const [resolution, failure] = new ApprovalScopeResolver(
      sources.blocks,
      lock,
      architecture,
    ).resolve(scopes)
    if (failure !== null) return fail(this.describe(failure))

    return ok(resolution)
  }

  private describe(failure: ApprovalScopeFailure): string {
    if (failure.code !== "SCOPE-AMBIGUOUS") return failure.message

    const choices = failure.choices.map((choice) => `- ${choice.label} (${choice.context})`)

    return [failure.message, ...choices].join("\n")
  }
}
