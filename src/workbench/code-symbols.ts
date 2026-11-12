import { createHash } from "node:crypto"
import { extname, join } from "node:path"
import ts from "typescript"
import { attemptAsync } from "../core/result"
import type { WorkbenchArchitectureCodeSymbol } from "./types"

const KIND_LABELS: Record<string, string> = {
  function: "Function",
  class: "Class",
  interface: "Interface",
  type: "Type",
  enum: "Enum",
  constant: "Constant",
}

export class TypeScriptSymbolReader {
  constructor(private readonly target: string) {}

  async read(paths: string[]): Promise<Map<string, WorkbenchArchitectureCodeSymbol[]>> {
    const symbolsByPath = new Map<string, WorkbenchArchitectureCodeSymbol[]>()

    for (const path of [...new Set(paths)].sort()) {
      if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path)) continue
      const [text, readError] = await attemptAsync(() => Bun.file(join(this.target, path)).text())
      if (readError !== null || text === null) continue

      symbolsByPath.set(path, this.symbols(path, text))
    }

    return symbolsByPath
  }

  private symbols(path: string, text: string): WorkbenchArchitectureCodeSymbol[] {
    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      this.scriptKind(path),
    )
    const symbols: WorkbenchArchitectureCodeSymbol[] = []

    for (const statement of source.statements) {
      const exported = this.isExported(statement)

      if (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)
      ) {
        const name = statement.name?.text
        if (name === undefined) continue
        const kind = this.declarationKind(statement)
        symbols.push(this.symbol(path, source, name, kind, exported, statement))
        continue
      }

      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        const kind =
          declaration.initializer !== undefined &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
            ? "function"
            : "constant"
        symbols.push(this.symbol(path, source, declaration.name.text, kind, exported, declaration))
      }
    }

    return symbols.sort(
      (left, right) => left.line - right.line || left.name.localeCompare(right.name),
    )
  }

  private symbol(
    path: string,
    source: ts.SourceFile,
    name: string,
    kind: string,
    exported: boolean,
    node: ts.Node,
  ): WorkbenchArchitectureCodeSymbol {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

    return {
      ref: `symbol_${this.digest(`${path}\u0000${kind}\u0000${name}\u0000${line}`).slice(0, 12)}`,
      name,
      kind,
      kindLabel: KIND_LABELS[kind] ?? this.humanize(kind),
      exported,
      line,
    }
  }

  private declarationKind(
    statement:
      | ts.FunctionDeclaration
      | ts.ClassDeclaration
      | ts.InterfaceDeclaration
      | ts.TypeAliasDeclaration
      | ts.EnumDeclaration,
  ): string {
    if (ts.isFunctionDeclaration(statement)) return "function"
    if (ts.isClassDeclaration(statement)) return "class"
    if (ts.isInterfaceDeclaration(statement)) return "interface"
    if (ts.isTypeAliasDeclaration(statement)) return "type"

    return "enum"
  }

  private isExported(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []

    return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  }

  private scriptKind(path: string): ts.ScriptKind {
    const extension = extname(path)

    if (extension === ".tsx") return ts.ScriptKind.TSX
    if (extension === ".jsx") return ts.ScriptKind.JSX
    if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
      return ts.ScriptKind.JS
    }

    return ts.ScriptKind.TS
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Symbol"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  private digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex")
  }
}
