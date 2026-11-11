import { readdir } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { parseQuint, type QuintDeclaration, type QuintModule } from "../core/quint"
import { attemptAsync } from "../core/result"
import type { GraphContribution, GraphElement, GraphFinding } from "./types"

export interface FormalSourceRecord {
  path: string
  modules: QuintModule[]
  declarations: QuintDeclaration[]
}

export interface FormalSources {
  records: FormalSourceRecord[]
  findings: GraphFinding[]
}

export async function loadFormalSources(target: string): Promise<FormalSources> {
  const files = await collectQuintFiles(join(target, "spec", "formal"))
  const records: FormalSourceRecord[] = []
  const findings: GraphFinding[] = []

  for (const file of files) {
    const [text, readError] = await attemptAsync(() => Bun.file(file).text())
    if (readError !== null || text === null) {
      findings.push({
        level: "warning",
        code: "FORMAL-SOURCE-READ",
        message: `cannot read formal source ${basename(file)}: ${readError ?? "unknown error"}`,
      })
      continue
    }

    const path = relative(target, file).replaceAll("\\", "/")
    const parsed = parseQuint(path, text)
    records.push({ path, modules: parsed.modules, declarations: parsed.declarations })
  }

  return { records, findings }
}

export class FormalGraphSource {
  collect(sources: FormalSources, knownIds: ReadonlySet<string> = new Set()): GraphContribution {
    const byId = new Map<string, GraphElement>()
    const findings: GraphFinding[] = [...sources.findings]
    const moduleIds = new Map<string, string>()

    for (const record of sources.records) {
      for (const module of record.modules) {
        this.collectModule(record.path, module, knownIds, moduleIds, byId, findings)
      }
    }

    for (const record of sources.records) {
      for (const declaration of record.declarations) {
        this.collectDeclaration(record.path, declaration, knownIds, moduleIds, byId, findings)
      }
    }

    return {
      elements: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
      findings,
    }
  }

  private collectModule(
    path: string,
    module: QuintModule,
    knownIds: ReadonlySet<string>,
    moduleIds: Map<string, string>,
    byId: Map<string, GraphElement>,
    findings: GraphFinding[],
  ): void {
    if (module.id === null) {
      findings.push(this.unannotated(path, module.line, `module '${module.name}'`))
      return
    }
    if (!module.id.startsWith("MOD-")) {
      findings.push(this.invalidId(path, module.line, module.id, "MOD-"))
      return
    }

    moduleIds.set(this.moduleKey(path, module.name), module.id)
    if (knownIds.has(module.id)) return
    if (byId.has(module.id)) {
      findings.push(this.duplicate(module.id))
      return
    }

    byId.set(module.id, {
      id: module.id,
      kind: "formal_module",
      title: module.name,
      provenance: `doc:${path}#${module.name}`,
      links: [],
    })
  }

  private collectDeclaration(
    path: string,
    declaration: QuintDeclaration,
    knownIds: ReadonlySet<string>,
    moduleIds: Map<string, string>,
    byId: Map<string, GraphElement>,
    findings: GraphFinding[],
  ): void {
    if (declaration.id === null) {
      findings.push(
        this.unannotated(path, declaration.line, `${declaration.kind} '${declaration.name}'`),
      )
      return
    }

    const kind = this.declarationKind(declaration.id)
    if (kind === null) {
      findings.push(this.invalidId(path, declaration.line, declaration.id, "PROP- or INV-"))
      return
    }
    if (knownIds.has(declaration.id)) return
    if (byId.has(declaration.id)) {
      findings.push(this.duplicate(declaration.id))
      return
    }

    const moduleId =
      declaration.module === null
        ? undefined
        : moduleIds.get(this.moduleKey(path, declaration.module))

    byId.set(declaration.id, {
      id: declaration.id,
      kind,
      title: declaration.name,
      provenance: `doc:${path}#${declaration.module ?? ""}.${declaration.name}`,
      links: moduleId === undefined ? [] : [{ type: "part_of", to: moduleId }],
    })
  }

  private declarationKind(id: string): string | null {
    if (id.startsWith("PROP-")) return "formal_property"
    if (id.startsWith("INV-")) return "invariant"
    return null
  }

  private moduleKey(path: string, name: string): string {
    return `${path}\u0000${name}`
  }

  private unannotated(path: string, line: number, target: string): GraphFinding {
    return {
      level: "warning",
      code: "FORMAL-UNANNOTATED",
      message: `${path}:${line} ${target} has no stable ID comment`,
    }
  }

  private invalidId(path: string, line: number, id: string, expected: string): GraphFinding {
    return {
      level: "warning",
      code: "FORMAL-INVALID-ID",
      message: `${path}:${line} annotation '${id}' must use ${expected}`,
    }
  }

  private duplicate(id: string): GraphFinding {
    return {
      level: "warning",
      code: "FORMAL-DUPLICATE-ID",
      message: `duplicate formal element '${id}'`,
      id,
    }
  }
}

async function collectQuintFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectQuintFiles(path)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".qnt")) files.push(path)
  }

  return files.sort()
}
