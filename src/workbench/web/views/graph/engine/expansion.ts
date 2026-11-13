export type ExpansionStrategy = "hierarchical" | "network" | "hybrid"

export interface ExpansionInput {
  selected: Set<string>
  children: Map<string, string[]>
  neighbors: Map<string, string[]>
  strategy: ExpansionStrategy
}

export class ExpansionPlanner {
  static reveal(input: ExpansionInput): Set<string> {
    const visible = new Set(input.selected)
    let changed = true
    while (changed) {
      changed = false
      for (const ref of [...visible]) {
        const targets =
          input.strategy === "hierarchical"
            ? (input.children.get(ref) ?? [])
            : input.strategy === "network"
              ? (input.neighbors.get(ref) ?? [])
              : [...(input.children.get(ref) ?? []), ...(input.neighbors.get(ref) ?? [])]
        for (const target of targets) {
          if (visible.has(target)) continue
          visible.add(target)
          changed = true
        }
      }
    }

    return visible
  }
}
