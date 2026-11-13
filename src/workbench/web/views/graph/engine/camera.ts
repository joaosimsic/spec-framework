export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

export class CameraFit {
  static fit(bounds: Bounds, width: number, height: number, padding = 48): Camera {
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX)
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY)
    const zoom = Math.min(
      (width - padding * 2) / contentWidth,
      (height - padding * 2) / contentHeight,
      2,
    )
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2

    return {
      x: width / 2 - centerX * zoom,
      y: height / 2 - centerY * zoom,
      zoom,
    }
  }
}
