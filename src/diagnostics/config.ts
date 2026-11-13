import { join } from "node:path"
import { attempt, attemptAsync, fail, ok, type Result } from "../core/result"

export interface BoundaryRule {
  from: string
  forbid: string[]
}

export interface DiagnosticsConfig {
  fanInThreshold: number
  fanOutThreshold: number
  maxSymbols: number
  maxLines: number
  boundaries: BoundaryRule[]
}

export class DiagnosticsConfigFactory {
  static fromRecord(record: Record<string, unknown>): DiagnosticsConfig {
    const value = (key: string): Record<string, unknown> => {
      const entry = record[key]
      return typeof entry === "object" && entry !== null && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {}
    }
    const number = (key: string, field: string, fallback: number): number => {
      const candidate = value(key)[field]
      return typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0
        ? candidate
        : fallback
    }
    const boundary = record["ARC-008"]
    const boundaries =
      typeof boundary === "object" && boundary !== null && !Array.isArray(boundary)
        ? (boundary as Record<string, unknown>)["boundaries"]
        : undefined

    return {
      fanInThreshold: number("ARC-002", "threshold", DEFAULT_DIAGNOSTICS.fanInThreshold),
      fanOutThreshold: number("ARC-003", "threshold", DEFAULT_DIAGNOSTICS.fanOutThreshold),
      maxSymbols: number("ARC-004", "max_symbols", DEFAULT_DIAGNOSTICS.maxSymbols),
      maxLines: number("ARC-004", "max_lines", DEFAULT_DIAGNOSTICS.maxLines),
      boundaries: Array.isArray(boundaries)
        ? boundaries.flatMap((entry) => {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return []
            const item = entry as Record<string, unknown>
            if (typeof item["from"] !== "string" || !Array.isArray(item["forbid"])) return []
            const forbid = item["forbid"].filter(
              (value): value is string => typeof value === "string",
            )
            return forbid.length === 0 ? [] : [{ from: item["from"], forbid }]
          })
        : [],
    }
  }
}

export const DEFAULT_DIAGNOSTICS: DiagnosticsConfig = {
  fanInThreshold: 12,
  fanOutThreshold: 12,
  maxSymbols: 40,
  maxLines: 800,
  boundaries: [],
}

export class DiagnosticsConfigLoader {
  constructor(private readonly root: string) {}

  async load(): Promise<Result<DiagnosticsConfig, string>> {
    const path = join(this.root, "spec", "implementation", "diagnostics.json")
    const [text, readError] = await attemptAsync(async () => {
      const file = Bun.file(path)
      return (await file.exists()) ? file.text() : ""
    })
    if (readError !== null || text === null) return fail(readError ?? "cannot read diagnostics")
    if (text === "") return ok(DEFAULT_DIAGNOSTICS)

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null || parsed === null) return fail(parseError ?? "invalid diagnostics")
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("diagnostics must be an object")
    }
    const record = parsed as Record<string, unknown>
    if (record["version"] !== 1) return fail("unsupported diagnostics version")
    const rules = record["rules"]
    if (
      rules !== undefined &&
      (typeof rules !== "object" || rules === null || Array.isArray(rules))
    ) {
      return fail("diagnostics rules must be an object")
    }
    const ruleRecord = (rules ?? {}) as Record<string, unknown>

    return ok({
      fanInThreshold: this.threshold(
        ruleRecord["ARC-002"],
        "threshold",
        DEFAULT_DIAGNOSTICS.fanInThreshold,
      ),
      fanOutThreshold: this.threshold(
        ruleRecord["ARC-003"],
        "threshold",
        DEFAULT_DIAGNOSTICS.fanOutThreshold,
      ),
      maxSymbols: this.threshold(
        ruleRecord["ARC-004"],
        "max_symbols",
        DEFAULT_DIAGNOSTICS.maxSymbols,
      ),
      maxLines: this.threshold(ruleRecord["ARC-004"], "max_lines", DEFAULT_DIAGNOSTICS.maxLines),
      boundaries: this.boundaries(ruleRecord["ARC-008"]),
    })
  }

  private threshold(value: unknown, key: string, fallback: number): number {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback
    const entry = (value as Record<string, unknown>)[key]

    return typeof entry === "number" && Number.isInteger(entry) && entry > 0 ? entry : fallback
  }

  private boundaries(value: unknown): BoundaryRule[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return []
    const entries = (value as Record<string, unknown>)["boundaries"]
    if (!Array.isArray(entries)) return []

    return entries.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return []
      const record = entry as Record<string, unknown>
      if (typeof record["from"] !== "string" || !Array.isArray(record["forbid"])) return []
      const forbid = record["forbid"].filter((item): item is string => typeof item === "string")
      return forbid.length === 0 ? [] : [{ from: record["from"], forbid }]
    })
  }
}
