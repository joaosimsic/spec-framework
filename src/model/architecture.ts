import { basename, join, relative } from "node:path"
import { collectC4Files, parseC4, type C4Element, type C4Relationship } from "../core/c4"
import { attemptAsync } from "../core/result"
import type { GraphContribution, GraphElement, GraphFinding, GraphLink } from "./types"

export interface ArchitectureSources {
  elements: C4Element[]
  relationships: C4Relationship[]
  findings: GraphFinding[]
}

export async function loadArchitectureSources(target: string): Promise<ArchitectureSources> {
  const files = await collectC4Files(join(target, "spec", "architecture"))
  const elements: C4Element[] = []
  const relationships: C4Relationship[] = []
  const findings: GraphFinding[] = []

  for (const file of files) {
    const [text, readError] = await attemptAsync(() => Bun.file(file).text())
    if (readError !== null || text === null) {
      findings.push({
        level: "warning",
        code: "ARCH-SOURCE-READ",
        message: `cannot read architecture source ${basename(file)}: ${readError ?? "unknown error"}`,
      })
      continue
    }

    const parsed = parseC4(relative(target, file), text)
    elements.push(...parsed.elements)
    relationships.push(...parsed.relationships)
  }

  return { elements, relationships, findings }
}

export class ArchitectureGraphSource {
  collect(
    sources: ArchitectureSources,
    knownIds: ReadonlySet<string> = new Set(),
  ): GraphContribution {
    const byAlias = new Map<string, C4Element>()
    const byId = new Map<string, C4Element>()
    const findings: GraphFinding[] = [...sources.findings]

    for (const element of sources.elements) {
      if (element.id === null) {
        findings.push({
          level: "warning",
          code: "ARCH-UNANNOTATED",
          message: `${element.file}:${element.line} '${element.alias}' has no stable ID comment`,
        })
        continue
      }
      if (knownIds.has(element.id)) continue
      if (byId.has(element.id)) {
        findings.push({
          level: "warning",
          code: "ARCH-DUPLICATE-ID",
          message: `duplicate architecture element '${element.id}'`,
          id: element.id,
        })
        continue
      }
      byAlias.set(element.alias, element)
      byId.set(element.id, element)
    }

    const links = new Map<string, GraphLink[]>()
    for (const relationship of sources.relationships) {
      const source = byAlias.get(relationship.source)
      const target = byAlias.get(relationship.target)
      if (source?.id === null || target?.id === null) continue
      if (source === undefined || target === undefined) continue

      if (relationship.label === "contains") {
        this.addLink(links, target.id, { type: "part_of", to: source.id })
        continue
      }

      this.addLink(links, source.id, {
        type: this.relationType(relationship.label),
        to: target.id,
      })
    }

    const elements: GraphElement[] = [...byId.values()]
      .map((element) => ({
        id: element.id as string,
        kind: element.kind,
        title: element.title,
        links: links.get(element.id as string) ?? [],
      }))
      .sort((left, right) => left.id.localeCompare(right.id))

    return { elements, findings }
  }

  private addLink(links: Map<string, GraphLink[]>, from: string, link: GraphLink): void {
    const current = links.get(from) ?? []
    if (current.some((candidate) => candidate.type === link.type && candidate.to === link.to)) {
      return
    }
    current.push(link)
    links.set(from, current)
  }

  private relationType(label: string): string {
    const normalized = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")

    return normalized === "" ? "relation" : normalized
  }
}
