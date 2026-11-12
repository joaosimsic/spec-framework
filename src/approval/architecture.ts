import { join } from "node:path"
import {
  C4_ID_COMMENT,
  collectC4Files,
  formatC4Annotation,
  parseC4,
  parseC4Annotation,
  type ArchitectureStatus,
  type C4Element,
  type C4Relationship,
} from "../core/c4"
import { attemptAsync, type Result } from "../core/result"
import { architectureContentHash } from "./hash"

export const ARCHITECTURE_PREFIXES = ["SYS-", "CMP-", "DAT-", "EXT-", "ACTOR-"] as const

export interface ArchitectureCatalog {
  elements: C4Element[]
  relationships: C4Relationship[]
}

export function isArchitectureId(id: string): boolean {
  return ARCHITECTURE_PREFIXES.some((prefix) => id.startsWith(prefix))
}

export class ArchitectureCatalogLoader {
  constructor(private readonly target: string) {}

  async load(): Promise<Result<ArchitectureCatalog, string>> {
    const files = await collectC4Files(join(this.target, "spec", "architecture"))
    if (files.length === 0) return [null, "no LikeC4 architecture sources found"]

    const elements: C4Element[] = []
    const relationships: C4Relationship[] = []

    for (const file of files) {
      const [text, readError] = await attemptAsync(() => Bun.file(file).text())
      if (readError !== null || text === null) {
        return [null, readError === null ? `cannot read ${file}` : readError]
      }

      const parsed = parseC4(file, text)
      elements.push(...parsed.elements)
      relationships.push(...parsed.relationships)
    }

    return [{ elements, relationships }, null]
  }
}

export function findArchitectureElement(
  catalog: ArchitectureCatalog,
  id: string,
): C4Element | null {
  return catalog.elements.find((element) => element.id === id) ?? null
}

export function architectureElementHash(catalog: ArchitectureCatalog, element: C4Element): string {
  return architectureContentHash(element, catalog.relationships)
}

export class ArchitectureStatusWriter {
  constructor(private readonly target: string) {}

  async write(ids: Set<string>, status: ArchitectureStatus): Promise<Result<string[], string>> {
    const files = await collectC4Files(join(this.target, "spec", "architecture"))
    const pending = new Set(ids)
    const written: string[] = []

    for (const file of files) {
      const [text, readError] = await attemptAsync(() => Bun.file(file).text())
      if (readError !== null || text === null) {
        return [null, readError === null ? `cannot read ${file}` : readError]
      }

      const [updated, changed] = this.rewrite(text, pending, status)
      if (!changed) continue

      const [, writeError] = await attemptAsync(() => Bun.write(file, updated))
      if (writeError !== null) return [null, `cannot write ${file}: ${writeError}`]

      written.push(file)
    }

    if (pending.size > 0) {
      return [null, `architecture element(s) not found: ${[...pending].sort().join(", ")}`]
    }

    return [written, null]
  }

  private rewrite(
    text: string,
    pending: Set<string>,
    status: ArchitectureStatus,
  ): [string, boolean] {
    const newline = text.includes("\r\n") ? "\r\n" : "\n"
    const lines = text.split(newline)
    let changed = false

    for (const [index, line] of lines.entries()) {
      const match = C4_ID_COMMENT.exec(line)
      if (match === null) continue

      const id = match[1] ?? ""
      if (!pending.has(id)) continue

      const annotation = parseC4Annotation(match[2] ?? "")
      annotation.status = status
      const indent = /^\s*/.exec(line)?.[0] ?? ""
      const formatted = formatC4Annotation(annotation)
      lines[index] = formatted === "" ? `${indent}// ${id}` : `${indent}// ${id} ${formatted}`
      pending.delete(id)
      changed = true
    }

    return [lines.join(newline), changed]
  }
}
