export interface RadialPosition {
  x: number
  y: number
}

export class RadialLayout {
  static place(
    center: RadialPosition,
    count: number,
    radius: number,
    startAngle = -Math.PI / 2,
  ): RadialPosition[] {
    if (count <= 0) return []
    const step = (Math.PI * 2) / count

    return Array.from({ length: count }, (_, index) => {
      const angle = startAngle + step * index
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      }
    })
  }

  static radius(count: number, nodeRadius: number, spacing: number): number {
    if (count <= 1) return nodeRadius + spacing

    return Math.max(nodeRadius * 2, (nodeRadius * 2 + spacing) / (2 * Math.sin(Math.PI / count)))
  }
}
