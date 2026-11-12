export interface ForceGraphNode {
  ref: string
  label: string
  kind: string
  kindLabel: string
  parentRef: string | null
  description?: string
  hiddenCount?: number
}

export interface ForceGraphLink {
  ref: string
  sourceRef: string
  targetRef: string
  label: string
  type: string
}

export interface ForceGraphData {
  nodes: ForceGraphNode[]
  links: ForceGraphLink[]
}

export interface VisibleForceGraph {
  nodes: ForceGraphNode[]
  links: ForceGraphLink[]
  visibleRefs: Set<string>
}

export class ForceGraphRadii {
  static forKind(kind: string): number {
    if (kind === "system") return 30
    if (kind === "subsystem") return 24
    if (kind === "component") return 18
    if (kind === "data_store" || kind === "external_system" || kind === "actor") return 16
    if (kind === "file") return 11
    if (kind === "class" || kind === "interface") return 8
    if (kind === "function" || kind === "enum") return 7

    return 6
  }
}
