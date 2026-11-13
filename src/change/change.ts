import { createHash } from "node:crypto"
import { SpecLockLoader, specLockPath } from "../approval/lock"
import type { SpecLock } from "../approval/types"
import { SpecConfigLoader } from "../core/config"
import { attemptAsync, type Result, ok, fail } from "../core/result"
import type { ToolLocator, ProcessRunner } from "../core/runner"
import { GraphSimulator, type SimulationReport } from "../model"
import type { SpecGraph } from "../model/types"
import { GitProposalRepository } from "./git"
import { ProposalGraphLoader } from "./graph-loader"
import { ProposalGraphSnapshotStore } from "./graph-store"
import { ProposalImpactAnalyzer } from "./impact"
import { WorkspaceOperationApplier, type OperationApplication } from "./operations"
import { ChangeReportRenderer } from "./report"
import { ProposalStore } from "./store"
import {
  PROPOSAL_VERSION,
  type ChangeReport,
  type GitProposalState,
  type Proposal,
  type ProposalMode,
  type ProposalOperation,
  type ProposalStatus,
} from "./types"

export interface ProposalGit {
  readState(target: string): Promise<Result<GitProposalState, string>>
  branchExists(target: string, branch: string): Promise<Result<boolean, string>>
  createBranch(target: string, branch: string, baseCommit: string): Promise<Result<string, string>>
  resolveAuthor(target: string): Promise<Result<string, string>>
}

export interface ChangeOptions {
  mode?: ProposalMode
  operations?: ProposalOperation[]
  simulate?: boolean
  json?: boolean
  technical?: boolean
  author?: string
  now?: () => Date
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  gitRepository?: ProposalGit
}

export interface OpenProposalOptions extends ChangeOptions {
  status?: ProposalStatus
}

export interface ChangeRun {
  report: ChangeReport | null
  output: string
  warnings: string[]
  code: number
}

export interface ChangeStatusRun {
  proposal: Proposal | null
  output: string
  code: number
}

export interface OpenedProposal {
  proposal: Proposal
  lock: SpecLock | null
  baseline_graph: SpecGraph | null
}

class ProposalNaming {
  static slug(direction: string): string {
    const slug = direction
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "")

    return slug === "" ? "change" : slug
  }
}

export async function openProposal(
  target: string,
  direction: string,
  options: OpenProposalOptions = {},
): Promise<Result<OpenedProposal, string>> {
  const trimmed = direction.trim()
  if (trimmed === "") return fail("direction is required")

  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError !== null) return fail(configError.message)
  if (config === null) return fail("config loader returned no configuration")

  const git =
    options.gitRepository ?? new GitProposalRepository(options.processRunner, options.toolLocator)
  const [state, stateError] = await git.readState(target)
  if (stateError !== null) return fail(`cannot read workspace: ${stateError}`)
  if (state === null) return fail("workspace reader returned no metadata")
  if (!state.clean) return fail("git tree is dirty; commit or stash changes first")
  if (state.branch.startsWith("spec/")) {
    return fail(`active proposal already exists on branch '${state.branch}'`)
  }

  const slug = ProposalNaming.slug(trimmed)
  const branch = `spec/${slug}`
  const [exists, existsError] = await git.branchExists(target, branch)
  if (existsError !== null) return fail(`cannot check branch '${branch}': ${existsError}`)
  if (exists === true) return fail(`proposal branch '${branch}' already exists`)

  const [lockHash, lockError] = await readLockHash(target)
  if (lockError !== null) return fail(lockError)
  if (lockHash === undefined) return fail("lock hash failed")

  const [lock, lockLoadError] = await loadApprovalLock(target)
  if (lockLoadError !== null) return fail(lockLoadError)

  const [author, authorError] = await resolveAuthor(git, options.author, target)
  if (authorError !== null) return fail(authorError)
  if (author === null) return fail("proposal author unavailable")

  const timestamp = (options.now ?? (() => new Date()))()
  const proposal: Proposal = {
    version: PROPOSAL_VERSION,
    id: `prop-${slug}`,
    direction: trimmed,
    mode: options.mode ?? (lockHash === null ? "mapping" : "refactor"),
    status: options.status ?? "draft",
    branch,
    base_commit: state.commit,
    baseline: { commit: state.commit, lock_hash: lockHash },
    author,
    created_at: timestamp.toISOString(),
    operations: [],
  }

  const [loadedGraph, graphError] = await new ProposalGraphLoader().load(target, {
    workspace: "single-repo",
    commit: state.commit,
    dirty: false,
  })
  if (options.simulate === true && (graphError !== null || loadedGraph === null)) {
    return fail(graphError ?? "baseline graph unavailable")
  }
  const baselineGraph = graphError === null ? loadedGraph : null

  const [, createError] = await git.createBranch(target, branch, state.commit)
  if (createError !== null) return fail(`cannot create '${branch}': ${createError}`)

  const store = new ProposalStore(target)
  const [saved, saveError] = await store.save(proposal)
  if (saveError !== null) return fail(saveError)
  if (saved === null) return fail("proposal was not saved")

  if (baselineGraph !== null) {
    const [, snapshotError] = await new ProposalGraphSnapshotStore(target).save(
      branch,
      proposal.id,
      baselineGraph,
    )
    if (snapshotError !== null && options.simulate === true) return fail(snapshotError)
  }

  return ok({ proposal, lock, baseline_graph: baselineGraph })
}

export async function runChange(
  target: string,
  direction: string,
  options: ChangeOptions = {},
): Promise<ChangeRun> {
  const [opened, openError] = await openProposal(target, direction, options)
  if (openError !== null) return changeFailure(openError)
  if (opened === null) return changeFailure("proposal was not opened")

  const { proposal, lock } = opened
  const store = new ProposalStore(target)
  const operations = options.operations ?? []
  const emptyApplication: OperationApplication = { logs: [], changes: [] }
  const [applied, applyError] =
    operations.length === 0
      ? ([emptyApplication, null] as const)
      : await new WorkspaceOperationApplier(target, options.now, proposal.author).apply(operations)
  if (applyError !== null) return changeFailure(applyError)
  if (applied === null) return changeFailure("proposal operations failed")

  const completed: Proposal = {
    ...proposal,
    status: "proposed",
    operations: applied.logs,
  }
  const [impact, impactError] = await new ProposalImpactAnalyzer(target).analyze(
    completed,
    applied.logs,
    lock,
  )
  if (impactError !== null) return changeFailure(impactError)
  if (impact === null) return changeFailure("impact analysis failed")

  const [simulation, simulationError] = await ChangeSimulation.build(
    target,
    completed,
    opened.baseline_graph,
    impact.graph,
    options.simulate === true,
  )
  if (simulationError !== null) return changeFailure(simulationError)

  const [, completeError] = await store.save(completed)
  if (completeError !== null) return changeFailure(completeError)

  const report: ChangeReport = {
    proposal: completed,
    operations: applied.logs,
    changes: applied.changes,
    impact: impact.impact,
    ...(simulation === null ? {} : { simulation }),
  }
  const output = options.json
    ? JSON.stringify(report, null, 2)
    : options.technical
      ? ChangeReportRenderer.technical(report)
      : ChangeReportRenderer.human(report)

  return { report, output, warnings: refactorWarnings(completed), code: 0 }
}

export async function runProposalOperations(
  target: string,
  operations: ProposalOperation[],
  options: ChangeOptions = {},
): Promise<ChangeRun> {
  if (operations.length === 0) return changeFailure("no operations supplied")

  const git =
    options.gitRepository ?? new GitProposalRepository(options.processRunner, options.toolLocator)
  const [state, stateError] = await git.readState(target)
  if (stateError !== null) return changeFailure(`cannot read workspace: ${stateError}`)
  if (state === null) return changeFailure("workspace reader returned no metadata")

  const store = new ProposalStore(target)
  const [proposal, proposalError] = await store.loadForBranch(state.branch)
  if (proposalError !== null) return changeFailure(proposalError)
  if (proposal === null) return changeFailure("no active proposal")
  if (proposal.status === "approved" || proposal.status === "superseded") {
    return changeFailure(`proposal '${proposal.branch}' is not editable`)
  }

  const [lock, lockLoadError] = await loadApprovalLock(target)
  if (lockLoadError !== null) return changeFailure(lockLoadError)

  const [baselineGraph, baselineError] = await ChangeSimulation.baseline(
    target,
    proposal,
    options.simulate === true,
  )
  if (baselineError !== null) return changeFailure(baselineError)

  const [applied, applyError] = await new WorkspaceOperationApplier(
    target,
    options.now,
    proposal.author,
  ).apply(operations)
  if (applyError !== null) return changeFailure(applyError)
  if (applied === null) return changeFailure("proposal operations failed")

  const completed: Proposal = {
    ...proposal,
    status: "proposed",
    operations: [...proposal.operations, ...applied.logs],
  }
  const [impact, impactError] = await new ProposalImpactAnalyzer(target).analyze(
    completed,
    completed.operations,
    lock,
  )
  if (impactError !== null) return changeFailure(impactError)
  if (impact === null) return changeFailure("impact analysis failed")

  const [simulation, simulationError] = await ChangeSimulation.build(
    target,
    completed,
    baselineGraph,
    impact.graph,
    options.simulate === true,
  )
  if (simulationError !== null) return changeFailure(simulationError)

  const [, saveError] = await store.save(completed)
  if (saveError !== null) return changeFailure(saveError)

  const report: ChangeReport = {
    proposal: completed,
    operations: applied.logs,
    changes: applied.changes,
    impact: impact.impact,
    ...(simulation === null ? {} : { simulation }),
  }
  const output = options.json
    ? JSON.stringify(report, null, 2)
    : options.technical
      ? ChangeReportRenderer.technical(report)
      : ChangeReportRenderer.human(report)

  return { report, output, warnings: refactorWarnings(completed), code: 0 }
}

export async function runChangeStatus(
  target: string,
  options: ChangeOptions = {},
): Promise<ChangeStatusRun> {
  const git =
    options.gitRepository ?? new GitProposalRepository(options.processRunner, options.toolLocator)
  const [state, stateError] = await git.readState(target)
  if (stateError !== null) return statusFailure(`cannot read workspace: ${stateError}`)
  if (state === null) return statusFailure("workspace reader returned no metadata")

  const [proposal, proposalError] = await new ProposalStore(target).loadForBranch(state.branch)
  if (proposalError !== null) return statusFailure(proposalError)
  if (proposal === null) return statusFailure("no active proposal")

  return {
    proposal,
    output: options.json
      ? JSON.stringify(proposal, null, 2)
      : ChangeReportRenderer.status(proposal, options.technical),
    code: 0,
  }
}

async function resolveAuthor(
  git: ProposalGit,
  explicit: string | undefined,
  target: string,
): Promise<Result<string, string>> {
  const configured = explicit?.trim() ?? ""
  if (configured !== "") return ok(configured)

  return git.resolveAuthor(target)
}

async function readLockHash(target: string): Promise<Result<string | null, string>> {
  const path = specLockPath(target)
  const [exists, existsError] = await attemptAsync(() => Bun.file(path).exists())
  if (existsError !== null) return fail(`cannot read ${path}: ${existsError}`)
  if (!exists) return ok(null)

  const [text, readError] = await attemptAsync(() => Bun.file(path).text())
  if (readError !== null || text === null) {
    return fail(readError === null ? `cannot read ${path}` : readError)
  }

  return ok(`sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`)
}

async function loadApprovalLock(target: string): Promise<Result<SpecLock | null, string>> {
  const [lock, lockError] = await new SpecLockLoader(target).load()
  if (lockError === null) return ok(lock)
  if (lockError.code === "SPEC-LOCK-NOT-FOUND") return ok(null)

  return fail(lockError.message)
}

class ChangeSimulation {
  static async baseline(
    target: string,
    proposal: Proposal,
    enabled: boolean,
  ): Promise<Result<SpecGraph | null, string>> {
    if (!enabled) return ok(null)

    const [snapshot, snapshotError] = await new ProposalGraphSnapshotStore(target).load(
      proposal.branch,
    )
    if (snapshotError !== null) return fail(snapshotError)
    if (snapshot === null) {
      return fail("baseline graph snapshot unavailable; reopen the proposal to capture it")
    }

    return ok(snapshot.graph)
  }

  static async build(
    target: string,
    proposal: Proposal,
    baseline: SpecGraph | null,
    after: SpecGraph,
    enabled: boolean,
  ): Promise<Result<SimulationReport | null, string>> {
    if (!enabled) return ok(null)

    let before = baseline
    if (before === null) {
      const [resolved, baselineError] = await this.baseline(target, proposal, true)
      if (baselineError !== null) return fail(baselineError)
      before = resolved
    }
    if (before === null) {
      return fail("baseline graph snapshot unavailable; reopen the proposal to capture it")
    }

    return ok(new GraphSimulator().simulate(before, after))
  }
}

function changeFailure(message: string): ChangeRun {
  return { report: null, output: `change failed: ${message}`, warnings: [], code: 1 }
}

function refactorWarnings(proposal: Proposal): string[] {
  if (proposal.mode !== "refactor" || proposal.baseline.lock_hash !== null) return []

  return ["no approved baseline; this is a draft-only refactor"]
}

function statusFailure(message: string): ChangeStatusRun {
  return { proposal: null, output: `change status failed: ${message}`, code: 1 }
}
