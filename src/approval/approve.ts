import { loadRequirementSources } from "../core/requirements"
import { fail, ok, type Result } from "../core/result"
import type { SdocBlock } from "../core/types"
import { EvidenceFactory, EvidenceStore, type EvidenceRecord } from "../evidence"
import {
  ArchitectureCatalogLoader,
  ArchitectureStatusWriter,
  architectureElementHash,
  findArchitectureElement,
  isArchitectureId,
  type ArchitectureCatalog,
} from "./architecture"
import type { ApprovalConfirmation } from "./confirmation"
import { GitCleanlinessReader, type GitStatusReader } from "./git"
import { elementContentHash } from "./hash"
import { SpecLockLoader, SpecLockWriter, specLockPath } from "./lock"
import { SdocStatusWriter } from "./status"
import { SPEC_LOCK_VERSION, type SpecLock, type SpecLockEvidence } from "./types"

export interface ApprovalOptions {
  approver: string
  confirmation: ApprovalConfirmation
  allowDirty?: boolean
  gitStatus?: GitStatusReader
  evidence?: EvidenceRecord[]
  labels?: Record<string, string>
  technical?: boolean
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
  const sourceErrors = sources.diagnostics.filter(
    (item) => item.level === "error" && item.code !== "SPEC-NO-REQUIREMENTS",
  )
  if (sourceErrors.length > 0) return failure(sourceErrors.map((item) => item.message).join("\n"))

  const [blocks, blockError] = indexBlocks(sources.blocks)
  if (blockError !== null || blocks === null) return failure(blockError ?? "cannot index elements")

  const architectureIds = requested.filter(isArchitectureId)
  const [loadedArchitecture, architectureError] = await loadArchitectureCatalog(
    target,
    architectureIds.length,
  )
  if (architectureError !== null) return failure(architectureError)
  const architecture = loadedArchitecture ?? { elements: [], relationships: [] }

  const missing = requested.filter(
    (id) => !blocks.has(id) && findArchitectureElement(architecture, id) === null,
  )
  if (missing.length > 0) return failure(`unknown element(s): ${missing.join(", ")}`)

  const loader = new SpecLockLoader(target)
  const [loadedLock, lockError] = await loader.load()
  if (lockError !== null && lockError.code !== "SPEC-LOCK-NOT-FOUND") {
    return failure(lockError.message)
  }
  const existingLock = lockError === null ? loadedLock : null

  const failureMessage = validateScope(requested, blocks, existingLock, architecture)
  if (failureMessage !== null) return failure(failureMessage)

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
    approvalPrompt(requested, options.labels, options.approver),
  )
  if (!confirmed) return failure("approval cancelled")

  const requirementIds = new Set(requested.filter((id) => !isArchitectureId(id)))
  const architectureIdsToWrite = new Set(requested.filter(isArchitectureId))
  const [requirementFiles, requirementStatusError] = await new SdocStatusWriter(target).write(
    requirementIds,
    "Approved",
  )
  if (requirementStatusError !== null) {
    return failure(`cannot update STATUS: ${requirementStatusError}`)
  }

  const [architectureFiles, architectureStatusError] = await new ArchitectureStatusWriter(
    target,
  ).write(architectureIdsToWrite, "approved")
  if (architectureStatusError !== null) {
    return failure(`cannot update architecture status: ${architectureStatusError}`)
  }

  const approvalEvidence = await new EvidenceFactory().refresh(target, options.evidence ?? [])

  const [evidencePaths, evidenceError] = await new EvidenceStore(target).writeAll(approvalEvidence)
  if (evidenceError !== null || evidencePaths === null) {
    return failure(evidenceError?.message ?? "cannot write evidence artifacts")
  }

  const timestamp = (options.now ?? (() => new Date()))().toISOString()
  const lock = buildLock(
    requested,
    blocks,
    architecture,
    existingLock,
    options.approver.trim(),
    timestamp,
    dirty,
    approvalEvidence,
  )
  const [lockPath, writeError] = await new SpecLockWriter(target).write(lock)
  if (writeError !== null || lockPath === null) {
    return failure(writeError ?? `cannot write ${specLockPath(target)}`)
  }

  const lines = requested.map((id) => `approved ${approvalLabel(id, options)}`)
  lines.push(`lock: ${lockPath}`)
  if (evidencePaths.length > 0) lines.push(`evidence: ${evidencePaths.length} artifact(s)`)
  const writtenFiles = (requirementFiles?.length ?? 0) + (architectureFiles?.length ?? 0)
  if (writtenFiles > 0) lines.push(`updated status in ${writtenFiles} file(s)`)

  return { lock, output: lines.join("\n"), code: 0 }
}

async function loadArchitectureCatalog(
  target: string,
  requested: number,
): Promise<Result<ArchitectureCatalog | null, string>> {
  if (requested === 0) return ok({ elements: [], relationships: [] })

  return new ArchitectureCatalogLoader(target).load()
}

function indexBlocks(blocks: SdocBlock[]): Result<Map<string, SdocBlock>, string> {
  const byId = new Map<string, SdocBlock>()

  for (const block of blocks) {
    const id = block.fields.UID
    if (!id) return fail(`requirement record at ${block.file}:${block.line} has no UID`)
    if (byId.has(id)) return fail(`duplicate element ID '${id}'`)
    byId.set(id, block)
  }

  return ok(byId)
}

function validateScope(
  requested: string[],
  blocks: Map<string, SdocBlock>,
  existingLock: SpecLock | null,
  architecture: ArchitectureCatalog,
): string | null {
  const requestedIds = new Set(requested)

  for (const id of requested) {
    if (isArchitectureId(id)) {
      const element = findArchitectureElement(architecture, id)
      if (element === null) return `unknown architecture element '${id}'`
      if (element.annotation.status !== "proposed") {
        return `${id} must have status 'proposed' before approval`
      }
      continue
    }

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
  architecture: ArchitectureCatalog,
  existingLock: SpecLock | null,
  approver: string,
  approvedAt: string,
  dirty: boolean,
  evidence: EvidenceRecord[],
): SpecLock {
  const elements = { ...(existingLock?.elements ?? {}) }

  for (const id of requested) {
    const element = findArchitectureElement(architecture, id)
    if (element !== null) {
      elements[id] = {
        content_hash: architectureElementHash(architecture, element),
        evidence: [],
      }
      continue
    }

    const block = blocks.get(id)
    if (block === undefined) continue
    elements[id] = {
      content_hash: elementContentHash(block),
      evidence: splitList(block.fields.EVIDENCE ?? ""),
    }
  }

  return {
    version: SPEC_LOCK_VERSION,
    approved_at: approvedAt,
    approver,
    dirty,
    elements,
    evidence: {
      ...(existingLock?.evidence ?? {}),
      ...evidenceEntries(evidence),
    },
  }
}

function evidenceEntries(evidence: EvidenceRecord[]): Record<string, SpecLockEvidence> {
  const entries: Record<string, SpecLockEvidence> = {}

  for (const record of evidence) {
    entries[record.id] = {
      hash: record.hash,
      tool: record.tool,
      result: record.result,
    }
  }

  return entries
}

function splitList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function approvalPrompt(
  ids: string[],
  labels: Record<string, string> | undefined,
  approver: string,
): string {
  const items = ids.map((id) => `- ${labels?.[id] ?? id}`)
  const lines = [`Approve ${ids.length} element(s) as ${approver}?`, ...items, "[y/N] "]

  return lines.join("\n")
}

function approvalLabel(id: string, options: ApprovalOptions): string {
  if (options.technical === true) return id

  return options.labels?.[id] ?? id
}

function failure(message: string): ApprovalRun {
  return { lock: null, output: message, code: 1 }
}
