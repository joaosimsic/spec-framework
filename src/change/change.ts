import { createHash } from "node:crypto"
import { specLockPath } from "../approval/lock"
import { SpecConfigLoader } from "../core/config"
import { attemptAsync, type Result } from "../core/result"
import type { ToolLocator, ProcessRunner } from "../core/runner"
import { GitProposalRepository } from "./git"
import { SdocOperationApplier, type OperationApplication } from "./operations"
import { ChangeReportRenderer } from "./report"
import { ProposalStore } from "./store"
import {
  PROPOSAL_VERSION,
  type ChangeReport,
  type GitProposalState,
  type Proposal,
  type ProposalMode,
  type ProposalOperation,
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
  json?: boolean
  technical?: boolean
  author?: string
  now?: () => Date
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  gitRepository?: ProposalGit
}

export interface ChangeRun {
  report: ChangeReport | null
  output: string
  code: number
}

export interface ChangeStatusRun {
  proposal: Proposal | null
  output: string
  code: number
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

export async function runChange(
  target: string,
  direction: string,
  options: ChangeOptions = {},
): Promise<ChangeRun> {
  const trimmed = direction.trim()
  if (trimmed === "") return changeFailure("direction is required")

  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError !== null) return changeFailure(configError.message)
  if (config === null) return changeFailure("config loader returned no configuration")

  const git =
    options.gitRepository ?? new GitProposalRepository(options.processRunner, options.toolLocator)
  const [state, stateError] = await git.readState(target)
  if (stateError !== null) return changeFailure(`cannot read workspace: ${stateError}`)
  if (state === null) return changeFailure("workspace reader returned no metadata")
  if (!state.clean) return changeFailure("git tree is dirty; commit or stash changes first")
  if (state.branch.startsWith("spec/")) {
    return changeFailure(`active proposal already exists on branch '${state.branch}'`)
  }

  const slug = ProposalNaming.slug(trimmed)
  const branch = `spec/${slug}`
  const [exists, existsError] = await git.branchExists(target, branch)
  if (existsError !== null) return changeFailure(`cannot check branch '${branch}': ${existsError}`)
  if (exists === true) return changeFailure(`proposal branch '${branch}' already exists`)

  const [lockHash, lockError] = await readLockHash(target)
  if (lockError !== null) return changeFailure(lockError)
  if (lockHash === undefined) return changeFailure("lock hash failed")

  const [author, authorError] = await resolveAuthor(git, options.author, target)
  if (authorError !== null) return changeFailure(authorError)
  if (author === null) return changeFailure("proposal author unavailable")

  const timestamp = (options.now ?? (() => new Date()))()
  const proposal: Proposal = {
    version: PROPOSAL_VERSION,
    id: `prop-${slug}`,
    direction: trimmed,
    mode: options.mode ?? (lockHash === null ? "mapping" : "refactor"),
    status: "draft",
    branch,
    base_commit: state.commit,
    baseline: { commit: state.commit, lock_hash: lockHash },
    author,
    created_at: timestamp.toISOString(),
    operations: [],
  }

  const [, createError] = await git.createBranch(target, branch, state.commit)
  if (createError !== null) return changeFailure(`cannot create '${branch}': ${createError}`)

  const store = new ProposalStore(target)
  const [saved, saveError] = await store.save(proposal)
  if (saveError !== null) return changeFailure(saveError)
  if (saved === null) return changeFailure("proposal was not saved")

  const operations = options.operations ?? []
  const emptyApplication: OperationApplication = { logs: [], changes: [] }
  const [applied, applyError] =
    operations.length === 0
      ? ([emptyApplication, null] as const)
      : await new SdocOperationApplier(target, options.now).apply(operations)
  if (applyError !== null) return changeFailure(applyError)
  if (applied === null) return changeFailure("proposal operations failed")

  const completed: Proposal = {
    ...proposal,
    status: "proposed",
    operations: applied.logs,
  }
  const [, completeError] = await store.save(completed)
  if (completeError !== null) return changeFailure(completeError)

  const report: ChangeReport = {
    proposal: completed,
    operations: applied.logs,
    changes: applied.changes,
  }
  const output = options.json
    ? JSON.stringify(report, null, 2)
    : options.technical
      ? ChangeReportRenderer.technical(report)
      : ChangeReportRenderer.human(report)

  return { report, output, code: 0 }
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

  const [applied, applyError] = await new SdocOperationApplier(target, options.now).apply(
    operations,
  )
  if (applyError !== null) return changeFailure(applyError)
  if (applied === null) return changeFailure("proposal operations failed")

  const completed: Proposal = {
    ...proposal,
    status: "proposed",
    operations: [...proposal.operations, ...applied.logs],
  }
  const [, saveError] = await store.save(completed)
  if (saveError !== null) return changeFailure(saveError)

  const report: ChangeReport = {
    proposal: completed,
    operations: applied.logs,
    changes: applied.changes,
  }
  const output = options.json
    ? JSON.stringify(report, null, 2)
    : options.technical
      ? ChangeReportRenderer.technical(report)
      : ChangeReportRenderer.human(report)

  return { report, output, code: 0 }
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
  if (configured !== "") return [configured, null]

  return git.resolveAuthor(target)
}

async function readLockHash(target: string): Promise<Result<string | null, string>> {
  const path = specLockPath(target)
  const [exists, existsError] = await attemptAsync(() => Bun.file(path).exists())
  if (existsError !== null) return [null, `cannot read ${path}: ${existsError}`]
  if (!exists) return [null, null]

  const [text, readError] = await attemptAsync(() => Bun.file(path).text())
  if (readError !== null || text === null) {
    return [null, readError === null ? `cannot read ${path}` : readError]
  }

  return [`sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`, null]
}

function changeFailure(message: string): ChangeRun {
  return { report: null, output: `change failed: ${message}`, code: 1 }
}

function statusFailure(message: string): ChangeStatusRun {
  return { proposal: null, output: `change status failed: ${message}`, code: 1 }
}
