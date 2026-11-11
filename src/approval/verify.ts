import type { Diagnostic, SdocBlock } from "../core/types"
import { elementContentHash } from "./hash"
import { SpecLockLoader } from "./lock"
import type { SpecLock } from "./types"

export async function verifySpecLock(target: string, blocks: SdocBlock[]): Promise<Diagnostic[]> {
  const [lock, lockError] = await new SpecLockLoader(target).load()
  if (lockError !== null) {
    if (lockError.code === "SPEC-LOCK-NOT-FOUND") return unlockedStatusDiagnostics(blocks)
    return [error("APPROVAL-BAD-LOCK", lockError.message)]
  }
  if (lock === null) return [error("APPROVAL-BAD-LOCK", "lock loader returned no result")]

  const byId = indexBlocks(blocks)
  const diagnostics = verifyLockedElements(lock, byId)
  diagnostics.push(...unlockedStatusDiagnostics(blocks, lock))

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
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const [id, element] of Object.entries(lock.elements)) {
    const block = blocks.get(id)
    if (block === undefined) {
      diagnostics.push(error("APPROVAL-MISSING-ELEMENT", `approved element '${id}' no longer exists`))
      continue
    }

    if (element.content_hash !== elementContentHash(block)) {
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

function missingAcceptanceDiagnostics(
  id: string,
  block: SdocBlock,
  lock: SpecLock,
): Diagnostic[] {
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

function unlockedStatusDiagnostics(
  blocks: SdocBlock[],
  lock?: SpecLock,
): Diagnostic[] {
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
