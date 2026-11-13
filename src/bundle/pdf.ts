const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const LEFT = 50
const TOP = 792
const LEADING = 12
const LINES = 58

export class GeneratedPdfRenderer {
  render(lines: string[]): Uint8Array {
    const pages = this.paginate(lines)
    const objects: string[] = []
    const pageIds = pages.map((_, index) => 5 + index * 2)
    objects.push(this.object(1, "<< /Type /Catalog /Pages 2 0 R >>"))
    objects.push(
      this.object(
        2,
        `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
      ),
    )
    objects.push(this.object(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    for (const [index, page] of pages.entries()) {
      const content = this.content(page)
      const contentId = 4 + index * 2
      const pageId = 5 + index * 2
      objects.push(
        this.object(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
      )
      objects.push(
        this.object(
          pageId,
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      )
    }
    let body = "%PDF-1.4\n"
    const offsets: number[] = []
    for (const object of objects) {
      offsets.push(body.length)
      body += object
    }
    const xref = body.length
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

    return new TextEncoder().encode(body)
  }

  private paginate(lines: string[]): string[][] {
    const pages: string[][] = []
    for (let index = 0; index < lines.length; index += LINES)
      pages.push(lines.slice(index, index + LINES))
    return pages.length === 0 ? [[]] : pages
  }

  private content(lines: string[]): string {
    return lines
      .map(
        (line, index) =>
          `BT /F1 9 Tf 1 0 0 1 ${LEFT} ${TOP - index * LEADING} Tm (${this.escape(line.slice(0, 100))}) Tj ET`,
      )
      .join("\n")
  }

  private object(id: number, body: string): string {
    return `${id} 0 obj\n${body}\nendobj\n`
  }

  private escape(value: string): string {
    return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
  }
}
