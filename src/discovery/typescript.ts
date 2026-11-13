import { readdir } from "node:fs/promises"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { attempt, attemptAsync, type Result, ok, fail } from "../core/result"
import { shouldIgnoreDirectory } from "./fs"
import { uniqueElementId } from "./ids"
import type { DiscoveryContribution, DiscoveryFinding, DraftElement, DraftLink } from "./types"

const SOURCE_ROOTS = ["src", "plugin"]
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"])
const RESOLVE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
]

const EXCLUDED_ROOTS = new Set(["tests", "docs", "examples", "tmp"])
const BUILTIN_MODULES = new Set(["bun"])

interface FsEntry {
  name: string
  isFile(): boolean
  isDirectory(): boolean
}

interface SourceFile {
  absolute: string
  relative: string
  subsystem: string
}

interface Subsystem {
  id: string
  title: string
  provenance: string
}

export class TypeScriptDiscovery {
  async discover(target: string, systemId: string): Promise<DiscoveryContribution> {
    const [files, fileError] = await this.collectFiles(target)
    if (fileError !== null || files === null) {
      return {
        elements: [],
        findings: [
          { level: "warning", code: "MAP-TS-SCAN", message: fileError ?? "file scan failed" },
        ],
        externalDependencies: [],
      }
    }
    if (files.length === 0) {
      return { elements: [], findings: [], externalDependencies: [] }
    }

    const used = new Set<string>([systemId])
    const findings: DiscoveryFinding[] = []
    const subsystems = new Map<string, Subsystem>()
    const elements = new Map<string, DraftElement>()
    const filesByPath = new Map<string, DraftElement>()
    const externalDependencies = new Set<string>()

    for (const file of files) {
      const subsystem = this.subsystemFor(file.relative)
      let subsystemEntry = subsystems.get(subsystem.key)
      if (subsystemEntry === undefined) {
        subsystemEntry = {
          id: uniqueElementId("CMP", subsystem.idName, used),
          title: subsystem.title,
          provenance: `code:${subsystem.directory}/`,
        }
        subsystems.set(subsystem.key, subsystemEntry)
        elements.set(subsystemEntry.id, {
          id: subsystemEntry.id,
          kind: "component",
          title: subsystem.title,
          status: "draft",
          provenance: subsystemEntry.provenance,
          confidence: "observed",
          links: [
            {
              type: "part_of",
              to: systemId,
              confidence: "observed",
              provenance: subsystemEntry.provenance,
            },
          ],
        })
      }

      const fileId = uniqueElementId("FILE", file.relative, used)
      const element: DraftElement = {
        id: fileId,
        kind: "module",
        title: file.relative,
        status: "draft",
        provenance: `code:${file.relative}`,
        confidence: "observed",
        links: [
          {
            type: "part_of",
            to: subsystemEntry.id,
            confidence: "observed",
            provenance: `code:${file.relative}`,
          },
        ],
      }
      file.subsystem = subsystemEntry.id
      filesByPath.set(this.normalized(file.absolute), element)
      elements.set(fileId, element)
    }

    for (const file of files) {
      const source = filesByPath.get(this.normalized(file.absolute))
      if (source === undefined) continue
      const [imports, readError] = await this.imports(file.absolute)
      if (readError !== null || imports === null) {
        findings.push({
          level: "warning",
          code: "MAP-TS-PARSE",
          message: readError ?? `${file.relative}: import scan failed`,
        })
        continue
      }

      for (const imported of imports) {
        const local = this.resolveImport(file.absolute, imported, filesByPath)
        if (local !== null) {
          this.addLink(source, {
            type: "depends_on",
            to: local.id,
            confidence: "observed",
            provenance: `code:${file.relative}#imports`,
          })
          if (file.subsystem !== local.links[0]?.to) {
            const sourceSubsystem = elements.get(file.subsystem)
            const targetSubsystem = elements.get(local.links[0]?.to ?? "")
            if (sourceSubsystem !== undefined && targetSubsystem !== undefined) {
              this.addLink(sourceSubsystem, {
                type: "depends_on",
                to: targetSubsystem.id,
                confidence: "observed",
                provenance: `code:${file.relative}#imports`,
              })
            }
          }
          continue
        }

        const external = this.externalPackage(imported)
        if (external !== null && !external.startsWith("@spec-framework/")) {
          externalDependencies.add(`${file.subsystem} -> ${external}`)
        }
      }
    }

    return {
      elements: this.sortElements([...elements.values()]),
      findings,
      externalDependencies: [...externalDependencies].sort(),
    }
  }

  private async collectFiles(target: string): Promise<Result<SourceFile[], string>> {
    const files: SourceFile[] = []
    for (const root of SOURCE_ROOTS) {
      const directory = join(target, root)
      const [entries, error] = await attemptAsync(
        async () => (await readdir(directory, { withFileTypes: true })) as FsEntry[],
      )
      if (error !== null || entries === null) continue
      const collected = await this.walk(target, directory, entries)
      files.push(...collected)
    }
    files.sort((left, right) => left.relative.localeCompare(right.relative))

    return ok(files)
  }

  private async walk(target: string, directory: string, entries: FsEntry[]): Promise<SourceFile[]> {
    const files: SourceFile[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (shouldIgnoreDirectory(entry.name) || EXCLUDED_ROOTS.has(entry.name)) continue
        const children = (await readdir(path, { withFileTypes: true }).catch(() => [])) as FsEntry[]
        files.push(...(await this.walk(target, path, children)))
        continue
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) continue
      files.push({
        absolute: path,
        relative: relative(target, path).split(sep).join("/"),
        subsystem: "",
      })
    }

    return files
  }

  private subsystemFor(path: string): {
    key: string
    idName: string
    title: string
    directory: string
  } {
    const parts = path.split("/")
    const first = parts[0] ?? "root"
    if (first === "src" && parts.length === 2) {
      return { key: "src", idName: "src", title: "src", directory: "src" }
    }
    if (first === "src") {
      const name = parts[1] ?? "src"
      const directory = `src/${name}`
      return { key: directory, idName: directory, title: directory, directory }
    }
    if (first === "plugin") {
      const name = parts[1] ?? "plugin"
      const directory = `plugin/${name}`
      return { key: directory, idName: directory, title: directory, directory }
    }
    return { key: first, idName: first, title: first, directory: first }
  }

  private async imports(path: string): Promise<Result<string[], string>> {
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) return fail(readError ?? `cannot read ${path}`)

    const extension = extname(path)
    const loader =
      extension === ".tsx"
        ? "tsx"
        : extension === ".jsx"
          ? "jsx"
          : extension === ".js"
            ? "js"
            : "ts"
    const transpiler = new Bun.Transpiler({ loader })
    const source = text.replace(/^#![^\n]*\n/, "")
    const [imports, parseError] = attempt(() => transpiler.scanImports(source))
    if (parseError !== null || imports === null) {
      return fail(`${path}: ${parseError ?? "import scan failed"}`)
    }

    return ok(
      imports
        .map((item) => item.path)
        .filter((value): value is string => typeof value === "string" && value !== ""),
    )
  }

  private resolveImport(
    sourcePath: string,
    specifier: string,
    files: Map<string, DraftElement>,
  ): DraftElement | null {
    if (!specifier.startsWith(".")) return null
    const base = resolve(dirname(sourcePath), specifier)
    for (const extension of RESOLVE_EXTENSIONS) {
      const candidate = files.get(this.normalized(`${base}${extension}`))
      if (candidate !== undefined) return candidate
    }

    return null
  }

  private externalPackage(specifier: string): string | null {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      if (
        specifier.startsWith("node:") ||
        specifier.startsWith("bun:") ||
        BUILTIN_MODULES.has(specifier)
      ) {
        return null
      }
      const parts = specifier.split("/")
      return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? null)
    }

    return null
  }

  private addLink(element: DraftElement, link: DraftLink): void {
    if (element.links.some((candidate) => candidate.type === link.type && candidate.to === link.to))
      return
    element.links.push(link)
  }

  private normalized(path: string): string {
    return path.split(sep).join("/")
  }

  private sortElements(elements: DraftElement[]): DraftElement[] {
    return elements
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((element) => ({
        ...element,
        links: [...element.links].sort((left, right) => {
          const typeOrder = left.type.localeCompare(right.type)
          return typeOrder === 0 ? left.to.localeCompare(right.to) : typeOrder
        }),
      }))
  }
}
