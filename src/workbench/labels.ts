import { createHash } from "node:crypto"
import type { Proposal, ProposalStatus } from "../change"
import type { DisplayEntry, DisplayProjection } from "../model"
import type { SpecGraph } from "../model/types"
import type { WorkbenchNamedItem, WorkbenchProposalSummary } from "./types"

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Waiting for decisions",
  proposed: "Ready for review",
  validated: "Checks passed",
  approved: "Approved",
  superseded: "Replaced",
}

const KIND_LABELS: Record<string, string> = {
  requirement: "Requirement",
  acceptance_criterion: "Acceptance criterion",
  component: "Component",
  capability: "Capability",
  evidence: "Evidence",
  unknown: "Open question",
}

export class WorkbenchLabeler {
  constructor(
    private readonly graph: SpecGraph,
    private readonly display: DisplayProjection,
  ) {}

  proposal(proposal: Proposal): WorkbenchProposalSummary {
    return {
      ref: this.proposalRef(proposal),
      label: proposal.direction.replace(/\s+/g, " ").trim() || "Untitled proposal",
      mode: proposal.mode,
      state: STATUS_LABELS[proposal.status],
      author: proposal.author,
      baseCommit: proposal.base_commit,
    }
  }

  entry(id: string): DisplayEntry | null {
    const [entry, error] = this.display.resolve(id)
    if (error !== null || entry === null) return null

    return entry
  }

  named(id: string, fallbackTitle?: string): WorkbenchNamedItem {
    const entry = this.entry(id)
    if (entry !== null) {
      return { ref: entry.ref, label: entry.label, kindLabel: entry.kindLabel, state: entry.state }
    }

    const element = this.graph.elements.find((candidate) => candidate.id === id)
    const title = fallbackTitle?.trim() || element?.title?.trim() || "Linked item"
    const kind = element?.kind ?? "linked_item"

    return {
      ref: null,
      label: title,
      kindLabel: KIND_LABELS[kind] ?? this.humanize(kind),
    }
  }

  proposalRef(proposal: Proposal): string {
    const digest = createHash("sha256")
      .update(`${proposal.id}\u0000${proposal.base_commit}`, "utf8")
      .digest("hex")

    return `proposal_${digest.slice(0, 12)}`
  }

  private humanize(value: string): string {
    const words = value.replaceAll("_", " ").trim()
    if (words === "") return "Linked item"

    return words.charAt(0).toUpperCase() + words.slice(1)
  }
}
