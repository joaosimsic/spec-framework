import type { GeneratedEvidence } from "../spec"
import { GeneratedSpecIdentity } from "../spec"

export class GeneratedEvidenceFactory {
  static fromProvenance(provenance: string, reference: string): GeneratedEvidence {
    const match = /^(?:[a-z]+:)?([^:]+):(\d+)$/i.exec(provenance)
    const file = match?.[1] ?? ""
    const line = match?.[2] === undefined ? 0 : Number(match[2])

    return {
      id: GeneratedSpecIdentity.evidence(`${provenance}\u0000${reference}`),
      kind: "source",
      reference,
      file,
      line: Number.isInteger(line) ? line : 0,
      hash: GeneratedSpecIdentity.digest(`${provenance}\u0000${reference}`),
    }
  }

  static ids(evidence: GeneratedEvidence[]): string[] {
    return evidence.map((item) => item.id)
  }
}
