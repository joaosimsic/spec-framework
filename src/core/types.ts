export type DiagnosticLevel = "error" | "warning"

export interface Diagnostic {
  level: DiagnosticLevel
  code: string
  message: string
  file?: string
  line?: number
  id?: string
}

export interface SdocBlock {
  file: string
  line: number
  kind: string
  fields: Record<string, string>
}

export interface CheckResult {
  diagnostics: Diagnostic[]
  errors: number
  warnings: number
}

export const STATUSES = ["Draft", "Proposed", "Approved", "Deprecated"] as const
export type Status = (typeof STATUSES)[number]

export const REQUIRED_FIELDS = {
  REQ: [
    "UID",
    "TITLE",
    "STATUS",
    "STATEMENT",
    "ACCEPTANCE",
    "COMPONENT",
    "FORMAL",
    "PROVENANCE",
    "OWNER",
  ],
  AC: ["UID", "TITLE", "STATUS", "STATEMENT", "PROVENANCE", "OWNER"],
  DEC: ["UID", "TITLE", "STATUS", "STATEMENT", "PROVENANCE", "OWNER"],
  UNK: ["UID", "TITLE", "STATUS", "STATEMENT", "PROVENANCE", "OWNER"],
} as const

export const EARS_PATTERNS = [
  /^The\b.*\bshall\b.*[.!?]$/,
  /^When\b.*\bshall\b.*[.!?]$/,
  /^While\b.*\bshall\b.*[.!?]$/,
  /^Where\b.*\bshall\b.*[.!?]$/,
  /^If\b.*\bthen\b.*\bshall\b.*[.!?]$/,
]

export const AMBIGUOUS_TERMS = [
  "appropriate",
  "as needed",
  "etc.",
  "properly",
  "gracefully",
  "quickly",
  "fast",
  "various",
  "some",
  "should",
  "may",
]
