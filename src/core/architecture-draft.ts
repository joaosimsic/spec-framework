import { uniqueElementId } from "../discovery/ids"
import type { DraftElement, DraftLink, MapReport } from "../discovery/types"
import { ArchitectureDraftLabels } from "./architecture-labels"

const EXTERNAL_SEPARATOR = " -> "

interface DraftContext {
  elements: DraftElement[]
  byId: Map<string, DraftElement>
  parentByModule: Map<string, string>
  modulesByParent: Map<string, string[]>
}

export class ArchitectureDraftBuilder {
  build(report: MapReport): DraftElement[] {
    const context = this.context(report)
    const elements = context.elements.map((element) => this.draftElement(element, context))
    this.addExternalSystems(report, elements)

    return elements.sort((left, right) => left.id.localeCompare(right.id))
  }

  private context(report: MapReport): DraftContext {
    const elements = report.elements.filter((element) => element.kind !== "module")
    const byId = new Map(elements.map((element) => [element.id, element]))
    const parentByModule = new Map<string, string>()
    const modulesByParent = new Map<string, string[]>()

    for (const element of report.elements) {
      if (element.kind !== "module") continue
      const parent = this.parentOf(element)
      if (parent === undefined) continue
      parentByModule.set(element.id, parent)
      const modules = modulesByParent.get(parent) ?? []
      modules.push(element.title)
      modulesByParent.set(parent, modules)
    }

    return { elements, byId, parentByModule, modulesByParent }
  }

  private parentOf(element: DraftElement): string | undefined {
    return element.links.find((link) => link.type === "part_of")?.to
  }

  private draftElement(element: DraftElement, context: DraftContext): DraftElement {
    const modules = context.modulesByParent.get(element.id) ?? []
    const codePaths = ArchitectureDraftLabels.codePaths(element, modules)
    const title = ArchitectureDraftLabels.title(element, modules)
    const links = this.links(element, context)

    return {
      ...element,
      title,
      links,
      ...(codePaths.length === 0 ? {} : { codePaths }),
    }
  }

  private links(element: DraftElement, context: DraftContext): DraftLink[] {
    const links = element.links.flatMap((link) => {
      const target = this.resolveTarget(link.to, context)
      if (target === undefined || target === element.id) return []

      return [{ ...link, to: target }]
    })

    return this.uniqueLinks(links)
  }

  private resolveTarget(target: string, context: DraftContext): string | undefined {
    if (context.byId.has(target)) return target
    const parent = context.parentByModule.get(target)
    if (parent === undefined) return undefined

    return context.byId.has(parent) ? parent : undefined
  }

  private uniqueLinks(links: DraftLink[]): DraftLink[] {
    const unique = new Map<string, DraftLink>()
    for (const link of links) unique.set(`${link.type}\u0000${link.to}`, link)

    return [...unique.values()].sort((left, right) => {
      const typeOrder = left.type.localeCompare(right.type)

      return typeOrder === 0 ? left.to.localeCompare(right.to) : typeOrder
    })
  }

  private addExternalSystems(report: MapReport, elements: DraftElement[]): void {
    const used = new Set(elements.map((element) => element.id))
    const byId = new Map(elements.map((element) => [element.id, element]))
    const externalIds = new Map(
      elements
        .filter((element) => element.kind === "external_system")
        .map((element) => [element.title, element.id]),
    )

    for (const dependency of report.gaps.externalDependencies) {
      const separator = dependency.indexOf(EXTERNAL_SEPARATOR)
      if (separator === -1) continue
      const sourceId = dependency.slice(0, separator)
      const name = dependency.slice(separator + EXTERNAL_SEPARATOR.length).trim()
      const source = byId.get(sourceId)
      if (source === undefined || name === "") continue
      const targetId = this.externalId(name, used, externalIds)
      if (targetId === source.id) continue
      if (!byId.has(targetId)) {
        const external = this.externalSystem(targetId, name)
        elements.push(external)
        byId.set(targetId, external)
      }
      const link: DraftLink = {
        type: "depends_on",
        to: targetId,
        confidence: "inferred",
        provenance: `code:${name}`,
      }
      source.links = this.uniqueLinks([...source.links, link])
    }
  }

  private externalId(name: string, used: Set<string>, externalIds: Map<string, string>): string {
    const existing = externalIds.get(name)
    if (existing !== undefined) return existing
    const id = uniqueElementId("EXT", name, used)
    externalIds.set(name, id)

    return id
  }

  private externalSystem(id: string, title: string): DraftElement {
    return {
      id,
      kind: "external_system",
      title,
      status: "draft",
      provenance: `code:${title}`,
      confidence: "inferred",
      links: [],
    }
  }
}
