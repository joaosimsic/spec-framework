import {
  AMBIGUOUS_TERMS,
  EARS_PATTERNS,
  REQUIRED_FIELDS,
  STATUSES,
  type CheckResult,
  type Diagnostic,
  type SdocBlock,
} from "./types"

const ID_PATTERNS = {
  REQ: /^REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
  AC: /^AC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
  DEC: /^DEC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
  UNK: /^UNK-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
}

type RecordKind = keyof typeof ID_PATTERNS

const LINK_PREFIXES = {
  ACCEPTANCE: ["AC-"],
  COMPONENT: ["CMP-"],
  FORMAL: ["PROP-", "INV-", "none"],
  EVIDENCE: ["EVD-"],
  WAIVER: ["WVR-"],
  REPLACES: [
    "REQ-",
    "AC-",
    "CMP-",
    "CAP-",
    "VOBJ-",
    "VER-",
    "PROP-",
    "CON-",
    "EVD-",
    "UNK-",
    "WVR-",
    "DEC-",
  ],
  DECIDES: [
    "REQ-",
    "AC-",
    "CMP-",
    "CAP-",
    "SYS-",
    "IFC-",
    "DAT-",
    "VOBJ-",
    "VER-",
    "INV-",
    "MOD-",
    "PROP-",
    "CON-",
    "EVD-",
    "UNK-",
    "WVR-",
    "DEC-",
  ],
  QUESTIONS: [
    "REQ-",
    "AC-",
    "CMP-",
    "CAP-",
    "SYS-",
    "IFC-",
    "DAT-",
    "VOBJ-",
    "VER-",
    "INV-",
    "MOD-",
    "PROP-",
    "CON-",
    "EVD-",
    "UNK-",
    "WVR-",
    "DEC-",
  ],
}

function diag(
  level: Diagnostic["level"],
  code: string,
  message: string,
  block: SdocBlock,
  id?: string,
): Diagnostic {
  return { level, code, message, file: block.file, line: block.line, id }
}

function splitList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isAmbiguous(statement: string): string[] {
  const lower = statement.toLowerCase()
  return AMBIGUOUS_TERMS.filter((term) =>
    new RegExp(`\\b${term.replace(".", "\\.")}\\b`).test(lower),
  )
}

function recordKind(uid: string | undefined): RecordKind {
  if (uid?.startsWith("AC-")) return "AC"
  if (uid?.startsWith("DEC-")) return "DEC"
  if (uid?.startsWith("UNK-")) return "UNK"

  return "REQ"
}

function validateEars(block: SdocBlock, diagnostics: Diagnostic[], kind: RecordKind) {
  const statement = block.fields.STATEMENT ?? ""
  if (!statement) return
  if (kind === "DEC" || kind === "UNK") return

  const id = block.fields.UID
  if (kind === "AC") {
    if (!/^(Given|When|While|If|Where|The)\b/.test(statement) || !/[.!?]$/.test(statement)) {
      diagnostics.push(
        diag(
          "error",
          "SDOC-BAD-ACCEPTANCE",
          "acceptance criterion must start with Given, When, While, If, Where, or The and end with punctuation",
          block,
          id,
        ),
      )
    }
  } else if (!EARS_PATTERNS.some((pattern) => pattern.test(statement))) {
    diagnostics.push(
      diag(
        "error",
        "SDOC-BAD-EARS",
        "requirement statement must match an EARS form and end with punctuation",
        block,
        id,
      ),
    )
  }

  for (const term of isAmbiguous(statement)) {
    diagnostics.push(
      diag("error", "SDOC-AMBIGUOUS", `ambiguous term '${term}' in normative statement`, block, id),
    )
  }
}

function validateLinks(block: SdocBlock, diagnostics: Diagnostic[]) {
  const id = block.fields.UID

  for (const [field, prefixes] of Object.entries(LINK_PREFIXES)) {
    const value = block.fields[field]
    if (!value) continue

    for (const item of splitList(value)) {
      if (!prefixes.some((prefix) => item.startsWith(prefix))) {
        diagnostics.push(
          diag(
            "error",
            "SDOC-BAD-LINK",
            `${field} value '${item}' has an invalid prefix`,
            block,
            id,
          ),
        )
      }
    }
  }

  if (block.fields.FORMAL === "none" && !block.fields.WAIVER) {
    diagnostics.push(
      diag("error", "SDOC-MISSING-WAIVER", "FORMAL: none requires a WAIVER reference", block, id),
    )
  }
}

export function lintBlocks(blocks: SdocBlock[]): CheckResult {
  const diagnostics: Diagnostic[] = []
  const seen = new Map<string, SdocBlock>()
  const acceptanceIds = new Set<string>()
  const requirementBlocks = blocks.filter((block) => block.kind === "REQUIREMENT")

  for (const block of requirementBlocks) {
    const uid = block.fields.UID
    if (uid?.startsWith("AC-")) acceptanceIds.add(uid)
  }

  for (const block of requirementBlocks) {
    const uid = block.fields.UID
    const kind = recordKind(uid)

    for (const field of REQUIRED_FIELDS[kind]) {
      if (!block.fields[field]) {
        diagnostics.push(
          diag("error", "SDOC-MISSING-FIELD", `missing required field ${field}`, block, uid),
        )
      }
    }

    if (!uid) continue

    const pattern = ID_PATTERNS[kind]
    if (!pattern.test(uid)) {
      diagnostics.push(diag("error", "SDOC-BAD-ID", `invalid ${kind} id '${uid}'`, block, uid))
    }

    if (seen.has(uid)) {
      const previous = seen.get(uid)!
      diagnostics.push(
        diag(
          "error",
          "SDOC-DUPLICATE-ID",
          `duplicate id '${uid}' (first at ${previous.file}:${previous.line})`,
          block,
          uid,
        ),
      )
    } else {
      seen.set(uid, block)
    }

    if (block.fields.STATUS && !STATUSES.includes(block.fields.STATUS as never)) {
      diagnostics.push(
        diag("error", "SDOC-BAD-STATUS", `invalid status '${block.fields.STATUS}'`, block, uid),
      )
    }

    if (
      block.fields.PROVENANCE &&
      !/^(human|code|doc|inferred|assumption):\S+/.test(block.fields.PROVENANCE)
    ) {
      diagnostics.push(
        diag(
          "error",
          "SDOC-BAD-PROVENANCE",
          "provenance must have a known prefix and a value",
          block,
          uid,
        ),
      )
    }

    validateEars(block, diagnostics, kind)
    validateLinks(block, diagnostics)

    if (kind === "REQ" && block.fields.ACCEPTANCE) {
      for (const criterion of splitList(block.fields.ACCEPTANCE)) {
        if (!acceptanceIds.has(criterion)) {
          diagnostics.push(
            diag(
              "error",
              "SDOC-MISSING-AC",
              `acceptance criterion '${criterion}' is not defined`,
              block,
              uid,
            ),
          )
        }
      }
    }
  }

  const errors = diagnostics.filter((item) => item.level === "error").length
  const warnings = diagnostics.filter((item) => item.level === "warning").length
  return { diagnostics, errors, warnings }
}
