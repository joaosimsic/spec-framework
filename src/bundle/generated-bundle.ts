import { createHash } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { join, relative } from "node:path"
import { attemptAsync, fail, ok, type Result } from "../core/result"
import type { GeneratedSpec } from "../spec"
import { GeneratedPdfRenderer } from "./pdf"

export interface GeneratedBundleOptions {
  output?: string
  force?: boolean
}

export interface GeneratedBundleResult {
  path: string
  files: string[]
}

export class GeneratedBundleWriter {
  async write(
    root: string,
    spec: GeneratedSpec,
    options: GeneratedBundleOptions = {},
  ): Promise<Result<GeneratedBundleResult, string>> {
    const destination =
      options.output ??
      join(root, "spec", "audit", `audit-${spec.snapshot.commit.slice(0, 8) || "working"}`)
    const [ready, readyError] = await attemptAsync(async () => {
      if (options.force) await rm(destination, { recursive: true, force: true })
      await mkdir(destination, { recursive: true })
      return true
    })
    if (readyError !== null || ready === null)
      return fail(readyError ?? "cannot create bundle directory")

    const json = `${JSON.stringify(spec, null, 2)}\n`
    const lines = this.lines(spec)
    const html = this.html(lines)
    const pdf = new GeneratedPdfRenderer().render(lines)
    const files: Array<[string, string | Uint8Array]> = [
      ["spec.gen.json", json],
      ["index.html", html],
      ["spec.pdf", pdf],
      ["flows.json", `${JSON.stringify(spec.flows, null, 2)}\n`],
      ["findings.json", `${JSON.stringify(spec.findings, null, 2)}\n`],
      ["evidence.json", `${JSON.stringify(spec.evidence, null, 2)}\n`],
    ]
    const manifest = {
      version: 1,
      snapshot_id: spec.snapshot.id,
      commit: spec.snapshot.commit,
      dirty: spec.snapshot.dirty,
      schema_version: spec.snapshot.schema_version,
      analyzer: spec.snapshot.analyzer,
      analyzer_version: spec.snapshot.analyzer_version,
      generated: Object.fromEntries(files.map(([name, content]) => [name, this.hash(content)])),
    }
    files.push(["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`])

    for (const [name, content] of files) {
      const [, writeError] = await attemptAsync(() => Bun.write(join(destination, name), content))
      if (writeError !== null) return fail(writeError)
    }

    return ok({
      path: destination,
      files: files.map(([name]) => relative(root, join(destination, name))),
    })
  }

  private lines(spec: GeneratedSpec): string[] {
    return [
      "Generated spec audit bundle",
      `Project: ${spec.project.name}`,
      `Snapshot: ${spec.snapshot.id}`,
      `Commit: ${spec.snapshot.commit}`,
      `Dirty: ${spec.snapshot.dirty}`,
      `Analyzer: ${spec.snapshot.analyzer} ${spec.snapshot.analyzer_version}`,
      "",
      "Architecture",
      ...spec.architecture.elements.map(
        (element) => `${element.type} ${element.label} (${element.confidence})`,
      ),
      "",
      "Observed behavior",
      ...spec.requirements.map((record) => `${record.title} (${record.confidence})`),
      "",
      "Contracts",
      ...spec.contracts.map((record) => `${record.title}: ${record.surface.join(", ")}`),
      "",
      "Verification",
      ...spec.verification.map((record) => `${record.title}: ${record.result}`),
      "",
      "Unknowns",
      ...spec.unknowns.map((unknown) => `${unknown.reason} (${unknown.source})`),
    ]
  }

  private html(lines: string[]): string {
    const escaped = lines.map((line) => this.escape(line)).join("\n")
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Generated spec</title><style>body{font-family:system-ui,sans-serif;margin:2rem;white-space:pre-wrap}</style></head><body><pre>${escaped}</pre></body></html>\n`
  }

  private hash(content: string | Uint8Array): string {
    return createHash("sha256").update(content).digest("hex")
  }

  private escape(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  }
}
