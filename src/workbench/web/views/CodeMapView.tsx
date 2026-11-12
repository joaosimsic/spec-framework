import { useCallback, useMemo, useState } from "react"
import { getRepoGraph } from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type { WorkbenchRepoGraphEdge, WorkbenchRepoGraphNode } from "../../types"
import { GraphLayout } from "./graph/layout"
import { useGraphViewport } from "./graph/useGraphViewport"
import { GraphViewportMath } from "./graph/viewport"
import type { WorkbenchViewProps } from "./types"

type GraphMode = "subsystems" | "files"

export function CodeMapView(_props: WorkbenchViewProps) {
  const load = useCallback(() => getRepoGraph(), [])
  const repo = useApiResource(load)
  const [mode, setMode] = useState<GraphMode>("subsystems")
  const [subsystem, setSubsystem] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const nodes = repo.data?.nodes ?? []
  const edges = repo.data?.edges ?? []
  const parentByNode = useMemo(() => parentMap(edges), [edges])
  const fileCounts = useMemo(() => countFiles(nodes, parentByNode), [nodes, parentByNode])
  const subsystems = useMemo(
    () =>
      nodes
        .filter((node) => node.level === "component" && (fileCounts.get(node.ref) ?? 0) > 0)
        .sort((left, right) => left.label.localeCompare(right.label)),
    [nodes, fileCounts],
  )
  const effectiveSubsystem = subsystem ?? subsystems[0]?.ref ?? null
  const visible = useMemo(
    () => visibleGraph(nodes, edges, parentByNode, mode, effectiveSubsystem, query),
    [nodes, edges, parentByNode, mode, effectiveSubsystem, query],
  )
  const focusRef =
    mode === "files"
      ? effectiveSubsystem
      : (nodes.find((node) => node.level === "system")?.ref ?? null)
  const geometry = useMemo(
    () => GraphLayout.build(visible.nodes, focusRef),
    [visible.nodes, focusRef],
  )
  const graph = useGraphViewport(geometry.width, geometry.height, "[data-graph-node='true']")
  const byRef = useMemo(() => new Map(nodes.map((node) => [node.ref, node])), [nodes])
  const selectedNode = selected === null ? null : (byRef.get(selected) ?? null)
  const incoming = selected === null ? [] : edges.filter((edge) => edge.targetRef === selected)
  const outgoing = selected === null ? [] : edges.filter((edge) => edge.sourceRef === selected)

  if (repo.loading) return <LoadingPanel label="Loading the repository graph." />
  if (repo.failure !== null) {
    return <FailurePanel failure={repo.failure} onRetry={() => void repo.reload()} />
  }
  if (repo.data === null) return <EmptyPanel>No repository graph is available.</EmptyPanel>

  function choose(node: WorkbenchRepoGraphNode): void {
    setSelected(node.ref)
    if (
      mode === "subsystems" &&
      node.level === "component" &&
      (fileCounts.get(node.ref) ?? 0) > 0
    ) {
      setSubsystem(node.ref)
      setMode("files")
    }
  }

  return (
    <>
      <section className="view-heading graph-heading">
        <div>
          <p className="eyebrow">Code map</p>
          <h2>How the source fits together</h2>
        </div>
        <p className="meta graph-summary">
          {repo.data.summary.nodes} nodes - {repo.data.summary.edges} relations -{" "}
          {repo.data.summary.components} components - {repo.data.summary.files} files
        </p>
        <p className="meta graph-description">
          Read-only dependencies discovered from source. Code-derived evidence, not the curated
          architecture.
        </p>
      </section>

      <section className="panel graph-controls graph-toolbar" aria-label="Graph controls">
        <div className="graph-control-group">
          <span className="meta">Level</span>
          <button
            type="button"
            aria-pressed={mode === "subsystems"}
            onClick={() => setMode("subsystems")}
          >
            Subsystems
          </button>
          <button
            type="button"
            aria-pressed={mode === "files"}
            onClick={() => setMode("files")}
            disabled={subsystems.length === 0}
          >
            Files
          </button>
        </div>

        {mode === "files" && (
          <label className="graph-field">
            Component
            <select
              value={effectiveSubsystem ?? ""}
              onChange={(event) => {
                setSubsystem(event.target.value)
                setSelected(event.target.value)
              }}
            >
              {subsystems.map((node) => (
                <option key={node.ref} value={node.ref}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="graph-field">
          Search
          <input
            value={query}
            placeholder="Name or path"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="graph-control-group">
          <span className="meta">Zoom {GraphViewportMath.percent(graph.viewport)}%</span>
          <button type="button" onClick={graph.zoomOut}>
            Zoom out
          </button>
          <button type="button" onClick={graph.zoomIn}>
            Zoom in
          </button>
          <button type="button" onClick={graph.reset}>
            Fit
          </button>
        </div>
      </section>

      <div className="graph-layout">
        <section className="panel graph-panel" aria-label="Dependency graph">
          {visible.nodes.length === 0 ? (
            <p className="empty">No nodes match the current filter.</p>
          ) : (
            <svg
              ref={graph.svgRef}
              className="graph-canvas"
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              role="group"
              aria-label={`${visible.nodes.length} nodes and ${visible.edges.length} relations`}
              onPointerDown={graph.onPointerDown}
              onPointerMove={graph.onPointerMove}
              onPointerUp={graph.onPointerUp}
              onPointerCancel={graph.onPointerCancel}
            >
              <defs>
                <marker
                  id="graph-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              <g transform={graph.transform}>
                {visible.edges.map((edge) => {
                  const source = geometry.positions.get(edge.sourceRef)
                  const target = geometry.positions.get(edge.targetRef)
                  if (source === undefined || target === undefined) return null

                  return (
                    <line
                      key={edge.ref}
                      className={`graph-edge graph-edge-${edge.type}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      markerEnd={edge.type === "depends_on" ? "url(#graph-arrow)" : undefined}
                    >
                      <title>
                        {edge.label}: {byRef.get(edge.sourceRef)?.label} to{" "}
                        {byRef.get(edge.targetRef)?.label}
                      </title>
                    </line>
                  )
                })}

                {geometry.nodes.map(({ node, x, y }) => {
                  const radius = node.level === "file" ? 8 : node.level === "system" ? 24 : 19
                  return (
                    <g
                      key={node.ref}
                      data-graph-node="true"
                      className={`graph-node graph-node-${node.level}${selected === node.ref ? " graph-node-selected" : ""}`}
                      transform={`translate(${x} ${y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.label}, ${node.kindLabel}`}
                      onClick={() => choose(node)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return
                        event.preventDefault()
                        choose(node)
                      }}
                    >
                      <circle r={radius} />
                      <text y={radius + 14} textAnchor="middle">
                        {node.label}
                      </text>
                      <title>
                        {node.label}
                        {node.path === undefined ? "" : ` ${node.path}`}
                      </title>
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
          <p className="meta graph-hint">
            Scroll to zoom, drag to pan. Use the zoom buttons for keyboard access.
          </p>
        </section>

        <aside className="panel graph-details" aria-live="polite">
          {selectedNode === null ? (
            <p className="empty">Select a node to inspect its dependencies.</p>
          ) : (
            <>
              <h2>{selectedNode.label}</h2>
              <p className="meta">
                {selectedNode.kindLabel} - {selectedNode.confidenceLabel}
              </p>
              {selectedNode.path !== undefined && (
                <p>
                  <code>{selectedNode.path}</code>
                </p>
              )}
              <RelationList title="Depends on" items={outgoing} direction="out" nodes={byRef} />
              <RelationList title="Used by" items={incoming} direction="in" nodes={byRef} />
            </>
          )}
        </aside>
      </div>

      <details className="panel graph-list-panel">
        <summary>Visible nodes ({visible.nodes.length})</summary>
        <ul className="plain-list graph-node-list">
          {visible.nodes.map((node) => (
            <li key={node.ref}>
              <button type="button" onClick={() => choose(node)}>
                {node.label}
              </button>
              <span className="meta">
                {node.kindLabel}
                {node.path === undefined ? "" : ` - ${node.path}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}

function RelationList({
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

function parentMap(edges: WorkbenchRepoGraphEdge[]): Map<string, string> {
  const parents = new Map<string, string>()
  for (const edge of edges) {
    if (edge.type === "part_of") parents.set(edge.sourceRef, edge.targetRef)
  }

  return parents
}

function countFiles(
  nodes: WorkbenchRepoGraphNode[],
  parents: Map<string, string>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of nodes) {
    if (node.level !== "file") continue
    const parent = parents.get(node.ref)
    if (parent === undefined) continue
    counts.set(parent, (counts.get(parent) ?? 0) + 1)
  }

  return counts
}

function visibleGraph(
  nodes: WorkbenchRepoGraphNode[],
  edges: WorkbenchRepoGraphEdge[],
  parents: Map<string, string>,
  mode: GraphMode,
  subsystem: string | null,
  query: string,
): { nodes: WorkbenchRepoGraphNode[]; edges: WorkbenchRepoGraphEdge[] } {
  const byRef = new Map(nodes.map((node) => [node.ref, node]))
  const base =
    mode === "subsystems" || subsystem === null
      ? nodes.filter((node) => node.level !== "file")
      : fileScope(nodes, edges, parents, subsystem)
  const filtered = base.filter((node) => matches(node, query))
  const refs = new Set(filtered.map((node) => node.ref))

  return {
    nodes: filtered,
    edges: edges.filter(
      (edge) =>
        refs.has(edge.sourceRef) &&
        refs.has(edge.targetRef) &&
        byRef.has(edge.sourceRef) &&
        byRef.has(edge.targetRef),
    ),
  }
}

function fileScope(
  nodes: WorkbenchRepoGraphNode[],
  edges: WorkbenchRepoGraphEdge[],
  parents: Map<string, string>,
  subsystem: string,
): WorkbenchRepoGraphNode[] {
  const byRef = new Map(nodes.map((node) => [node.ref, node]))
  const refs = new Set<string>([subsystem])
  for (const node of nodes) {
    if (node.level === "file" && parents.get(node.ref) === subsystem) refs.add(node.ref)
  }
  const base = new Set(refs)
  for (const edge of edges) {
    if (base.has(edge.sourceRef) && byRef.has(edge.targetRef)) refs.add(edge.targetRef)
    if (base.has(edge.targetRef) && byRef.has(edge.sourceRef)) refs.add(edge.sourceRef)
  }

  return [...refs].flatMap((ref) => {
    const node = byRef.get(ref)
    return node === undefined ? [] : [node]
  })
}

function matches(node: WorkbenchRepoGraphNode, query: string): boolean {
  const value = query.trim().toLowerCase()
  if (value === "") return true

  return node.label.toLowerCase().includes(value) || (node.path ?? "").toLowerCase().includes(value)
}
