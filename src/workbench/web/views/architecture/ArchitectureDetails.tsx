import type { WorkbenchArchitectureGraphEdge, WorkbenchArchitectureGraphNode } from "../../../types"

interface ArchitectureDetailsProps {
  selected: WorkbenchArchitectureGraphNode | null
  nodes: Map<string, WorkbenchArchitectureGraphNode>
  incoming: WorkbenchArchitectureGraphEdge[]
  outgoing: WorkbenchArchitectureGraphEdge[]
  collapsed: boolean
  onToggleGroup(ref: string): void
}

export function ArchitectureDetails({
  selected,
  nodes,
  incoming,
  outgoing,
  collapsed,
  onToggleGroup,
}: ArchitectureDetailsProps) {
  if (selected === null) {
    return <p className="empty">Select an element to inspect its relations.</p>
  }

  return (
    <>
      <h2>{selected.label}</h2>
      <p className="meta">
        {selected.kindLabel} - {selected.stateLabel} - {selected.confidenceLabel}
      </p>
      {selected.parentRef !== null && (
        <p className="meta">Inside {nodes.get(selected.parentRef)?.label ?? "a parent group"}</p>
      )}
      {selected.childCount > 0 && (
        <button type="button" onClick={() => onToggleGroup(selected.ref)}>
          {collapsed ? `Expand ${selected.childCount} elements` : "Collapse group"}
        </button>
      )}
      <ArchitectureRelationList title="Outgoing" edges={outgoing} direction="out" nodes={nodes} />
      <ArchitectureRelationList title="Incoming" edges={incoming} direction="in" nodes={nodes} />
    </>
  )
}

function ArchitectureRelationList({
  title,
  edges,
  direction,
  nodes,
}: {
  title: string
  edges: WorkbenchArchitectureGraphEdge[]
  direction: "in" | "out"
  nodes: Map<string, WorkbenchArchitectureGraphNode>
}) {
  if (edges.length === 0) return null

  return (
    <section className="graph-relations">
      <h3>{title}</h3>
      <ul className="plain-list">
        {edges.map((edge) => {
          const ref = direction === "out" ? edge.targetRef : edge.sourceRef
          return (
            <li key={edge.ref}>
              <span>{nodes.get(ref)?.label ?? "Related element"}</span>
              <span className="meta">{edge.label}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
