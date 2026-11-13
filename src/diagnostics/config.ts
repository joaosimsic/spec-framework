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
