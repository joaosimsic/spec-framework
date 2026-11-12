import { useMemo } from "react"
import type { WorkbenchArchitectureGraphEdge, WorkbenchArchitectureGraphNode } from "../../../types"
import { useGraphViewport } from "../graph/useGraphViewport"
import { GraphViewportMath } from "../graph/viewport"
import { ArchitectureLayout } from "./layout"

interface ArchitectureCanvasProps {
  nodes: WorkbenchArchitectureGraphNode[]
  edges: WorkbenchArchitectureGraphEdge[]
  collapsed: Set<string>
  selected: string | null
  onSelect(ref: string): void
}

export function ArchitectureCanvas({
  nodes,
  edges,
  collapsed,
  selected,
  onSelect,
}: ArchitectureCanvasProps) {
  const geometry = useMemo(() => ArchitectureLayout.build(nodes, collapsed), [nodes, collapsed])
  const byRef = useMemo(() => new Map(nodes.map((node) => [node.ref, node])), [nodes])
  const graph = useGraphViewport(geometry.width, geometry.height, "[data-architecture-node='true']")

  return (
    <section className="panel graph-panel" aria-label="Architecture graph">
      <div className="graph-controls architecture-zoom-controls">
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
      </div>

      <svg
        ref={graph.svgRef}
        className="graph-canvas architecture-canvas"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="group"
        aria-label={`${nodes.length} architecture elements and ${edges.length} relations`}
        onPointerDown={graph.onPointerDown}
        onPointerMove={graph.onPointerMove}
        onPointerUp={graph.onPointerUp}
        onPointerCancel={graph.onPointerCancel}
      >
        <defs>
          <marker
            id="architecture-arrow"
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
          {geometry.clusters.map((cluster) => (
            <rect
              key={cluster.ref}
              className="architecture-cluster"
              x={cluster.x}
              y={cluster.y}
              width={cluster.width}
              height={cluster.height}
              rx={14}
            />
          ))}

          {edges.map((edge) => {
            const source = geometry.positions.get(edge.sourceRef)
            const target = geometry.positions.get(edge.targetRef)
            if (source === undefined || target === undefined) return null
            const sourceNode = byRef.get(edge.sourceRef)
            const targetNode = byRef.get(edge.targetRef)
            const crossGroup = sourceNode?.groupRef !== targetNode?.groupRef
            const middleX = (source.x + target.x) / 2
            const middleY = (source.y + target.y) / 2

            return (
              <g
                key={edge.ref}
                className={`architecture-edge${crossGroup ? " architecture-edge-cross" : ""}`}
              >
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  markerEnd="url(#architecture-arrow)"
                />
                <text x={middleX} y={middleY - 5} textAnchor="middle">
                  {shortLabel(edge.label, 20)}
                </text>
                <title>
                  {edge.label}: {sourceNode?.label ?? "Related element"} to{" "}
                  {targetNode?.label ?? "Related element"}
                </title>
              </g>
            )
          })}

          {geometry.nodes.map((box) => {
            const node = byRef.get(box.ref)
            if (node === undefined) return null
            const group = node.childCount > 0

            return (
              <g
                key={node.ref}
                data-architecture-node="true"
                className={`architecture-node${group ? " architecture-node-group" : ""}${selected === node.ref ? " architecture-node-selected" : ""}`}
                transform={`translate(${box.x} ${box.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={selected === node.ref}
                aria-label={`${node.label}, ${node.kindLabel}${group ? `, group with ${node.childCount} children` : ""}`}
                onClick={() => onSelect(node.ref)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  onSelect(node.ref)
                }}
              >
                <rect width={box.width} height={box.height} rx={8} />
                <text x={12} y={20}>
                  {shortLabel(node.label, 22)}
                </text>
                <text className="architecture-node-meta" x={12} y={35}>
                  {node.kindLabel}
                  {group ? ` - ${node.childCount} inside` : ""}
                </text>
                <title>
                  {node.label} - {node.kindLabel}, {node.stateLabel}
                </title>
              </g>
            )
          })}
        </g>
      </svg>
      <p className="meta graph-hint">
        Scroll to zoom, drag to pan. Select a group to collapse or expand it in the details panel.
      </p>
    </section>
  )
}

function shortLabel(value: string, length: number): string {
  if (value.length <= length) return value

  return `${value.slice(0, length - 1)}...`
}
