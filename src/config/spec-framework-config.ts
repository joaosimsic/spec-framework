import { basename, join } from "node:path"
import { attempt, attemptAsync, fail, ok, type Result } from "../core/result"

export interface EntryPointOverride {
  kind: string
  path: string
}

export interface AnalysisConfig {
  roots: string[]
  exclude: string[]
  entryPoints: {
    include: EntryPointOverride[]
    exclude: Array<{ path: string }>
  }
  flowAnalysis: boolean
}

export interface CheckConfig {
  id: string
  command: string[]
  workingDirectory: string
  timeoutMs: number
  kind: "build" | "typecheck" | "test" | "external"
}

export interface SpecFrameworkConfig {
  version: 1
  project: { name: string }
  analysis: AnalysisConfig
  diagnostics: Record<string, unknown>
  checks: CheckConfig[]
  ai: { provider: "local" | "remote" } | null
}

export class SpecFrameworkConfigLoader {
  constructor(private readonly root: string) {}

  async load(): Promise<Result<SpecFrameworkConfig, string>> {
    const path = join(this.root, "spec-framework.json")
    const [text, readError] = await attemptAsync(async () => {
      const file = Bun.file(path)
      return (await file.exists()) ? file.text() : ""
    })
    if (readError !== null || text === null)
      return fail(readError ?? "cannot read spec-framework.json")
    if (text.trim() === "") return ok(this.defaults())

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null)
      return fail(parseError ?? "invalid spec-framework.json")
    if (typeof parsed !== "object" || Array.isArray(parsed))
      return fail("spec-framework.json must be an object")
    const record = parsed as Record<string, unknown>
    if (record["version"] !== 1) return fail("unsupported spec-framework.json version")

    return ok({
      version: 1,
      project: this.project(record["project"]),
      analysis: this.analysis(record["analysis"]),
      diagnostics: this.record(record["diagnostics"]),
      checks: this.checks(record["checks"]),
      ai: this.ai(record["ai"]),
    })
  }

  private defaults(): SpecFrameworkConfig {
    return {
      version: 1,
      project: { name: basename(this.root) },
      analysis: {
        roots: ["."],
        exclude: [],
        entryPoints: { include: [], exclude: [] },
        flowAnalysis: true,
      },
      diagnostics: {},
      checks: [],
      ai: null,
    }
  }

  private project(value: unknown): { name: string } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { name: basename(this.root) }
    }
    const name = (value as Record<string, unknown>)["name"]

    return {
      name: typeof name === "string" && name.trim() !== "" ? name.trim() : basename(this.root),
    }
  }

  private analysis(value: unknown): AnalysisConfig {
    const record = this.record(value)
    const analysis = this.record(record["analysis"] ?? record)
    const roots = this.strings(analysis["roots"])
    const exclude = this.strings(analysis["exclude"])
    const entries = this.record(analysis["entry_points"] ?? analysis["entryPoints"])
    const include = this.entryEntries(entries["include"])
    const omitted = this.entryEntries(entries["exclude"]).map((entry) => ({ path: entry.path }))
    const flowAnalysis = analysis["flow_analysis"] ?? analysis["flowAnalysis"]

    return {
      roots: roots.length === 0 ? ["."] : roots,
      exclude,
      entryPoints: { include, exclude: omitted },
      flowAnalysis: typeof flowAnalysis === "boolean" ? flowAnalysis : true,
    }
  }

  private checks(value: unknown): CheckConfig[] {
    if (!Array.isArray(value)) return []

    return value.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return []
      const record = entry as Record<string, unknown>
      const id = record["id"]
      const command = record["command"]
      if (
        typeof id !== "string" ||
        !Array.isArray(command) ||
        !command.every((item) => typeof item === "string")
      ) {
        return []
      }
      if (command.length === 0) return []
      const kind = record["kind"]
      return [
        {
          id,
          command,
          workingDirectory:
            typeof record["workingDirectory"] === "string" ? record["workingDirectory"] : ".",
          timeoutMs: typeof record["timeoutMs"] === "number" ? record["timeoutMs"] : 120000,
          kind:
            kind === "build" || kind === "typecheck" || kind === "test" || kind === "external"
              ? kind
              : "external",
        },
      ]
    })
  }

  private ai(value: unknown): SpecFrameworkConfig["ai"] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null
    const provider = (value as Record<string, unknown>)["provider"]

    return provider === "local" || provider === "remote" ? { provider } : null
  }

  private entryEntries(value: unknown): EntryPointOverride[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return []
      const record = entry as Record<string, unknown>
      if (typeof record["path"] !== "string") return []
      return [
        { kind: typeof record["kind"] === "string" ? record["kind"] : "cli", path: record["path"] },
      ]
    })
  }

  private strings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : []
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  }
}
