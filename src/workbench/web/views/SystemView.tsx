import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fail, ok } from "../../../core/result"
import {
  getCurrentProject,
  getSystemArchitecture,
  getSystemChildren,
  getSystemGraph,
  getSystemImplementation,
  getSystemRelationships,
  getUnassignedImplementation,
} from "../api"
import { EmptyPanel, FailurePanel, LoadingPanel } from "../components/Panels"
import { useApiResource } from "../components/useApiResource"
import type {
  WorkbenchMapping,
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
  unassigned: WorkbenchSystemNode[]
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
    const [unassigned, unassignedError] = await getUnassignedImplementation(project.id)
    if (unassignedError !== null || unassigned === null) {
      return fail(unassignedError ?? missing("implementation"))
    }

    return ok({ project, architecture, graph, unassigned })
  }, [])
  const system = useApiResource<SystemData>(load)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [extraNodes, setExtraNodes] = useState<WorkbenchSystemNode[]>([])
  const [extraEdges, setExtraEdges] = useState<WorkbenchSystemEdge[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [overlay, setOverlay] = useState(false)
  const [implementation, setImplementation] = useState<{
    nodes: WorkbenchSystemNode[]
    mappings: WorkbenchMapping[]
  }>({ nodes: [], mappings: [] })
  const expanding = useRef(new Set<string>())

  useEffect(() => {
    if (selected === null) {
      setImplementation({ nodes: [], mappings: [] })
      return
    }
    let cancelled = false
    void getSystemImplementation(selected).then(([result, error]) => {
      if (cancelled) return
      if (error !== null || result === null) {
        setImplementation({ nodes: [], mappings: [] })
        return
      }
      setImplementation({ nodes: result.nodes, mappings: result.mappings as WorkbenchMapping[] })
    })

    return () => {
      cancelled = true
    }
  }, [selected])

  const overlayNodes = useMemo(
    () => (overlay && selected !== null ? implementation.nodes : []),
    [overlay, selected, implementation.nodes],
  )
  const overlayEdges = useMemo(
    () =>
      overlay && selected !== null
        ? implementation.nodes.map((node) => ({
            id: `MAP-LINK-${selected}-${node.id}`,
            sourceId: selected,
            targetId: node.id,
            type: "maps_to",
            label: "maps to",
            resolution: "resolved",
            confidence: "observed",
            provenance: "analysis:behavior-reachability",
          }))
        : [],
    [overlay, selected, implementation.nodes],
  )
  const allNodes = useMemo(() => {
    const nodes = [...(system.data?.graph.nodes ?? []), ...extraNodes, ...overlayNodes]
    return [...new Map(nodes.map((node) => [node.id, node])).values()]
  }, [system.data, extraNodes, overlayNodes])
  const allEdges = useMemo(() => {
    const edges = [...(system.data?.graph.edges ?? []), ...extraEdges, ...overlayEdges]
    return [...new Map(edges.map((edge) => [edge.id, edge])).values()]
  }, [system.data, extraEdges, overlayEdges])
  const universe = useMemo(() => buildUniverse(allNodes, allEdges), [allNodes, allEdges])
  const effectiveExpanded = useMemo(() => {
    if (!overlay || selected === null) return expanded
    return new Set(expanded).add(selected)
  }, [expanded, overlay, selected])
  const visible = useMemo(
    () => ForceGraphVisibility.build(universe, effectiveExpanded, query),
    [universe, effectiveExpanded, query],
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
          {system.data.architecture.summary.nodes} conceptual -{" "}
          {system.data.architecture.summary.files} files -{" "}
          {system.data.architecture.summary.symbols} symbols
        </p>
        <p className="meta graph-description">
          Conceptual nodes come from observed behavior anchors. Expand a component for interfaces,
          data stores, and external systems. Files and symbols stay in the implementation overlay.
          Snapshot {system.data.architecture.snapshot_id.slice(0, 13)} at commit{" "}
          {system.data.architecture.commit.slice(0, 8)}.
        </p>
      </section>

      <section className="panel graph-controls graph-toolbar" aria-label="System controls">
        <label className="graph-field">
          Search
          <input
            value={query}
            placeholder="Label, interface, or evidence"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="graph-field">
          <input
            type="checkbox"
            checked={overlay}
            onChange={(event) => setOverlay(event.target.checked)}
          />
          Implementation overlay
        </label>
        <div className="graph-control-group">
          <span className="meta">Coverage</span>
          <span>{system.data.architecture.coverage.mapped.length} mapped</span>
          <span>{system.data.architecture.coverage.unmapped.length} unmapped</span>
          <span>{system.data.architecture.coverage.unassigned.length} unassigned files</span>
        </div>
      </section>

      <div className="graph-layout">
        <nav className="panel system-hierarchy" aria-label="Conceptual hierarchy">
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
          <SystemInspector
            node={selectedNode}
            edges={allEdges}
            nodes={nodeById}
            implementation={implementation.nodes}
          />
        </aside>
      </div>

      <section className="panel" aria-label="Coverage">
        <h2>Coverage</h2>
        <ul className="plain-list">
          <li>{system.data.architecture.coverage.mapped.length} conceptual elements mapped</li>
          <li>{system.data.architecture.coverage.partial.length} partially mapped</li>
          <li>{system.data.architecture.coverage.unmapped.length} unmapped</li>
          <li>{system.data.architecture.coverage.ambiguous.length} ambiguous mappings</li>
          <li>
            {system.data.architecture.coverage.entryPointsWithoutSinks.length} entry points without
            sinks
          </li>
          <li>
            {system.data.architecture.coverage.behaviorWithoutImplementation.length} behavior
            records without implementation
          </li>
          <li>{system.data.architecture.coverage.externalSystems.length} external systems</li>
          <li>{system.data.unassigned.length} unassigned implementation files</li>
        </ul>
        {system.data.unassigned.length > 0 && (
          <details>
            <summary>Unassigned implementation</summary>
            <ul className="plain-list">
              {system.data.unassigned.slice(0, 50).map((file) => (
                <li key={file.id}>
                  <code>{file.file_path ?? file.label}</code>
                </li>
              ))}
            </ul>
          </details>
        )}
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
    description: node.summary ?? node.file_path ?? node.signature ?? node.provenance,
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
  implementation,
}: {
  node: WorkbenchSystemNode | null
  edges: WorkbenchSystemEdge[]
  nodes: Map<string, WorkbenchSystemNode>
  implementation: WorkbenchSystemNode[]
}) {
  if (node === null) return <p className="empty">Select a conceptual element to inspect it.</p>
  const incoming = edges.filter((edge) => edge.targetId === node.id && edge.type !== "contains")
  const outgoing = edges.filter((edge) => edge.sourceId === node.id && edge.type !== "contains")

  return (
    <>
      <h2>{node.label}</h2>
      <p className="meta">
        {node.kind_label} - {node.source} - {node.confidence}
      </p>
      {node.summary !== null && <p>{node.summary}</p>}
      <section>
        <h3>Evidence</h3>
        <ul className="plain-list">
          {node.label_evidence.map((value) => (
            <li key={value} className="technical-value">
              {value}
            </li>
          ))}
        </ul>
      </section>
      {node.entry_points.length > 0 && (
        <section>
          <h3>Entry points</h3>
          <ul className="plain-list">
            {node.entry_points.map((value) => (
              <li key={value} className="technical-value">
                {value}
              </li>
            ))}
          </ul>
        </section>
      )}
      {node.public_surface.length > 0 && (
        <section>
          <h3>Public surface</h3>
          <ul className="plain-list">
            {node.public_surface.map((value) => (
              <li key={value}>
                <code>{value}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
      {node.data_access.length > 0 && (
        <section>
          <h3>Data</h3>
          <ul className="plain-list">
            {node.data_access.map((value) => (
              <li key={`${value.kind}:${value.channel}:${value.target}`}>
                {value.kind} {value.channel}: <code>{value.target}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
      {node.tests.length > 0 && (
        <section>
          <h3>Tests</h3>
          <ul className="plain-list">
            {node.tests.map((value) => (
              <li key={value}>
                <code>{value}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
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
      <section>
        <h3>Implementation</h3>
        <ul className="plain-list">
          {implementation.slice(0, 50).map((item) => (
            <li key={item.id}>
              <code>{item.file_path ?? item.label}</code>
            </li>
          ))}
          {implementation.length === 0 && <li>No implementation mapping.</li>}
        </ul>
      </section>
      {node.unknowns.length > 0 && (
        <section>
          <h3>Unknowns</h3>
          <ul className="plain-list">
            {node.unknowns.slice(0, 20).map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </section>
      )}
      {node.hypothesis !== null && (
        <section>
          <h3>AI hypothesis</h3>
          <p>{node.hypothesis.text}</p>
          <p className="meta">
            {node.hypothesis.provider} {node.hypothesis.model} - confidence{" "}
            {node.hypothesis.confidence.toFixed(2)}
          </p>
        </section>
      )}
      <details>
        <summary>Technical details</summary>
        <p className="technical-value">{node.id}</p>
        <p className="technical-value">
          {node.label_role} {node.label_anchor}
        </p>
        <p className="technical-value">{node.provenance}</p>
      </details>
    </>
  )
}

function missing(value: string) {
  return { code: "SYSTEM-NOT-FOUND", message: `${value} unavailable` }
}
