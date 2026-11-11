import { mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "../core/result"
import { EvidenceCollector } from "./collector"
import type { EvidenceFailure, EvidenceRecord } from "./types"

export interface EvidenceLoad {
  records: EvidenceRecord[]
  failures: EvidenceFailure[]
}

export class EvidenceStore {
  private readonly directory: string

  constructor(private readonly target: string) {
    this.directory = join(target, "spec", "evidence")
  }

  async writeAll(records: EvidenceRecord[]): Promise<Result<string[], EvidenceFailure>> {
    const [collected, collectError] = new EvidenceCollector().collect(records)
    if (collectError !== null) return [null, collectError]
    if (collected === null) {
      return [null, { code: "EVIDENCE-BAD-RECORD", message: "evidence collection failed" }]
    }

    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(this.directory, { recursive: true })
      const paths: string[] = []
      for (const record of collected) {
        const path = join(this.directory, `${record.id}.json`)
        await Bun.write(path, `${JSON.stringify(record, null, 2)}\n`)
        paths.push(path)
      }

      return paths
    })
    if (writeError !== null || written === null) {
      return [
        null,
        {
          code: "EVIDENCE-BAD-RECORD",
          message: writeError ?? "cannot write evidence artifacts",
        },
      ]
    }

    return [written, null]
  }

  async loadAll(): Promise<EvidenceLoad> {
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => [])
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort()
    const records: EvidenceRecord[] = []
    const failures: EvidenceFailure[] = []

    for (const file of files) {
      const path = join(this.directory, file)
      const [text, readError] = await attemptAsync(() => Bun.file(path).text())
      if (readError !== null || text === null) {
        failures.push({
          code: "EVIDENCE-BAD-RECORD",
          message: readError === null ? `cannot read ${path}` : `${path}: ${readError}`,
        })
        continue
      }

      const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
      if (parseError !== null) {
        failures.push({ code: "EVIDENCE-BAD-RECORD", message: `${path}: ${parseError}` })
        continue
      }

      const [record, validationError] = new EvidenceCollector().validate(parsed)
      if (validationError !== null) {
        failures.push(validationError)
        continue
      }
      if (record !== null) records.push(record)
    }

    return {
      records: records.sort((left, right) => left.id.localeCompare(right.id)),
      failures,
    }
  }
}
