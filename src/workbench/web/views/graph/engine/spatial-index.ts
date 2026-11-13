export interface SpatialPoint {
  id: string
  x: number
  y: number
  radius: number
}

export class SpatialIndex {
  private readonly cells = new Map<string, SpatialPoint[]>()

  constructor(private readonly cellSize = 80) {}

  insert(point: SpatialPoint): void {
    for (const key of this.keys(
      point.x - point.radius,
      point.y - point.radius,
      point.x + point.radius,
      point.y + point.radius,
    )) {
      const cell = this.cells.get(key) ?? []
      cell.push(point)
      this.cells.set(key, cell)
    }
  }

  query(x: number, y: number, radius = 0): SpatialPoint[] {
    const found = new Map<string, SpatialPoint>()
    for (const key of this.keys(x - radius, y - radius, x + radius, y + radius)) {
      for (const point of this.cells.get(key) ?? []) found.set(point.id, point)
    }

    return [...found.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private keys(minX: number, minY: number, maxX: number, maxY: number): Set<string> {
    const keys = new Set<string>()
    const startX = Math.floor(minX / this.cellSize)
    const endX = Math.floor(maxX / this.cellSize)
    const startY = Math.floor(minY / this.cellSize)
    const endY = Math.floor(maxY / this.cellSize)
    for (let column = startX; column <= endX; column++) {
      for (let row = startY; row <= endY; row++) keys.add(`${column}:${row}`)
    }

    return keys
  }
}
