import { createHash } from "node:crypto"

export class AnalysisIds {
  static digest(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex")
  }

  static prefix(prefix: string, value: string, length = 16): string {
    return `${prefix}${this.digest(value).slice(0, length)}`
  }

  static project(repositoryPath: string): string {
    return this.prefix("PROJ-", repositoryPath)
  }

  static snapshot(fingerprint: string): string {
    return this.prefix("SNAP-", fingerprint)
  }

  static artifact(snapshotId: string, path: string): string {
    return this.prefix("ART-", `${snapshotId}\u0000${path}`)
  }

  static job(now: string): string {
    return this.prefix("JOB-", `${now}\u0000${crypto.randomUUID()}`)
  }

  static run(now: string): string {
    return this.prefix("RUN-", `${now}\u0000${crypto.randomUUID()}`)
  }

  static verificationRun(snapshotId: string, now: string): string {
    return this.prefix("VRUN-", `${snapshotId}\u0000${now}\u0000${crypto.randomUUID()}`)
  }

  static interpretationRun(snapshotId: string, now: string): string {
    return this.prefix("INTRUN-", `${snapshotId}\u0000${now}\u0000${crypto.randomUUID()}`)
  }

  static interpretation(runId: string, targetKind: string, targetId: string): string {
    return this.prefix("INTP-", `${runId}\u0000${targetKind}\u0000${targetId}`)
  }
}
