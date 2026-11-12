import { useCallback, useMemo, useState } from "react"
import { getArchitectureGraph } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchViewProps } from "./types"
import { ArchitectureCanvas } from "./architecture/ArchitectureCanvas"
import { ArchitectureDetails } from "./architecture/ArchitectureDetails"
import { ArchitectureProjectionBuilder } from "./architecture/projection"

export function ArchitectureView(_props: WorkbenchViewProps) {
  const load = useCallback(() => getArchitectureGraph(), [])
  const architecture = useApiResource(load)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const nodes = architecture.data?.nodes ?? []
  const edges = architecture.data?.edges ?? []
  const projection = useMemo(
    () => ArchitectureProjectionBuilder.build(nodes, edges, collapsed, query),
    [nodes, edges, collapsed, query],
  )
  const byRef = useMemo(
    () => new Map(projection.nodes.map((node) => [node.ref, node])),
    [projection.nodes],
  )
  const selectedNode = selected === null ? null : (byRef.get(selected) ?? null)
  const incoming =
    selected === null ? [] : projection.edges.filter((edge) => edge.targetRef === selected)
  const outgoing =
    selected === null ? [] : projection.edges.filter((edge) => edge.sourceRef === selected)

  function toggleGroup(ref: string): void {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  if (architecture.loading) return <LoadingPanel label="Loading the architecture graph." />
  if (architecture.failure !== null) {
    return (
      <FailurePanel failure={architecture.failure} onRetry={() => void architecture.reload()} />
    )
  }
  if (architecture.data === null)
    return <EmptyPanel>No architecture graph is available.</EmptyPanel>

  return (
    <>
      <section className="view-heading graph-heading">
        <div>
          <p className="eyebrow">Architecture</p>
          <h2>How the system fits together</h2>
        </div>
        <p className="meta graph-summary">
          {architecture.data.summary.nodes} elements - {architecture.data.summary.relations}{" "}
          relations - {architecture.data.summary.groups} groups - {architecture.data.summary.roots}{" "}
          top-level
        </p>
        <p className="meta graph-description">
          Read-only curated model. Scroll to zoom, drag to pan. Nothing here approves or edits the
          model.
        </p>
      </section>

      <section className="panel graph-controls graph-toolbar" aria-label="Architecture controls">
        <label className="graph-field">
          Search
          <input
            value={query}
            placeholder="Name or kind"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="graph-control-group">
          <span className="meta">Groups</span>
          <button
            type="button"
            onClick={() =>
              setCollapsed(
                new Set(nodes.filter((node) => node.childCount > 0).map((node) => node.ref)),
              )
            }
          >
            Collapse all
          </button>
          <button type="button" onClick={() => setCollapsed(new Set())}>
            Expand all
          </button>
        </div>
      </section>

      <div className="graph-layout">
        <ArchitectureCanvas
          nodes={projection.nodes}
          edges={projection.edges}
          collapsed={collapsed}
          selected={selected}
          onSelect={setSelected}
        />
        <aside className="panel graph-details" aria-live="polite">
          <ArchitectureDetails
            selected={selectedNode}
            nodes={byRef}
            incoming={incoming}
            outgoing={outgoing}
            collapsed={selected === null ? false : collapsed.has(selected)}
            onToggleGroup={toggleGroup}
          />
        </aside>
      </div>

      <details className="panel graph-list-panel">
        <summary>Visible elements ({projection.nodes.length})</summary>
        <ul className="plain-list graph-node-list">
          {projection.nodes.map((node) => (
            <li key={node.ref}>
              <button type="button" onClick={() => setSelected(node.ref)}>
                {node.label}
              </button>
              <span className="meta">
                {node.kindLabel}
                {node.childCount > 0 ? ` - ${node.childCount} inside` : ""}
              </span>
              {node.childCount > 0 && (
                <button type="button" onClick={() => toggleGroup(node.ref)}>
                  {collapsed.has(node.ref) ? "Expand" : "Collapse"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}
