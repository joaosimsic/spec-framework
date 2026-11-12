import { join, relative } from "node:path"
import { attemptAsync } from "../core/result"
import { EvidenceHasher } from "./hash"
import {
  EVIDENCE_VERSION,
  type EvidenceDraft,
  type EvidenceInput,
  type EvidenceRecord,
} from "./types"

export class EvidenceFactory {
  async inputs(target: string, paths: string[]): Promise<EvidenceInput[]> {
    const uniquePaths = [...new Set(paths)].sort()
    const inputs: EvidenceInput[] = []

    for (const path of uniquePaths) {
      const input = await this.input(target, path)
      inputs.push(input)
    }

    return EvidenceHasher.sortedInputs(inputs)
  }

  async refresh(target: string, records: EvidenceRecord[]): Promise<EvidenceRecord[]> {
    const refreshed: EvidenceRecord[] = []
    for (const record of records) {
      const inputs = await this.inputs(
        target,
        record.inputs.map((input) => join(target, input.path)),
      )
      refreshed.push(
        this.create({
          id: record.id,
          kind: record.kind,
          method: record.method,
          tool: record.tool,
          result: record.result,
          inputs,
          ...(record.command === undefined ? {} : { command: record.command }),
          ...(record.details === undefined ? {} : { details: record.details }),
        }),
      )
    }

    return refreshed
  }

  create(draft: EvidenceDraft): EvidenceRecord {
    const inputs = EvidenceHasher.sortedInputs(draft.inputs)
    const base = {
      version: EVIDENCE_VERSION,
      id: draft.id,
      kind: draft.kind,
      method: draft.method,
      tool: draft.tool,
      result: draft.result,
      inputs,
      ...(draft.command === undefined ? {} : { command: [...draft.command] }),
      ...(draft.details === undefined ? {} : { details: draft.details.trim().slice(0, 500) }),
    } satisfies Omit<EvidenceRecord, "hash" | "input_hash">

    return {
      ...base,
      hash: EvidenceHasher.contentHash(base),
      input_hash: EvidenceHasher.inputHash(inputs),
    }
  }

  private async input(target: string, path: string): Promise<EvidenceInput> {
    const [bytes, readError] = await attemptAsync(() => Bun.file(path).bytes())
    const displayPath = relative(target, path)

    if (readError !== null || bytes === null) {
      return { path: displayPath, hash: "sha256:missing" }
    }

    return {
      path: displayPath,
      hash: EvidenceHasher.digest(Buffer.from(bytes).toString("base64")),
    }
  }
}
