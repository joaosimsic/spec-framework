export interface GraphPoint {
  x: number
  y: number
}

export interface GraphViewport {
  zoom: number
  pan: GraphPoint
}

export class GraphViewportMath {
  static readonly minimumZoom = 0.25
  static readonly maximumZoom = 8
  static readonly zoomStep = 1.25

  static initial(): GraphViewport {
    return { zoom: 1, pan: { x: 0, y: 0 } }
  }

  static zoomBy(viewport: GraphViewport, point: GraphPoint, factor: number): GraphViewport {
    return GraphViewportMath.zoomAt(
      viewport,
      point,
      GraphViewportMath.clampZoom(viewport.zoom * factor),
    )
  }

  static zoomAt(viewport: GraphViewport, point: GraphPoint, zoom: number): GraphViewport {
    const nextZoom = GraphViewportMath.clampZoom(zoom)
    const ratio = nextZoom / viewport.zoom

    return {
      zoom: nextZoom,
      pan: {
        x: point.x - (point.x - viewport.pan.x) * ratio,
        y: point.y - (point.y - viewport.pan.y) * ratio,
      },
    }
  }

  static panFrom(start: GraphViewport, startPoint: GraphPoint, point: GraphPoint): GraphViewport {
    return {
      zoom: start.zoom,
      pan: {
        x: start.pan.x + point.x - startPoint.x,
        y: start.pan.y + point.y - startPoint.y,
      },
    }
  }

  static transform(viewport: GraphViewport): string {
    return `translate(${viewport.pan.x} ${viewport.pan.y}) scale(${viewport.zoom})`
  }

  static percent(viewport: GraphViewport): number {
    return Math.round(viewport.zoom * 100)
  }

  static pointFromClient(svg: SVGSVGElement, clientX: number, clientY: number): GraphPoint | null {
    const matrix = svg.getScreenCTM()
    if (matrix === null) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const transformed = point.matrixTransform(matrix.inverse())

    return { x: transformed.x, y: transformed.y }
  }

  private static clampZoom(zoom: number): number {
    return Math.min(GraphViewportMath.maximumZoom, Math.max(GraphViewportMath.minimumZoom, zoom))
  }
}
