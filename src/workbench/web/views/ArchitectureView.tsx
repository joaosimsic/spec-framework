import { useCallback, useMemo, useState } from "react"
import { getArchitectureGraph } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchViewProps } from "./types"
import { ArchitectureDetails } from "./architecture/ArchitectureDetails"
import { ArchitectureUniverseBuilder } from "./architecture/universe"
import { ForceGraphCanvas } from "./graph/ForceGraphCanvas"
import { ForceGraphVisibility } from "./graph/force-visibility"

export function ArchitectureView(_props: WorkbenchViewProps) {
  const load = useCallback(() => getArchitectureGraph(), [])
  const architecture = useApiResource(load)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [showInternal, setShowInternal] = useState(false)

  const architectureNodes = architecture.data?.nodes ?? []
  const architectureEdges = architecture.data?.edges ?? []
  const universe = useMemo(
    () => ArchitectureUniverseBuilder.build(architectureNodes, architectureEdges, showInternal),
    [architectureNodes, architectureEdges, showInternal],
  )
  const visible = useMemo(
    () => ForceGraphVisibility.build(universe.graph, expanded, query),
    [universe.graph, expanded, query],
  )
  const selectedNode = selected === null ? null : (universe.details.get(selected) ?? null)
  const incoming =
    selected === null ? [] : universe.graph.links.filter((link) => link.targetRef === selected)
  const outgoing =
    selected === null ? [] : universe.graph.links.filter((link) => link.sourceRef === selected)

  function choose(ref: string): void {
    setSelected(ref)
    setInspectorOpen(true)
  }

  function toggleExpanded(ref: string): void {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  function expandAll(): void {
    setExpanded(new Set(universe.graph.nodes.map((node) => node.ref)))
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
          relations - {visible.nodes.length} visible
        </p>
        <p className="meta graph-description">
          Expand nodes to reveal systems, subsystems, components, files, and symbols. Click selects;
          double-click expands or collapses.
        </p>
      </section>

      {architecture.data.warnings.length > 0 && (
        <div className="panel notice-warn" role="status">
          <ul>
            {architecture.data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="panel graph-controls graph-toolbar" aria-label="Architecture controls">
        <div className="graph-legend" aria-label="Architecture legend">
          <span>System</span>
          <span>Subsystem</span>
          <span>Component</span>
          <span>File</span>
          <span>Symbol</span>
        </div>

        <label className="graph-field">
          Search
          <input
            value={query}
            placeholder="Name, role, code path, or symbol"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="graph-control-group">
          <span className="meta">Graph</span>
          <button type="button" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" onClick={() => setExpanded(new Set())}>
            Collapse all
          </button>
        </div>
        <label className="graph-control-group">
          <input
            type="checkbox"
            checked={showInternal}
            onChange={(event) => setShowInternal(event.target.checked)}
          />
          Show internal declarations
        </label>
        <div className="graph-control-group">
          <span className="meta">Inspector</span>
          <button type="button" onClick={() => setInspectorOpen((open) => !open)}>
            {inspectorOpen ? "Hide" : "Show"}
          </button>
        </div>
      </section>

      <div className={`graph-layout${inspectorOpen ? "" : " graph-layout-inspector-hidden"}`}>
        <ForceGraphCanvas
          nodes={visible.nodes}
          links={visible.links}
          selected={selected}
          onSelect={choose}
          onToggle={toggleExpanded}
        />
        {inspectorOpen && (
          <aside className="panel graph-details" aria-live="polite">
            <ArchitectureDetails
              selected={selectedNode}
              nodes={universe.details}
              incoming={incoming}
              outgoing={outgoing}
              collapsed={
                selected !== null && !expanded.has(selected) && (selectedNode?.childCount ?? 0) > 0
              }
              onToggleGroup={toggleExpanded}
              onSelect={choose}
            />
          </aside>
        )}
      </div>

      <details className="panel graph-list-panel">
        <summary>Visible elements ({visible.nodes.length})</summary>
        <ul className="plain-list graph-node-list">
          {visible.nodes.map((node) => (
            <li key={node.ref}>
              <button type="button" onClick={() => choose(node.ref)}>
                {node.label}
              </button>
              <span className="meta">
                {node.kindLabel}
                {node.hiddenCount !== undefined && node.hiddenCount > 0
                  ? ` - ${node.hiddenCount} hidden`
                  : ""}
              </span>
              {node.description !== undefined && (
                <span className="graph-node-summary">{node.description}</span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}
