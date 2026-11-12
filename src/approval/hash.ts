import { createHash } from "node:crypto"
import type { C4Element, C4Relationship } from "../core/c4"
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
  return sha256(canonicalElementContent(block))
}

export function architectureContentHash(
  element: C4Element,
  relationships: C4Relationship[],
): string {
  const related = relationships
    .filter(
      (relationship) =>
        relationship.source === element.alias || relationship.target === element.alias,
    )
    .map(relationshipContent)
    .sort()
  const content = [element.id ?? "", element.alias, element.kind, element.title, ...related].join(
    "\n",
  )

  return sha256(content)
}

function relationshipContent(relationship: C4Relationship): string {
  return `${relationship.source}->${relationship.target}:${relationship.label}`
}

function sha256(value: string): string {
  const digest = createHash("sha256").update(value, "utf8").digest("hex")

  return `sha256:${digest}`
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}
