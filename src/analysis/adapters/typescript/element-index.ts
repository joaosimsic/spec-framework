export interface ElementSpan {
  id: string
  filePath: string
  start: number
  end: number
}

export class ElementIndex {
  private readonly spans: ElementSpan[] = []

  add(span: ElementSpan): void {
    this.spans.push(span)
  }

  all(): ElementSpan[] {
    return [...this.spans]
  }

  find(filePath: string, position: number): string | null {
    const candidates = this.spans
      .filter(
        (span) => span.filePath === filePath && span.start <= position && position <= span.end,
      )
      .sort((left, right) => right.start - left.start || left.end - right.end)

    return candidates[0]?.id ?? null
  }
}
