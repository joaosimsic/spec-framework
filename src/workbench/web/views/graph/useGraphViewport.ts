import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { GraphViewportMath, type GraphPoint, type GraphViewport } from "./viewport"

interface DragState {
  pointerId: number
  viewport: GraphViewport
  point: GraphPoint
}

export interface GraphViewportControl {
  svgRef(node: SVGSVGElement | null): void
  viewport: GraphViewport
  transform: string
  zoomIn(): void
  zoomOut(): void
  reset(): void
  onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void
  onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void
  onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void
  onPointerCancel(): void
}

export function useGraphViewport(
  width: number,
  height: number,
  ignoreSelector: string,
): GraphViewportControl {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null)
  const drag = useRef<DragState | null>(null)
  const [viewport, setViewport] = useState(GraphViewportMath.initial)
  const svgRef = useCallback((node: SVGSVGElement | null) => {
    setSvg(node)
  }, [])

  useEffect(() => {
    if (svg === null) return

    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const point = GraphViewportMath.pointFromClient(svg, event.clientX, event.clientY)
      if (point === null) return
      const factor = Math.exp(-event.deltaY * 0.0015)
      setViewport((current) => GraphViewportMath.zoomBy(current, point, factor))
    }

    svg.addEventListener("wheel", handleWheel, { passive: false })
    return () => svg.removeEventListener("wheel", handleWheel)
  }, [svg])

  function zoomIn(): void {
    setViewport((current) =>
      GraphViewportMath.zoomBy(
        current,
        { x: width / 2, y: height / 2 },
        GraphViewportMath.zoomStep,
      ),
    )
  }

  function zoomOut(): void {
    setViewport((current) =>
      GraphViewportMath.zoomBy(
        current,
        { x: width / 2, y: height / 2 },
        1 / GraphViewportMath.zoomStep,
      ),
    )
  }

  function reset(): void {
    setViewport(GraphViewportMath.initial())
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.button !== 0) return
    if ((event.target as Element).closest(ignoreSelector) !== null) return
    const point = GraphViewportMath.pointFromClient(
      event.currentTarget,
      event.clientX,
      event.clientY,
    )
    if (point === null) return
    drag.current = { pointerId: event.pointerId, viewport, point }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    const point = GraphViewportMath.pointFromClient(
      event.currentTarget,
      event.clientX,
      event.clientY,
    )
    if (point === null) return
    setViewport(GraphViewportMath.panFrom(current.viewport, current.point, point))
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function onPointerCancel(): void {
    drag.current = null
  }

  return {
    svgRef,
    viewport,
    transform: GraphViewportMath.transform(viewport),
    zoomIn,
    zoomOut,
    reset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
