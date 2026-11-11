import { join } from "node:path"
import { attempt, attemptAsync } from "../core/result"
import type { BundleManifest, BundleReport, BundleSource } from "./types"
import { BUNDLE_VERSION } from "./types"

export interface BundleManifestInput {
  target: string
  project: { name: string; adoption: string }
  specVersion: string
  report: BundleReport
  files: Record<string, string>
}

export class BundleManifestBuilder {
  async build(input: BundleManifestInput): Promise<BundleManifest> {
    const tools = await this.toolVersions(input.target, input.report)

    return {
      version: BUNDLE_VERSION,
      spec_version: input.specVersion,
      graph_version: input.report.graphVersion,
      project: {
        name: input.project.name,
        adoption: input.project.adoption,
      },
      git: {
        workspace: input.report.workspace,
        commit: input.report.commit,
        dirty: input.report.dirty,
        preview: input.report.preview,
      },
      tools,
      checks: {
        errors: input.report.checks.filter((item) => item.level === "error").length,
        warnings: input.report.checks.filter((item) => item.level === "warning").length,
        diagnostics: input.report.checks.length,
      },
      sources: this.sources(input.report.sources),
      evidence: Object.fromEntries(
        input.report.evidence.map((record) => [
          record.id,
          {
            kind: record.kind,
            method: record.method,
            result: record.result,
            tool: record.tool,
            hash: record.hash,
            input_hash: record.input_hash,
          },
        ]),
      ),
      approvals: {
        approved_elements: input.report.approvals.length,
        approved_evidence:
          input.report.lock === null ? 0 : Object.keys(input.report.lock.evidence).length,
        pending: input.report.pending.length,
        approver: input.report.lock?.approver ?? null,
        approved_at: input.report.lock?.approved_at ?? null,
      },
      files: Object.fromEntries(
        Object.entries(input.files).sort(([left], [right]) => left.localeCompare(right)),
      ),
    }
  }

  private sources(sources: BundleSource[]): BundleManifest["sources"] {
    const groups: BundleManifest["sources"] = {}

    for (const source of [...sources].sort((left, right) => left.path.localeCompare(right.path))) {
      const entries = groups[source.group] ?? []
      entries.push({ path: source.path, hash: source.hash })
      groups[source.group] = entries
    }

    return groups
  }

  private async toolVersions(
    target: string,
    report: BundleReport,
  ): Promise<Record<string, string>> {
    const tools: Record<string, string> = { ...report.tools }
    const path = join(target, "spec", "toolchain.lock.json")
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())

    if (readError === null && text !== null) {
      const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
      if (parseError === null && this.isRecord(parsed)) {
        const pinned = parsed["tools"]
        if (this.isRecord(pinned)) {
          for (const [name, version] of Object.entries(pinned)) {
            if (typeof version === "string" && version.trim() !== "") {
              tools[name] = version
            }
          }
        }
      }
    }

    for (const evidence of report.evidence) {
      if (tools[evidence.tool] === undefined) tools[evidence.tool] = "unknown"
    }

    return Object.fromEntries(
      Object.entries(tools).sort(([left], [right]) => left.localeCompare(right)),
    )
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
