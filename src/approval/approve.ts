import { loadRequirementSources } from "../core/requirements"
import type { SdocBlock } from "../core/types"
import type { ApprovalConfirmation } from "./confirmation"
import { GitCleanlinessReader, type GitStatusReader } from "./git"
import { elementContentHash } from "./hash"
import { SpecLockLoader, SpecLockWriter, specLockPath } from "./lock"
import { SdocStatusWriter } from "./status"
import { SPEC_LOCK_VERSION, type SpecLock } from "./types"

export interface ApprovalOptions {
  approver: string
  confirmation: ApprovalConfirmation
  allowDirty?: boolean
  gitStatus?: GitStatusReader
  now?: () => Date
}

export interface ApprovalRun {
  lock: SpecLock | null
  output: string
  code: number
}

export async function runApproval(
  target: string,
  ids: string[],
  options: ApprovalOptions,
): Promise<ApprovalRun> {
  const requested = [...new Set(ids)]
  if (requested.length === 0) return failure("no element IDs supplied")
  if (requested.length !== ids.length) return failure("duplicate element IDs supplied")
  if (options.approver.trim() === "") return failure("approver identity is required")

  const sources = await loadRequirementSources(target)
  const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
  if (sourceErrors.length > 0) return failure(sourceErrors.map((item) => item.message).join("\n"))

  const [blocks, blockError] = indexBlocks(sources.blocks)
  if (blockError !== null || blocks === null) return failure(blockError ?? "cannot index elements")

  const missing = requested.filter((id) => !blocks.has(id))
  if (missing.length > 0) return failure(`unknown element(s): ${missing.join(", ")}`)

  const loader = new SpecLockLoader(target)
  const [loadedLock, lockError] = await loader.load()
  if (lockError !== null && lockError.code !== "SPEC-LOCK-NOT-FOUND") {
    return failure(lockError.message)
  }
  const existingLock = lockError === null ? loadedLock : null

  const failureMessage = validateScope(requested, blocks, existingLock)
  if (failureMessage !== null) return failure(failureMessage)

  const requestedIds = new Set(requested)
  const [clean, gitError] = await (options.gitStatus ?? new GitCleanlinessReader()).read(target)
  const dirty = clean !== true
  if (dirty && !options.allowDirty) {
    return failure(
      gitError === null
        ? "git tree is dirty; commit the proposal or pass --allow-dirty"
        : `cannot verify a clean git tree: ${gitError}`,
    )
  }

  const confirmed = await options.confirmation.confirm(
    `Approve ${requested.length} element(s) as ${options.approver}? [y/N] `,
  )
  if (!confirmed) return failure("approval cancelled")

  const [writtenFiles, statusError] = await new SdocStatusWriter(target).write(
    requestedIds,
    "Approved",
  )
  if (statusError !== null) return failure(`cannot update STATUS: ${statusError}`)

  const timestamp = (options.now ?? (() => new Date()))().toISOString()
  const lock = buildLock(
    requested,
    blocks,
    existingLock,
    options.approver.trim(),
    timestamp,
    dirty,
  )
  const [lockPath, writeError] = await new SpecLockWriter(target).write(lock)
  if (writeError !== null || lockPath === null) {
    return failure(writeError ?? `cannot write ${specLockPath(target)}`)
  }

  const lines = requested.map((id) => `approved ${id}`)
  lines.push(`lock: ${lockPath}`)
  if (writtenFiles !== null && writtenFiles.length > 0) {
    lines.push(`updated status in ${writtenFiles.length} file(s)`)
  }

  return { lock, output: lines.join("\n"), code: 0 }
}

function indexBlocks(blocks: SdocBlock[]): [Map<string, SdocBlock> | null, string | null] {
  const byId = new Map<string, SdocBlock>()

  for (const block of blocks) {
    const id = block.fields.UID
    if (!id) return [null, `requirement record at ${block.file}:${block.line} has no UID`]
    if (byId.has(id)) return [null, `duplicate element ID '${id}'`]
    byId.set(id, block)
  }

  return [byId, null]
}

function validateScope(
  requested: string[],
  blocks: Map<string, SdocBlock>,
  existingLock: SpecLock | null,
): string | null {
  const requestedIds = new Set(requested)

  for (const id of requested) {
    const block = blocks.get(id)
    if (block === undefined) return `unknown element '${id}'`
    if (!id.startsWith("REQ-") && !id.startsWith("AC-")) {
      return `${id} is not an approvable requirement or acceptance record`
    }
    if (block.fields.STATUS !== "Proposed") {
      return `${id} must have STATUS: Proposed before approval`
    }
    if (id.startsWith("REQ-")) {
      const failureMessage = validateRequirement(block, requestedIds, blocks, existingLock)
      if (failureMessage !== null) return failureMessage
    }
  }

  return null
}

function validateRequirement(
  block: SdocBlock,
  requestedIds: Set<string>,
  blocks: Map<string, SdocBlock>,
  existingLock: SpecLock | null,
): string | null {
  const id = block.fields.UID
  if (!id) return "requirement record has no UID"

  const acceptance = splitList(block.fields.ACCEPTANCE ?? "")
  if (acceptance.length === 0) return `${id} has no acceptance criteria`

  for (const criterionId of acceptance) {
    const failureMessage = validateAcceptanceScope(criterionId, requestedIds, blocks, existingLock)
    if (failureMessage !== null) return `${id}: ${failureMessage}`
  }

  const formal = splitList(block.fields.FORMAL ?? "")
  const hasFormalization = formal.some((item) => item !== "none")
  if (!hasFormalization && !block.fields.WAIVER) {
    return `${id} needs a formalization or waiver`
  }

  return null
}

function validateAcceptanceScope(
  criterionId: string,
  requestedIds: Set<string>,
  blocks: Map<string, SdocBlock>,
  existingLock: SpecLock | null,
): string | null {
  if (requestedIds.has(criterionId)) return null

  const criterion = blocks.get(criterionId)
  if (criterion === undefined) return `acceptance criterion '${criterionId}' is not defined`
  if (criterion.fields.STATUS !== "Approved") {
    return `acceptance criterion '${criterionId}' is not approved or included in this approval`
  }

  const locked = existingLock?.elements[criterionId]
  if (locked === undefined || locked.content_hash !== elementContentHash(criterion)) {
    return `acceptance criterion '${criterionId}' is not hash-locked or has changed`
  }

  return null
}

function buildLock(
  requested: string[],
  blocks: Map<string, SdocBlock>,
  existingLock: SpecLock | null,
  approver: string,
  approvedAt: string,
  dirty: boolean,
): SpecLock {
  const elements = { ...(existingLock?.elements ?? {}) }

  for (const id of requested) {
    const block = blocks.get(id)
    if (block === undefined) continue
    elements[id] = {
      content_hash: elementContentHash(block),
      evidence: existingLock?.elements[id]?.evidence ?? [],
    }
  }

  return {
    version: SPEC_LOCK_VERSION,
    approved_at: approvedAt,
    approver,
    dirty,
    elements,
    evidence: { ...(existingLock?.evidence ?? {}) },
  }
}

function splitList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function failure(message: string): ApprovalRun {
  return { lock: null, output: message, code: 1 }
}
