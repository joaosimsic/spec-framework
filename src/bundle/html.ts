import type { Diagnostic } from "../core/types"
import type { GraphFinding } from "../model/types"
import type { BundleElement, BundleReport } from "./types"

const STYLE = `
:root { color-scheme: light; font-family: system-ui, sans-serif; }
body { margin: 0 auto; max-width: 1100px; padding: 2rem; line-height: 1.45; color: #1f2933; }
h1, h2, h3 { line-height: 1.2; }
h1 { margin-bottom: 0.25rem; }
h2 { border-bottom: 1px solid #cbd2d9; margin-top: 2.5rem; padding-bottom: 0.35rem; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; }
th, td { border: 1px solid #cbd2d9; padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }
th { background: #f0f4f8; }
code, pre { font-family: ui-monospace, monospace; }
pre { white-space: pre-wrap; background: #f0f4f8; padding: 1rem; overflow-wrap: anywhere; }
.muted { color: #52606d; }
.preview { border-left: 4px solid #d97706; padding-left: 0.75rem; }
.grid { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
`

export class BundleHtmlRenderer {
  render(report: BundleReport): string {
    const requirements = report.elements.filter((element) => element.kind === "requirement")
    const acceptance = report.elements.filter((element) => element.kind === "acceptance_criterion")

    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>Audit bundle - ${this.escape(report.project)}</title>`,
      `<style>${STYLE}</style>`,
      "</head>",
      "<body>",
      `<h1>Audit bundle</h1>`,
      `<p class="muted">${this.escape(report.project)} - spec ${this.escape(report.specVersion)}</p>`,
      ...(report.preview
        ? ['<p class="preview"><strong>Preview only.</strong> Generated from a dirty git tree.</p>']
        : []),
      "<h2>Cover</h2>",
      this.cover(report),
      "<h2>Scope</h2>",
      "<p>Generated deterministically from the specification sources, native checks, stored evidence, and approval lock. Internal identity and hashes are preserved for audit.</p>",
      "<h2>Requirements</h2>",
      this.elements(requirements, "No requirement records."),
      "<h2>Acceptance criteria</h2>",
      this.elements(acceptance, "No acceptance criteria."),
      "<h2>Traceability</h2>",
      this.traceability(report.elements),
      "<h2>Checks</h2>",
      this.checks(report.checks),
      "<h2>Findings</h2>",
      this.findings(report.findings),
      "<h2>Evidence index</h2>",
      this.evidence(report),
      "<h2>Approvals</h2>",
      this.approvals(report),
      "<h2>Sources</h2>",
      this.sources(report),
      "<h2>Change report</h2>",
      `<pre>${this.escape(report.changeReport)}</pre>`,
      "</body>",
      "</html>",
      "",
    ].join("\n")
  }

  private cover(report: BundleReport): string {
    const rows = [
      ["Project", report.project],
      ["Spec version", report.specVersion],
      ["Graph version", String(report.graphVersion)],
      ["Workspace", report.workspace],
      ["Commit", report.commit],
      ["Dirty tree", String(report.dirty)],
      [
        "Approval",
        report.lock === null ? "No lock" : `${report.lock.approver} at ${report.lock.approved_at}`,
      ],
      ...Object.entries(report.tools).map(([name, version]) => [`Tool: ${name}`, version]),
    ]

    return `<dl class="grid">${rows
      .map(([label, value]) => `<dt>${this.escape(label)}</dt><dd>${this.escape(value)}</dd>`)
      .join("")}</dl>`
  }

  private elements(elements: BundleElement[], empty: string): string {
    if (elements.length === 0) return `<p class="muted">${this.escape(empty)}</p>`

    const rows = elements.map((element) => [
      element.id,
      element.title ?? "",
      element.status ?? "",
      element.owner ?? "",
      element.provenance ?? "",
      this.links(element),
    ])

    return this.table(["ID", "Title", "Status", "Owner", "Provenance", "Links"], rows)
  }

  private traceability(elements: BundleElement[]): string {
    const rows = elements.map((element) => [
      element.id,
      element.title ?? "",
      element.kind,
      element.links.map((link) => `${link.type} -> ${link.to}`).join(", "),
    ])

    return this.table(["ID", "Title", "Kind", "Links"], rows)
  }

  private checks(diagnostics: Diagnostic[]): string {
    if (diagnostics.length === 0) return '<p class="muted">No diagnostics.</p>'

    const rows = diagnostics.map((diagnostic) => [
      diagnostic.level,
      diagnostic.code,
      diagnostic.id ?? "",
      diagnostic.file ?? "",
      diagnostic.line === undefined ? "" : String(diagnostic.line),
      diagnostic.message,
    ])

    return this.table(["Level", "Code", "ID", "File", "Line", "Message"], rows)
  }

  private findings(findings: GraphFinding[]): string {
    if (findings.length === 0) return '<p class="muted">No graph findings.</p>'

    const rows = findings.map((finding) => [
      finding.level,
      finding.code,
      finding.id ?? "",
      finding.message,
    ])

    return this.table(["Level", "Code", "ID", "Message"], rows)
  }

  private evidence(report: BundleReport): string {
    if (report.evidence.length === 0) return '<p class="muted">No evidence records.</p>'

    const rows = report.evidence.map((record) => [
      record.id,
      record.kind,
      record.method,
      record.tool,
      record.result,
      record.hash,
      record.input_hash,
    ])

    return this.table(["ID", "Kind", "Method", "Tool", "Result", "Hash", "Input hash"], rows)
  }

  private approvals(report: BundleReport): string {
    const lines: string[] = []

    if (report.lock !== null) {
      lines.push(
        `<p>Approver: ${this.escape(report.lock.approver)} - ${this.escape(report.lock.approved_at)}</p>`,
      )
      lines.push(
        `<p>Elements: ${report.approvals.length} - Evidence: ${Object.keys(report.lock.evidence).length}</p>`,
      )
    } else {
      lines.push('<p class="muted">No approval lock.</p>')
    }

    if (report.pending.length > 0) {
      lines.push(`<p>Pending proposed elements: ${this.escape(report.pending.join(", "))}</p>`)
    }

    if (report.approvals.length > 0) {
      lines.push(
        this.table(
          ["ID", "Content hash", "Evidence"],
          report.approvals.map((approval) => [
            approval.id,
            approval.contentHash,
            approval.evidence.join(", "),
          ]),
        ),
      )
    }

    return lines.join("\n")
  }

  private sources(report: BundleReport): string {
    if (report.sources.length === 0) return '<p class="muted">No source files.</p>'

    return this.table(
      ["Group", "Path", "Hash"],
      report.sources.map((source) => [source.group, source.path, source.hash]),
    )
  }

  private links(element: BundleElement): string {
    return element.links.map((link) => `${link.type} -> ${link.to}`).join(", ")
  }

  private table(headers: string[], rows: string[][]): string {
    const head = headers.map((header) => `<th>${this.escape(header)}</th>`).join("")
    const body = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${this.escape(cell)}</td>`).join("")}</tr>`)
      .join("")

    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  }

  private escape(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
  }
}
