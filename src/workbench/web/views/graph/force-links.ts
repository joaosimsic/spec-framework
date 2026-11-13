import type { ForceGraphLink, ForceGraphNode } from "./force-types"

export class ForceGraphLinkSanitizer {
  static sanitize(nodes: ForceGraphNode[], links: ForceGraphLink[]): ForceGraphLink[] {
    const refs = new Set(nodes.map((node) => node.ref))
    const unique = new Map<string, ForceGraphLink>()

    for (const link of links) {
      if (!refs.has(link.sourceRef) || !refs.has(link.targetRef)) continue
      if (link.sourceRef === link.targetRef) continue
      unique.set(link.ref, link)
    }

    return [...unique.values()].sort((left, right) => left.ref.localeCompare(right.ref))
  }
}
