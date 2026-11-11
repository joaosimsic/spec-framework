import { createHash } from "node:crypto"
import type { SdocBlock } from "../core/types"

const APPROVAL_EXCLUDED_FIELDS = new Set(["STATUS"])

export function canonicalElementContent(block: SdocBlock): string {
  const fields = Object.entries(block.fields)
    .filter(([field]) => !APPROVAL_EXCLUDED_FIELDS.has(field))
    .map(([field, value]) => [field, normalize(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))

  return JSON.stringify({ kind: block.kind, fields })
}

export function elementContentHash(block: SdocBlock): string {
  const digest = createHash("sha256").update(canonicalElementContent(block), "utf8").digest("hex")

  return `sha256:${digest}`
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}
