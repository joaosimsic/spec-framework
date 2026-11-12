import { MapDriftAnalyzer, type DriftReport } from "../discovery/drift"
import { DriftReportRenderer } from "../discovery/drift-report"

export interface MapCheckOptions {
  json?: boolean
  technical?: boolean
}

export interface MapCheckRun {
  report: DriftReport | null
  output: string
  code: number
}

export async function runMapCheck(
  target: string,
  options: MapCheckOptions = {},
): Promise<MapCheckRun> {
  const [report, error] = await new MapDriftAnalyzer(target).analyze()
  if (error !== null) return { report: null, output: `map check failed: ${error}`, code: 1 }
  if (report === null) return { report: null, output: "map check failed", code: 1 }

  if (options.json === true) {
    return { report, output: DriftReportRenderer.json(report), code: codeFor(report) }
  }
  if (options.technical === true) {
    return { report, output: DriftReportRenderer.technical(report), code: codeFor(report) }
  }

  return { report, output: DriftReportRenderer.human(report), code: codeFor(report) }
}

function codeFor(report: DriftReport): number {
  return report.findings.length > 0 ? 1 : 0
}
