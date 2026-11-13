import { join } from "node:path"
import { attempt, attemptAsync, type Result, ok, fail } from "../core/result"
import {
  SPEC_LOCK_VERSION,
  type SpecLock,
  type SpecLockElement,
  type SpecLockEvidence,
  type SpecLockFailure,
} from "./types"

export function specLockPath(target: string): string {
  return join(target, "spec", "spec.lock")
}

export class SpecLockLoader {
  private readonly path: string

  constructor(target: string) {
    this.path = specLockPath(target)
  }

  async load(): Promise<Result<SpecLock, SpecLockFailure>> {
    const [exists, existsError] = await attemptAsync(() => Bun.file(this.path).exists())
    if (existsError) return fail(this.bad(`cannot read ${this.path}: ${existsError}`))
    if (!exists) {
      return fail(this.failure("SPEC-LOCK-NOT-FOUND", `no lock at ${this.path}`))
    }

    const [text, readError] = await attemptAsync(() => Bun.file(this.path).text())
    if (readError || text === null) {
      return fail(this.bad(readError === null ? `cannot read ${this.path}` : readError))
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError) return fail(this.bad(`invalid JSON in ${this.path}: ${parseError}`))

    return this.validate(parsed)
  }

  private validate(value: unknown): Result<SpecLock, SpecLockFailure> {
    if (!this.isRecord(value)) return fail(this.bad("lock must be an object"))
    if (value["version"] !== SPEC_LOCK_VERSION) {
      return fail(this.bad(`unsupported lock version '${String(value["version"])}'`))
    }
    if (typeof value["approved_at"] !== "string") {
      return fail(this.bad("approved_at must be a string"))
    }
    if (typeof value["approver"] !== "string") {
      return fail(this.bad("approver must be a string"))
    }
    if (typeof value["dirty"] !== "boolean") {
      return fail(this.bad("dirty must be a boolean"))
    }

    const [elements, elementFailure] = this.readElements(value["elements"])
    if (elementFailure !== null) return fail(elementFailure)
    if (elements === null) return fail(this.bad("elements failed"))

    const [evidence, evidenceFailure] = this.readEvidence(value["evidence"])
    if (evidenceFailure !== null) return fail(evidenceFailure)
    if (evidence === null) return fail(this.bad("evidence failed"))

    return ok({
      version: SPEC_LOCK_VERSION,
      approved_at: value["approved_at"],
      approver: value["approver"],
      dirty: value["dirty"],
      elements,
      evidence,
    })
  }

  private readElements(value: unknown): Result<Record<string, SpecLockElement>, SpecLockFailure> {
    if (!this.isRecord(value)) return fail(this.bad("elements must be an object"))

    const elements: Record<string, SpecLockElement> = {}
    for (const [id, candidate] of Object.entries(value)) {
      if (!this.isRecord(candidate)) return fail(this.bad(`element ${id} must be an object`))
      if (typeof candidate["content_hash"] !== "string") {
        return fail(this.bad(`element ${id} content_hash must be a string`))
      }
      if (!this.isStringArray(candidate["evidence"])) {
        return fail(this.bad(`element ${id} evidence must be a string array`))
      }
      elements[id] = {
        content_hash: candidate["content_hash"],
        evidence: [...candidate["evidence"]],
      }
    }

    return ok(elements)
  }

  private readEvidence(value: unknown): Result<Record<string, SpecLockEvidence>, SpecLockFailure> {
    if (!this.isRecord(value)) return fail(this.bad("evidence must be an object"))

    const evidence: Record<string, SpecLockEvidence> = {}
    for (const [id, candidate] of Object.entries(value)) {
      if (!this.isRecord(candidate)) return fail(this.bad(`evidence ${id} must be an object`))
      if (typeof candidate["hash"] !== "string") {
        return fail(this.bad(`evidence ${id} hash must be a string`))
      }
      if (typeof candidate["tool"] !== "string") {
        return fail(this.bad(`evidence ${id} tool must be a string`))
      }
      if (typeof candidate["result"] !== "string") {
        return fail(this.bad(`evidence ${id} result must be a string`))
      }
      evidence[id] = {
        hash: candidate["hash"],
        tool: candidate["tool"],
        result: candidate["result"],
      }
    }

    return ok(evidence)
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string")
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  private bad(message: string): SpecLockFailure {
    return this.failure("SPEC-LOCK-BAD", message)
  }

  private failure(code: SpecLockFailure["code"], message: string): SpecLockFailure {
    return { code, message }
  }
}

export class SpecLockWriter {
  constructor(private readonly target: string) {}

  async write(lock: SpecLock): Promise<Result<string, string>> {
    const path = specLockPath(this.target)
    const [written, writeError] = await attemptAsync(async () => {
      await Bun.write(path, `${JSON.stringify(this.sorted(lock), null, 2)}\n`)
      return path
    })

    if (writeError || written === null) {
      return fail(writeError === null ? `cannot write ${path}` : writeError)
    }

    return ok(written)
  }

  private sorted(lock: SpecLock): SpecLock {
    return {
      version: lock.version,
      approved_at: lock.approved_at,
      approver: lock.approver,
      dirty: lock.dirty,
      elements: this.sortedElements(lock.elements),
      evidence: this.sortedEvidence(lock.evidence),
    }
  }

  private sortedElements(
    elements: Record<string, SpecLockElement>,
  ): Record<string, SpecLockElement> {
    return Object.fromEntries(
      Object.entries(elements)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, element]) => [
          id,
          { content_hash: element.content_hash, evidence: [...element.evidence].sort() },
        ]),
    )
  }

  private sortedEvidence(
    evidence: Record<string, SpecLockEvidence>,
  ): Record<string, SpecLockEvidence> {
    return Object.fromEntries(
      Object.entries(evidence).sort(([left], [right]) => left.localeCompare(right)),
    )
  }
}
