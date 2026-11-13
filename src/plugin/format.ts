import type {
  PluginAnalyzeView,
  PluginCheckView,
  PluginContextView,
  PluginQueryView,
  PluginStatusView,
} from "./types"

export function formatStatus(view: PluginStatusView): string {
  return [
    `project: ${view.project_id ?? "none"}`,
    `snapshot: ${view.snapshot_id ?? "none"}`,
    `commit: ${view.commit === "" ? "none" : view.commit.slice(0, 12)}`,
    `workspace: ${view.dirty ? "dirty" : "clean"}`,
    `architecture: ${view.architecture} elements`,
    `flows: ${view.flows}`,
    `findings: ${view.findings}`,
    `unknowns: ${view.unknowns}`,
  ].join("\n")
}

export function formatContext(view: PluginContextView): string {
  return [
    formatStatus(view.status),
    view.spec === null ? "generated spec: none" : `contracts: ${view.spec.contracts.length}`,
    view.spec === null ? "" : `verification: ${view.spec.verification.length}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function formatQuery(view: PluginQueryView): string {
  if (view.elements.length === 0) return "No matching generated elements."

  return view.elements
    .map(
      (element) =>
        `${element.label} - ${element.type} (${element.confidence}) - ${element.summary}`,
    )
    .join("\n")
}

export function formatCheck(view: PluginCheckView): string {
  return [`errors: ${view.errors}`, `warnings: ${view.warnings}`, ...view.findings].join("\n")
}

export function formatAnalyze(view: PluginAnalyzeView): string {
  return `analysis ${view.state}: ${view.job_id}`
}

export function formatContextBlock(view: PluginStatusView): string {
  return [
    "<generated-spec-context>",
    `contract: ${view.contract}`,
    `project: ${view.project_id ?? "none"}`,
    `snapshot: ${view.snapshot_id ?? "none"}`,
    `commit: ${view.commit.slice(0, 12)}`,
    `architecture: ${view.architecture}`,
    `flows: ${view.flows}`,
    `findings: ${view.findings}`,
    `unknowns: ${view.unknowns}`,
    "</generated-spec-context>",
  ].join("\n")
}

export function redactInternalIds(text: string): string {
  return text.replace(
    /\b(?:SYS|SUB|CMP|FILE|SYM|ENTRY|REQ|CON|VER|FLOW|FIND|EVD|UNK)-[A-Za-z0-9/.#:_-]+/g,
    "generated item",
  )
}
