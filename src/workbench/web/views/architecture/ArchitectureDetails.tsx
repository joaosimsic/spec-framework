import type { WorkbenchArchitectureGraphEdge, WorkbenchArchitectureGraphNode } from "../../../types"

interface ArchitectureDetailsProps {
  selected: WorkbenchArchitectureGraphNode | null
  nodes: Map<string, WorkbenchArchitectureGraphNode>
  incoming: WorkbenchArchitectureGraphEdge[]
  outgoing: WorkbenchArchitectureGraphEdge[]
  collapsed: boolean
  onToggleGroup(ref: string): void
  onSelect(ref: string): void
}

export function ArchitectureDetails({
  selected,
  nodes,
  incoming,
  outgoing,
  collapsed,
  onToggleGroup,
  onSelect,
}: ArchitectureDetailsProps) {
  if (selected === null) {
    return (
      <div className="inspector-empty">
        <h2>Inspect the system</h2>
        <p>
          Select an element to see what it does, what it owns, how it is implemented, and what it
          connects to.
        </p>
      </div>
    )
  }

  const children = [...nodes.values()]
    .filter((node) => node.parentRef === selected.ref)
    .sort((left, right) => left.label.localeCompare(right.label))

  return (
    <>
      <header className="inspector-header">
        <h2>{selected.label}</h2>
        <p className="meta">
          {selected.kindLabel} - {selected.stateLabel} - {selected.confidenceLabel}
        </p>
        {selected.owner !== undefined && <p className="meta">Owned by {selected.owner}</p>}
        {selected.technology !== undefined && (
          <p className="meta">Technology: {selected.technology}</p>
        )}
        {selected.parentRef !== null && (
          <p className="meta">
            Inside{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => onSelect(selected.parentRef ?? "")}
            >
              {nodes.get(selected.parentRef)?.label ?? "parent group"}
            </button>
          </p>
        )}
        {selected.childCount > 0 && (
          <button type="button" onClick={() => onToggleGroup(selected.ref)}>
            {collapsed ? `Expand ${selected.childCount} elements` : "Collapse group"}
          </button>
        )}
      </header>

      <InspectorText title="What it does" value={selected.description} />
      <InspectorText title="Responsibility" value={selected.responsibility} />
      <InspectorText title="Boundary" value={selected.boundary} />

      {children.length > 0 && (
        <section className="inspector-section">
          <h3>Contains ({children.length})</h3>
          <ul className="plain-list inspector-list">
            {children.map((child) => (
              <li key={child.ref}>
                <button type="button" className="link-button" onClick={() => onSelect(child.ref)}>
                  {child.label}
                </button>
                {(child.description ?? child.responsibility) !== undefined && (
                  <span className="meta">{child.description ?? child.responsibility}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="inspector-section">
        <h3>Implemented in</h3>
        {selected.codePaths.length === 0 ? (
          <p className="empty">No code reference recorded.</p>
        ) : (
          <>
            <ul className="plain-list code-path-list">
              {selected.codePaths.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
            {selected.codeFiles.length > 0 && (
              <ul className="plain-list inspector-list code-file-list">
                {selected.codeFiles.map((file) => (
                  <li key={file.path}>
                    <span>{file.label}</span>
                    <span className="meta">{file.path}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <ArchitectureRelationList
        title="Outgoing"
        edges={outgoing}
        direction="out"
        nodes={nodes}
        onSelect={onSelect}
      />
      <ArchitectureRelationList
        title="Incoming"
        edges={incoming}
        direction="in"
        nodes={nodes}
        onSelect={onSelect}
      />
    </>
  )
}

function InspectorText({ title, value }: { title: string; value?: string }) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      <p className={value === undefined ? "empty" : undefined}>{value ?? "Not documented."}</p>
    </section>
  )
}

function ArchitectureRelationList({
  title,
  edges,
  direction,
  nodes,
  onSelect,
}: {
  title: string
  edges: WorkbenchArchitectureGraphEdge[]
  direction: "in" | "out"
  nodes: Map<string, WorkbenchArchitectureGraphNode>
  onSelect(ref: string): void
}) {
  if (edges.length === 0) return null

  return (
    <section className="inspector-section graph-relations">
      <h3>{title}</h3>
      <ul className="plain-list inspector-list">
        {edges.map((edge) => {
          const ref = direction === "out" ? edge.targetRef : edge.sourceRef
          const node = nodes.get(ref)
          return (
            <li key={edge.ref}>
              <button type="button" className="link-button" onClick={() => onSelect(ref)}>
                {node?.label ?? "Related element"}
              </button>
              <span className="relation-label">{edge.label}</span>
              {(node?.description ?? node?.responsibility) !== undefined && (
                <span className="meta">{node?.description ?? node?.responsibility}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
