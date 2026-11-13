import { mkdir } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { renderDraftModel } from "../discovery/render"
import type { MapReport } from "../discovery/types"
import { ArchitectureDraftBuilder } from "./architecture-draft"
import { runMap } from "./map"
import { attemptAsync, type Result } from "./result"
import type { ProcessRunner, ToolLocator } from "./runner"
import { ok, fail } from "./result"

export const ARCHITECTURE_DRAFT_PATH = join("spec", "generated", "architecture.gen.c4")

export interface ArchitectureGenerateOptions {
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
}

export interface ArchitectureGenerateRun {
  output: string
  code: number
  path: string
  changed: boolean
}

export class ArchitectureModelGenerator {
  private readonly builder: ArchitectureDraftBuilder

  constructor(private readonly target: string) {
    this.builder = new ArchitectureDraftBuilder()
  }

  async generate(
    options: ArchitectureGenerateOptions = {},
  ): Promise<Result<{ model: string; elements: number }, string>> {
    const run = await runMap(this.target, {
      processRunner: options.processRunner,
      toolLocator: options.toolLocator,
    })
    if (run.code !== 0 || run.report === null) return fail(run.output)

    return ok(this.model(run.report))
  }

  async write(
    options: ArchitectureGenerateOptions = {},
  ): Promise<Result<ArchitectureGenerateRun, string>> {
    const [generated, generateError] = await this.generate(options)
    if (generateError !== null) return fail(generateError)
    if (generated === null) return fail("architecture generation returned no model")

    const path = join(this.target, ARCHITECTURE_DRAFT_PATH)
    const [current, readError] = await attemptAsync(() => Bun.file(path).text())
    const changed = readError !== null || current !== generated.model
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(path, generated.model)

      return path
    })
    if (writeError !== null || written === null) return fail(writeError ?? "cannot write model")

    return ok({
      output: `generated ${relative(this.target, written)} (${generated.elements} elements)`,
      code: 0,
      path: written,
      changed,
    })
  }

  async check(
    options: ArchitectureGenerateOptions = {},
  ): Promise<Result<ArchitectureGenerateRun, string>> {
    const [generated, generateError] = await this.generate(options)
    if (generateError !== null) return fail(generateError)
    if (generated === null) return fail("architecture generation returned no model")

    const path = join(this.target, ARCHITECTURE_DRAFT_PATH)
    const [current, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || current === null) {
      return ok({
        output: `missing or unreadable generated architecture draft: ${relative(this.target, path)}`,
        code: 1,
        path,
        changed: true,
      })
    }
    const changed = current !== generated.model

    return ok({
      output: changed
        ? `generated architecture draft is stale: ${relative(this.target, path)}`
        : `generated architecture draft is current: ${relative(this.target, path)}`,
      code: changed ? 1 : 0,
      path,
      changed,
    })
  }

  private model(report: MapReport): { model: string; elements: number } {
    const elements = this.builder.build(report)

    return { model: renderDraftModel(elements), elements: elements.length }
  }
}
