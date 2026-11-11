import { openProposal, type ProposalGit } from "../change/change"
import type { Proposal } from "../change/types"
import {
  MAPPING_REVIEW_VERSION,
  MappingReviewFactory,
  type MappingReview,
} from "../discovery/review"
import { MappingReviewReportRenderer } from "../discovery/review-report"
import type { MapReport } from "../discovery/types"
import { runMap } from "./map"
import type { ProcessRunner, ToolLocator } from "./runner"

export interface MapReviewOptions {
  json?: boolean
  technical?: boolean
  author?: string
  now?: () => Date
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  gitRepository?: ProposalGit
}

export interface MapReviewReport {
  version: typeof MAPPING_REVIEW_VERSION
  review: MappingReview
  map: MapReport
  proposal: Proposal
}

export interface MapReviewRun {
  report: MapReviewReport | null
  output: string
  warnings: string[]
  code: number
}

const MAP_FAILURE_PREFIX = "map failed: "

export async function runMapReview(
  target: string,
  options: MapReviewOptions = {},
): Promise<MapReviewRun> {
  const mapRun = await runMap(target, {
    processRunner: options.processRunner,
    toolLocator: options.toolLocator,
  })
  if (mapRun.code !== 0 || mapRun.report === null) {
    return failure(mapRun.code, detail(mapRun.output, MAP_FAILURE_PREFIX))
  }

  const direction = reviewDirection(mapRun.report)
  const [opened, openError] = await openProposal(target, direction, {
    mode: "mapping",
    status: "proposed",
    author: options.author,
    now: options.now,
    processRunner: options.processRunner,
    toolLocator: options.toolLocator,
    gitRepository: options.gitRepository,
  })
  if (openError !== null) return failure(1, openError)
  if (opened === null) return failure(1, "proposal was not opened")

  const review = MappingReviewFactory.build(mapRun.report, opened.proposal.direction)
  const report: MapReviewReport = {
    version: MAPPING_REVIEW_VERSION,
    review,
    map: mapRun.report,
    proposal: opened.proposal,
  }
  const output = options.json
    ? JSON.stringify(report, null, 2)
    : options.technical
      ? MappingReviewReportRenderer.technical(review, report.map, report.proposal)
      : MappingReviewReportRenderer.human(review)

  return { report, output, warnings: [], code: 0 }
}

function reviewDirection(report: MapReport): string {
  const system = report.elements.find((element) => element.kind === "system")
  const title = system?.title.trim() ?? ""

  return title === "" ? "Review mapping" : `Review ${title} mapping`
}

function detail(output: string, prefix: string): string {
  return output.startsWith(prefix) ? output.slice(prefix.length) : output
}

function failure(code: number, message: string): MapReviewRun {
  return {
    report: null,
    output: `map review failed: ${message}`,
    warnings: [],
    code: code === 0 ? 1 : code,
  }
}
