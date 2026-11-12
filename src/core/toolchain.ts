import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "./result"

export type ToolchainStatus = "unprovisioned" | "partial" | "provisioned"

export interface ToolchainLock {
  schema: number
  status: ToolchainStatus
  tools: Record<string, string>
}

export type ToolchainFailureCode =
  "TOOLCHAIN-NO-LOCK" | "TOOLCHAIN-BAD-LOCK" | "TOOLCHAIN-WRITE-FAILED"

export interface ToolchainFailure {
  code: ToolchainFailureCode
  message: string
}

const PINNED_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

export class ToolchainLockStore {
  private readonly path: string

  constructor(target: string) {
    this.path = join(target, "spec", "toolchain.lock.json")
  }

  static isPinnedVersion(version: string): boolean {
    return PINNED_VERSION.test(version)
  }

  static statusFor(required: number, present: number): ToolchainStatus {
    if (required === 0 || present === required) return "provisioned"
    if (present === 0) return "unprovisioned"

    return "partial"
  }

  async load(): Promise<Result<ToolchainLock, ToolchainFailure>> {
    const [exists, existsError] = await attemptAsync(() => Bun.file(this.path).exists())
    if (existsError !== null) {
      return [null, this.failure("TOOLCHAIN-NO-LOCK", `cannot read ${this.path}: ${existsError}`)]
    }
    if (!exists) {
      return [null, this.failure("TOOLCHAIN-NO-LOCK", `missing ${this.path}; run spec init`)]
    }

    const [text, readError] = await attemptAsync(() => Bun.file(this.path).text())
    if (readError !== null || text === null) {
      return [null, this.failure("TOOLCHAIN-NO-LOCK", `cannot read ${this.path}`)]
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null) {
      return [
        null,
        this.failure("TOOLCHAIN-BAD-LOCK", `invalid JSON in ${this.path}: ${parseError}`),
      ]
    }

    return this.validate(parsed)
  }

  async save(lock: ToolchainLock): Promise<Result<ToolchainLock, ToolchainFailure>> {
    const tools = Object.fromEntries(
      Object.entries(lock.tools).sort(([left], [right]) => left.localeCompare(right)),
    )
    const content = `${JSON.stringify({ schema: lock.schema, status: lock.status, tools }, null, 2)}\n`
    const [, writeError] = await attemptAsync(() => Bun.write(this.path, content))
    if (writeError !== null) {
      return [
        null,
        this.failure("TOOLCHAIN-WRITE-FAILED", `cannot write ${this.path}: ${writeError}`),
      ]
    }

    return [lock, null]
  }

  private validate(value: unknown): Result<ToolchainLock, ToolchainFailure> {
    if (!this.isRecord(value)) {
      return [null, this.failure("TOOLCHAIN-BAD-LOCK", "toolchain lock must be a JSON object")]
    }
    if (value.schema !== 1) {
      return [null, this.failure("TOOLCHAIN-BAD-LOCK", "toolchain lock schema must be 1")]
    }
    if (!this.isStatus(value.status)) {
      return [
        null,
        this.failure(
          "TOOLCHAIN-BAD-LOCK",
          "toolchain lock status must be unprovisioned, partial, or provisioned",
        ),
      ]
    }

    const [tools, toolsError] = this.readTools(value.tools)
    if (toolsError !== null || tools === null) {
      return [null, this.failure("TOOLCHAIN-BAD-LOCK", toolsError ?? "cannot read tools")]
    }

    return [{ schema: 1, status: value.status, tools }, null]
  }

  private readTools(value: unknown): Result<Record<string, string>, string> {
    if (!this.isRecord(value)) return [null, "toolchain lock tools must be an object"]

    const tools: Record<string, string> = {}
    for (const [name, version] of Object.entries(value)) {
      if (typeof version !== "string") {
        return [null, `toolchain lock version for '${name}' must be a string`]
      }
      if (!ToolchainLockStore.isPinnedVersion(version)) {
        return [null, `toolchain lock version for '${name}' must be exact, got '${version}'`]
      }
      tools[name] = version
    }

    return [tools, null]
  }

  private isStatus(value: unknown): value is ToolchainStatus {
    return value === "unprovisioned" || value === "partial" || value === "provisioned"
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  private failure(code: ToolchainFailureCode, message: string): ToolchainFailure {
    return { code, message }
  }
}
