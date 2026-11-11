import type { BundleReport } from "./types"

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const LEFT_MARGIN = 50
const TOP_BASELINE = 792
const FONT_SIZE = 9
const LEADING = 12.5
const MAX_LINE_WIDTH = 100
const LINES_PER_PAGE = 56

export class BundlePdfRenderer {
  render(report: BundleReport): Uint8Array {
    const pages = this.paginate(this.lines(report))
    const objects: Buffer[] = []
    const pageIds = pages.map((_, index) => 5 + index * 2)

    objects.push(this.object(1, `<< /Type /Catalog /Pages 2 0 R >>`))
    objects.push(
      this.object(
        2,
        `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
      ),
    )
    objects.push(this.object(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`))

    for (const [index, lines] of pages.entries()) {
      const content = this.content(lines)
      const contentId = 4 + index * 2
      const pageId = 5 + index * 2
      objects.push(
        this.object(
          contentId,
          `<< /Length ${content.length} >>\nstream\n${content.toString("latin1")}\nendstream`,
        ),
      )
      objects.push(
        this.object(
          pageId,
          [
            "<< /Type /Page",
            "/Parent 2 0 R",
            `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`,
            "/Resources << /Font << /F1 3 0 R >> >>",
            `/Contents ${contentId} 0 R`,
            ">>",
          ].join(" "),
        ),
      )
    }

    return this.document(Buffer.concat(objects))
  }

  private lines(report: BundleReport): string[] {
    const lines = [
      "Audit bundle",
      `Project: ${report.project}`,
      `Spec version: ${report.specVersion}`,
      `Workspace: ${report.workspace}`,
      `Commit: ${report.commit}`,
      `Dirty tree: ${report.dirty}`,
      `Preview only: ${report.preview}`,
      `Approval: ${
        report.lock === null ? "none" : `${report.lock.approver} at ${report.lock.approved_at}`
      }`,
      "",
      "Scope",
      "Generated deterministically from specification sources, native checks, evidence, and approval lock. Internal identity and hashes are preserved.",
    ]

    lines.push("", "Requirements")

    const requirements = report.elements.filter((element) => element.kind === "requirement")
    if (requirements.length === 0) lines.push("None.")
    for (const element of requirements) {
      lines.push(this.elementLine(element), `  links: ${this.links(element)}`)
    }

    lines.push("", "Acceptance criteria")
    const acceptance = report.elements.filter((element) => element.kind === "acceptance_criterion")
    if (acceptance.length === 0) lines.push("None.")
    for (const element of acceptance) {
      lines.push(this.elementLine(element), `  links: ${this.links(element)}`)
    }

    lines.push("", "Traceability")
    for (const element of report.elements) {
      lines.push(`${element.id} (${element.kind}): ${this.links(element)}`)
    }

    lines.push("", "Checks")
    if (report.checks.length === 0) lines.push("No diagnostics.")
    for (const diagnostic of report.checks) {
      lines.push(
        `${diagnostic.level} ${diagnostic.code}${
          diagnostic.id === undefined ? "" : ` ${diagnostic.id}`
        }: ${diagnostic.message}`,
      )
    }

    lines.push("", "Findings")
    if (report.findings.length === 0) lines.push("No graph findings.")
    for (const finding of report.findings) {
      lines.push(`${finding.level} ${finding.code}: ${finding.message}`)
    }

    lines.push("", "Evidence index")
    if (report.evidence.length === 0) lines.push("No evidence records.")
    for (const record of report.evidence) {
      lines.push(
        `${record.id} ${record.kind} ${record.method} ${record.result} ${record.tool} ${record.hash}`,
      )
    }

    lines.push("", "Approvals")
    if (report.lock === null) lines.push("No approval lock.")
    for (const approval of report.approvals) {
      lines.push(`${approval.id} ${approval.contentHash} ${approval.evidence.join(", ")}`)
    }
    if (report.pending.length > 0) {
      lines.push(`Pending proposed elements: ${report.pending.join(", ")}`)
    }

    lines.push("", "Sources")
    for (const source of report.sources) {
      lines.push(`${source.group} ${source.path} ${source.hash}`)
    }

    lines.push("", "Change report")
    lines.push(...report.changeReport.split(/\r?\n/))

    return lines.flatMap((line) => this.wrap(line))
  }

  private elementLine(element: BundleReport["elements"][number]): string {
    return `${element.id} [${element.status ?? "unknown"}] ${element.title ?? ""}`
  }

  private links(element: BundleReport["elements"][number]): string {
    return element.links.map((link) => `${link.type}->${link.to}`).join(", ")
  }

  private wrap(line: string): string[] {
    if (line === "") return [""]
    const lines: string[] = []
    let remaining = line

    while (remaining.length > MAX_LINE_WIDTH) {
      const candidate = remaining.slice(0, MAX_LINE_WIDTH)
      const split = candidate.lastIndexOf(" ")
      const index = split > 40 ? split : MAX_LINE_WIDTH
      lines.push(remaining.slice(0, index).trimEnd())
      remaining = remaining.slice(index).trimStart()
    }
    lines.push(remaining)

    return lines
  }

  private paginate(lines: string[]): string[][] {
    if (lines.length === 0) return [["Audit bundle"]]
    const pages: string[][] = []

    for (let index = 0; index < lines.length; index += LINES_PER_PAGE) {
      pages.push(lines.slice(index, index + LINES_PER_PAGE))
    }

    return pages
  }

  private content(lines: string[]): Buffer {
    const commands = [
      "BT",
      `/F1 ${FONT_SIZE} Tf`,
      `${LEADING} TL`,
      `${LEFT_MARGIN} ${TOP_BASELINE} Td`,
    ]

    for (const line of lines) {
      commands.push(`(${this.escape(line)}) Tj`, "T*")
    }
    commands.push("ET")

    return Buffer.from(commands.join("\n"), "latin1")
  }

  private escape(value: string): string {
    return (
      value
        // eslint-disable-next-line no-control-regex
        .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?")
        .replaceAll("\\", "\\\\")
        .replaceAll("(", "\\(")
        .replaceAll(")", "\\)")
    )
  }

  private object(id: number, body: string | Buffer): Buffer {
    const content = typeof body === "string" ? Buffer.from(body, "latin1") : body

    return Buffer.concat([
      Buffer.from(`${id} 0 obj\n`, "latin1"),
      content,
      Buffer.from("\nendobj\n", "latin1"),
    ])
  }

  private document(body: Buffer): Uint8Array {
    const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")
    const offsets: number[] = []
    let length = header.length
    let cursor = 0

    while (cursor < body.length) {
      offsets.push(length)
      const end = this.objectEnd(body, cursor)
      length += end - cursor
      cursor = end
    }

    const xrefOffset = header.length + body.length
    const entries = ["0000000000 65535 f "]
    for (const offset of offsets) {
      entries.push(`${offset.toString().padStart(10, "0")} 00000 n `)
    }

    const trailer = Buffer.from(
      [
        "xref",
        `0 ${offsets.length + 1}`,
        ...entries,
        "trailer",
        `<< /Size ${offsets.length + 1} /Root 1 0 R >>`,
        "startxref",
        String(xrefOffset),
        "%%EOF",
        "",
      ].join("\n"),
      "latin1",
    )

    return Buffer.concat([header, body, trailer])
  }

  private objectEnd(body: Buffer, start: number): number {
    const marker = Buffer.from("endobj\n", "latin1")
    const index = body.indexOf(marker, start)
    return index === -1 ? body.length : index + marker.length
  }
}
