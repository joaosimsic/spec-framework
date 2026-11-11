import { elementContentHash } from "../approval/hash"
import type { SpecLock } from "../approval/types"
import { loadRequirementSources } from "../core/requirements"
import type { Result } from "../core/result"
import type { SdocBlock } from "../core/types"
import { ImpactAnalyzer, type ImpactApproval, type ImpactReport } from "../model"
import type { GraphWorkspace, SpecGraph } from "../model/types"
import { ProposalGraphLoader } from "./graph-loader"
import type { Proposal, ProposalOperationLog } from "./types"

export interface ProposalImpactResult {
  graph: SpecGraph
  impact: ImpactReport
}

export class ProposalImpactAnalyzer {
  constructor(private readonly target: string) {}

  async analyze(
    proposal: Proposal,
    operations: ProposalOperationLog[],
    lock: SpecLock | null,
  ): Promise<Result<ProposalImpactResult, string>> {
    const workspace: GraphWorkspace = {
      workspace: "single-repo",
      commit: proposal.base_commit,
      dirty: true,
    }
    const [graph, graphError] = await new ProposalGraphLoader().load(this.target, workspace)
    if (graphError !== null) return [null, graphError]
    if (graph === null) return [null, "graph loader returned no graph"]

    const sources = await loadRequirementSources(this.target)
    const sourceErrors = sources.diagnostics.filter((item) => item.level === "error")
    if (sourceErrors.length > 0) {
      return [null, sourceErrors.map((item) => item.message).join("\n")]
    }

    const blocks = this.blocksById(sources.blocks)
    const changedIds = this.changedIds(operations, lock, blocks)
    const approvals = this.approvals(lock)
    const impact = new ImpactAnalyzer().analyze(graph, changedIds, approvals)

    return [{ graph, impact }, null]
  }

  private blocksById(blocks: SdocBlock[]): Map<string, SdocBlock> {
    const byId = new Map<string, SdocBlock>()

    for (const block of blocks) {
      const id = block.fields.UID
      if (id === undefined || id === "" || byId.has(id)) continue
      byId.set(id, block)
    }

    return byId
  }

  private changedIds(
    operations: ProposalOperationLog[],
    lock: SpecLock | null,
    blocks: Map<string, SdocBlock>,
  ): string[] {
    const changed = new Set<string>()

    for (const operation of operations) {
      for (const id of operation.targets) changed.add(id)
      for (const id of Object.keys(operation.before_hashes)) changed.add(id)
      for (const id of Object.keys(operation.after_hashes)) changed.add(id)
    }

    for (const [id, element] of Object.entries(lock?.elements ?? {})) {
      const block = blocks.get(id)
      if (block === undefined) {
        changed.add(id)
        continue
      }
      if (element.content_hash !== elementContentHash(block)) changed.add(id)
      if (block.fields.STATUS !== "Approved") changed.add(id)
    }

    return [...changed].sort()
  }

  private approvals(lock: SpecLock | null): ImpactApproval[] {
    return Object.entries(lock?.elements ?? {})
      .map(([id, element]) => ({ id, evidence: [...element.evidence] }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }
}
