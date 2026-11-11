import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "../core/result"
import {
  PROPOSAL_VERSION,
  type Proposal,
  type ProposalBaseline,
  type ProposalMode,
  type ProposalOperationLog,
  type ProposalStatus,
} from "./types"

const MODES = new Set<ProposalMode>(["scratch", "mapping", "refactor"])
const STATUSES = new Set<ProposalStatus>([
  "draft",
  "proposed",
  "validated",
  "approved",
  "superseded",
])
const OPERATION_KINDS = new Set([
  "rename",
  "deprecate",
  "replace",
  "split",
  "merge",
  "extract",
  "move",
  "change-contract",
])

export class ProposalStore {
  private readonly directory: string

  constructor(target: string) {
    this.directory = join(target, "spec", "proposals")
  }

  async load(slug: string): Promise<Result<Proposal, string>> {
    const path = this.pathFor(slug)
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) {
      return [null, readError === null ? `cannot read ${path}` : readError]
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) {
      return [null, `invalid JSON in ${path}: ${parseError ?? "empty document"}`]
    }

    return this.validate(parsed, path)
  }

  async loadForBranch(branch: string): Promise<Result<Proposal, string>> {
    if (!branch.startsWith("spec/") || branch.length === "spec/".length) {
      return [null, `no active proposal on branch '${branch}'`]
    }

    return this.load(branch.slice("spec/".length))
  }

  async save(proposal: Proposal): Promise<Result<string, string>> {
    const path = this.pathFor(this.slugFor(proposal.branch))
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(this.directory, { recursive: true })
      await Bun.write(path, `${JSON.stringify(proposal, null, 2)}\n`)

      return path
    })
    if (writeError !== null || written === null) {
      return [null, writeError === null ? `cannot write ${path}` : writeError]
    }

    return [written, null]
  }

  private pathFor(slug: string): string {
    return join(this.directory, `${slug}.json`)
  }

  private slugFor(branch: string): string {
    return branch.startsWith("spec/") ? branch.slice("spec/".length) : branch
  }

  private validate(value: unknown, path: string): Result<Proposal, string> {
    if (!this.isRecord(value)) return [null, `${path}: proposal must be an object`]
    if (value["version"] !== PROPOSAL_VERSION) {
      return [null, `${path}: unsupported proposal version '${String(value["version"])}'`]
    }

    const [baseline, baselineError] = this.readBaseline(value["baseline"], path)
    if (baselineError !== null) return [null, baselineError]
    if (baseline === null) return [null, `${path}: baseline failed`]

    const [operations, operationsError] = this.readOperations(value["operations"], path)
    if (operationsError !== null) return [null, operationsError]
    if (operations === null) return [null, `${path}: operations failed`]

    const mode = value["mode"]
    const status = value["status"]
    if (!MODES.has(mode as ProposalMode)) return [null, `${path}: invalid mode`]
    if (!STATUSES.has(status as ProposalStatus)) return [null, `${path}: invalid status`]

    const strings = ["id", "direction", "branch", "base_commit", "author", "created_at"] as const
    const missing = strings.find((field) => typeof value[field] !== "string")
    if (missing !== undefined) return [null, `${path}: ${missing} must be a string`]

    return [
      {
        version: PROPOSAL_VERSION,
        id: value["id"] as string,
        direction: value["direction"] as string,
        mode: mode as ProposalMode,
        status: status as ProposalStatus,
        branch: value["branch"] as string,
        base_commit: value["base_commit"] as string,
        baseline,
        author: value["author"] as string,
        created_at: value["created_at"] as string,
        operations,
      },
      null,
    ]
  }

  private readBaseline(
    value: unknown,
    path: string,
  ): Result<ProposalBaseline, string> {
    if (!this.isRecord(value)) return [null, `${path}: baseline must be an object`]
    if (typeof value["commit"] !== "string") {
      return [null, `${path}: baseline.commit must be a string`]
    }
    if (value["lock_hash"] !== null && typeof value["lock_hash"] !== "string") {
      return [null, `${path}: baseline.lock_hash must be a string or null`]
    }

    return [
      { commit: value["commit"], lock_hash: value["lock_hash"] as string | null },
      null,
    ]
  }

  private readOperations(
    value: unknown,
    path: string,
  ): Result<ProposalOperationLog[], string> {
    if (!Array.isArray(value)) return [null, `${path}: operations must be an array`]

    const operations: ProposalOperationLog[] = []
    for (const candidate of value) {
      const [operation, error] = this.readOperation(candidate, path)
      if (error !== null) return [null, error]
      if (operation === null) return [null, `${path}: operation failed`]
      operations.push(operation)
    }

    return [operations, null]
  }

  private readOperation(
    value: unknown,
    path: string,
  ): Result<ProposalOperationLog, string> {
    if (!this.isRecord(value)) return [null, `${path}: operation must be an object`]
    if (typeof value["kind"] !== "string" || !OPERATION_KINDS.has(value["kind"])) {
      return [null, `${path}: invalid operation kind`]
    }
    if (typeof value["at"] !== "string") {
      return [null, `${path}: operation at must be a string`]
    }
    if (!this.isStringArray(value["targets"])) {
      return [null, `${path}: operation targets must be a string array`]
    }

    const [before, beforeError] = this.readHashes(value["before_hashes"], path)
    if (beforeError !== null) return [null, beforeError]
    if (before === null) return [null, `${path}: before hashes failed`]

    const [after, afterError] = this.readHashes(value["after_hashes"], path)
    if (afterError !== null) return [null, afterError]
    if (after === null) return [null, `${path}: after hashes failed`]

    return [
      {
        kind: value["kind"] as ProposalOperationLog["kind"],
        at: value["at"],
        targets: [...value["targets"]],
        before_hashes: before,
        after_hashes: after,
      },
      null,
    ]
  }

  private readHashes(
    value: unknown,
    path: string,
  ): Result<Record<string, string | null>, string> {
    if (!this.isRecord(value)) return [null, `${path}: hashes must be an object`]

    const hashes: Record<string, string | null> = {}
    for (const [id, hash] of Object.entries(value)) {
      if (hash !== null && typeof hash !== "string") {
        return [null, `${path}: hash for ${id} must be a string or null`]
      }
      hashes[id] = hash
    }

    return [hashes, null]
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string")
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
