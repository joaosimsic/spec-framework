import { mkdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { attempt, attemptAsync, type Result } from "../core/result"
import { CurationParser } from "./curation-parser"
import {
  MAPPING_SNAPSHOT_VERSION,
  type CurationDecision,
  type MappingSnapshot,
} from "./curation-types"
import { renderDraftModel } from "./render"
import type { DraftElement, MapReport } from "./types"

export const MAPPING_DRAFT_PATH = join("spec", "generated", "draft.gen.c4")

export class MappingSnapshotStore {
  private readonly directory: string

  constructor(private readonly target: string) {
    this.directory = join(target, "spec", "proposals")
  }

  async load(branch: string): Promise<Result<MappingSnapshot, string>> {
    const slug = this.slugFor(branch)
    if (slug === null) return [null, `no active mapping proposal on branch '${branch}'`]

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

  async save(
    branch: string,
    map: MapReport,
    decisions: CurationDecision[],
  ): Promise<Result<string, string>> {
    const slug = this.slugFor(branch)
    if (slug === null) return [null, `no active mapping proposal on branch '${branch}'`]

    const path = this.pathFor(slug)
    const snapshot: MappingSnapshot = {
      version: MAPPING_SNAPSHOT_VERSION,
      map,
      decisions,
    }
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(this.directory, { recursive: true })
      await Bun.write(path, `${JSON.stringify(snapshot, null, 2)}\n`)

      return path
    })
    if (writeError !== null || written === null) {
      return [null, writeError === null ? `cannot write ${path}` : writeError]
    }

    return [written, null]
  }

  async writeDraft(areas: DraftElement[]): Promise<Result<string, string>> {
    const path = join(this.target, MAPPING_DRAFT_PATH)
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(join(this.target, "spec", "architecture"), { recursive: true })
      await Bun.write(path, renderDraftModel(areas))

      return path
    })
    if (writeError !== null || written === null) {
      return [null, writeError === null ? `cannot write ${path}` : writeError]
    }

    return [relative(this.target, written), null]
  }

  private validate(value: unknown, path: string): Result<MappingSnapshot, string> {
    if (!this.isRecord(value)) return [null, `${path}: mapping snapshot must be an object`]
    if (value["version"] !== MAPPING_SNAPSHOT_VERSION) {
      return [null, `${path}: unsupported mapping snapshot version`]
    }

    const map = value["map"]
    if (!this.isRecord(map)) return [null, `${path}: map must be an object`]
    if (!Array.isArray(map["elements"])) return [null, `${path}: map.elements must be an array`]
    if (!this.isRecord(map["gaps"])) return [null, `${path}: map.gaps must be an object`]

    const [decisions, decisionsError] = CurationParser.parseDecisions(value["decisions"])
    if (decisionsError !== null || decisions === null) {
      return [null, `${path}: ${decisionsError ?? "decisions failed"}`]
    }

    return [
      {
        version: MAPPING_SNAPSHOT_VERSION,
        map: map as unknown as MapReport,
        decisions,
      },
      null,
    ]
  }

  private slugFor(branch: string): string | null {
    if (!branch.startsWith("spec/") || branch.length === "spec/".length) return null

    return branch.slice("spec/".length)
  }

  private pathFor(slug: string): string {
    return join(this.directory, `${slug}.mapping.json`)
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
