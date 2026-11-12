import { join } from "node:path"
import {
  collectC4Files,
  escapeTitle,
  formatC4Annotation,
  parseC4,
  C4_ID_COMMENT,
  type C4Annotation,
  type C4Element,
  type C4Relationship,
} from "../core/c4"
import { architectureContentHash } from "../approval/hash"
import { likec4Alias } from "../discovery/ids"
import { attemptAsync, type Result } from "../core/result"

export interface ArchitectureFile {
  path: string
  text: string
  original: string
  changed: boolean
}

interface C4Document {
  path: string
  original: string
  newline: string
  lines: string[]
}

export class ArchitectureEditor {
  private readonly documents: C4Document[]
  private elements: C4Element[] = []
  private relationships: C4Relationship[] = []

  private constructor(documents: C4Document[]) {
    this.documents = documents
    this.refresh()
  }

  static async load(target: string): Promise<Result<ArchitectureEditor, string>> {
    const files = await collectC4Files(join(target, "spec", "architecture"))
    const documents: C4Document[] = []

    for (const path of files) {
      const [text, readError] = await attemptAsync(() => Bun.file(path).text())
      if (readError !== null || text === null) {
        return [null, readError === null ? `cannot read ${path}` : readError]
      }
      documents.push({
        path,
        original: text,
        newline: text.includes("\r\n") ? "\r\n" : "\n",
        lines: text.split(text.includes("\r\n") ? "\r\n" : "\n"),
      })
    }

    if (documents.length === 0) {
      return [null, "no LikeC4 architecture sources found under spec/architecture"]
    }

    return [new ArchitectureEditor(documents), null]
  }

  hasElement(id: string): boolean {
    return this.element(id) !== null
  }

  element(id: string): C4Element | null {
    const explicit = this.elements.find((element) => element.id === id)
    if (explicit !== undefined) return explicit

    const aliases = this.aliasCandidates(id)
    for (const alias of aliases) {
      const element = this.elements.find(
        (candidate) => candidate.alias === alias && candidate.id === null,
      )
      if (element !== undefined) return element
    }

    return null
  }

  titleFor(id: string): string | null {
    return this.element(id)?.title ?? null
  }

  parentId(childId: string): string | null {
    const child = this.element(childId)
    if (child === null) return null

    const parent = this.parentRelationship(child.alias)
    if (parent === null) return null

    return this.elementByAlias(parent.source)?.id ?? null
  }

  hashFor(id: string): string | null {
    const element = this.element(id)
    if (element === null) return null

    return architectureContentHash(element, this.relationships)
  }

  ensureElementKind(kind: string): Result<boolean, string> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(kind)) return [null, `invalid element kind '${kind}'`]

    const [document, documentError] = this.writeDocument()
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, "no writable architecture document"]

    if (this.hasKindDeclaration(document, kind)) return [true, null]

    const [closeIndex, closeError] = this.blockCloseIndex(document, "specification")
    if (closeError !== null) return [null, closeError]
    if (closeIndex === null) return [null, "architecture specification block not found"]

    const closing = document.lines[closeIndex] ?? "}"
    const indent = /^\s*/.exec(closing)?.[0] ?? ""
    document.lines.splice(closeIndex, 0, `${indent}  element ${kind}`)
    this.refresh()

    return [true, null]
  }

  setAnnotation(id: string, annotation: C4Annotation): Result<boolean, string> {
    this.refresh()
    const element = this.element(id)
    if (element === null) return [null, `unknown architecture element '${id}'`]

    const document = this.documents.find((candidate) => candidate.path === element.file)
    if (document === undefined) return [null, `cannot load ${element.file}`]

    const annotationIndex = element.line - 2
    const existing = document.lines[annotationIndex]
    const indent = /^\s*/.exec(document.lines[element.line - 1] ?? "")?.[0] ?? ""
    const formatted = formatC4Annotation(annotation)
    const line = formatted === "" ? `${indent}// ${id}` : `${indent}// ${id} ${formatted}`

    if (existing !== undefined && C4_ID_COMMENT.exec(existing)?.[1] === id) {
      document.lines[annotationIndex] = line
    } else {
      document.lines.splice(element.line - 1, 0, line)
    }
    this.refresh()

    return [true, null]
  }

  addRelation(sourceId: string, targetId: string, type: string): Result<boolean, string> {
    const [, sourceAnnotationError] = this.annotateElement(sourceId)
    if (sourceAnnotationError !== null) return [null, sourceAnnotationError]
    const [, targetAnnotationError] = this.annotateElement(targetId)
    if (targetAnnotationError !== null) return [null, targetAnnotationError]
    this.refresh()

    const source = this.element(sourceId)
    if (source === null) return [null, `unknown architecture element '${sourceId}'`]
    const target = this.element(targetId)
    if (target === null) return [null, `unknown architecture element '${targetId}'`]
    if (source.alias === target.alias) return [null, "an element cannot relate to itself"]

    const containment = type === "part_of"
    const sourceAlias = containment ? target.alias : source.alias
    const targetAlias = containment ? source.alias : target.alias
    const label = containment ? "contains" : type
    const exists = this.relationships.some(
      (relationship) =>
        relationship.source === sourceAlias &&
        relationship.target === targetAlias &&
        relationship.label === label,
    )
    if (exists) return [true, null]

    const [document, documentError] = this.writeDocument()
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, "no writable architecture document"]

    const [inserted, insertError] = this.insertModelLines(document, [
      `${sourceAlias} -> ${targetAlias} '${escapeTitle(label)}'`,
    ])
    if (insertError !== null) return [null, insertError]
    if (!inserted) return [null, "relation was not added"]
    this.refresh()

    return [true, null]
  }

  addElement(id: string, title: string, kind: string, parentId?: string): Result<string, string> {
    this.refresh()
    if (this.hasElement(id)) return [null, `architecture element '${id}' already exists`]
    if (title.trim() === "") return [null, "new component requires a title"]
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(kind)) return [null, `invalid element kind '${kind}'`]

    const [document, documentError] = this.writeDocument()
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, "no writable architecture document"]

    const alias = this.uniqueAlias(likec4Alias(id))
    const [inserted, insertError] = this.insertModelLines(document, [
      `// ${id} proposed`,
      `${alias} = ${kind} '${escapeTitle(title)}'`,
    ])
    if (insertError !== null) return [null, insertError]
    if (!inserted) return [null, "component was not added"]

    this.refresh()
    if (parentId !== undefined) {
      const [linked, linkError] = this.addContainment(parentId, id)
      if (linkError !== null) return [null, linkError]
      if (!linked) return [null, "component parent was not linked"]
    }

    return [alias, null]
  }

  moveContainment(childId: string, newParentId: string): Result<boolean, string> {
    const [, childAnnotationError] = this.annotateElement(childId)
    if (childAnnotationError !== null) return [null, childAnnotationError]
    const [, parentAnnotationError] = this.annotateElement(newParentId)
    if (parentAnnotationError !== null) return [null, parentAnnotationError]
    this.refresh()

    const child = this.element(childId)
    if (child === null) return [null, `unknown architecture element '${childId}'`]
    const newParent = this.element(newParentId)
    if (newParent === null) return [null, `unknown architecture element '${newParentId}'`]
    if (child.alias === newParent.alias) return [null, "an element cannot contain itself"]

    const cycle = this.createsCycle(child.alias, newParent.alias)
    if (cycle) return [null, "move would create a containment cycle"]

    const children = this.relationships.filter(
      (relationship) => relationship.label === "contains" && relationship.target === child.alias,
    )
    if (children.length > 1) {
      return [null, `element '${childId}' has multiple containment relations`]
    }

    const existing = children[0]
    if (existing === undefined) {
      return this.addContainment(newParentId, childId)
    }
    if (existing.source === newParent.alias) return [true, null]

    const document = this.documents.find((candidate) => candidate.path === existing.file)
    if (document === undefined) return [null, `cannot load ${existing.file}`]
    const line = document.lines[existing.line - 1]
    if (line === undefined) return [null, "containment relation line disappeared"]
    const indent = /^\s*/.exec(line)?.[0] ?? ""
    document.lines[existing.line - 1] = `${indent}${newParent.alias} -> ${child.alias} 'contains'`
    this.refresh()

    return [true, null]
  }

  files(): ArchitectureFile[] {
    return this.documents
      .map((document) => {
        const text = document.lines.join(document.newline)
        return {
          path: document.path,
          text,
          original: document.original,
          changed: text !== document.original,
        }
      })
      .sort((left, right) => left.path.localeCompare(right.path))
  }

  private refresh(): void {
    const elements: C4Element[] = []
    const relationships: C4Relationship[] = []

    for (const document of this.documents) {
      const parsed = parseC4(document.path, document.lines.join(document.newline))
      elements.push(...parsed.elements)
      relationships.push(...parsed.relationships)
    }

    this.elements = elements
    this.relationships = relationships
  }

  private addContainment(parentId: string, childId: string): Result<boolean, string> {
    const [, parentAnnotationError] = this.annotateElement(parentId)
    if (parentAnnotationError !== null) return [null, parentAnnotationError]
    const [, childAnnotationError] = this.annotateElement(childId)
    if (childAnnotationError !== null) return [null, childAnnotationError]
    this.refresh()

    const parent = this.element(parentId)
    if (parent === null) return [null, `unknown architecture element '${parentId}'`]
    const child = this.element(childId)
    if (child === null) return [null, `unknown architecture element '${childId}'`]
    if (parent.alias === child.alias) return [null, "an element cannot contain itself"]

    if (this.createsCycle(child.alias, parent.alias)) {
      return [null, "move would create a containment cycle"]
    }

    const exists = this.relationships.some(
      (relationship) =>
        relationship.label === "contains" &&
        relationship.source === parent.alias &&
        relationship.target === child.alias,
    )
    if (exists) return [true, null]

    const [document, documentError] = this.writeDocument()
    if (documentError !== null) return [null, documentError]
    if (document === null) return [null, "no writable architecture document"]

    const [inserted, insertError] = this.insertModelLines(document, [
      `${parent.alias} -> ${child.alias} 'contains'`,
    ])
    if (insertError !== null) return [null, insertError]
    if (!inserted) return [null, "containment relation was not added"]
    this.refresh()

    return [true, null]
  }

  private annotateElement(id: string): Result<boolean, string> {
    this.refresh()
    const element = this.element(id)
    if (element === null) return [null, `unknown architecture element '${id}'`]
    if (element.id !== null) return [true, null]

    const document = this.documents.find((candidate) => candidate.path === element.file)
    if (document === undefined) return [null, `cannot load ${element.file}`]
    const line = document.lines[element.line - 1]
    if (line === undefined) return [null, "architecture element line disappeared"]
    const indent = /^\s*/.exec(line)?.[0] ?? ""
    document.lines.splice(element.line - 1, 0, `${indent}// ${id}`)
    this.refresh()

    return [true, null]
  }

  private parentRelationship(childAlias: string): C4Relationship | null {
    return (
      this.relationships.find(
        (relationship) => relationship.label === "contains" && relationship.target === childAlias,
      ) ?? null
    )
  }

  private createsCycle(childAlias: string, newParentAlias: string): boolean {
    const parentByAlias = new Map<string, string>()
    for (const relationship of this.relationships) {
      if (relationship.label !== "contains") continue
      parentByAlias.set(relationship.target, relationship.source)
    }

    let current: string | undefined = newParentAlias
    const visited = new Set<string>()
    while (current !== undefined && !visited.has(current)) {
      if (current === childAlias) return true
      visited.add(current)
      current = parentByAlias.get(current)
    }

    return false
  }

  private insertModelLines(document: C4Document, lines: string[]): Result<boolean, string> {
    const [closeIndex, closeError] = this.modelCloseIndex(document)
    if (closeError !== null) return [null, closeError]
    if (closeIndex === null) return [null, "architecture model block not found"]

    const closing = document.lines[closeIndex] ?? "}"
    const indent = /^\s*/.exec(closing)?.[0] ?? ""
    const body = lines.map((line) => `${indent}  ${line}`)
    const previous = document.lines[closeIndex - 1]
    const prefix = previous === undefined || previous.trim() === "" ? [] : [""]
    document.lines.splice(closeIndex, 0, ...prefix, ...body)

    return [true, null]
  }

  private modelCloseIndex(document: C4Document): Result<number | null, string> {
    return this.blockCloseIndex(document, "model")
  }

  private blockCloseIndex(document: C4Document, block: string): Result<number | null, string> {
    const pattern = new RegExp(`^\\s*${block}\\s*\\{\\s*$`)
    const start = document.lines.findIndex((line) => pattern.test(line))
    if (start === -1) return [null, `architecture ${block} block not found`]

    let depth = 0
    for (let index = start; index < document.lines.length; index++) {
      const line = structuralLine(document.lines[index] ?? "")
      depth += count(line, "{")
      depth -= count(line, "}")
      if (depth === 0) return [index, null]
    }

    return [null, `architecture ${block} block is not closed`]
  }

  private hasKindDeclaration(document: C4Document, kind: string): boolean {
    const [closeIndex, closeError] = this.blockCloseIndex(document, "specification")
    if (closeError !== null || closeIndex === null) return false

    const start = document.lines.findIndex((line) => /^\s*specification\s*\{\s*$/.test(line))
    if (start === -1) return false
    const pattern = new RegExp(`^\\s*element\\s+${kind}\\s*$`)

    return document.lines.slice(start, closeIndex).some((line) => pattern.test(line))
  }

  private writeDocument(): Result<C4Document | null, string> {
    const model = this.documents.find((document) => document.path.endsWith("model.c4"))
    if (model !== undefined) return [model, null]

    return [this.documents[0] ?? null, null]
  }

  private elementByAlias(alias: string): C4Element | null {
    return this.elements.find((element) => element.alias === alias) ?? null
  }

  private uniqueAlias(base: string): string {
    const used = new Set(this.elements.map((element) => element.alias))
    let alias = base
    let suffix = 2
    while (used.has(alias)) {
      alias = `${base}${suffix}`
      suffix += 1
    }

    return alias
  }

  private aliasCandidates(id: string): string[] {
    const prefix = id.split("-")[0] ?? ""
    const rest = id.split("-").slice(1).join("-")
    const candidates = [likec4Alias(id), likec4Alias(rest)]
    if (prefix !== "" && rest !== "") candidates.push(rest.toLowerCase())

    return [...new Set(candidates.filter(Boolean))]
  }
}

function count(value: string, needle: string): number {
  return value.split(needle).length - 1
}

function structuralLine(value: string): string {
  return value.replace(/'(?:\\.|[^'])*'/g, "''").replace(/\/\/.*$/, "")
}
