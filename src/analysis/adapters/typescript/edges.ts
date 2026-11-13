import { resolve } from "node:path"
import ts from "typescript"
import {
  IrIdentity,
  type IrCall,
  type IrElement,
  type IrFinding,
  type IrRelationship,
} from "../../ir"
import type { ScannedFile } from "../../types"
import { DataAccessClassifier } from "./data-access"
import type { ElementIndex } from "./element-index"
import type { TypeScriptProgram } from "./program"

interface SymbolResolution {
  target: string | null
  state: "resolved" | "ambiguous" | "unresolved" | "external"
  name: string
  filePath: string
  line: number
}

export interface EdgeResult {
  relationships: IrRelationship[]
  findings: IrFinding[]
}

export class TypeScriptEdgeExtractor {
  private readonly byId: Map<string, IrElement>
  private readonly pathByAbsolute = new Map<string, string>()
  private readonly relationships = new Map<string, IrRelationship>()
  private readonly findings = new Map<string, IrFinding>()

  constructor(
    private readonly typeScript: TypeScriptProgram,
    private readonly files: ScannedFile[],
    private readonly elements: IrElement[],
    private readonly index: ElementIndex,
  ) {
    this.byId = new Map(elements.map((element) => [element.id, element]))
    for (const file of files) {
      this.pathByAbsolute.set(this.normalize(resolve(file.absolutePath)), file.path)
    }
  }

  extract(): EdgeResult {
    for (const file of this.files) {
      const sourceFile = this.typeScript.program.getSourceFile(file.absolutePath)
      if (sourceFile === undefined) continue
      this.imports(sourceFile, file)
      this.visit(sourceFile, file)
    }

    return {
      relationships: [...this.relationships.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      findings: [...this.findings.values()].sort((left, right) => left.id.localeCompare(right.id)),
    }
  }

  private imports(sourceFile: ts.SourceFile, file: ScannedFile): void {
    const module = this.byId.get(IrIdentity.file(file.path))
    if (module === undefined) return
    module.imports = []
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
      const specifier = statement.moduleSpecifier
      if (specifier === undefined || !ts.isStringLiteral(specifier)) continue
      const resolved = ts.resolveModuleName(
        specifier.text,
        sourceFile.fileName,
        this.typeScript.program.getCompilerOptions(),
        ts.sys,
      ).resolvedModule
      const targetPath =
        resolved === undefined
          ? undefined
          : this.pathByAbsolute.get(this.normalize(resolved.resolvedFileName))
      module.imports.push({
        specifier: specifier.text,
        target: targetPath === undefined ? specifier.text : IrIdentity.file(targetPath),
        external: targetPath === undefined,
      })
      if (targetPath === undefined) continue
      this.addRelationship(
        module.id,
        IrIdentity.file(targetPath),
        "imports",
        "resolved",
        `typescript:${file.path}#import`,
      )
    }
  }

  private visit(sourceFile: ts.SourceFile, file: ScannedFile): void {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) this.call(node, sourceFile, file)
      if (ts.isNewExpression(node)) this.construct(node, sourceFile, file)
      if (ts.isIdentifier(node)) this.reference(node, sourceFile, file)
      if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        this.inheritance(node, sourceFile, file)
      }
      const accesses = DataAccessClassifier.classify(node, sourceFile)
      if (accesses.length > 0) this.dataAccess(node, accesses, file)
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  private call(node: ts.CallExpression, sourceFile: ts.SourceFile, file: ScannedFile): void {
    const owner = this.owner(node, file)
    if (owner === null) return
    const name = node.expression.getText(sourceFile).slice(0, 160)
    const resolved = this.resolveExpression(node.expression, sourceFile)
    const call: IrCall = {
      target: resolved.target,
      name,
      state: resolved.state,
      confidence: resolved.state === "resolved" ? "observed" : "ambiguous",
      provenance: `typescript:${file.path}:${this.line(sourceFile, node)}`,
    }
    if (
      !owner.calls.some(
        (existing) => existing.name === call.name && existing.target === call.target,
      )
    ) {
      owner.calls.push(call)
    }
    if (resolved.target !== null && resolved.target !== owner.id) {
      this.addRelationship(
        owner.id,
        resolved.target,
        "calls",
        resolved.state,
        `typescript:${file.path}:${this.line(sourceFile, node)}`,
      )
      return
    }
    if (resolved.state !== "unresolved") return
    this.unresolved(owner.id, name, file.path, this.line(sourceFile, node))
  }

  private construct(node: ts.NewExpression, sourceFile: ts.SourceFile, file: ScannedFile): void {
    const owner = this.owner(node, file)
    if (owner === null) return
    const resolved = this.resolveExpression(node.expression, sourceFile)
    if (resolved.target === null || resolved.target === owner.id) return
    this.addRelationship(
      owner.id,
      resolved.target,
      "calls",
      resolved.state,
      `typescript:${file.path}:${this.line(sourceFile, node)}`,
    )
  }

  private reference(node: ts.Identifier, sourceFile: ts.SourceFile, file: ScannedFile): void {
    if (this.isDeclarationName(node) || this.isMemberName(node)) return
    const owner = this.owner(node, file)
    if (owner === null) return
    const resolved = this.resolveExpression(node, sourceFile)
    if (resolved.target === null || resolved.target === owner.id) return
    if (!owner.references.includes(resolved.target)) owner.references.push(resolved.target)
    this.addRelationship(
      owner.id,
      resolved.target,
      "references",
      resolved.state,
      `typescript:${file.path}:${this.line(sourceFile, node)}`,
    )
  }

  private inheritance(
    node: ts.ClassDeclaration | ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
  ): void {
    const owner = this.owner(node, file)
    if (owner === null) return
    for (const clause of node.heritageClauses ?? []) {
      for (const type of clause.types) {
        const resolved = this.resolveExpression(type.expression, sourceFile)
        const kind = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements"
        owner.inheritance.push({
          kind,
          target: resolved.target,
          name: type.expression.getText(sourceFile),
        })
        if (resolved.target === null) continue
        this.addRelationship(
          owner.id,
          resolved.target,
          kind === "extends" ? "inherits" : "implements",
          resolved.state,
          `typescript:${file.path}:${this.line(sourceFile, type)}`,
        )
      }
    }
  }

  private dataAccess(
    node: ts.Node,
    accesses: ReturnType<typeof DataAccessClassifier.classify>,
    file: ScannedFile,
  ): void {
    const owner = this.owner(node, file)
    if (owner === null) return
    for (const access of accesses) {
      if (
        owner.dataAccess.some(
          (item) => item.channel === access.channel && item.line === access.line,
        )
      ) {
        continue
      }
      owner.dataAccess.push(access)
    }
  }

  private resolveExpression(
    expression: ts.Expression,
    sourceFile: ts.SourceFile,
  ): SymbolResolution {
    let symbol = this.typeScript.checker.getSymbolAtLocation(expression)
    if (symbol === undefined && ts.isPropertyAccessExpression(expression)) {
      symbol = this.typeScript.checker.getSymbolAtLocation(expression.name)
    }
    if (symbol === undefined) return this.unresolvedResolution(expression, sourceFile)
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      symbol = this.typeScript.checker.getAliasedSymbol(symbol)
    }
    const declarations = symbol.declarations ?? []
    const internal = declarations.flatMap((declaration) => {
      const filePath = this.pathByAbsolute.get(this.normalize(declaration.getSourceFile().fileName))
      if (filePath === undefined) return []
      const line =
        declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart()).line + 1
      return [{ filePath, line }]
    })
    if (internal.length === 0) {
      return {
        target: null,
        state: "external",
        name: expression.getText(sourceFile),
        filePath: "",
        line: this.line(sourceFile, expression),
      }
    }
    const first = internal[0]
    if (first === undefined) return this.unresolvedResolution(expression, sourceFile)
    const target = this.index.find(first.filePath, declarations[0]?.getStart() ?? 0)
    return {
      target: target ?? IrIdentity.file(first.filePath),
      state: internal.length > 1 ? "ambiguous" : "resolved",
      name: symbol.getName(),
      filePath: first.filePath,
      line: first.line,
    }
  }

  private unresolvedResolution(
    expression: ts.Expression,
    sourceFile: ts.SourceFile,
  ): SymbolResolution {
    return {
      target: null,
      state: "unresolved",
      name: expression.getText(sourceFile),
      filePath: "",
      line: this.line(sourceFile, expression),
    }
  }

  private owner(node: ts.Node, file: ScannedFile): IrElement | null {
    const id = this.index.find(file.path, node.getStart())
    if (id === null) return this.byId.get(IrIdentity.file(file.path)) ?? null

    return this.byId.get(id) ?? this.byId.get(IrIdentity.file(file.path)) ?? null
  }

  private addRelationship(
    sourceId: string,
    targetId: string,
    type: IrRelationship["type"],
    resolution: IrRelationship["resolution"],
    provenance: string,
  ): void {
    const id = IrIdentity.relationship(sourceId, type, targetId)
    if (this.relationships.has(id)) return
    this.relationships.set(id, {
      id,
      sourceId,
      targetId,
      type,
      resolution,
      confidence: resolution === "resolved" ? "observed" : "ambiguous",
      provenance,
      resolvedBy: "typescript-checker",
    })
  }

  private unresolved(ownerId: string, name: string, path: string, line: number): void {
    const id = IrIdentity.finding("IR-UNRESOLVED-CALL", ownerId, name)
    if (this.findings.has(id)) return
    this.findings.set(id, {
      id,
      ruleId: "IR-UNRESOLVED-CALL",
      family: "deterministic",
      title: "Unresolved call target",
      severity: "warning",
      status: "open",
      affectedElements: [ownerId],
      evidence: [{ kind: "source", reference: name, file: path, line }],
      explanation: "The call target cannot be resolved statically.",
      recommendation: "Inspect dynamic dispatch or add an explicit type annotation.",
      confidence: 0.5,
    })
  }

  private isDeclarationName(node: ts.Identifier): boolean {
    const parent = node.parent
    if (ts.isVariableDeclaration(parent) && parent.name === node) return true
    if (ts.isFunctionDeclaration(parent) && parent.name === node) return true
    if (ts.isClassDeclaration(parent) && parent.name === node) return true
    if (ts.isInterfaceDeclaration(parent) && parent.name === node) return true
    if (ts.isTypeAliasDeclaration(parent) && parent.name === node) return true
    if (ts.isEnumDeclaration(parent) && parent.name === node) return true
    if (ts.isParameter(parent) && parent.name === node) return true
    if (ts.isPropertyDeclaration(parent) && parent.name === node) return true
    if (ts.isMethodDeclaration(parent) && parent.name === node) return true
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return true

    return false
  }

  private isMemberName(node: ts.Identifier): boolean {
    return ts.isPropertyAccessExpression(node.parent) && node.parent.name === node
  }

  private line(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
  }

  private normalize(path: string): string {
    return path.split("\\").join("/")
  }
}
