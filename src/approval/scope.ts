import { loadRequirementSources } from "../core/requirements"
import type { Result } from "../core/result"
import type { SdocBlock } from "../core/types"
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

const APPROVABLE_PREFIXES = ["REQ-", "AC-"] as const

export class ApprovalScopeResolver {
  private readonly byId = new Map<string, SdocBlock>()
  private readonly byTitle = new Map<string, SdocBlock[]>()

  constructor(
    blocks: SdocBlock[],
    private readonly lock: SpecLock | null,
  ) {
    for (const block of blocks) {
      const id = block.fields.UID
      if (id === undefined || id === "") continue

      this.byId.set(id, block)
      if (!this.isApprovable(id)) continue

      const key = this.titleKey(block)
      if (key === "") continue

      const matches = this.byTitle.get(key) ?? []
      matches.push(block)
      this.byTitle.set(key, matches)
    }
  }

  resolve(scopes: string[]): Result<ApprovalScopeResolution, ApprovalScopeFailure> {
    const selections: ApprovalScopeSelection[] = []
    const seen = new Set<string>()

    for (const scope of scopes) {
      const term = scope.trim()
      if (term === "") return [null, this.notFound(scope)]

      const [matched, matchFailure] = this.match(term)
      if (matchFailure !== null) return [null, matchFailure]
      if (matched === null) return [null, this.notFound(term)]

      for (const block of this.expand(matched)) {
        const id = block.fields.UID
        if (id === undefined || id === "") continue
        if (seen.has(id)) continue
        if (block !== matched && this.isApprovedAndLocked(block)) continue

        seen.add(id)
        selections.push({
          id,
          label: this.label(block),
          kind: this.kindLabel(id),
          reason: block === matched ? "requested" : "acceptance",
        })
      }
    }

    return [
      {
        ids: selections.map((selection) => selection.id),
        selections,
        labels: Object.fromEntries(selections.map((selection) => [selection.id, selection.label])),
      },
      null,
    ]
  }

  private match(term: string): Result<SdocBlock | null, ApprovalScopeFailure> {
    const byId = this.byId.get(term)
    if (byId !== undefined) return this.approvable(byId)

    const matches = this.byTitle.get(this.normalize(term)) ?? []
    if (matches.length === 0) return [null, null]
    if (matches.length > 1) {
      return [null, this.ambiguous(term, matches)]
    }

    return this.approvable(matches[0] ?? null)
  }

  private approvable(block: SdocBlock | null): Result<SdocBlock | null, ApprovalScopeFailure> {
    if (block === null) return [null, null]

    const id = block.fields.UID ?? ""
    if (this.isApprovable(id)) return [block, null]

    return [
      null,
      {
        code: "SCOPE-NOT-APPROVABLE",
        message: `${id} is not an approvable requirement or acceptance record`,
      },
    ]
  }

  private expand(block: SdocBlock): SdocBlock[] {
    const id = block.fields.UID ?? ""
    if (!id.startsWith("REQ-")) return [block]

    const acceptance = this.splitList(block.fields.ACCEPTANCE ?? "")
    const criteria = acceptance
      .map((criterionId) => this.byId.get(criterionId))
      .filter((criterion): criterion is SdocBlock => criterion !== undefined)

    return [block, ...criteria]
  }

  private isApprovedAndLocked(block: SdocBlock): boolean {
    if (block.fields.STATUS !== "Approved") return false

    const id = block.fields.UID ?? ""
    const locked = this.lock?.elements[id]

    return locked !== undefined && locked.content_hash === elementContentHash(block)
  }

  private notFound(term: string): ApprovalScopeFailure {
    return { code: "SCOPE-NOT-FOUND", message: `unknown approval scope: ${term}` }
  }

  private ambiguous(term: string, matches: SdocBlock[]): ApprovalScopeFailure {
    const choices = matches
      .map((match) => this.choice(match))
      .sort((left, right) => left.id.localeCompare(right.id))

    return {
      code: "SCOPE-AMBIGUOUS",
      message: `more than one approval scope is named '${term}'`,
      choices,
    }
  }

  private choice(block: SdocBlock): ApprovalScopeChoice {
    const id = block.fields.UID ?? ""
    const owner = block.fields.OWNER?.trim()
    const context = [this.kindLabel(id), block.fields.STATUS ?? "Unknown state"]
    if (owner !== undefined && owner !== "") context.push(`owned by ${owner}`)

    return {
      id,
      label: this.label(block),
      context: context.join(" - "),
    }
  }

  private label(block: SdocBlock): string {
    const title = block.fields.TITLE?.trim() ?? ""
    if (title !== "") return title

    return `Untitled ${this.kindLabel(block.fields.UID ?? "").toLowerCase()}`
  }

  private kindLabel(id: string): string {
    return id.startsWith("AC-") ? "Acceptance criterion" : "Requirement"
  }

  private isApprovable(id: string): boolean {
    return APPROVABLE_PREFIXES.some((prefix) => id.startsWith(prefix))
  }

  private titleKey(block: SdocBlock): string {
    return this.normalize(block.fields.TITLE ?? "")
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
    const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
    if (sourceErrors.length > 0) {
      return [null, sourceErrors.map((item) => item.message).join("\n")]
    }

    const [locked, lockError] = await new SpecLockLoader(this.target).load()
    if (lockError !== null && lockError.code !== "SPEC-LOCK-NOT-FOUND") {
      return [null, lockError.message]
    }
    const lock = lockError === null ? locked : null

    const [resolution, failure] = new ApprovalScopeResolver(sources.blocks, lock).resolve(scopes)
    if (failure !== null) return [null, this.describe(failure)]

    return [resolution, null]
  }

  private describe(failure: ApprovalScopeFailure): string {
    if (failure.code !== "SCOPE-AMBIGUOUS") return failure.message

    const choices = failure.choices.map((choice) => `- ${choice.label} (${choice.context})`)

    return [failure.message, ...choices].join("\n")
  }
}
