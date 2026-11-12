import { mkdir, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { GenericDiscovery } from "../discovery/generic"
import { elementId } from "../discovery/ids"
import { renderDraftModel } from "../discovery/render"
import { buildMapReport, formatMapReport, renderMapJson } from "../discovery/report"
import { RustDiscovery } from "../discovery/rust"
import { TypeScriptDiscovery } from "../discovery/typescript"
import type { DraftElement, DraftLink, MapReport } from "../discovery/types"
import { SpecConfigLoader } from "./config"
import { parseSdoc, requirementBlocks } from "./sdoc"
import { attemptAsync } from "./result"
import { BunProcessRunner, ToolResolver, type ProcessRunner, type ToolLocator } from "./runner"

export interface MapOptions {
  draft?: boolean
  json?: boolean
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
}

export interface MapRun {
  report: MapReport | null
  output: string
  code: number
  draftPath: string | null
}

export async function runMap(target: string, options: MapOptions = {}): Promise<MapRun> {
  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError !== null) return failure(configError.message)
  if (config === null) return failure("config loader returned no configuration")

  const system: DraftElement = {
    id: elementId("SYS", config.project.name),
    kind: "system",
    title: config.project.name,
    status: "draft",
    provenance: "doc:spec/config.json#project.name",
    confidence: "observed",
    links: [],
  }

  const generic = await new GenericDiscovery().discover(target, system.id)
  const rust = await new RustDiscovery(
    options.processRunner ?? new BunProcessRunner(),
    options.toolLocator ?? new ToolResolver(target),
  ).discover(target, system.id)
  const typescript = await new TypeScriptDiscovery().discover(target, system.id)

  const elements = mergeElements([
    system,
    ...generic.elements,
    ...rust.elements,
    ...typescript.elements,
  ])
  const unresolvedRequirementLinks = await findUnresolvedRequirementLinks(target, elements)

  let draftPath: string | null = null
  if (options.draft) {
    const draftFile = join(target, "spec", "architecture", "draft.gen.c4")
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(join(target, "spec", "architecture"), { recursive: true })
      await Bun.write(draftFile, renderDraftModel(elements))
      return draftFile
    })
    if (writeError !== null || written === null) {
      return failure(
        `cannot write ${relative(target, draftFile)}: ${writeError ?? "unknown error"}`,
      )
    }
    draftPath = relative(target, written)
  }

  const report = buildMapReport(
    elements,
    [...generic.findings, ...rust.findings, ...typescript.findings],
    [
      ...generic.externalDependencies,
      ...rust.externalDependencies,
      ...typescript.externalDependencies,
    ],
    unresolvedRequirementLinks,
    draftPath,
  )

  return {
    report,
    output: options.json ? renderMapJson(report) : formatMapReport(report),
    code: 0,
    draftPath,
  }
}

function mergeElements(elements: DraftElement[]): DraftElement[] {
  const byId = new Map<string, DraftElement>()

  for (const element of elements) {
    const existing = byId.get(element.id)
    if (existing === undefined) {
      byId.set(element.id, {
        ...element,
        links: [...element.links],
      })
      continue
    }

    const links = new Map<string, DraftLink>()
    for (const link of [...existing.links, ...element.links]) {
      links.set(`${link.type}\u0000${link.to}`, link)
    }
    byId.set(element.id, {
      ...element,
      links: [...links.values()],
    })
  }

  return [...byId.values()]
    .map((element) => ({
      ...element,
      links: [...element.links].sort((left, right) => {
        const typeOrder = left.type.localeCompare(right.type)
        return typeOrder === 0 ? left.to.localeCompare(right.to) : typeOrder
      }),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

async function findUnresolvedRequirementLinks(
  target: string,
  elements: DraftElement[],
): Promise<string[]> {
  const files = await collectRequirementFiles(join(target, "spec", "requirements"))
  const ids = new Set(elements.map((element) => element.id))
  const unresolved = new Set<string>()

  for (const file of files) {
    const [text, readError] = await attemptAsync(() => Bun.file(file).text())
    if (readError !== null || text === null) continue

    for (const block of requirementBlocks(parseSdoc(file, text))) {
      const componentField = block.fields.COMPONENT
      if (componentField === undefined) continue

      for (const componentId of splitList(componentField)) {
        if (ids.has(componentId)) continue
        const source = block.fields.UID ?? `${relative(target, file)}:${block.line}`
        unresolved.add(`${source} -> ${componentId}`)
      }
    }
  }

  return [...unresolved].sort()
}

async function collectRequirementFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  const pending: string[] = [directory]

  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]
    if (current === undefined) continue

    const entries = (await readdir(current, { withFileTypes: true }).catch(() => [])).sort(
      (left, right) => left.name.localeCompare(right.name),
    )
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      if (entry.isFile() && /\.(sdoc|md)$/.test(entry.name)) files.push(path)
    }
  }

  return files
}

function splitList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function failure(message: string): MapRun {
  return {
    report: null,
    output: `map failed: ${message}`,
    code: 1,
    draftPath: null,
  }
}
