import { useCallback, useMemo, useState } from "react"
import { getRepoGraph } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchRepoGraphEdge, WorkbenchRepoGraphNode } from "../../types"
import { CodeMapUniverseBuilder } from "./graph/code-map-universe"
import { ForceGraphCanvas } from "./graph/ForceGraphCanvas"
import { ForceGraphVisibility } from "./graph/force-visibility"
import type { WorkbenchViewProps } from "./types"

export function CodeMapView(_props: WorkbenchViewProps) {
  const load = useCallback(() => getRepoGraph(), [])
  const repo = useApiResource(load)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  const nodes = repo.data?.nodes ?? []
  const edges = repo.data?.edges ?? []
  const universe = useMemo(() => CodeMapUniverseBuilder.build(nodes, edges), [nodes, edges])
  const visible = useMemo(
    () => ForceGraphVisibility.build(universe, expanded, query),
    [universe, expanded, query],
  )
  const byRef = useMemo(() => new Map(nodes.map((node) => [node.ref, node])), [nodes])
  const selectedNode = selected === null ? null : (byRef.get(selected) ?? null)
  const incoming = selected === null ? [] : edges.filter((edge) => edge.targetRef === selected)
  const outgoing = selected === null ? [] : edges.filter((edge) => edge.sourceRef === selected)

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

  if (repo.loading) return <LoadingPanel label="Loading the repository graph." />
  if (repo.failure !== null) {
    return <FailurePanel failure={repo.failure} onRetry={() => void repo.reload()} />
  }
  if (repo.data === null) return <EmptyPanel>No repository graph is available.</EmptyPanel>

  return (
    <>
      <section className="view-heading graph-heading">
        <div>
          <p className="eyebrow">Code map</p>
          <h2>How the source fits together</h2>
        </div>
        <p className="meta graph-summary">
          {repo.data.summary.nodes} nodes - {repo.data.summary.edges} relations -{" "}
          {visible.nodes.length} visible
        </p>
        <p className="meta graph-description">
          Read-only dependencies discovered from source. Click selects; double-click expands or
          collapses.
        </p>
      </section>

      <section className="panel graph-controls graph-toolbar" aria-label="Graph controls">
        <label className="graph-field">
          Search
          <input
            value={query}
            placeholder="Name or path"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="graph-control-group">
          <span className="meta">Graph</span>
          <button
            type="button"
            onClick={() => setExpanded(new Set(universe.nodes.map((node) => node.ref)))}
          >
            Expand all
          </button>
          <button type="button" onClick={() => setExpanded(new Set())}>
            Collapse all
          </button>
        </div>
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
            <CodeMapDetails
              selected={selectedNode}
              incoming={incoming}
              outgoing={outgoing}
              nodes={byRef}
            />
          </aside>
        )}
      </div>

      <details className="panel graph-list-panel">
        <summary>Visible nodes ({visible.nodes.length})</summary>
        <ul className="plain-list graph-node-list">
          {visible.nodes.map((node) => (
            <li key={node.ref}>
              <button type="button" onClick={() => choose(node.ref)}>
                {node.label}
              </button>
              <span className="meta">
                {node.kindLabel}
                {node.description === undefined ? "" : ` - ${node.description}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}

function CodeMapDetails({
  selected,
  incoming,
  outgoing,
  nodes,
}: {
  selected: WorkbenchRepoGraphNode | null
  incoming: WorkbenchRepoGraphEdge[]
  outgoing: WorkbenchRepoGraphEdge[]
  nodes: Map<string, WorkbenchRepoGraphNode>
}) {
  if (selected === null) {
    return <p className="empty">Select a node to inspect its dependencies.</p>
  }

  return (
    <>
      <h2>{selected.label}</h2>
      <p className="meta">
        {selected.kindLabel} - {selected.confidenceLabel}
      </p>
      {selected.path !== undefined && (
        <p>
          <code>{selected.path}</code>
        </p>
      )}
      <CodeMapRelations title="Depends on" items={outgoing} direction="out" nodes={nodes} />
      <CodeMapRelations title="Used by" items={incoming} direction="in" nodes={nodes} />
    </>
  )
}

function CodeMapRelations({
  title,
  items,
  direction,
  nodes,
}: {
  title: string
  items: WorkbenchRepoGraphEdge[]
  direction: "in" | "out"
  nodes: Map<string, WorkbenchRepoGraphNode>
}) {
  if (items.length === 0) return null
  const unique = new Map<string, WorkbenchRepoGraphEdge>()
  for (const item of items) unique.set(item.ref, item)

  return (
    <section className="graph-relations">
      <h3>{title}</h3>
      <ul className="plain-list">
        {[...unique.values()].map((edge) => {
          const ref = direction === "out" ? edge.targetRef : edge.sourceRef
          return <li key={edge.ref}>{nodes.get(ref)?.label ?? "Related node"}</li>
        })}
      </ul>
    </section>
  )
}
