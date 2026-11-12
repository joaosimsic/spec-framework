import type { DisplayEntry } from "../model"
import type {
  PluginChangeView,
  PluginCheckView,
  PluginContextView,
  PluginDiffView,
  PluginImpactView,
  PluginNextView,
  PluginStatusView,
  PluginTechnicalView,
} from "./types"

const INTERNAL_ID =
  /\b(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS|MOD|IFACE|ENT|TERM|ONT|CS|SEM|DAT)-[A-Z0-9][A-Z0-9-]*\b/g

export function formatStatus(view: PluginStatusView): string {
  return [
    `mode: ${view.mode}`,
    `commit: ${view.commit}`,
    `workspace: ${view.dirty ? "local changes present" : "clean"}`,
    `proposal: ${view.proposal === null ? "none" : `${view.proposal.label} (${view.proposal.state})`}`,
    `approved: ${view.approved.length}`,
    ...namedLines("approved scope", view.approved),
    ...listLines("blockers", view.blockers),
    ...namedLines("open questions", view.openQuestions),
    ...listLines("next", view.next),
  ].join("\n")
}

export function formatContext(view: PluginContextView, technical = false): string {
  const lines = [
    `proposal: ${view.proposal === null ? "none" : `${view.proposal.label} (${view.proposal.state})`}`,
    `items: ${view.entries.length}`,
    ...view.entries.map((entry) => entryLine(entry, technical)),
    ...listLines("blockers", view.blockers),
    ...namedLines("open questions", view.openQuestions),
    ...listLines("decisions to make", view.prompts),
    ...listLines("next", view.next),
  ]

  return lines.join("\n")
}

export function formatQuery(entries: DisplayEntry[], technical = false): string {
  if (entries.length === 0) return "No matching items."

  return entries.map((entry) => entryLine(entry, technical)).join("\n")
}

export function formatNext(view: PluginNextView): string {
  return [
    ...listLines("decisions to make", view.prompts),
    ...listLines("next", view.next),
    ...listLines("blockers", view.blockers),
    ...namedLines("open questions", view.openQuestions),
  ].join("\n")
}

export function formatImpact(view: PluginImpactView): string {
  if (!view.available) return `Impact unavailable: ${view.reason ?? "no proposal"}`

  return [
    ...namedLines("changed", view.changed),
    ...namedLines("affected", view.affected),
    ...namedLines("evidence to regenerate", view.invalidatedEvidence),
    ...namedLines("approvals to renew", view.approvalsToRenew),
    ...namedLines("open questions", view.openQuestions),
  ].join("\n")
}

export function formatDiff(view: PluginDiffView): string {
  if (!view.available) return `Diff unavailable: ${view.reason ?? "no proposal"}`

  return [
    ...namedLines("added", view.added),
    ...namedLines("removed", view.removed),
    ...namedLines("modified", view.modified),
  ].join("\n")
}

export function formatChange(view: PluginChangeView): string {
  return [
    `proposal: ${view.proposal.label} (${view.proposal.state})`,
    ...namedLines("operations", view.operations),
    "",
    formatDiff(view.diff),
    "",
    formatImpact(view.impact),
  ].join("\n")
}

export function formatCheck(view: PluginCheckView, technical = false): string {
  const lines = [`errors: ${view.errors}`, `warnings: ${view.warnings}`]

  for (const finding of view.findings) {
    lines.push(`${finding.level}: ${finding.message}`)
  }

  return technical ? lines.join("\n") : redactInternalIds(lines.join("\n"))
}

export function formatTechnicalProposal(view: PluginTechnicalView): string {
  const operations = view.proposal.operations.length
  const lock = view.lock === null ? "none" : "present"

  return [
    `proposal: ${view.proposal.id}`,
    `branch: ${view.proposal.branch}`,
    `mode: ${view.proposal.mode}`,
    `status: ${view.proposal.status}`,
    `author: ${view.proposal.author}`,
    `base commit: ${view.proposal.base_commit}`,
    `baseline commit: ${view.proposal.baseline.commit}`,
    `baseline lock: ${view.proposal.baseline.lock_hash ?? "none"}`,
    `operations: ${operations}`,
    `approval lock: ${lock}`,
    `graph: ${view.graph.elements.length} elements, ${view.graph.evidence.length} evidence records`,
    ...Object.entries(view.toolVersions).map(([name, version]) => `tool ${name}: ${version}`),
  ].join("\n")
}

export function formatContextBlock(view: PluginStatusView): string {
  const proposal =
    view.proposal === null ? "none" : `${view.proposal.label} (${view.proposal.mode})`
  const questions = view.openQuestions.map((item) => item.label)

  return [
    "<spec-context>",
    `contract: ${view.contract}`,
    `mode: ${view.mode}`,
    `commit: ${view.commit.slice(0, 12)}`,
    `workspace: ${view.dirty ? "dirty" : "clean"}`,
    `proposal: ${proposal}`,
    `approved: ${view.approved.length}`,
    `blockers: ${view.blockers.length}`,
    `open questions: ${questions.length === 0 ? "none" : questions.join("; ")}`,
    "</spec-context>",
  ].join("\n")
}

export function redactInternalIds(text: string): string {
  return text.replace(INTERNAL_ID, "linked item")
}

function entryLine(entry: DisplayEntry, technical: boolean): string {
  const base = `- ${entry.label} - ${entry.state} (${entry.kindLabel.toLowerCase()})`
  if (!technical) return base

  const details = [
    `id: ${entry.technical.id}`,
    ...(entry.technical.status === undefined ? [] : [`status: ${entry.technical.status}`]),
    ...(entry.technical.owner === undefined ? [] : [`owner: ${entry.technical.owner}`]),
    ...(entry.technical.provenance === undefined
      ? []
      : [`provenance: ${entry.technical.provenance}`]),
    ...(entry.technical.links.length === 0
      ? []
      : [`links: ${entry.technical.links.map((link) => `${link.type} -> ${link.to}`).join(", ")}`]),
    ...entry.technical.diagnostics.map(
      (diagnostic) => `diagnostic ${diagnostic.code}: ${diagnostic.message}`,
    ),
  ]

  return `${base}\n  ${details.join("\n  ")}`
}

function namedLines(label: string, items: Array<{ label: string; state?: string }>): string[] {
  if (items.length === 0) return []

  return [
    `${label}:`,
    ...items.map((item) => `- ${item.label}${item.state === undefined ? "" : ` - ${item.state}`}`),
  ]
}

function listLines(label: string, items: string[]): string[] {
  if (items.length === 0) return []

  return [`${label}:`, ...items.map((item) => `- ${item}`)]
}
