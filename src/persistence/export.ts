import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { attemptAsync, type Result, ok, fail } from "../core/result"
import type { CodeArtifactRecord, SnapshotRecord } from "./types"

export interface AnalysisExportInput {
  snapshot: SnapshotRecord
  artifacts: CodeArtifactRecord[]
  nodes: unknown[]
  edges: unknown[]
  flows: unknown[]
  findings: unknown[]
  annotations?: unknown[]
}

export class AnalysisArtifactExporter {
  static async write(target: string, input: AnalysisExportInput): Promise<Result<string, string>> {
    const path = join(target, "spec", "generated", "analysis.gen.json")
    const payload = {
      version: input.snapshot.schemaVersion,
      snapshot: {
        id: input.snapshot.id,
        commit: input.snapshot.commit,
        dirty: input.snapshot.dirty,
        analyzer: input.snapshot.analyzer,
        analyzer_version: input.snapshot.analyzerVersion,
        schema_version: input.snapshot.schemaVersion,
      },
      artifacts: input.artifacts
        .map((artifact) => ({
          path: artifact.path,
          language: artifact.language,
          hash: artifact.hash,
          size: artifact.size,
          line_count: artifact.lineCount,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      nodes: input.nodes,
      edges: input.edges,
      flows: input.flows,
      findings: input.findings,
      annotations: input.annotations ?? [],
      coverage: input.snapshot.coverage,
    }
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(path, `${JSON.stringify(payload, null, 2)}\n`)
      return path
    })
    if (writeError !== null || written === null) {
      return fail(writeError ?? "analysis export was not written")
    }

    return ok(written)
  }
}
