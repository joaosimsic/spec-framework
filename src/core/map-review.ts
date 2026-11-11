import { openProposal, type ProposalGit } from "../change/change"
import { GitProposalRepository } from "../change/git"
import { ProposalStore } from "../change/store"
import type { Proposal } from "../change/types"
import { curatedMapReport, MappingCurationEngine } from "../discovery/curation"
import { MappingSnapshotStore } from "../discovery/mapping-store"
import type {
  CurationAction,
  CurationDecision,
  MappingCurationReport,
  MappingCurationState,
  MappingSnapshot,
} from "../discovery/curation-types"
import { MAPPING_SNAPSHOT_VERSION } from "../discovery/curation-types"
import {
  MAPPING_REVIEW_VERSION,
  MappingReviewFactory,
  type MappingReview,
} from "../discovery/review"
import { MappingReviewReportRenderer } from "../discovery/review-report"
import type { MapReport } from "../discovery/types"
import { runMap } from "./map"
import type { Result } from "./result"
import type { ProcessRunner, ToolLocator } from "./runner"

export interface MapReviewOptions {
  actions?: CurationAction[]
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
  curation: MappingCurationReport
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
  const git =
    options.gitRepository ?? new GitProposalRepository(options.processRunner, options.toolLocator)
  const [state, stateError] = await git.readState(target)
  if (stateError !== null) return failure(1, `cannot read workspace: ${stateError}`)
  if (state === null) return failure(1, "workspace reader returned no metadata")

  const [opened, openError] = state.branch.startsWith("spec/")
    ? await resumeProposal(target, state.branch)
    : await createProposal(target, options)
  if (openError !== null) return failure(1, openError)
  if (opened === null) return failure(1, "proposal was not opened")

  const snapshotStore = new MappingSnapshotStore(target)
  const [snapshot, snapshotError] = await snapshotStore.load(opened.proposal.branch)
  if (snapshotError !== null) return failure(1, snapshotError)
  if (snapshot === null) return failure(1, "mapping snapshot failed to load")

  const [curated, curationError] = await curate(target, opened.proposal, snapshot, options)
  if (curationError !== null) return failure(1, curationError)
  if (curated === null) return failure(1, "mapping curation failed")

  return { report: curated, output: render(curated, options), warnings: [], code: 0 }
}

async function createProposal(
  target: string,
  options: MapReviewOptions,
): Promise<Result<{ proposal: Proposal }, string>> {
  const mapRun = await runMap(target, {
    processRunner: options.processRunner,
    toolLocator: options.toolLocator,
  })
  if (mapRun.code !== 0 || mapRun.report === null) {
    return [null, detail(mapRun.output, MAP_FAILURE_PREFIX)]
  }

  const direction = reviewDirection(mapRun.report)
  const [proposal, openError] = await openProposal(target, direction, {
    mode: "mapping",
    status: "proposed",
    author: options.author,
    now: options.now,
    processRunner: options.processRunner,
    toolLocator: options.toolLocator,
    gitRepository: options.gitRepository,
  })
  if (openError !== null || proposal === null) {
    return [null, openError ?? "proposal was not opened"]
  }

  const [saved, saveError] = await new MappingSnapshotStore(target).save(
    proposal.proposal.branch,
    mapRun.report,
    [],
  )
  if (saveError !== null || saved === null) {
    return [null, saveError ?? "mapping snapshot was not saved"]
  }

  return [{ proposal: proposal.proposal }, null]
}

async function resumeProposal(
  target: string,
  branch: string,
): Promise<Result<{ proposal: Proposal }, string>> {
  const [proposal, proposalError] = await new ProposalStore(target).loadForBranch(branch)
  if (proposalError !== null || proposal === null) {
    return [null, `no active proposal on branch '${branch}': ${proposalError ?? "load failed"}`]
  }
  if (proposal.mode !== "mapping") {
    return [null, `active proposal '${branch}' is not a mapping review`]
  }
  if (proposal.status === "approved" || proposal.status === "superseded") {
    return [null, `active proposal '${branch}' is not editable`]
  }

  return [{ proposal }, null]
}

async function curate(
  target: string,
  proposal: Proposal,
  snapshot: MappingSnapshot,
  options: MapReviewOptions,
): Promise<Result<MapReviewReport, string>> {
  const [engine, replayError] = MappingCurationEngine.replay(
    snapshot.map,
    snapshot.decisions,
    proposal.author,
  )
  if (replayError !== null || engine === null) {
    return [null, replayError ?? "curation replay failed"]
  }

  const actions = options.actions ?? []
  const timestamp = (options.now ?? (() => new Date()))().toISOString()
  for (const action of actions) {
    const [, actionError] = engine.apply(action, timestamp, proposal.author)
    if (actionError !== null) return [null, actionError]
  }

  const decisions = engine.decisionsForStorage()
  const initial = engine.state()
  const [draftPath, draftError, savedError] = await persist(
    target,
    proposal,
    snapshot,
    initial,
    actions.length > 0,
    decisions,
  )
  if (draftError !== null) return [null, draftError]
  if (savedError !== null) return [null, savedError]

  const state = engine.state()
  const map = curatedMapReport(snapshot.map, state, draftPath)
  const review = currentReview(map, proposal.direction, state)
  const curation: MappingCurationReport = {
    ...state,
    version: MAPPING_SNAPSHOT_VERSION,
    draftPath,
  }

  return [
    {
      version: MAPPING_REVIEW_VERSION,
      review,
      map,
      curation,
      proposal,
    },
    null,
  ]
}

async function persist(
  target: string,
  proposal: Proposal,
  snapshot: MappingSnapshot,
  state: MappingCurationState,
  mutate: boolean,
  decisions: CurationDecision[],
): Promise<[string | null, string | null, string | null]> {
  if (decisions.length === 0) return [snapshot.map.draftPath, null, null]

  const store = new MappingSnapshotStore(target)
  if (mutate) {
    const [, saveError] = await store.save(proposal.branch, snapshot.map, decisions)
    if (saveError !== null) return [null, null, saveError]
  }

  const [draftPath, draftError] = await store.writeDraft(state.areas)
  if (draftError !== null || draftPath === null) {
    return [null, draftError ?? "mapping draft was not written", null]
  }

  return [draftPath, null, null]
}

function currentReview(
  map: MapReport,
  direction: string,
  state: MappingCurationState,
): MappingReview {
  const review = MappingReviewFactory.build(map, direction)
  const resolved = new Set(state.resolvedIds)
  const queue = review.queue.filter((item) => !resolved.has(item.technical.id))
  const unresolved = state.areas.filter((area) => !resolved.has(area.id)).length
  const relationsPending = review.relationQueue.length
  const status =
    unresolved === 0 &&
    relationsPending === 0 &&
    (state.decisions.length > 0 || state.areas.length === 0)
      ? "curation complete"
      : state.decisions.length > 0
        ? "curation in progress"
        : "waiting for curation"

  return { ...review, queue, state: status }
}

function render(report: MapReviewReport, options: MapReviewOptions): string {
  if (options.json) return JSON.stringify(report, null, 2)
  if (options.technical) {
    return MappingReviewReportRenderer.technical(
      report.review,
      report.map,
      report.proposal,
      report.curation,
    )
  }

  return MappingReviewReportRenderer.human(report.review, report.curation)
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
