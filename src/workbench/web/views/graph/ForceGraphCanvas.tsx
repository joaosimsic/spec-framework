import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force"
import { useEffect, useMemo, useRef, useState } from "react"
import { LabelEngine, type LabelCandidate, type LabelMode } from "./engine/label-engine"
import { ForceGraphLinkSanitizer } from "./force-links"
import { GraphViewportMath } from "./viewport"
import { useGraphViewport } from "./useGraphViewport"
import { ForceGraphRadii, type ForceGraphLink, type ForceGraphNode } from "./force-types"

interface ForceGraphCanvasProps {
  nodes: ForceGraphNode[]
  links: ForceGraphLink[]
  selected: string | null
  onSelect(ref: string): void
  onToggle(ref: string): void
}

interface SimulationNode extends SimulationNodeDatum {
  ref: string
  radius: number
}

interface SimulationLink extends SimulationLinkDatum<SimulationNode> {
  ref: string
  sourceRef: string
  targetRef: string
  label: string
  type: string
}

const WIDTH = 1600
const HEIGHT = 1000
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2

class ForceGraphLayout {
  static linkDistance(type: string): number {
    if (type === "contains" || type === "implements" || type === "declares") return 72
    if (type === "imports") return 92
    if (type === "part_of") return 72
    if (type === "depends_on") return 150

    return 190
  }

  static spawn(
    index: number,
    parent: { x: number; y: number } | undefined,
  ): { x: number; y: number } {
    const base = parent ?? { x: CENTER_X, y: CENTER_Y }
    const angle = index * 2.399963229728653
    const distance = parent === undefined ? 18 + index * 4 : 34

    return { x: base.x + Math.cos(angle) * distance, y: base.y + Math.sin(angle) * distance }
  }

  static nodeClass(kind: string): string {
    return `force-node force-node-${kind.replaceAll(/[^a-z0-9_-]/gi, "-")}`
  }
}

export function ForceGraphCanvas({
  nodes,
  links,
  selected,
  onSelect,
  onToggle,
}: ForceGraphCanvasProps) {
  const positions = useRef(new Map<string, { x: number; y: number }>())
  const simulationRef = useRef<Simulation<SimulationNode, SimulationLink> | null>(null)
  const [tick, setTick] = useState(0)
  const [labelMode, setLabelMode] = useState<LabelMode>("automatic")
  const graph = useGraphViewport(WIDTH, HEIGHT, "[data-force-node='true']")
  const byRef = useMemo(() => new Map(nodes.map((node) => [node.ref, node])), [nodes])
  const graphLinks = useMemo(() => ForceGraphLinkSanitizer.sanitize(nodes, links), [nodes, links])
  const labels = useMemo(() => {
    const engine = new LabelEngine({
      mode: labelMode,
      viewport: { width: WIDTH, height: HEIGHT, zoom: graph.viewport.zoom },
      measure: (text) => ({ width: Math.min(220, text.length * 7), height: 13 }),
    })
    const candidates: LabelCandidate[] = nodes.flatMap((node) => {
      const position = positions.current.get(node.ref)
      if (position === undefined) return []
      return [
        {
          id: node.ref,
          text: node.label,
          x: position.x,
          y: position.y,
          priority:
            selected === node.ref ? "selected" : node.parentRef === null ? "root" : "nearby",
          selected: selected === node.ref,
        },
      ]
    })
    const occupied = nodes.flatMap((node) => {
      const position = positions.current.get(node.ref)
      if (position === undefined) return []
      const radius = ForceGraphRadii.forKind(node.kind)
      return [
        { x: position.x - radius, y: position.y - radius, width: radius * 2, height: radius * 2 },
      ]
    })

    return engine.place(candidates, occupied)
  }, [nodes, selected, labelMode, graph.viewport.zoom, tick])

  useEffect(() => {
    simulationRef.current?.stop()
    const simulationNodes = nodes.map((node, index) => {
      const previous = positions.current.get(node.ref)
      const parent = node.parentRef === null ? undefined : positions.current.get(node.parentRef)
      const position = previous ?? ForceGraphLayout.spawn(index, parent)

      return {
        ref: node.ref,
        radius: ForceGraphRadii.forKind(node.kind),
        x: position.x,
        y: position.y,
      }
    })
    const simulationLinks = graphLinks.map((link) => ({
      ...link,
      source: link.sourceRef,
      target: link.targetRef,
    }))
    const simulation = forceSimulation<SimulationNode>(simulationNodes)
      .force(
        "link",
        forceLink<SimulationNode, SimulationLink>(simulationLinks)
          .id((node) => node.ref)
          .distance((link) => ForceGraphLayout.linkDistance(link.type))
          .strength(0.55),
      )
      .force(
        "charge",
        forceManyBody<SimulationNode>().strength((node) =>
          node.radius >= 24 ? -420 : node.radius >= 16 ? -240 : -110,
        ),
      )
      .force(
        "collide",
        forceCollide<SimulationNode>()
          .radius((node) => node.radius + 9)
          .iterations(2),
      )
      .force("center", forceCenter<SimulationNode>(CENTER_X, CENTER_Y).strength(0.06))
      .force("x", forceX<SimulationNode>(CENTER_X).strength(0.018))
      .force("y", forceY<SimulationNode>(CENTER_Y).strength(0.018))
      .alphaDecay(0.035)
      .velocityDecay(0.32)

    const savePositions = (): void => {
      for (const node of simulation.nodes()) {
        positions.current.set(node.ref, { x: node.x ?? CENTER_X, y: node.y ?? CENTER_Y })
      }
    }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    simulation.on("tick", () => {
      savePositions()
      setTick((tick) => tick + 1)
    })

    simulationRef.current = simulation
    if (reducedMotion) {
      simulation.stop()
      for (let index = 0; index < 240; index++) simulation.tick()
      savePositions()
      setTick((tick) => tick + 1)
    } else {
      simulation.alpha(1).restart()
    }

    return () => {
      simulation.stop()
    }
  }, [nodes, graphLinks])

  return (
    <section className="panel graph-panel force-panel" aria-label="Graph">
      <div className="graph-controls architecture-zoom-controls">
        <label className="graph-control-group">
          Labels
          <select
            value={labelMode}
            onChange={(event) => setLabelMode(event.target.value as LabelMode)}
          >
            <option value="automatic">Automatic</option>
            <option value="all">All</option>
            <option value="selected">Selected</option>
          </select>
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
      </div>

      <svg
        ref={graph.svgRef}
        className="graph-canvas force-canvas"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        aria-label={`${nodes.length} nodes and ${graphLinks.length} relations`}
        onPointerDown={graph.onPointerDown}
        onPointerMove={graph.onPointerMove}
        onPointerUp={graph.onPointerUp}
        onPointerCancel={graph.onPointerCancel}
      >
        <g transform={graph.transform}>
          {graphLinks.map((link) => {
            const source = positions.current.get(link.sourceRef)
            const target = positions.current.get(link.targetRef)
            if (source === undefined || target === undefined) return null
            const showLabel = selected === link.sourceRef || selected === link.targetRef

            return (
              <g
                key={link.ref}
                className={`force-link force-link-${link.type.replaceAll(/[^a-z0-9_-]/gi, "-")}`}
              >
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
                {showLabel && (
                  <text
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2 - 5}
                    textAnchor="middle"
                  >
                    {link.label}
                  </text>
                )}
                <title>
                  {link.label}: {byRef.get(link.sourceRef)?.label ?? "Related node"} to{" "}
                  {byRef.get(link.targetRef)?.label ?? "Related node"}
                </title>
              </g>
            )
          })}

          {labels.map((label) => (
            <text
              key={`label-${label.id}`}
              className="force-node-label"
              x={label.x}
              y={label.y + label.height}
              textAnchor="start"
            >
              {label.text}
            </text>
          ))}

          {nodes.map((node) => {
            const position = positions.current.get(node.ref)
            if (position === undefined) return null
            const radius = ForceGraphRadii.forKind(node.kind)
            const collapsed = (node.hiddenCount ?? 0) > 0

            return (
              <g
                key={node.ref}
                data-force-node="true"
                className={`${ForceGraphLayout.nodeClass(node.kind)}${selected === node.ref ? " force-node-selected" : ""}`}
                transform={`translate(${position.x} ${position.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={selected === node.ref}
                aria-label={`${node.label}, ${node.kindLabel}${collapsed ? `, ${node.hiddenCount} hidden nodes` : ""}`}
                onClick={() => onSelect(node.ref)}
                onDoubleClick={() => onToggle(node.ref)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    onSelect(node.ref)
                    return
                  }
                  if (event.key !== " ") return
                  event.preventDefault()
                  onToggle(node.ref)
                }}
              >
                <circle r={radius} />
                {collapsed && (
                  <g className="force-node-badge" transform={`translate(${radius} ${-radius})`}>
                    <circle r={9} />
                    <text y={3} textAnchor="middle">
                      +{node.hiddenCount}
                    </text>
                  </g>
                )}
                <title>
                  {node.label} - {node.kindLabel}
                  {node.description === undefined ? "" : `. ${node.description}`}
                </title>
              </g>
            )
          })}
        </g>
      </svg>
      <p className="meta graph-hint">
        Scroll to zoom, drag to pan. Click selects; double-click expands or collapses.
      </p>
    </section>
  )
}
