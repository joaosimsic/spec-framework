import { createHash } from "node:crypto"
import type { DraftElement, MapReport } from "../discovery/types"
import type {
  WorkbenchRepoGraphEdge,
  WorkbenchRepoGraphNode,
  WorkbenchRepoGraphView,
} from "./types"

const CONFIDENCE_LABELS: Record<string, string> = {
  observed: "Clear from code",
  inferred: "Inferred - confirm or correct",
  ambiguous: "Uncertain boundary - choose",
  unknown: "Needs human input",
}

const LEVELS: Record<string, WorkbenchRepoGraphNode["level"]> = {
  system: "system",
  component: "component",
  module: "file",
}

export class WorkbenchRepoGraphDisplay {
  private readonly refs = new Map<string, string>()

  constructor(private readonly report: MapReport) {
    for (const element of report.elements) this.refs.set(element.id, this.ref(element.id))
  }

  view(): WorkbenchRepoGraphView {
    const nodes = this.report.elements.map((element) => this.node(element))
    const edges = this.report.elements.flatMap((element) => this.edges(element))
    const files = nodes.filter((node) => node.level === "file").length
    const components = nodes.filter((node) => node.level === "component").length

    return {
      nodes: nodes.sort((left, right) => left.label.localeCompare(right.label)),
      edges: edges.sort((left, right) => left.ref.localeCompare(right.ref)),
      summary: {
        nodes: nodes.length,
        edges: edges.length,
        components,
        files,
        externalDependencies: this.report.gaps.externalDependencies.length,
      },
    }
  }

  private node(element: DraftElement): WorkbenchRepoGraphNode {
    const level = LEVELS[element.kind] ?? "other"
    const path = level === "file" ? element.title : undefined

    return {
      ref: this.refs.get(element.id) ?? this.ref(element.id),
      label: level === "file" ? this.fileLabel(element.title) : element.title,
      kindLabel: this.kindLabel(element.kind),
      level,
      confidenceLabel: CONFIDENCE_LABELS[element.confidence] ?? "Needs review",
      ...(path === undefined ? {} : { path }),
    }
  }

  private edges(element: DraftElement): WorkbenchRepoGraphEdge[] {
    const sourceRef = this.refs.get(element.id)
    if (sourceRef === undefined) return []
    const sourceLevel = LEVELS[element.kind] ?? "other"

    return element.links.flatMap((link) => {
      const targetRef = this.refs.get(link.to)
      if (targetRef === undefined) return []
      const target = this.report.elements.find((candidate) => candidate.id === link.to)
      const targetLevel = target === undefined ? "other" : (LEVELS[target.kind] ?? "other")
      const level =
        sourceLevel === "file" || targetLevel === "file"
          ? "file"
          : sourceLevel === "other" || targetLevel === "other"
            ? "other"
            : "component"

      return [
        {
          ref: this.edgeRef(element.id, link.type, link.to),
          sourceRef,
          targetRef,
          type: link.type,
          label: this.humanize(link.type),
          level,
        },
      ]
    })
  }

  private fileLabel(path: string): string {
    return path.split("/").at(-1) ?? path
  }

  private kindLabel(kind: string): string {
    if (kind === "module") return "File"
    if (kind === "system") return "System"
    if (kind === "component") return "Component"

    return this.humanize(kind)
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Related"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  private ref(id: string): string {
    return `node_${this.digest(id).slice(0, 12)}`
  }

  private edgeRef(source: string, type: string, target: string): string {
    return `edge_${this.digest(`${source}\u0000${type}\u0000${target}`).slice(0, 12)}`
  }

  private digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex")
  }
}
