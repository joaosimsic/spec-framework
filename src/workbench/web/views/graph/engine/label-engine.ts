export type LabelMode = "automatic" | "all" | "selected"
export type LabelPriority = "selected" | "hovered" | "root" | "nearby" | "distant"

export interface LabelCandidate {
  id: string
  text: string
  x: number
  y: number
  priority: LabelPriority
  selected?: boolean
}

export interface LabelBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface MeasuredLabel extends LabelBounds {
  id: string
  text: string
  priority: LabelPriority
}

export interface LabelViewport {
  width: number
  height: number
  zoom: number
}

export interface LabelEngineOptions {
  mode: LabelMode
  viewport: LabelViewport
  measure(text: string): { width: number; height: number }
  padding?: number
}

const PRIORITY_ORDER: Record<LabelPriority, number> = {
  selected: 0,
  hovered: 1,
  root: 2,
  nearby: 3,
  distant: 4,
}

export class LabelEngine {
  private readonly cache = new Map<string, { width: number; height: number }>()

  constructor(private readonly options: LabelEngineOptions) {}

  place(candidates: LabelCandidate[], occupied: LabelBounds[] = []): MeasuredLabel[] {
    if (this.options.mode === "selected") {
      candidates = candidates.filter((candidate) => candidate.selected === true)
    }
    const limit = this.options.viewport.zoom < 0.55 ? 1 : this.options.viewport.zoom < 0.9 ? 3 : 5
    const accepted: MeasuredLabel[] = []
    const blocked = [...occupied]

    for (const candidate of [...candidates].sort((left, right) => this.compare(left, right))) {
      const size = this.measure(candidate.text)
      const placements = [
        { x: candidate.x + 8, y: candidate.y - size.height / 2 },
        { x: candidate.x - size.width - 8, y: candidate.y - size.height / 2 },
        { x: candidate.x - size.width / 2, y: candidate.y - size.height - 10 },
        { x: candidate.x - size.width / 2, y: candidate.y + 10 },
      ]
      const placed = placements
        .map((placement) => ({ ...placement, width: size.width, height: size.height }))
        .find(
          (bounds) =>
            this.inside(bounds) &&
            (candidate.priority === "selected" ||
              !blocked.some((existing) =>
                this.overlaps(bounds, existing, this.options.padding ?? 3),
              )),
        )
      if (placed === undefined) continue
      accepted.push({ ...candidate, ...placed })
      blocked.push(placed)
      if (accepted.length >= limit) break
    }

    return accepted
  }

  private measure(text: string): { width: number; height: number } {
    const cached = this.cache.get(text)
    if (cached !== undefined) return cached
    const measured = this.options.measure(text)
    this.cache.set(text, measured)

    return measured
  }

  private compare(left: LabelCandidate, right: LabelCandidate): number {
    const priority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    if (priority !== 0) return priority

    return left.id.localeCompare(right.id)
  }

  private inside(bounds: LabelBounds): boolean {
    return (
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= this.options.viewport.width &&
      bounds.y + bounds.height <= this.options.viewport.height
    )
  }

  private overlaps(left: LabelBounds, right: LabelBounds, padding: number): boolean {
    return !(
      left.x + left.width + padding < right.x ||
      right.x + right.width + padding < left.x ||
      left.y + left.height + padding < right.y ||
      right.y + right.height + padding < left.y
    )
  }
}
