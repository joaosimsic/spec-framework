import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "../core/result"
import type { ProposalContractFields } from "./types"

export interface ContractFile {
  path: string
  text: string
  original: string
  changed: boolean
}

interface ContractDocument {
  path: string
  original: string
  fields: Record<string, unknown>
  text: string
}

const COMPATIBILITY = new Set(["none", "backward", "forward", "full"])

export class ContractEditor {
  private readonly documents: ContractDocument[]
  private readonly pathsById = new Map<string, string>()

  private constructor(documents: ContractDocument[]) {
    this.documents = documents
    for (const document of documents) {
      const id = readString(document.fields["id"])
      if (id === null) continue
      this.pathsById.set(id, document.path)
    }
  }

  static async load(target: string): Promise<Result<ContractEditor, string>> {
    const files = await collectContractFiles(join(target, "spec", "contracts"))
    const documents: ContractDocument[] = []
    const seen = new Set<string>()

    for (const path of files) {
      const [text, readError] = await attemptAsync(() => Bun.file(path).text())
      if (readError !== null || text === null) {
        return [null, readError === null ? `cannot read ${path}` : readError]
      }
      const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
      if (parseError !== null || !isRecord(parsed)) {
        return [null, `invalid contract sidecar ${path}: ${parseError ?? "expected an object"}`]
      }
      const id = readString(parsed["id"])
      if (id === null) continue
      if (seen.has(id)) return [null, `duplicate contract ID '${id}'`]
      seen.add(id)
      documents.push({ path, original: text, fields: { ...parsed }, text })
    }

    return [new ContractEditor(documents), null]
  }

  has(id: string): boolean {
    return this.pathsById.has(id)
  }

  titleFor(id: string): string | null {
    const document = this.documentFor(id)
    if (document === null) return null

    return contractTitle(document)
  }

  hashFor(id: string): string | null {
    const document = this.documentFor(id)
    if (document === null) return null

    return `sha256:${createHash("sha256").update(document.text, "utf8").digest("hex")}`
  }

  patch(id: string, patch: ProposalContractFields): Result<boolean, string> {
    const document = this.documentFor(id)
    if (document === null) return [null, `unknown contract '${id}'`]

    const suppliedId = patch["id"]
    if (suppliedId !== undefined && suppliedId !== id) {
      return [null, "contract ID cannot change"]
    }

    const next = { ...document.fields, ...patch, id }
    const validationError = validateContract(next)
    if (validationError !== null) return [null, validationError]

    document.fields = next
    document.text = `${JSON.stringify(next, null, 2)}\n`

    return [true, null]
  }

  files(): ContractFile[] {
    return this.documents
      .map((document) => ({
        path: document.path,
        text: document.text,
        original: document.original,
        changed: document.text !== document.original,
      }))
      .sort((left, right) => left.path.localeCompare(right.path))
  }

  private documentFor(id: string): ContractDocument | null {
    const path = this.pathsById.get(id)
    if (path === undefined) return null

    return this.documents.find((document) => document.path === path) ?? null
  }
}

export async function collectContractFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectContractFiles(path)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".contract.json")) files.push(path)
  }

  return files.sort()
}

function validateContract(fields: Record<string, unknown>): string | null {
  const id = readString(fields["id"])
  if (id === null) return "contract requires a string id"
  const owner = readString(fields["owner"])
  if (owner === null) return `contract '${id}' requires a string owner`
  const consumers = fields["consumers"]
  if (!Array.isArray(consumers) || !consumers.every((entry) => typeof entry === "string")) {
    return `contract '${id}' requires a string consumers array`
  }
  const compatibility = fields["compatibility"]
  if (typeof compatibility !== "string" || !COMPATIBILITY.has(compatibility)) {
    return `contract '${id}' requires compatibility none, backward, forward, or full`
  }
  for (const key of ["schema", "package", "versioning"]) {
    const value = fields[key]
    if (value !== undefined && typeof value !== "string") {
      return `contract '${id}' field ${key} must be a string`
    }
  }

  return null
}

function readString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null
  return value.trim()
}

function contractTitle(document: ContractDocument): string {
  const title = readString(document.fields["title"])
  if (title !== null) return title

  const name = document.path.split("/").pop() ?? document.path
  const stem = name.slice(0, -".contract.json".length)
  const words = stem.replace(/[^A-Za-z0-9]+/g, " ").trim()

  return words === "" ? stem : words.charAt(0).toUpperCase() + words.slice(1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
