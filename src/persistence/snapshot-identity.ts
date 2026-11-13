import { AnalysisIds } from "./ids"

export interface SnapshotIdentityInput {
  projectId: string
  commit: string
  dirty: boolean
  analyzer: string
  analyzerVersion: string
  schemaVersion: number
  ruleVersion: string
  promptVersion: string
  modelVersion: string
  inputHashes: string[]
}

export interface SnapshotIdentity {
  fingerprint: string
  id: string
}

export class SnapshotIdentityFactory {
  static create(input: SnapshotIdentityInput): SnapshotIdentity {
    const material = [
      input.projectId,
      input.commit,
      input.dirty ? "dirty" : "clean",
      input.analyzer,
      input.analyzerVersion,
      String(input.schemaVersion),
      input.ruleVersion,
      input.promptVersion,
      input.modelVersion,
      ...[...input.inputHashes].sort(),
    ].join("\u0000")
    const fingerprint = AnalysisIds.digest(material)

    return { fingerprint, id: AnalysisIds.snapshot(fingerprint) }
  }
}
