import type { ValidationReport } from "./types"

export class ValidationReportWriter {
  static markdown(report: ValidationReport): string {
    const lines = [
      "# Generated spec validation",
      "",
      `Generated: ${report.generatedAt}`,
      `Analyzer version: ${report.analyzerVersion}`,
      "",
      "| Repository | Commit | Analysis | Elements | Relationships | Behavior | Flows | Findings | Deterministic | API depth 2 | API depth 4 |",
      "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |",
    ]
    for (const item of report.repositories) {
      const depth2 = item.api.find((entry) => entry.path.includes("depth=2"))
      const depth4 = item.api.find((entry) => entry.path.includes("depth=4"))
      lines.push(
        `| ${item.name} | ${item.commit.slice(0, 8)} | ${(item.timing.milliseconds / 1000).toFixed(2)}s | ${item.counts.elements} | ${item.counts.relationships} | ${item.counts.behavior} | ${item.counts.flows} | ${item.counts.findings} | ${item.deterministic ? "yes" : "no"} | ${depth2?.medianMs.toFixed(0) ?? "n/a"}ms | ${depth4?.medianMs.toFixed(0) ?? "n/a"}ms |`,
      )
    }
    lines.push("", "## Repository details", "")
    for (const item of report.repositories) {
      lines.push(
        `### ${item.name}`,
        "",
        `- source: ${item.source}`,
        `- commit: ${item.commit}`,
        `- clone: ${item.clonePath}`,
        `- original clean before/after: ${item.cleanBefore}/${item.cleanAfter}`,
        `- files: ${item.counts.files}`,
        `- behavior records: ${item.counts.behavior}`,
        `- contracts: ${item.counts.contracts}`,
        `- verification: ${item.counts.verification}`,
        `- unknowns: ${item.counts.unknowns}`,
        `- evidence: ${item.counts.evidence}`,
        `- spec size: ${(item.counts.specBytes / 1024 / 1024).toFixed(2)} MB`,
        `- database size: ${(item.counts.databaseBytes / 1024 / 1024).toFixed(2)} MB`,
        `- rss: ${(item.timing.rss / 1024 / 1024).toFixed(0)} MB`,
        "",
        "Issues:",
        ...(item.issues.length === 0 ? ["- none"] : item.issues.map((issue) => `- ${issue}`)),
        "",
        "Warnings:",
        ...(item.warnings.length === 0
          ? ["- none"]
          : item.warnings.map((warning) => `- ${warning}`)),
        "",
        "API:",
        ...item.api.map(
          (entry) =>
            `- ${entry.path}: ${entry.medianMs.toFixed(0)}ms median, ${entry.maxMs.toFixed(0)}ms max, ${entry.bytes} bytes, status ${entry.status}`,
        ),
        "",
      )
    }

    return lines.join("\n")
  }
}
