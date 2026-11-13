import {
  type IrElement,
  type IrEntryPoint,
  type IrFlow,
  type IrFlowAccess,
  type IrFlowStep,
  type IrRelationship,
} from "../analysis/ir"

export interface FlowLimits {
  maxDepth: number
  maxSteps: number
}

const DEFAULT_LIMITS: FlowLimits = { maxDepth: 8, maxSteps: 250 }

export class FlowAnalyzer {
  constructor(private readonly limits: FlowLimits = DEFAULT_LIMITS) {}

  analyze(
    elements: IrElement[],
    relationships: IrRelationship[],
    entryPoints: IrEntryPoint[],
  ): IrFlow[] {
    const byId = new Map(elements.map((element) => [element.id, element]))
    const adjacency = new Map<string, string[]>()
    for (const relationship of relationships) {
      if (relationship.type !== "calls") continue
      const targets = adjacency.get(relationship.sourceId) ?? []
      targets.push(relationship.targetId)
      adjacency.set(relationship.sourceId, [...new Set(targets)].sort())
    }

    return entryPoints
      .map((entry) => this.flow(entry, byId, adjacency))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  private flow(
    entry: IrEntryPoint,
    byId: Map<string, IrElement>,
    adjacency: Map<string, string[]>,
  ): IrFlow {
    const steps: IrFlowStep[] = []
    const sources: IrFlowAccess[] = []
    const sinks: IrFlowAccess[] = []
    const unknowns: string[] = []
    const limitsReached: string[] = []
    const visited = new Set<string>()
    const pending: Array<{ id: string; depth: number }> = [{ id: entry.nodeId, depth: 0 }]

    for (let index = 0; index < pending.length; index++) {
      const current = pending[index]
      if (current === undefined) continue
      if (visited.has(current.id)) continue
      if (steps.length >= this.limits.maxSteps) {
        if (!limitsReached.includes("max_steps")) limitsReached.push("max_steps")
        break
      }
      const element = byId.get(current.id)
      if (element === undefined) continue
      visited.add(current.id)
      steps.push(this.step(element, steps.length === 0 ? "entry" : "call"))
      this.accesses(element, sources, sinks)
      for (const call of element.calls) {
        if (call.state === "unresolved" || call.state === "ambiguous") {
          const value = `${element.filePath}:${call.name} (${call.state})`
          if (!unknowns.includes(value)) unknowns.push(value)
        }
      }
      if (current.depth >= this.limits.maxDepth) {
        if (!limitsReached.includes("max_depth")) limitsReached.push("max_depth")
        continue
      }
      for (const target of adjacency.get(current.id) ?? []) {
        pending.push({ id: target, depth: current.depth + 1 })
      }
    }

    return {
      id: `FLOW-${entry.id}`,
      entryPointId: entry.id,
      steps,
      sources,
      sinks,
      returns: [],
      errors: [],
      evidence: "static",
      confidence: unknowns.length === 0 ? "inferred" : "ambiguous",
      unknowns,
      limitsReached,
    }
  }

  private step(element: IrElement, kind: IrFlowStep["kind"]): IrFlowStep {
    return {
      nodeId: element.id,
      filePath: element.filePath,
      line: element.startLine,
      resolution: "resolved",
      confidence: element.confidence,
      kind,
    }
  }

  private accesses(element: IrElement, sources: IrFlowAccess[], sinks: IrFlowAccess[]): void {
    for (const access of element.dataAccess) {
      const value = {
        nodeId: element.id,
        channel: access.channel,
        source: access.source,
        line: access.line,
      }
      if (access.kind === "read") sources.push(value)
      else sinks.push(value)
    }
  }
}
