import { describe, expect, test } from "bun:test"
import { CameraFit } from "../src/workbench/web/views/graph/engine/camera"
import { ExpansionPlanner } from "../src/workbench/web/views/graph/engine/expansion"
import { LabelEngine } from "../src/workbench/web/views/graph/engine/label-engine"
import { RadialLayout } from "../src/workbench/web/views/graph/engine/radial-layout"
import { SpatialIndex } from "../src/workbench/web/views/graph/engine/spatial-index"

describe("graph rendering engine", () => {
  test("places labels with collision avoidance and priority", () => {
    const engine = new LabelEngine({
      mode: "all",
      viewport: { width: 400, height: 300, zoom: 1 },
      measure: (text) => ({ width: text.length * 7, height: 12 }),
    })
    const labels = engine.place(
      [
        { id: "b", text: "Distant", x: 50, y: 50, priority: "distant" },
        { id: "a", text: "Selected", x: 52, y: 52, priority: "selected", selected: true },
        { id: "c", text: "Second", x: 200, y: 120, priority: "nearby" },
      ],
      [{ x: 40, y: 40, width: 60, height: 24 }],
    )
    expect(labels[0]?.id).toBe("a")
    expect(labels.some((label) => label.id === "c")).toBe(true)
  })

  test("places many children radially and fits the camera", () => {
    const positions = RadialLayout.place({ x: 100, y: 100 }, 12, 80)
    expect(positions).toHaveLength(12)
    expect(new Set(positions.map((position) => `${position.x}:${position.y}`)).size).toBe(12)
    const bounds = {
      minX: Math.min(...positions.map((position) => position.x)),
      minY: Math.min(...positions.map((position) => position.y)),
      maxX: Math.max(...positions.map((position) => position.x)),
      maxY: Math.max(...positions.map((position) => position.y)),
    }
    const camera = CameraFit.fit(bounds, 800, 600)
    expect(camera.zoom).toBeGreaterThan(0)
    expect(camera.zoom).toBeLessThanOrEqual(2)
  })

  test("supports hybrid expansion and spatial queries", () => {
    const visible = ExpansionPlanner.reveal({
      selected: new Set(["root"]),
      children: new Map([["root", ["child"]]]),
      neighbors: new Map([["root", ["neighbor"]]]),
      strategy: "hybrid",
    })
    expect(visible.has("child")).toBe(true)
    expect(visible.has("neighbor")).toBe(true)

    const index = new SpatialIndex(40)
    index.insert({ id: "a", x: 10, y: 10, radius: 4 })
    index.insert({ id: "b", x: 200, y: 200, radius: 4 })
    expect(index.query(10, 10, 2).map((point) => point.id)).toEqual(["a"])
  })

  test("handles a 5000 node spatial index", () => {
    const index = new SpatialIndex()
    for (let nodeIndex = 0; nodeIndex < 5000; nodeIndex++) {
      index.insert({
        id: `node-${nodeIndex}`,
        x: (nodeIndex % 100) * 20,
        y: Math.floor(nodeIndex / 100) * 20,
        radius: 5,
      })
    }
    expect(index.query(200, 200, 30).length).toBeGreaterThan(0)
  })
})
