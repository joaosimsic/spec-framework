import { describe, expect, test } from "bun:test"
import { GraphViewportMath } from "../src/workbench/web/views/graph/viewport"

describe("GraphViewportMath", () => {
  test("keeps the point under the cursor stable while zooming", () => {
    const start = { zoom: 1, pan: { x: 0, y: 0 } }
    const point = { x: 120, y: 80 }
    const next = GraphViewportMath.zoomAt(start, point, 2)

    expect(next).toEqual({ zoom: 2, pan: { x: -120, y: -80 } })
    expect((point.x - next.pan.x) / next.zoom).toBeCloseTo((point.x - start.pan.x) / start.zoom)
    expect((point.y - next.pan.y) / next.zoom).toBeCloseTo((point.y - start.pan.y) / start.zoom)
  })

  test("clamps zoom to the supported range", () => {
    const start = { zoom: 1, pan: { x: 0, y: 0 } }

    expect(GraphViewportMath.zoomBy(start, { x: 0, y: 0 }, 100).zoom).toBe(
      GraphViewportMath.maximumZoom,
    )
    expect(GraphViewportMath.zoomBy(start, { x: 0, y: 0 }, 0.001).zoom).toBe(
      GraphViewportMath.minimumZoom,
    )
  })

  test("pans by viewBox distance without changing zoom", () => {
    const start = { zoom: 3, pan: { x: 10, y: 20 } }
    const next = GraphViewportMath.panFrom(start, { x: 100, y: 100 }, { x: 140, y: 70 })

    expect(next).toEqual({ zoom: 3, pan: { x: 50, y: -10 } })
    expect(GraphViewportMath.transform(next)).toBe("translate(50 -10) scale(3)")
    expect(GraphViewportMath.percent(next)).toBe(300)
  })
})
