import { createHash } from "node:crypto"
import type { EvidenceInput, EvidenceRecord } from "./types"

export class EvidenceHasher {
  static contentHash(record: Omit<EvidenceRecord, "hash" | "input_hash">): string {
    return this.digest(this.canonicalContent(record))
  }

  static inputHash(inputs: EvidenceInput[]): string {
    const lines = this.sortedInputs(inputs).map((input) => `${input.path}\u0000${input.hash}`)

    return this.digest(lines.join("\n"))
  }

  static recordHash(record: EvidenceRecord): string {
    return this.contentHash(this.withoutHash(record))
  }

  static sortedInputs(inputs: EvidenceInput[]): EvidenceInput[] {
    const byPath = new Map<string, EvidenceInput>()

    for (const input of inputs) {
      byPath.set(input.path, { path: input.path, hash: input.hash })
    }

    return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path))
  }

  static digest(value: string): string {
    const hex = createHash("sha256").update(value, "utf8").digest("hex")

    return `sha256:${hex}`
  }

  private static canonicalContent(record: Omit<EvidenceRecord, "hash" | "input_hash">): string {
    return JSON.stringify({
      version: record.version,
      id: record.id,
      kind: record.kind,
      method: record.method,
      tool: record.tool,
      result: record.result,
      inputs: this.sortedInputs(record.inputs),
      command: record.command ?? null,
      details: record.details ?? null,
    })
  }

  private static withoutHash(record: EvidenceRecord): Omit<EvidenceRecord, "hash" | "input_hash"> {
    return {
      version: record.version,
      id: record.id,
      kind: record.kind,
      method: record.method,
      tool: record.tool,
      result: record.result,
      inputs: record.inputs,
      ...(record.command === undefined ? {} : { command: record.command }),
      ...(record.details === undefined ? {} : { details: record.details }),
    }
  }
}
