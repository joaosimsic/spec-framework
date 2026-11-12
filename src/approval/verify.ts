import type { C4Element } from "../core/c4"
import type { Diagnostic, SdocBlock } from "../core/types"
import type { EvidenceRecord } from "../evidence"
import {
  ArchitectureCatalogLoader,
  architectureElementHash,
  findArchitectureElement,
  isArchitectureId,
  type ArchitectureCatalog,
} from "./architecture"
import { elementContentHash } from "./hash"
import { SpecLockLoader } from "./lock"
import type { SpecLock } from "./types"

export async function verifySpecLock(
  target: string,
  blocks: SdocBlock[],
  evidence?: EvidenceRecord[],
): Promise<Diagnostic[]> {
  const [loadedArchitecture, architectureError] = await new ArchitectureCatalogLoader(target).load()
  if (architectureError !== null && architectureError !== "no LikeC4 architecture sources found") {
    return [error("APPROVAL-BAD-ARCHITECTURE", architectureError)]
  }
  const architecture = loadedArchitecture ?? { elements: [], relationships: [] }

  const [lock, lockError] = await new SpecLockLoader(target).load()
  if (lockError !== null) {
    if (lockError.code === "SPEC-LOCK-NOT-FOUND") {
      return [
        ...unlockedStatusDiagnostics(blocks),
        ...unlockedArchitectureDiagnostics(architecture),
      ]
    }
    return [error("APPROVAL-BAD-LOCK", lockError.message)]
  }
  if (lock === null) return [error("APPROVAL-BAD-LOCK", "lock loader returned no result")]

  const byId = indexBlocks(blocks)
  const diagnostics = verifyLockedElements(lock, byId, architecture)
  diagnostics.push(...unlockedStatusDiagnostics(blocks, lock))
  diagnostics.push(...unlockedArchitectureDiagnostics(architecture, lock))
  if (evidence !== undefined) diagnostics.push(...verifyEvidence(lock, evidence))

  return diagnostics
}

function verifyEvidence(lock: SpecLock, evidence: EvidenceRecord[]): Diagnostic[] {
  const byId = new Map(evidence.map((record) => [record.id, record] as const))
  const diagnostics: Diagnostic[] = []

  for (const [id, locked] of Object.entries(lock.evidence)) {
    const current = byId.get(id)
    if (current === undefined) {
      diagnostics.push({
        level: "error",
        code: "APPROVAL-EVIDENCE-MISSING",
        message: `approved evidence '${id}' was not regenerated`,
        id,
      })
      continue
    }
    if (current.hash !== locked.hash) {
      diagnostics.push({
        level: "error",
        code: "APPROVAL-EVIDENCE-MISMATCH",
        message: `approved evidence changed for '${id}'`,
        id,
      })
    }
  }

  return diagnostics
}

function indexBlocks(blocks: SdocBlock[]): Map<string, SdocBlock> {
  const byId = new Map<string, SdocBlock>()

  for (const block of blocks) {
    const id = block.fields.UID
    if (id && !byId.has(id)) byId.set(id, block)
  }

  return byId
}

function verifyLockedElements(
  lock: SpecLock,
  blocks: Map<string, SdocBlock>,
  architecture: ArchitectureCatalog,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const [id, locked] of Object.entries(lock.elements)) {
    if (isArchitectureId(id)) {
      diagnostics.push(...verifyArchitectureElement(id, locked.content_hash, architecture))
      continue
    }

    const block = blocks.get(id)
    if (block === undefined) {
      diagnostics.push(
        error("APPROVAL-MISSING-ELEMENT", `approved element '${id}' no longer exists`),
      )
      continue
    }

    if (locked.content_hash !== elementContentHash(block)) {
      diagnostics.push(
        locatedError("APPROVAL-HASH-MISMATCH", `approved content changed for '${id}'`, block, id),
      )
    }
    if (block.fields.STATUS !== "Approved") {
      diagnostics.push(
        locatedError(
          "APPROVAL-STATUS",
          `'${id}' is hash-locked but STATUS is '${block.fields.STATUS ?? "missing"}'`,
          block,
          id,
        ),
      )
    }

    diagnostics.push(...missingAcceptanceDiagnostics(id, block, lock))
  }

  return diagnostics
}

function verifyArchitectureElement(
  id: string,
  contentHash: string,
  architecture: ArchitectureCatalog,
): Diagnostic[] {
  const element = findArchitectureElement(architecture, id)
  if (element === null) {
    return [error("APPROVAL-MISSING-ELEMENT", `approved element '${id}' no longer exists`)]
  }

  const diagnostics: Diagnostic[] = []
  if (contentHash !== architectureElementHash(architecture, element)) {
    diagnostics.push(architectureError("APPROVAL-HASH-MISMATCH", id, element))
  }
  if (element.annotation.status !== "approved") {
    diagnostics.push(
      architectureError(
        "APPROVAL-STATUS",
        id,
        element,
        `status is '${element.annotation.status ?? "missing"}'`,
      ),
    )
  }

  return diagnostics
}

function unlockedArchitectureDiagnostics(
  architecture: ArchitectureCatalog,
  lock?: SpecLock,
): Diagnostic[] {
  return architecture.elements
    .filter((element) => element.annotation.status === "approved")
    .filter((element) => element.id !== null && !(element.id in (lock?.elements ?? {})))
    .map((element) =>
      architectureError(
        "APPROVAL-UNLOCKED",
        element.id ?? "unknown",
        element,
        "status 'approved' requires a spec/spec.lock entry",
      ),
    )
}

function architectureError(
  code: string,
  id: string,
  element: C4Element,
  detail?: string,
): Diagnostic {
  const message = detail === undefined ? `approved content changed for '${id}'` : `${id}: ${detail}`

  return { level: "error", code, message, file: element.file, line: element.line, id }
}

function missingAcceptanceDiagnostics(id: string, block: SdocBlock, lock: SpecLock): Diagnostic[] {
  if (!id.startsWith("REQ-")) return []

  return splitList(block.fields.ACCEPTANCE ?? "")
    .filter((criterionId) => !(criterionId in lock.elements))
    .map((criterionId) =>
      locatedError(
        "APPROVAL-MISSING-AC",
        `approved requirement '${id}' references unlocked acceptance criterion '${criterionId}'`,
        block,
        id,
      ),
    )
}

function unlockedStatusDiagnostics(blocks: SdocBlock[], lock?: SpecLock): Diagnostic[] {
  return blocks
    .filter((block) => block.fields.STATUS === "Approved")
    .filter((block) => {
      const id = block.fields.UID
      return id !== undefined && !(id in (lock?.elements ?? {}))
    })
    .map((block) =>
      locatedError(
        "APPROVAL-UNLOCKED",
        `STATUS: Approved requires a spec/spec.lock entry`,
        block,
        block.fields.UID,
      ),
    )
}

function splitList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function locatedError(
  code: string,
  message: string,
  block: SdocBlock,
  id: string | undefined,
): Diagnostic {
  return { level: "error", code, message, file: block.file, line: block.line, id }
}

function error(code: string, message: string): Diagnostic {
  return { level: "error", code, message }
}
