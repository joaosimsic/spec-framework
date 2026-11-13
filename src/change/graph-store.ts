import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { attempt, attemptAsync, type Result, ok, fail } from "../core/result"
import { GRAPH_VERSION, type SpecGraph } from "../model"

export const PROPOSAL_GRAPH_VERSION = 1

export interface ProposalGraphSnapshot {
  version: typeof PROPOSAL_GRAPH_VERSION
  proposal_id: string
  graph: SpecGraph
}

export class ProposalGraphSnapshotStore {
  private readonly directory: string

  constructor(target: string) {
    this.directory = join(target, "spec", "proposals")
  }

  async save(
    branch: string,
    proposalId: string,
    graph: SpecGraph,
  ): Promise<Result<string, string>> {
    const slug = this.slugFor(branch)
    if (slug === null) return fail(`no proposal branch for '${branch}'`)

    const path = this.pathFor(slug)
    const snapshot: ProposalGraphSnapshot = {
      version: PROPOSAL_GRAPH_VERSION,
      proposal_id: proposalId,
      graph,
    }
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(this.directory, { recursive: true })
      await Bun.write(path, `${JSON.stringify(snapshot, null, 2)}\n`)

      return path
    })
    if (writeError !== null || written === null) {
      return fail(writeError === null ? `cannot write ${path}` : writeError)
    }

    return ok(written)
  }

  async load(branch: string): Promise<Result<ProposalGraphSnapshot | null, string>> {
    const slug = this.slugFor(branch)
    if (slug === null) return ok(null)

    const path = this.pathFor(slug)
    const [exists, existsError] = await attemptAsync(() => Bun.file(path).exists())
    if (existsError !== null) return fail(`cannot read ${path}: ${existsError}`)
    if (!exists) return ok(null)

    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) {
      return fail(readError === null ? `cannot read ${path}` : readError)
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) {
      return fail(`invalid JSON in ${path}: ${parseError ?? "empty document"}`)
    }

    return this.validate(parsed, path)
  }

  private validate(value: unknown, path: string): Result<ProposalGraphSnapshot, string> {
    if (!this.isRecord(value)) return fail(`${path}: graph snapshot must be an object`)
    if (value["version"] !== PROPOSAL_GRAPH_VERSION) {
      return fail(`${path}: unsupported graph snapshot version`)
    }
    if (typeof value["proposal_id"] !== "string") {
      return fail(`${path}: proposal_id must be a string`)
    }

    const graph = value["graph"]
    if (!this.isRecord(graph)) return fail(`${path}: graph must be an object`)
    if (graph["version"] !== GRAPH_VERSION) return fail(`${path}: unsupported graph version`)
    if (!Array.isArray(graph["elements"])) return fail(`${path}: graph.elements must be an array`)

    return ok({
      version: PROPOSAL_GRAPH_VERSION,
      proposal_id: value["proposal_id"],
      graph: graph as unknown as SpecGraph,
    })
  }

  private slugFor(branch: string): string | null {
    if (!branch.startsWith("spec/") || branch.length === "spec/".length) return null

    return branch.slice("spec/".length)
  }

  private pathFor(slug: string): string {
    return join(this.directory, `${slug}.graph.json`)
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
