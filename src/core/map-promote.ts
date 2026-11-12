import {
  MappingPromoter,
  type PromotionOptions,
  type PromotionReport,
} from "../discovery/promotion"
import { PromotionReportRenderer } from "../discovery/promotion-report"

export interface MapPromoteOptions extends PromotionOptions {
  json?: boolean
}

export interface MapPromoteRun {
  report: PromotionReport | null
  output: string
  code: number
}

export async function runMapPromote(
  target: string,
  options: MapPromoteOptions = {},
): Promise<MapPromoteRun> {
  const [report, error] = await new MappingPromoter(target).promote(options)
  if (error !== null) {
    return { report: null, output: `map promote failed: ${error.code}: ${error.message}`, code: 1 }
  }
  if (report === null) return { report: null, output: "map promote failed", code: 1 }

  if (options.json === true) {
    return { report, output: PromotionReportRenderer.json(report), code: 0 }
  }
  if (options.technical === true) {
    return { report, output: PromotionReportRenderer.technical(report), code: 0 }
  }

  return { report, output: PromotionReportRenderer.human(report), code: 0 }
}
