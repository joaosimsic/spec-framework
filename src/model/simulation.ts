import {
  SIMULATION_VERSION,
  type GraphSimulation,
  type SimulationElement,
} from "./simulation-types"
import type { GraphElement, SpecGraph } from "./types"

const COMPARED_FIELDS = [
  "kind",
  "title",
  "status",
  "owner",
  "provenance",
  "confidence",
  "links",
] as const

export class GraphSimulator {
  simulate(before: SpecGraph, after: SpecGraph): GraphSimulation {
    const beforeById = this.byId(before.elements)
    const afterById = this.byId(after.elements)
    const added = [...afterById.keys()]
      .filter((id) => !beforeById.has(id))
      .map((id) => this.elementFor(afterById.get(id) as GraphElement))
      .sort(this.compare)
    const removed = [...beforeById.keys()]
      .filter((id) => !afterById.has(id))
      .map((id) => this.elementFor(beforeById.get(id) as GraphElement))
      .sort(this.compare)
    const modified = [...afterById.keys()]
      .filter((id) => beforeById.has(id))
      .map((id) =>
        this.modifiedElement(beforeById.get(id) as GraphElement, afterById.get(id) as GraphElement),
      )
      .filter((element): element is SimulationElement => element !== null)
      .sort(this.compare)

    return {
      version: SIMULATION_VERSION,
      available: true,
      baseline_commit: before.commit,
      current_commit: after.commit,
      added,
      removed,
      modified,
    }
  }

  private byId(elements: GraphElement[]): Map<string, GraphElement> {
    return new Map(elements.map((element) => [element.id, element] as const))
  }

  private elementFor(element: GraphElement): SimulationElement {
    return {
      id: element.id,
      kind: element.kind,
      title: element.title ?? "",
      changed: [],
    }
  }

  private modifiedElement(before: GraphElement, after: GraphElement): SimulationElement | null {
    const changed = COMPARED_FIELDS.filter((field) => this.fieldChanged(field, before, after))
    if (changed.length === 0) return null

    return {
      id: after.id,
      kind: after.kind,
      title: after.title ?? "",
      ...(before.title === after.title ? {} : { previous_title: before.title ?? "" }),
      changed: [...changed],
    }
  }

  private fieldChanged(
    field: (typeof COMPARED_FIELDS)[number],
    before: GraphElement,
    after: GraphElement,
  ): boolean {
    if (field === "links") {
      return this.linksKey(before) !== this.linksKey(after)
    }

    return before[field] !== after[field]
  }

  private linksKey(element: GraphElement): string {
    return element.links
      .map((link) => `${link.type}:${link.to}`)
      .sort((left, right) => left.localeCompare(right))
      .join("|")
  }

  private compare(left: SimulationElement, right: SimulationElement): number {
    const titleOrder = left.title.localeCompare(right.title)
    if (titleOrder !== 0) return titleOrder

    return left.id.localeCompare(right.id)
  }
}
