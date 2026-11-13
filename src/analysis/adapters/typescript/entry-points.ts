import { join } from "node:path"
import ts from "typescript"
import { attempt, attemptAsync, fail, ok, type Result } from "../../../core/result"
import { IrIdentity, type IrElement, type IrEntryPoint, type IrEntryPointKind } from "../../ir"
import type { ScannedFile } from "../../types"
import type { ElementIndex } from "./element-index"
import type { TypeScriptProgram } from "./program"

import type { EntryPointOverride } from "../../../config"

export interface EntryPointOptions {
  include: EntryPointOverride[]
  exclude: Array<{ path: string }>
}

export class TypeScriptEntryPointExtractor {
  private readonly byId: Map<string, IrElement>

  constructor(
    private readonly root: string,
    private readonly typeScript: TypeScriptProgram,
    private readonly files: ScannedFile[],
    elements: IrElement[],
    private readonly index: ElementIndex,
    private readonly options: EntryPointOptions = { include: [], exclude: [] },
  ) {
    this.byId = new Map(elements.map((element) => [element.id, element]))
  }

  async extract(): Promise<Result<IrEntryPoint[], string>> {
    const entries = new Map<string, IrEntryPoint>()
    const [packageEntries, packageError] = await this.packageEntries()
    if (packageError !== null) return fail(packageError)
    for (const entry of packageEntries) entries.set(entry.id, entry)

    for (const element of this.byId.values()) {
      if (element.type === "function" && element.name === "main") {
        this.add(
          entries,
          element,
          "application_main",
          `Main function in ${element.filePath}`,
          "typescript",
        )
      }
      if (element.exported && (element.type === "function" || element.type === "class")) {
        this.add(entries, element, "library_api", element.name, "typescript")
      }
    }

    for (const file of this.files) {
      if (file.path.startsWith("tests/")) continue
      const sourceFile = this.typeScript.program.getSourceFile(file.absolutePath)
      if (sourceFile === undefined) continue
      if (file.path.startsWith("bin/")) {
        const module = this.byId.get(IrIdentity.file(file.path))
        if (module !== undefined) this.add(entries, module, "cli", file.path, "typescript:bin")
      }
      this.routes(sourceFile, file, entries)
      if (await this.hasShebang(file.absolutePath)) {
        const module = this.byId.get(IrIdentity.file(file.path))
        if (module !== undefined) {
          this.add(entries, module, "application_main", file.path, "typescript:shebang")
        }
      }
    }

    for (const include of this.options.include) this.configured(entries, include)
    const excluded = new Set(this.options.exclude.map((entry) => entry.path))

    return ok(
      [...entries.values()]
        .filter((entry) => {
          const element = this.byId.get(entry.nodeId)
          return element === undefined || !excluded.has(element.filePath)
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
    )
  }

  private routes(
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    entries: Map<string, IrEntryPoint>,
  ): void {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        this.route(node, sourceFile, file, entries)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  private route(
    node: ts.CallExpression,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    entries: Map<string, IrEntryPoint>,
  ): void {
    if (!ts.isPropertyAccessExpression(node.expression)) return
    const method = node.expression.name.text.toLowerCase()
    if (!["get", "post", "put", "patch", "delete", "use"].includes(method)) return
    const argument = node.arguments[0]
    if (argument === undefined || !ts.isStringLiteral(argument)) return
    if (!argument.text.startsWith("/")) return
    const id = this.index.find(file.path, node.getStart()) ?? IrIdentity.file(file.path)
    const element = this.byId.get(id)
    if (element === undefined) return
    const key = `${file.path}#${method}:${argument.text}`
    const entry: IrEntryPoint = {
      id: IrIdentity.entry("http", key),
      nodeId: id,
      kind: "http_route",
      label: `${method.toUpperCase()} ${argument.text}`,
      provenance: `typescript:${file.path}:${this.line(sourceFile, node)}`,
      confidence: "inferred",
      metadata: { method: method.toUpperCase(), route: argument.text },
    }
    entries.set(entry.id, entry)
  }

  private add(
    entries: Map<string, IrEntryPoint>,
    element: IrElement,
    kind: IrEntryPointKind,
    label: string,
    provenance: string,
    metadata: Record<string, string> = {},
  ): void {
    const key = kind === "library_api" ? element.id : element.filePath
    const entry: IrEntryPoint = {
      id: IrIdentity.entry(kind, key),
      nodeId: element.id,
      kind,
      label,
      provenance: `${provenance}:${element.filePath}`,
      confidence: "observed",
      metadata: { path: element.filePath, ...metadata },
    }
    entries.set(entry.id, entry)
  }

  private configured(entries: Map<string, IrEntryPoint>, include: EntryPointOverride): void {
    const file = this.files.find((candidate) => candidate.path === include.path)
    if (file === undefined) return
    const module = this.byId.get(IrIdentity.file(file.path))
    if (module === undefined) return
    const kind = this.kind(include.kind)
    this.add(entries, module, kind, include.path, "configured", {
      path: file.path,
      ...(include.name === undefined ? {} : { name: include.name }),
    })
  }

  private kind(value: string): IrEntryPointKind {
    if (value === "http_route" || value === "library_api" || value === "application_main") {
      return value
    }
    if (value === "event_handler") return "event_handler"

    return "cli"
  }

  private async packageEntries(): Promise<Result<IrEntryPoint[], string>> {
    const path = join(this.root, "package.json")
    const [text, readError] = await attemptAsync(async () => {
      const file = Bun.file(path)
      return (await file.exists()) ? file.text() : ""
    })
    if (readError !== null || text === null) return fail(readError ?? "cannot read package.json")
    if (text === "") return ok([])

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) return fail(parseError ?? "invalid package.json")
    if (typeof parsed !== "object" || Array.isArray(parsed)) return ok([])
    const bin = (parsed as Record<string, unknown>)["bin"]
    const entries: IrEntryPoint[] = []
    if (typeof bin === "string") {
      entries.push(...this.packageEntry(bin, null))
      return ok(entries)
    }
    if (typeof bin !== "object" || bin === null || Array.isArray(bin)) return ok(entries)
    for (const [name, value] of Object.entries(bin)) {
      if (typeof value === "string") entries.push(...this.packageEntry(value, name))
    }

    return ok(entries)
  }

  private packageEntry(path: string, name: string | null): IrEntryPoint[] {
    const normalized = path.replace(/^\.\//, "")
    const module = this.byId.get(IrIdentity.file(normalized))
    if (module === undefined) return []
    const anchor = name ?? normalized.split("/").at(-1) ?? "entry"
    return [
      {
        id: IrIdentity.entry("cli", anchor),
        nodeId: module.id,
        kind: "cli",
        label: anchor,
        provenance: "package.json#bin",
        confidence: "observed",
        metadata: { path: normalized, name: anchor },
      },
    ]
  }

  private async hasShebang(path: string): Promise<boolean> {
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) return false

    return text.startsWith("#!")
  }

  private line(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
  }
}
