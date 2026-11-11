import type { EvidenceMethod, EvidenceRecord } from "../evidence"

const METHOD_DIRECTORIES: Record<EvidenceMethod, string> = {
  formal: "formal",
  test: "test",
  analysis: "analysis",
  inspection: "inspection",
  demonstration: "demonstration",
  preflight: "implementation",
  contract: "contracts",
}

export interface BundleEvidenceArtifact {
  path: string
  record: EvidenceRecord
  content: string
}

export class BundleEvidenceWriter {
  artifacts(records: EvidenceRecord[]): BundleEvidenceArtifact[] {
    return [...records]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((record) => ({
        path: ["evidence", METHOD_DIRECTORIES[record.method], `${record.id}.json`].join("/"),
        record,
        content: `${JSON.stringify(record, null, 2)}\n`,
      }))
  }
}
