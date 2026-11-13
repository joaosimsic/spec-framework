import ts from "typescript"
import type { ScannedFile } from "../../types"
import { IrIdentity, type IrElement, type IrElementType, type IrVisibility } from "../../ir"
import { ElementIndex } from "./element-index"

const TYPE_ALIAS_LABEL = "type_alias"

export interface ExtractedElements {
  elements: IrElement[]
  index: ElementIndex
}

export class TypeScriptElementExtractor {
  constructor(private readonly checker: ts.TypeChecker) {}

  extract(sourceFile: ts.SourceFile, file: ScannedFile): ExtractedElements {
    const elements: IrElement[] = []
    const index = new ElementIndex()
    const used = new Set<string>()
    const module = this.moduleElement(sourceFile, file)
    elements.push(module)
    index.add({
      id: module.id,
      filePath: file.path,
      start: sourceFile.getStart(sourceFile),
      end: sourceFile.getEnd(),
    })
    used.add(module.id)

    for (const statement of sourceFile.statements) {
      this.statement(statement, sourceFile, file, module, elements, index, used, null)
    }

    return {
      elements: elements.sort((left, right) => left.id.localeCompare(right.id)),
      index,
    }
  }

  private statement(
    statement: ts.Statement,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    parent: IrElement,
    elements: IrElement[],
    index: ElementIndex,
    used: Set<string>,
    className: string | null,
  ): void {
    if (ts.isVariableStatement(statement)) {
      this.variables(statement, sourceFile, file, parent, elements, index, used)
      return
    }
    if (!this.isNamedDeclaration(statement)) return
    const name = this.nameOf(statement.name)
    if (name === null) return
    const type = this.declarationType(statement)
    if (type === null) return

    const qualifiedName = className === null ? name : `${className}.${name}`
    const element = this.element(
      statement,
      sourceFile,
      file,
      parent,
      type,
      name,
      qualifiedName,
      used,
    )
    elements.push(element)
    index.add(this.span(element, statement, sourceFile, file))
    if (ts.isClassDeclaration(statement)) {
      this.classMembers(statement, sourceFile, file, element, elements, index, used)
    }
    if (ts.isInterfaceDeclaration(statement)) {
      this.interfaceMembers(statement, sourceFile, file, element, elements, index, used)
    }
  }

  private variables(
    statement: ts.VariableStatement,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    parent: IrElement,
    elements: IrElement[],
    index: ElementIndex,
    used: Set<string>,
  ): void {
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue
      const name = declaration.name.text
      const callable =
        declaration.initializer !== undefined &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      const type: IrElementType = callable ? "function" : "constant"
      const element = this.element(declaration, sourceFile, file, parent, type, name, name, used)
      elements.push(element)
      index.add(this.span(element, declaration, sourceFile, file))
    }
  }

  private classMembers(
    declaration: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    parent: IrElement,
    elements: IrElement[],
    index: ElementIndex,
    used: Set<string>,
  ): void {
    for (const member of declaration.members) {
      if (ts.isConstructorDeclaration(member)) {
        const element = this.element(
          member,
          sourceFile,
          file,
          parent,
          "method",
          "constructor",
          `${parent.name}.constructor`,
          used,
        )
        elements.push(element)
        index.add(this.span(element, member, sourceFile, file))
        continue
      }
      if (!("name" in member) || member.name === undefined || !ts.isIdentifier(member.name))
        continue
      const name = member.name.text
      if (ts.isMethodDeclaration(member)) {
        this.pushMember(member, "method", name, sourceFile, file, parent, elements, index, used)
        continue
      }
      if (ts.isPropertyDeclaration(member)) {
        this.pushMember(member, "property", name, sourceFile, file, parent, elements, index, used)
        continue
      }
      if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
        this.pushMember(member, "method", name, sourceFile, file, parent, elements, index, used)
      }
    }
  }

  private interfaceMembers(
    declaration: ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    parent: IrElement,
    elements: IrElement[],
    index: ElementIndex,
    used: Set<string>,
  ): void {
    for (const member of declaration.members) {
      if (!("name" in member) || member.name === undefined || !ts.isIdentifier(member.name))
        continue
      const name = member.name.text
      if (ts.isMethodSignature(member)) {
        this.pushMember(member, "method", name, sourceFile, file, parent, elements, index, used)
        continue
      }
      if (ts.isPropertySignature(member)) {
        this.pushMember(member, "property", name, sourceFile, file, parent, elements, index, used)
      }
    }
  }

  private pushMember(
    node: ts.Node,
    type: IrElementType,
    name: string,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    parent: IrElement,
    elements: IrElement[],
    index: ElementIndex,
    used: Set<string>,
  ): void {
    const element = this.element(
      node,
      sourceFile,
      file,
      parent,
      type,
      name,
      `${parent.name}.${name}`,
      used,
    )
    elements.push(element)
    index.add(this.span(element, node, sourceFile, file))
  }

  private element(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    file: ScannedFile,
    parent: IrElement,
    type: IrElementType,
    name: string,
    qualifiedName: string,
    used: Set<string>,
  ): IrElement {
    const baseId = IrIdentity.symbol(file.path, qualifiedName)
    const id = this.unique(baseId, used)
    return {
      id,
      type,
      language: file.language,
      name,
      qualifiedName,
      filePath: file.path,
      startLine: this.line(sourceFile, node.getStart(sourceFile)),
      endLine: this.line(sourceFile, node.getEnd()),
      parentId: parent.id,
      signature: this.signature(node, sourceFile),
      visibility: this.visibility(node, parent),
      exported: this.exported(node),
      references: [],
      calls: [],
      imports: [],
      inheritance: [],
      dataAccess: [],
      confidence: "observed",
      provenance: `typescript:${file.path}:${this.line(sourceFile, node.getStart(sourceFile))}`,
    }
  }

  private moduleElement(sourceFile: ts.SourceFile, file: ScannedFile): IrElement {
    const endLine = this.line(sourceFile, sourceFile.getEnd())
    return {
      id: IrIdentity.file(file.path),
      type: "module",
      language: file.language,
      name: file.path,
      qualifiedName: file.path,
      filePath: file.path,
      startLine: 1,
      endLine,
      parentId: null,
      signature: file.path,
      visibility: "internal",
      exported: false,
      references: [],
      calls: [],
      imports: [],
      inheritance: [],
      dataAccess: [],
      confidence: "observed",
      provenance: `typescript:${file.path}`,
    }
  }

  private span(element: IrElement, node: ts.Node, sourceFile: ts.SourceFile, file: ScannedFile) {
    return {
      id: element.id,
      filePath: file.path,
      start: node.getStart(sourceFile),
      end: node.getEnd(),
    }
  }

  private nameOf(name: ts.DeclarationName | undefined): string | null {
    return name !== undefined && ts.isIdentifier(name) ? name.text : null
  }

  private declarationType(node: ts.NamedDeclaration): IrElementType | null {
    if (ts.isFunctionDeclaration(node)) return "function"
    if (ts.isClassDeclaration(node)) return "class"
    if (ts.isInterfaceDeclaration(node)) return "interface"
    if (ts.isTypeAliasDeclaration(node)) return TYPE_ALIAS_LABEL
    if (ts.isEnumDeclaration(node)) return "enum"

    return null
  }

  private isNamedDeclaration(node: ts.Node): node is ts.NamedDeclaration {
    return (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    )
  }

  private visibility(node: ts.Node, parent: IrElement): IrVisibility {
    if (parent.type !== "class" && parent.type !== "interface") {
      return this.exported(node) ? "public" : "internal"
    }
    const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword))
      return "private"
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ProtectedKeyword)) {
      return "protected"
    }

    return "public"
  }

  private exported(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []

    return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  }

  private signature(node: ts.Node, sourceFile: ts.SourceFile): string {
    const text = node.getText(sourceFile).replace(/\s+/g, " ").trim()
    const brace = text.indexOf("{")
    const signature = brace === -1 ? text : text.slice(0, brace).trim()

    return signature.slice(0, 240)
  }

  private line(sourceFile: ts.SourceFile, position: number): number {
    return sourceFile.getLineAndCharacterOfPosition(position).line + 1
  }

  private unique(base: string, used: Set<string>): string {
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    let suffix = 2
    while (used.has(`${base}~${suffix}`)) suffix += 1
    const id = `${base}~${suffix}`
    used.add(id)

    return id
  }
}
