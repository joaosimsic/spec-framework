import type { SpecLock } from "../approval/types"
import type { CheckResult } from "../core/types"
import type { EvidenceRecord } from "../evidence"
import type { SpecGraph } from "../model/types"
import type {
  BundleApproval,
  BundleElement,
  BundleEvidence,
  BundleReport,
  BundleSource,
} from "./types"

export interface BundleReportInput {
  project: string
  specVersion: string
  graph: SpecGraph
  evidence: EvidenceRecord[]
  checks: CheckResult
  sources: BundleSource[]
  lock: SpecLock | null
  changeReport: string
  preview: boolean
}

export class BundleReportBuilder {
  build(input: BundleReportInput): BundleReport {
    return {
      project: input.project,
      specVersion: input.specVersion,
      graphVersion: input.graph.version,
      commit: input.graph.commit,
      workspace: input.graph.workspace,
      dirty: input.graph.dirty,
      preview: input.preview,
      tools: input.graph.tool_versions,
      elements: input.graph.elements.map((element) => ({
        id: element.id,
        kind: element.kind,
        ...(element.title === undefined ? {} : { title: element.title }),
        ...(element.status === undefined ? {} : { status: element.status }),
        ...(element.owner === undefined ? {} : { owner: element.owner }),
        ...(element.provenance === undefined ? {} : { provenance: element.provenance }),
        links: element.links.map((link) => ({ type: link.type, to: link.to })),
      })) satisfies BundleElement[],
      evidence: input.evidence
        .map((record) => this.evidence(record))
        .sort((left, right) => left.id.localeCompare(right.id)),
      checks: input.checks.diagnostics,
      findings: input.graph.findings,
      approvals: this.approvals(input.lock),
      pending: this.pending(input.graph, input.lock),
      sources: input.sources,
      changeReport: input.changeReport,
      lock: input.lock,
    }
  }

  private evidence(record: EvidenceRecord): BundleEvidence {
    return {
      id: record.id,
      kind: record.kind,
      method: record.method,
      tool: record.tool,
      result: record.result,
      hash: record.hash,
      input_hash: record.input_hash,
    }
  }

  private approvals(lock: SpecLock | null): BundleApproval[] {
    return Object.entries(lock?.elements ?? {})
      .map(([id, element]) => ({
        id,
        contentHash: element.content_hash,
        evidence: [...element.evidence].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  private pending(graph: SpecGraph, lock: SpecLock | null): string[] {
    const locked = new Set(Object.keys(lock?.elements ?? {}))

    return graph.elements
      .filter((element) => element.status === "proposed" && !locked.has(element.id))
      .map((element) => element.id)
      .sort()
  }
}
