import { useCallback, useMemo, useRef, useState } from "react"
import { fail, ok } from "../../../core/result"
import {
  getCurrentProject,
  getSystemArchitecture,
  getSystemChildren,
  getSystemGraph,
  getSystemRelationships,
} from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type {
  WorkbenchSystemArchitecture,
  WorkbenchSystemEdge,
  WorkbenchSystemGraph,
  WorkbenchSystemNode,
  WorkbenchProjectSummary,
} from "../../types"
import { ForceGraphCanvas } from "./graph/ForceGraphCanvas"
import { ForceGraphLinkSanitizer } from "./graph/force-links"
import { ForceGraphVisibility } from "./graph/force-visibility"
import type { ForceGraphData } from "./graph/force-types"
import type { WorkbenchViewProps } from "./types"

interface SystemData {
  project: WorkbenchProjectSummary
  architecture: WorkbenchSystemArchitecture
  graph: WorkbenchSystemGraph
}

export function SystemView(_props: WorkbenchViewProps) {
  const load = useCallback(async () => {
    const [project, projectError] = await getCurrentProject()
    if (projectError !== null || project === null) return fail(projectError ?? missing("project"))
    const [architecture, architectureError] = await getSystemArchitecture(project.id)
    if (architectureError !== null || architecture === null) {
      return fail(architectureError ?? missing("analysis"))
    }
    const [graph, graphError] = await getSystemGraph(project.id, 2)
    if (graphError !== null || graph === null) return fail(graphError ?? missing("graph"))

    return ok({ project, architecture, graph })
  }, [])
  const system = useApiResource<SystemData>(load)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [extraNodes, setExtraNodes] = useState<WorkbenchSystemNode[]>([])
  const [extraEdges, setExtraEdges] = useState<WorkbenchSystemEdge[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const expanding = useRef(new Set<string>())

  const allNodes = useMemo(() => {
    const nodes = [...(system.data?.graph.nodes ?? []), ...extraNodes]
    return [...new Map(nodes.map((node) => [node.id, node])).values()]
  }, [system.data, extraNodes])
  const allEdges = useMemo(() => {
    const edges = [...(system.data?.graph.edges ?? []), ...extraEdges]
    return [...new Map(edges.map((edge) => [edge.id, edge])).values()]
  }, [system.data, extraEdges])
  const universe = useMemo(() => buildUniverse(allNodes, allEdges), [allNodes, allEdges])
  const visible = useMemo(
    () => ForceGraphVisibility.build(universe, expanded, query),
    [universe, expanded, query],
  )
  const nodeById = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes])
  const selectedNode = selected === null ? null : (nodeById.get(selected) ?? null)
  const hierarchy = useMemo(() => flattenHierarchy(allNodes), [allNodes])

  const expand = useCallback(
    async (ref: string) => {
      if (expanded.has(ref)) {
        setExpanded((current) => {
          const next = new Set(current)
          next.delete(ref)
          return next
        })
        return
      }
      if (expanding.current.has(ref)) return
      expanding.current.add(ref)
      setExpanded((current) => new Set(current).add(ref))
      const [children, childrenError] = await getSystemChildren(ref)
      if (childrenError !== null || children === null) {
        expanding.current.delete(ref)
        return
      }
      setExtraNodes((current) => [...current, ...children])
      const [relationships, relationshipError] = await getSystemRelationships(ref)
      if (relationshipError !== null || relationships === null) {
        expanding.current.delete(ref)
        return
      }
      setExtraEdges((current) => [
        ...current,
        ...relationshipEdges(relationships.incoming, "incoming"),
        ...relationshipEdges(relationships.outgoing, "outgoing"),
      ])
      expanding.current.delete(ref)
    },
    [expanded],
  )

  if (system.loading) return <LoadingPanel label="Loading the system overview." />
  if (system.failure !== null) {
    return <FailurePanel failure={system.failure} onRetry={() => void system.reload()} />
  }
  if (system.data === null) {
    return <EmptyPanel>No analysis snapshot is available. Run an analysis first.</EmptyPanel>
  }

  return (
    <>
      <section className="view-heading graph-heading">
        <div>
          <p className="eyebrow">System</p>
          <h2>{system.data.project.name}</h2>
        </div>
        <p className="meta graph-summary">
          {system.data.architecture.summary.nodes} elements -{" "}
          {system.data.architecture.summary.files} files -{" "}
          {system.data.architecture.summary.symbols} symbols
        </p>
        <p className="meta graph-description">
          The system view joins intent and observed code. Expand a component to inspect files and
          symbols. Snapshot {system.data.architecture.snapshot_id.slice(0, 13)} at commit{" "}
          {system.data.architecture.commit.slice(0, 8)}.
        </p>
      </section>

      <section className="panel graph-controls graph-toolbar" aria-label="System controls">
        <label className="graph-field">
          Search
          <input
            value={query}
            placeholder="Name, path, or symbol"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="graph-control-group">
          <span className="meta">Coverage</span>
          <span>{system.data.architecture.coverage.mapped.length} mapped</span>
          <span>{system.data.architecture.coverage.unmapped.length} unmapped</span>
          <span>{system.data.architecture.coverage.unassigned.length} unassigned</span>
        </div>
      </section>

      <div className="graph-layout">
        <nav className="panel system-hierarchy" aria-label="System hierarchy">
          <h2>Hierarchy</h2>
          <ul className="plain-list system-hierarchy-list">
            {hierarchy.map((item) => (
              <li key={item.node.id} className={`system-depth-${Math.min(4, item.depth)}`}>
                <button
                  type="button"
                  aria-current={selected === item.node.id ? "true" : undefined}
                  onClick={() => setSelected(item.node.id)}
                >
                  {item.node.label}
                </button>
                {item.node.child_count > 0 && (
                  <button
                    type="button"
                    aria-label={`Expand ${item.node.label}`}
                    onClick={() => void expand(item.node.id)}
                  >
                    {expanded.has(item.node.id) ? "-" : "+"}
                  </button>
                )}
                <span className="meta"> {item.node.kind_label}</span>
              </li>
            ))}
          </ul>
        </nav>

        <ForceGraphCanvas
          nodes={visible.nodes}
          links={visible.links}
          selected={selected}
          onSelect={setSelected}
          onToggle={(ref) => void expand(ref)}
        />

        <aside className="panel graph-details" aria-live="polite">
          <SystemInspector node={selectedNode} edges={allEdges} nodes={nodeById} />
        </aside>
      </div>

      <section className="panel" aria-label="Coverage">
        <h2>Coverage</h2>
        <ul className="plain-list">
          <li>{system.data.architecture.coverage.mapped.length} conceptual elements mapped</li>
          <li>{system.data.architecture.coverage.partial.length} partially mapped</li>
          <li>{system.data.architecture.coverage.unmapped.length} unmapped</li>
          <li>{system.data.architecture.coverage.unassigned.length} files unassigned</li>
          <li>{system.data.architecture.coverage.stale.length} stale selectors</li>
        </ul>
      </section>
    </>
  )
}

function buildUniverse(nodes: WorkbenchSystemNode[], edges: WorkbenchSystemEdge[]): ForceGraphData {
  const graphNodes = nodes.map((node) => ({
    ref: node.id,
    label: node.label,
    kind: node.kind,
    kindLabel: node.kind_label,
    parentRef: node.parent_id,
    description: node.file_path ?? node.signature ?? node.provenance,
  }))
  const graphLinks = edges.map((edge) => ({
    ref: edge.id,
    sourceRef: edge.sourceId,
    targetRef: edge.targetId,
    label: edge.label,
    type: edge.type,
  }))

  return {
    nodes: graphNodes,
    links: ForceGraphLinkSanitizer.sanitize(graphNodes, graphLinks),
  }
}

function flattenHierarchy(nodes: WorkbenchSystemNode[]): Array<{
  node: WorkbenchSystemNode
  depth: number
}> {
  const byParent = new Map<string | null, WorkbenchSystemNode[]>()
  for (const node of nodes) {
    const children = byParent.get(node.parent_id) ?? []
    children.push(node)
    byParent.set(node.parent_id, children)
  }
  const result: Array<{ node: WorkbenchSystemNode; depth: number }> = []
  const pending = [...(byParent.get(null) ?? []).map((node) => ({ node, depth: 0 }))]
  const seen = new Set<string>()
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index]
    if (item === undefined || seen.has(item.node.id)) continue
    seen.add(item.node.id)
    result.push(item)
    for (const child of byParent.get(item.node.id) ?? []) {
      pending.push({ node: child, depth: Math.min(4, item.depth + 1) })
    }
  }

  return result.sort((left, right) => {
    if (left.depth !== right.depth) return left.depth - right.depth
    return left.node.label.localeCompare(right.node.label)
  })
}

function relationshipEdges(
  values: unknown[],
  direction: "incoming" | "outgoing",
): WorkbenchSystemEdge[] {
  return values.flatMap((value) => {
    if (typeof value !== "object" || value === null) return []
    const record = value as Record<string, unknown>
    if (typeof record["id"] !== "string" || typeof record["sourceId"] !== "string") return []
    if (typeof record["targetId"] !== "string") return []
    return [
      {
        id: record["id"],
        sourceId: record["sourceId"],
        targetId: record["targetId"],
        type: typeof record["type"] === "string" ? record["type"] : direction,
        label: typeof record["label"] === "string" ? record["label"] : direction,
        resolution: typeof record["resolution"] === "string" ? record["resolution"] : "unknown",
        confidence: typeof record["confidence"] === "string" ? record["confidence"] : "unknown",
        provenance: typeof record["provenance"] === "string" ? record["provenance"] : "analysis",
      },
    ]
  })
}

function SystemInspector({
  node,
  edges,
  nodes,
}: {
  node: WorkbenchSystemNode | null
  edges: WorkbenchSystemEdge[]
  nodes: Map<string, WorkbenchSystemNode>
}) {
  if (node === null) return <p className="empty">Select an element to inspect it.</p>
  const incoming = edges.filter((edge) => edge.targetId === node.id && edge.type !== "contains")
  const outgoing = edges.filter((edge) => edge.sourceId === node.id && edge.type !== "contains")

  return (
    <>
      <h2>{node.label}</h2>
      <p className="meta">
        {node.kind_label} - {node.source} - {node.confidence}
      </p>
      {node.file_path !== null && (
        <p>
          <code>
            {node.file_path}
            {node.start_line === null ? "" : `:${node.start_line}`}
          </code>
        </p>
      )}
      {node.signature !== null && <p className="technical-value">{node.signature}</p>}
      <section>
        <h3>Role</h3>
        <p>{node.responsibility ?? "Responsibility not specified."}</p>
        <dl>
          <dt>Boundary</dt>
          <dd>{node.boundary ?? "Not specified"}</dd>
          <dt>Owner</dt>
          <dd>{node.owner ?? "Not specified"}</dd>
          <dt>Technology</dt>
          <dd>{node.technology ?? "Not specified"}</dd>
        </dl>
      </section>
      <section>
        <h3>Relations</h3>
        <ul className="plain-list">
          {[...incoming, ...outgoing].slice(0, 20).map((edge) => {
            const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId
            return (
              <li key={edge.id}>
                {edge.label}: {nodes.get(otherId)?.label ?? otherId}
              </li>
            )
          })}
        </ul>
      </section>
      {node.entry_point_kind !== null && (
        <p>
          Entry point: <strong>{node.entry_point_kind}</strong>
        </p>
      )}
      <details>
        <summary>Technical details</summary>
        <p className="technical-value">{node.id}</p>
        <p className="technical-value">{node.provenance}</p>
      </details>
    </>
  )
}

function missing(value: string) {
  return { code: "SYSTEM-NOT-FOUND", message: `${value} unavailable` }
}
